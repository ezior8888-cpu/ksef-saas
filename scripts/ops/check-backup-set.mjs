#!/usr/bin/env node
/**
 * Local validation of REPORTED F0 backup evidence, never a backup executor.
 * Importing is inert. No referenced artifact, repository or service is read.
 * Digests/bytes are claims checked for shape and agreement, not truth.
 * v1 supports only Unversioned S3; version-aware backup needs a new contract.
 */
import { closeSync, fstatSync, lstatSync, openSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SHA256 = /^[a-f0-9]{64}$/;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const UTC = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(?:Z|\+00:00)$/;
const MAX_AGE_MS = 26 * 60 * 60 * 1000;
const MAX_JSON_BYTES = 1024 * 1024;
const COUNT_KEYS = ["bucketCount", "currentObjectCount", "currentObjectBytes", "allVersionCount", "allVersionBytes", "deleteMarkerCount", "multipartUploadCount"];
const MINIO_HOSTS = { application: "ops-1", supabase: "db-1" };
const EXPECTED_GROUPS = ["database", "application", "supabase"];
export const CONSISTENCY_NOTICE = "Manifest spójny — zgłoszone dowody nadal wymagają niezależnej weryfikacji. To nie jest potwierdzenie kopii, restore ani PASS G09.";
export const HELP = "Użycie: node scripts/ops/check-backup-set.mjs <prywatny-manifest.json>\n       node scripts/ops/check-backup-set.mjs --help\nWyłącznie lokalny JSON (maks. 1 MiB); brak sieci, poleceń, kopii i restore.\nExit 0: spójność zgłoszeń, bez potwierdzenia prawdziwości/PASS G09.\nExit 1: niepełny/niespójny manifest. Exit 2: błąd argumentów lub odczytu JSON.\nv1 wymaga obu baz i obu MinIO oraz wyłącznie Unversioned S3.\n";

const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const sameMembers = (a, b) => a.length === b.length && a.every((item) => b.some((other) => item.sha256 === other.sha256 && item.bytes === other.bytes));

/** Pure check of claims. `now` is injectable for deterministic local tests. */
export function validateBackupSet(manifest, { now = new Date() } = {}) {
  const issues = [];
  const seenIssues = new Set();
  const artifactSizes = new Map();
  const nowMs = now instanceof Date ? now.getTime() : NaN;
  const issue = (field, code) => {
    const key = `${field}:${code}`;
    if (!seenIssues.has(key)) { seenIssues.add(key); issues.push({ field, code }); }
  };
  const obj = (value, field) => { if (!record(value)) { issue(field, "required_object"); return {}; } return value; };
  const yes = (value, field) => { if (value !== true) issue(field, "required_true"); };
  const zero = (value, field) => { if (value !== 0) issue(field, "required_zero"); };
  const text = (value, field) => { if (typeof value !== "string" || value.trim().length === 0 || value.length > 2048) issue(field, "required_string"); };
  const hash = (value, field) => { if (typeof value !== "string" || !SHA256.test(value)) issue(field, "invalid_sha256"); };
  const count = (value, field, positive = false) => { if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) issue(field, "invalid_integer"); };
  const timestamp = (value, field) => {
    const match = typeof value === "string" ? UTC.exec(value) : null;
    const time = match ? Date.parse(value) : NaN;
    if (!match || !Number.isFinite(time) || new Date(time).toISOString().slice(0, 19) !== match[1]) {
      issue(field, "invalid_utc_timestamp"); return null;
    }
    if (time > nowMs) issue(field, "future_timestamp");
    return time;
  };
  const within = (time, window, field) => {
    if (time !== null && window && (time < window.start || time > window.end)) issue(field, "outside_window");
  };
  const window = (value, field, parent = null) => {
    const item = obj(value, field);
    const start = timestamp(item.startedAtUtc, `${field}.startedAtUtc`);
    const end = timestamp(item.completedAtUtc, `${field}.completedAtUtc`);
    within(start, parent, `${field}.startedAtUtc`); within(end, parent, `${field}.completedAtUtc`);
    if (start !== null && end !== null && start > end) issue(field, "reversed_window");
    return start === null || end === null ? null : { start, end };
  };
  const artifact = (value, field, parent = null) => {
    const item = obj(value, field);
    hash(item.sha256, `${field}.sha256`); count(item.bytes, `${field}.bytes`, true);
    if (typeof item.sha256 === "string" && SHA256.test(item.sha256) && Number.isSafeInteger(item.bytes)) {
      if (artifactSizes.has(item.sha256) && artifactSizes.get(item.sha256) !== item.bytes) issue(field, "digest_size_mismatch");
      artifactSizes.set(item.sha256, item.bytes);
    }
    const at = timestamp(item.createdAtUtc, `${field}.createdAtUtc`);
    within(at, parent, `${field}.createdAtUtc`);
    return { sha256: item.sha256, bytes: item.bytes, at };
  };
  const run = obj(manifest, "manifest");
  if (!Number.isFinite(nowMs)) issue("validation", "invalid_clock");
  if (run.schemaVersion !== 1) issue("schemaVersion", "unsupported_schema");
  if (typeof run.runId !== "string" || !RUN_ID.test(run.runId)) issue("runId", "invalid_run_id");
  const sameRun = (value, field) => { if (typeof value !== "string" || value !== run.runId) issue(field, "run_id_mismatch"); };
  const runWindow = window(run, "run");
  // Project freshness is the last COMPLETE success, not job start time.
  if (runWindow && nowMs - runWindow.end > MAX_AGE_MS) issue("run", "older_than_26h");
  const stabilization = obj(run.stabilization, "stabilization");
  const stableWindow = window(stabilization, "stabilization", runWindow);
  yes(stabilization.mutationsExcluded, "stabilization.mutationsExcluded");
  const stableEvidence = artifact(stabilization.evidence, "stabilization.evidence", runWindow);
  if (stableWindow && stableEvidence.at !== null && stableEvidence.at < stableWindow.end) issue("stabilization.evidence", "evidence_before_window_end");
  const operationWindow = (value, field) => window(value, field, stableWindow);
  const sourceArtifacts = { database: [], application: [], supabase: [] };
  const add = (kind, value) => {
    // Identical content may legitimately serve multiple evidence roles.
    const existing = sourceArtifacts[kind].find((item) => item.sha256 === value.sha256 && item.bytes === value.bytes);
    if (existing) existing.at = Math.max(existing.at ?? 0, value.at ?? 0);
    else sourceArtifacts[kind].push({ sha256: value.sha256, bytes: value.bytes, at: value.at });
  };

  const inventory = obj(run.sourceInventory, "sourceInventory");
  sameRun(inventory.runId, "sourceInventory.runId"); yes(inventory.complete, "sourceInventory.complete");
  const inventoryWindow = operationWindow(inventory.operationWindow, "sourceInventory.operationWindow");
  const exactNames = (value, expected, field) => {
    if (!Array.isArray(value) || value.length !== expected.length || expected.some((name) => value.filter((x) => x === name).length !== 1)) issue(field, "incomplete_or_duplicate_sources");
  };
  exactNames(inventory.databaseNames, ["postgres", "_supabase"], "sourceInventory.databaseNames");
  exactNames(inventory.minioIds, ["application", "supabase"], "sourceInventory.minioIds");
  add("database", artifact(inventory.artifact, "sourceInventory.artifact", inventoryWindow));
  add("database", stableEvidence);

  const databases = Array.isArray(run.databases) ? run.databases : [];
  if (!Array.isArray(run.databases) || databases.length !== 2) issue("databases", "two_databases_required");
  for (const name of ["postgres", "_supabase"]) {
    const matches = databases.filter((db) => record(db) && db.name === name);
    const field = name === "postgres" ? "databases.postgres" : "databases._supabase";
    if (matches.length !== 1) issue(field, "missing_or_duplicate_database");
    const db = obj(matches[0], field); sameRun(db.runId, `${field}.runId`);
    if (db.host !== "db-1") issue(`${field}.host`, "wrong_source_host");
    const dbWindow = operationWindow(db.operationWindow, `${field}.operationWindow`);
    const dump = obj(db.dump, `${field}.dump`);
    if (dump.format !== "custom") issue(`${field}.dump.format`, "custom_format_required");
    zero(dump.exitCode, `${field}.dump.exitCode`); yes(dump.allSchemas, `${field}.dump.allSchemas`);
    const dumpArtifact = artifact(dump.artifact, `${field}.dump.artifact`, dbWindow); add("database", dumpArtifact);
    const check = obj(db.restoreListCheck, `${field}.restoreListCheck`);
    zero(check.exitCode, `${field}.restoreListCheck.exitCode`);
    const checkedAt = timestamp(check.checkedAtUtc, `${field}.restoreListCheck.checkedAtUtc`);
    within(checkedAt, runWindow, `${field}.restoreListCheck.checkedAtUtc`);
    if (checkedAt !== null && dumpArtifact.at !== null && checkedAt < dumpArtifact.at) issue(`${field}.restoreListCheck`, "check_before_artifact");
    const evidence = artifact(check.evidence, `${field}.restoreListCheck.evidence`, runWindow);
    if (evidence.at !== null && checkedAt !== null && evidence.at < checkedAt) issue(`${field}.restoreListCheck.evidence`, "evidence_before_check");
    add("database", evidence);
  }

  const globals = obj(run.globals, "globals"); sameRun(globals.runId, "globals.runId");
  zero(globals.exitCode, "globals.exitCode");
  if (globals.scope !== "globals-only") issue("globals.scope", "globals_only_required");
  yes(globals.rolesIncluded, "globals.rolesIncluded"); yes(globals.tablespacesIncluded, "globals.tablespacesIncluded");
  add("database", artifact(globals.artifact, "globals.artifact", operationWindow(globals.operationWindow, "globals.operationWindow")));
  const recovery = obj(run.recoveryBundle, "recoveryBundle"); sameRun(recovery.runId, "recoveryBundle.runId");
  for (const key of ["encrypted", "configurationIncluded", "keysIncluded"]) yes(recovery[key], `recoveryBundle.${key}`);
  add("database", artifact(recovery.artifact, "recoveryBundle.artifact", operationWindow(recovery.operationWindow, "recoveryBundle.operationWindow")));

  const counters = (value, field) => {
    const item = obj(value, field);
    for (const key of COUNT_KEYS) count(item[key], `${field}.${key}`);
    const versions = obj(item.versioningCounts, `${field}.versioningCounts`);
    for (const key of ["Enabled", "Suspended", "Unversioned"]) count(versions[key], `${field}.versioningCounts.${key}`);
    if (versions.Enabled !== 0 || versions.Suspended !== 0 || item.deleteMarkerCount !== 0) issue(field, "UNSUPPORTED_VERSIONING");
    if (versions.Unversioned !== item.bucketCount) issue(field, "bucket_versioning_count_mismatch");
    if (item.allVersionCount !== item.currentObjectCount || item.allVersionBytes !== item.currentObjectBytes) issue(field, "unversioned_counts_mismatch");
    zero(item.multipartUploadCount, `${field}.multipartUploadCount`);
    if (item.currentObjectCount === 0 && item.currentObjectBytes !== 0) issue(field, "bytes_without_objects");
    if (item.bucketCount === 0 && COUNT_KEYS.some((key) => item[key] !== 0)) issue(field, "objects_without_buckets");
    return item;
  };
  const minios = Array.isArray(run.minio) ? run.minio : [];
  if (!Array.isArray(run.minio) || minios.length !== 2) issue("minio", "two_minio_sources_required");
  for (const id of ["application", "supabase"]) {
    const field = `minio.${id}`; const matches = minios.filter((item) => record(item) && item.id === id);
    if (matches.length !== 1) issue(field, "missing_or_duplicate_minio");
    const item = obj(matches[0], field); sameRun(item.runId, `${field}.runId`);
    if (item.host !== MINIO_HOSTS[id]) issue(`${field}.host`, "wrong_source_host");
    const sourceWindow = operationWindow(item.operationWindow, `${field}.operationWindow`);
    const source = counters(item.source, `${field}.source`); const exported = counters(item.exported, `${field}.exported`);
    for (const key of COUNT_KEYS) if (source[key] !== exported[key]) issue(`${field}.exported.${key}`, "source_export_mismatch");
    for (const key of ["Enabled", "Suspended", "Unversioned"]) if (source.versioningCounts?.[key] !== exported.versioningCounts?.[key]) issue(`${field}.exported.versioningCounts.${key}`, "source_export_mismatch");
    const listing = obj(item.listingComplete, `${field}.listingComplete`);
    for (const key of ["buckets", "currentObjects", "versions", "versioning", "multipartUploads"]) yes(listing[key], `${field}.listingComplete.${key}`);
    for (const key of ["exportComplete", "metadataComplete", "bucketConfigurationComplete"]) yes(item[key], `${field}.${key}`);
    const hashes = obj(item.objectHashManifest, `${field}.objectHashManifest`);
    yes(hashes.complete, `${field}.objectHashManifest.complete`);
    hash(hashes.sourceSha256, `${field}.objectHashManifest.sourceSha256`); hash(hashes.exportedSha256, `${field}.objectHashManifest.exportedSha256`);
    if (hashes.sourceSha256 !== hashes.exportedSha256) issue(`${field}.objectHashManifest`, "object_identity_mismatch");
    const hashArtifact = artifact(hashes.artifact, `${field}.objectHashManifest.artifact`, sourceWindow);
    if (hashArtifact.sha256 !== hashes.exportedSha256) issue(`${field}.objectHashManifest.artifact`, "object_manifest_digest_mismatch");
    add(id, hashArtifact);
    for (const key of ["sourceListingArtifact", "exportArtifact", "metadataArtifact", "bucketConfigurationArtifact"]) add(id, artifact(item[key], `${field}.${key}`, sourceWindow));
  }

  const refs = obj(run.references, "references"); sameRun(refs.runId, "references.runId"); yes(refs.complete, "references.complete");
  for (const key of ["missing", "unknown", "hashMismatches"]) zero(refs[key], `references.${key}`);
  const refsWindow = operationWindow(refs.operationWindow, "references.operationWindow");
  const refsAt = timestamp(refs.checkedAtUtc, "references.checkedAtUtc"); within(refsAt, refsWindow, "references.checkedAtUtc");
  const refsEvidence = artifact(refs.evidence, "references.evidence", refsWindow);
  if (refsEvidence.at !== null && refsAt !== null && refsEvidence.at < refsAt) issue("references.evidence", "evidence_before_check");
  add("database", refsEvidence);
  // Shared source evidence belongs to the DB repository; each MinIO has its
  // own listings, exact-object manifest, payload export and configuration.
  const members = (value, field) => {
    if (!Array.isArray(value) || value.length === 0) { issue(field, "members_required"); return []; }
    const result = value.map((entry, index) => { const entryField = `${field}.${index}`; const item = obj(entry, entryField); hash(item.sha256, `${entryField}.sha256`); count(item.bytes, `${entryField}.bytes`, true); return { sha256: item.sha256, bytes: item.bytes }; });
    if (new Set(result.map((item) => item.sha256)).size !== result.length) issue(field, "duplicate_members");
    return result;
  };
  const snapshots = Array.isArray(run.snapshots) ? run.snapshots : [];
  if (!Array.isArray(run.snapshots) || snapshots.length !== 3) issue("snapshots", "three_snapshots_required");
  const repositoryIds = []; const snapshotIds = []; const resolvedSnapshots = []; const snapshotProofTimes = [];
  for (const kind of EXPECTED_GROUPS) {
    const field = `snapshots.${kind}`; const matches = snapshots.filter((item) => record(item) && item.kind === kind);
    if (matches.length !== 1) issue(field, "missing_or_duplicate_snapshot");
    const item = obj(matches[0], field); sameRun(item.runId, `${field}.runId`);
    text(item.repositoryId, `${field}.repositoryId`); hash(item.snapshotId, `${field}.snapshotId`);
    repositoryIds.push(item.repositoryId); snapshotIds.push(item.snapshotId); resolvedSnapshots.push(item);
    zero(item.resticExitCode, `${field}.resticExitCode`);
    const createdAt = timestamp(item.createdAtUtc, `${field}.createdAtUtc`); within(createdAt, runWindow, `${field}.createdAtUtc`);
    if (createdAt !== null) snapshotProofTimes.push(createdAt);
    if (stableWindow && createdAt !== null && createdAt < stableWindow.end) issue(`${field}.createdAtUtc`, "snapshot_before_sources_complete");
    const target = obj(item.destination, `${field}.destination`);
    for (const key of ["offSourceHosts", "independentOfStaging", "clientSideEncryption"]) yes(target[key], `${field}.destination.${key}`);
    if (target.region !== "EU") issue(`${field}.destination.region`, "eu_required");
    const escrow = obj(item.keyEscrow, `${field}.keyEscrow`);
    yes(escrow.independent, `${field}.keyEscrow.independent`); yes(escrow.repositoryRecoveryKeyIncluded, `${field}.keyEscrow.repositoryRecoveryKeyIncluded`);
    const escrowEvidence = artifact(escrow.evidence, `${field}.keyEscrow.evidence`, runWindow);
    if (escrowEvidence.at !== null && createdAt !== null && escrowEvidence.at > createdAt) issue(`${field}.keyEscrow.evidence`, "key_escrow_after_snapshot");
    const declaredMembers = members(item.members, `${field}.members`);
    if (!sameMembers(declaredMembers, sourceArtifacts[kind])) issue(`${field}.members`, "artifact_coverage_mismatch");
    if (createdAt !== null && sourceArtifacts[kind].some((entry) => entry.at !== null && entry.at > createdAt)) issue(`${field}.members`, "snapshot_before_member");
    const read = obj(item.deepRead, `${field}.deepRead`); sameRun(read.runId, `${field}.deepRead.runId`);
    if (read.repositoryId !== item.repositoryId) issue(`${field}.deepRead.repositoryId`, "repository_mismatch");
    if (read.snapshotId !== item.snapshotId) issue(`${field}.deepRead.snapshotId`, "snapshot_mismatch");
    zero(read.exitCode, `${field}.deepRead.exitCode`); yes(read.complete, `${field}.deepRead.complete`); yes(read.independentClientRead, `${field}.deepRead.independentClientRead`);
    const checkedAt = timestamp(read.checkedAtUtc, `${field}.deepRead.checkedAtUtc`); within(checkedAt, runWindow, `${field}.deepRead.checkedAtUtc`);
    if (createdAt !== null && checkedAt !== null && checkedAt < createdAt) issue(`${field}.deepRead`, "read_before_snapshot");
    const readEvidence = artifact(read.evidence, `${field}.deepRead.evidence`, runWindow);
    if (readEvidence.at !== null) snapshotProofTimes.push(readEvidence.at);
    if (readEvidence.at !== null && checkedAt !== null && readEvidence.at < checkedAt) issue(`${field}.deepRead.evidence`, "evidence_before_check");
    if (!sameMembers(members(read.verifiedMembers, `${field}.deepRead.verifiedMembers`), sourceArtifacts[kind])) issue(`${field}.deepRead.verifiedMembers`, "read_coverage_mismatch");
  }
  if (new Set(repositoryIds).size !== 3) issue("snapshots", "repositories_not_distinct");
  if (new Set(snapshotIds).size !== 3) issue("snapshots", "snapshot_ids_not_distinct");

  // This describes a SEPARATE final private manifest artifact, never a digest
  // of this attestation JSON. Its delivery proof avoids self-reference.
  const final = obj(run.manifestOffHost, "manifestOffHost"); sameRun(final.runId, "manifestOffHost.runId");
  text(final.repositoryId, "manifestOffHost.repositoryId"); hash(final.snapshotId, "manifestOffHost.snapshotId");
  if (!resolvedSnapshots.some((item) => item.repositoryId === final.repositoryId)) issue("manifestOffHost", "unknown_manifest_repository");
  if (snapshotIds.includes(final.snapshotId)) issue("manifestOffHost.snapshotId", "manifest_snapshot_must_be_later_separate_delivery");
  zero(final.resticExitCode, "manifestOffHost.resticExitCode");
  const finalArtifact = artifact(final.artifact, "manifestOffHost.artifact", runWindow);
  if (snapshotProofTimes.length === 6 && finalArtifact.at !== null && finalArtifact.at < Math.max(...snapshotProofTimes)) issue("manifestOffHost.artifact", "manifest_before_snapshot_checks");
  const copiedAt = timestamp(final.copiedAtUtc, "manifestOffHost.copiedAtUtc"); within(copiedAt, runWindow, "manifestOffHost.copiedAtUtc");
  if (finalArtifact.at !== null && copiedAt !== null && copiedAt < finalArtifact.at) issue("manifestOffHost", "copy_before_manifest");
  const read = obj(final.independentClientRead, "manifestOffHost.independentClientRead");
  sameRun(read.runId, "manifestOffHost.independentClientRead.runId");
  if (read.repositoryId !== final.repositoryId) issue("manifestOffHost.independentClientRead.repositoryId", "repository_mismatch");
  if (read.snapshotId !== final.snapshotId) issue("manifestOffHost.independentClientRead.snapshotId", "snapshot_mismatch");
  zero(read.exitCode, "manifestOffHost.independentClientRead.exitCode"); yes(read.complete, "manifestOffHost.independentClientRead.complete");
  yes(read.independentClient, "manifestOffHost.independentClientRead.independentClient");
  hash(read.sha256, "manifestOffHost.independentClientRead.sha256"); count(read.bytes, "manifestOffHost.independentClientRead.bytes", true);
  if (read.sha256 !== finalArtifact.sha256 || read.bytes !== finalArtifact.bytes) issue("manifestOffHost.independentClientRead", "manifest_read_mismatch");
  const finalReadAt = timestamp(read.checkedAtUtc, "manifestOffHost.independentClientRead.checkedAtUtc"); within(finalReadAt, runWindow, "manifestOffHost.independentClientRead.checkedAtUtc");
  if (copiedAt !== null && finalReadAt !== null && finalReadAt < copiedAt) issue("manifestOffHost.independentClientRead", "read_before_manifest_copy");
  const finalEvidence = artifact(read.evidence, "manifestOffHost.independentClientRead.evidence", runWindow);
  if (finalEvidence.at !== null && finalReadAt !== null && finalEvidence.at < finalReadAt) issue("manifestOffHost.independentClientRead.evidence", "evidence_before_check");
  return { ok: issues.length === 0, issues, notice: CONSISTENCY_NOTICE, evidenceVerified: false, g09Accepted: false };
}

/** Reads exactly the supplied local JSON; never follows artifact references. */
export function runCli(argv, { stdout = process.stdout, stderr = process.stderr, now = new Date() } = {}) {
  if (argv.length === 1 && argv[0] === "--help") { stdout.write(HELP); return 0; }
  if (argv.length !== 1 || typeof argv[0] !== "string" || !argv[0] || argv[0].startsWith("-") || /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(argv[0]) || /^[\\/]{2}/.test(argv[0])) {
    stderr.write("Błąd argumentów. Użyj --help.\n"); return 2;
  }
  let fd; let parsed;
  try {
    if (!lstatSync(argv[0]).isFile()) throw new Error("regular_local_file_required");
    fd = openSync(argv[0], "r");
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_JSON_BYTES) throw new Error("invalid_local_file");
    const bytes = readFileSync(fd);
    if (bytes.byteLength > MAX_JSON_BYTES) throw new Error("input_limit");
    parsed = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, ""));
  } catch {
    stderr.write("Nie można odczytać poprawnego lokalnego manifestu JSON. Szczegóły wejścia są prywatne.\n"); return 2;
  } finally { if (fd !== undefined) closeSync(fd); }
  let result;
  try { result = validateBackupSet(parsed, { now }); }
  catch { stderr.write("Manifest ma nieprawidłową strukturę. Szczegóły wejścia są prywatne.\n"); return 1; }
  if (result.ok) { stdout.write(`${CONSISTENCY_NOTICE}\n`); return 0; }
  stderr.write("Manifest niepełny lub niespójny — nie potwierdza gotowości kopii.\n");
  // Field names/codes are static schema identifiers, never input values.
  for (const item of result.issues) stderr.write(`${item.field}: ${item.code}\n`);
  return 1;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = runCli(process.argv.slice(2));
}
