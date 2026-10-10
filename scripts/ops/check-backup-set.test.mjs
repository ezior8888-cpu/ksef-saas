import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONSISTENCY_NOTICE, runCli, validateBackupSet } from "./check-backup-set.mjs";

const NOW = new Date("2026-10-10T12:00:00.000Z");
const at = (time) => `2026-10-10T${time}:00.000Z`;
const opWindow = () => ({ startedAtUtc: at("11:01"), completedAtUtc: at("11:10") });

/** Synthetic claims only: no real backup, repository, object or credential. */
function fixture({ emptyApplication = false } = {}) {
  let nextHash = 0;
  const artifact = (time = "11:10") => ({ sha256: (++nextHash).toString(16).padStart(64, "0"), bytes: 100, createdAtUtc: at(time) });
  const manifest = {
    schemaVersion: 1, runId: "synthetic-run-1", startedAtUtc: at("11:00"), completedAtUtc: at("11:50"),
    stabilization: { startedAtUtc: at("11:00"), completedAtUtc: at("11:20"), mutationsExcluded: true, evidence: artifact("11:21") },
    sourceInventory: { runId: "synthetic-run-1", complete: true, databaseNames: ["postgres", "_supabase"], minioIds: ["application", "supabase"], operationWindow: opWindow(), artifact: artifact() },
    databases: ["postgres", "_supabase"].map((name) => ({ name, host: "db-1", runId: "synthetic-run-1", operationWindow: opWindow(), dump: { format: "custom", exitCode: 0, allSchemas: true, artifact: artifact() }, restoreListCheck: { exitCode: 0, checkedAtUtc: at("11:22"), evidence: artifact("11:23") } })),
    globals: { runId: "synthetic-run-1", scope: "globals-only", exitCode: 0, rolesIncluded: true, tablespacesIncluded: true, operationWindow: opWindow(), artifact: artifact() },
    recoveryBundle: { runId: "synthetic-run-1", encrypted: true, configurationIncluded: true, keysIncluded: true, operationWindow: opWindow(), artifact: artifact() },
    minio: ["application", "supabase"].map((id) => {
      const empty = id === "supabase" || emptyApplication;
      const counters = { bucketCount: 1, currentObjectCount: empty ? 0 : 31, currentObjectBytes: empty ? 0 : 378638, allVersionCount: empty ? 0 : 31, allVersionBytes: empty ? 0 : 378638, deleteMarkerCount: 0, multipartUploadCount: 0, versioningCounts: { Enabled: 0, Suspended: 0, Unversioned: 1 } };
      const hashArtifact = artifact();
      return { id, host: id === "application" ? "ops-1" : "db-1", runId: "synthetic-run-1", operationWindow: opWindow(), source: counters, exported: structuredClone(counters), listingComplete: { buckets: true, currentObjects: true, versions: true, versioning: true, multipartUploads: true }, exportComplete: true, metadataComplete: true, bucketConfigurationComplete: true, objectHashManifest: { complete: true, sourceSha256: hashArtifact.sha256, exportedSha256: hashArtifact.sha256, artifact: hashArtifact }, sourceListingArtifact: artifact(), exportArtifact: artifact(), metadataArtifact: artifact(), bucketConfigurationArtifact: artifact() };
    }),
    references: { runId: "synthetic-run-1", complete: true, missing: 0, unknown: 0, hashMismatches: 0, operationWindow: opWindow(), checkedAtUtc: at("11:09"), evidence: artifact() },
  };
  const member = (item) => ({ sha256: item.sha256, bytes: item.bytes });
  const dbArtifacts = [manifest.sourceInventory.artifact, manifest.stabilization.evidence, ...manifest.databases.flatMap((db) => [db.dump.artifact, db.restoreListCheck.evidence]), manifest.globals.artifact, manifest.recoveryBundle.artifact, manifest.references.evidence];
  const artifactsFor = (kind) => kind === "database" ? dbArtifacts : (() => { const item = manifest.minio.find((entry) => entry.id === kind); return [item.objectHashManifest.artifact, item.sourceListingArtifact, item.exportArtifact, item.metadataArtifact, item.bucketConfigurationArtifact]; })();
  manifest.snapshots = ["database", "application", "supabase"].map((kind) => {
    const repositoryId = `synthetic-${kind}-repository`;
    const snapshotId = artifact().sha256;
    const members = artifactsFor(kind).map(member);
    return { kind, runId: manifest.runId, repositoryId, snapshotId, createdAtUtc: at("11:30"), resticExitCode: 0, destination: { offSourceHosts: true, independentOfStaging: true, region: "EU", clientSideEncryption: true }, members, keyEscrow: { independent: true, repositoryRecoveryKeyIncluded: true, evidence: artifact("11:24") }, deepRead: { runId: manifest.runId, repositoryId, snapshotId, exitCode: 0, complete: true, independentClientRead: true, checkedAtUtc: at("11:35"), verifiedMembers: structuredClone(members), evidence: artifact("11:36") } };
  });
  const finalArtifact = artifact("11:40");
  const finalSnapshot = artifact().sha256;
  manifest.manifestOffHost = { runId: manifest.runId, repositoryId: manifest.snapshots[0].repositoryId, snapshotId: finalSnapshot, resticExitCode: 0, artifact: finalArtifact, copiedAtUtc: at("11:42"), independentClientRead: { runId: manifest.runId, repositoryId: manifest.snapshots[0].repositoryId, snapshotId: finalSnapshot, exitCode: 0, complete: true, independentClient: true, checkedAtUtc: at("11:45"), sha256: finalArtifact.sha256, bytes: finalArtifact.bytes, evidence: artifact("11:46") } };
  return manifest;
}

function check(manifest) { return validateBackupSet(manifest, { now: NOW }); }
function rejected(change, code) {
  const manifest = fixture(); change(manifest);
  const result = check(manifest); assert.equal(result.ok, false);
  if (code) assert.ok(result.issues.some((issue) => issue.code === code), JSON.stringify(result.issues));
  assert.equal(result.evidenceVerified, false); assert.equal(result.g09Accepted, false);
  return result;
}

test("coherent synthetic claims are not authenticated evidence or G09 acceptance", () => {
  const result = check(fixture()); assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.deepEqual(result.issues, []); assert.equal(result.evidenceVerified, false); assert.equal(result.g09Accepted, false);
  assert.equal(result.notice, CONSISTENCY_NOTICE);
});
test("complete empty S3 is allowed; payload object count is not archive bytes", () => {
  assert.equal(check(fixture({ emptyApplication: true })).ok, true);
});
test("_supabase cannot be omitted from a full DB set", () => rejected((m) => { m.databases.pop(); }, "missing_or_duplicate_database"));
test("source inventory must list every source, not just declarations about artifacts", () => rejected((m) => { delete m.sourceInventory; }, "required_object"));
test("duplicate database does not cover a missing second database", () => rejected((m) => { m.databases[1] = structuredClone(m.databases[0]); }, "missing_or_duplicate_database"));
test("a dump failed despite an artifact cannot be accepted", () => rejected((m) => { m.databases[0].dump.exitCode = 1; }, "required_zero"));
test("plain SQL / filtered dumps do not satisfy the declared custom full-database contract", () => {
  rejected((m) => { m.databases[0].dump.format = "plain"; }, "custom_format_required");
  rejected((m) => { m.databases[0].dump.allSchemas = false; }, "required_true");
});
test("pg_restore --list failure is distinct from a successful dump", () => rejected((m) => { m.databases[1].restoreListCheck.exitCode = 1; }, "required_zero"));
test("roles-only globals do not include tablespaces", () => {
  rejected((m) => { m.globals.scope = "roles-only"; }, "globals_only_required");
  rejected((m) => { m.globals.tablespacesIncluded = false; }, "required_true");
});
test("restic code 3 means source read failures even with a snapshot ID", () => rejected((m) => { m.snapshots[1].resticExitCode = 3; }, "required_zero"));
test("restic deep check code 3 also fails", () => rejected((m) => { m.snapshots[0].deepRead.exitCode = 3; }, "required_zero"));
test("snapshot and its independent read must belong to this same run", () => {
  rejected((m) => { m.snapshots[0].runId = "other-run"; }, "run_id_mismatch");
  rejected((m) => { m.snapshots[1].deepRead.runId = "other-run"; }, "run_id_mismatch");
});
test("three labels for one repository or snapshot are not three independent repositories", () => {
  rejected((m) => { m.snapshots[2].repositoryId = m.snapshots[0].repositoryId; }, "repositories_not_distinct");
  rejected((m) => { m.snapshots[2].snapshotId = m.snapshots[0].snapshotId; }, "snapshot_ids_not_distinct");
});
test("snapshot members must cover all source artifacts", () => rejected((m) => { m.snapshots[0].members.pop(); }, "artifact_coverage_mismatch"));
test("independent deep read must cover these members, not an unrelated snapshot", () => {
  rejected((m) => { m.snapshots[2].deepRead.verifiedMembers.pop(); }, "read_coverage_mismatch");
  rejected((m) => { m.snapshots[1].deepRead.snapshotId = "a".repeat(64); }, "snapshot_mismatch");
  rejected((m) => { m.snapshots[1].deepRead.repositoryId = "unrelated"; }, "repository_mismatch");
});
test("same-host check is not an independent client read", () => rejected((m) => { m.snapshots[0].deepRead.independentClientRead = false; }, "required_true"));
test("EU/off-host/encryption/escrow are mandatory claims", () => {
  rejected((m) => { m.snapshots[1].destination.region = "US"; }, "eu_required");
  rejected((m) => { m.snapshots[1].destination.offSourceHosts = false; }, "required_true");
  rejected((m) => { m.snapshots[1].destination.clientSideEncryption = false; }, "required_true");
  rejected((m) => { m.snapshots[1].keyEscrow.independent = false; }, "required_true");
  rejected((m) => { m.recoveryBundle.keysIncluded = false; }, "required_true");
});
test("a future timestamp anywhere in the set fails", () => {
  rejected((m) => { m.databases[0].dump.artifact.createdAtUtc = at("12:01"); }, "future_timestamp");
  rejected((m) => { m.manifestOffHost.independentClientRead.checkedAtUtc = "2026-10-11T12:00:00Z"; }, "future_timestamp");
});
test("UTC is required and calendar-invalid dates are rejected", () => {
  rejected((m) => { m.startedAtUtc = "2026-10-10T13:00:00+02:00"; }, "invalid_utc_timestamp");
  rejected((m) => { m.startedAtUtc = "2026-02-30T11:00:00Z"; }, "invalid_utc_timestamp");
});
test("26-hour freshness uses the last complete success, not job start time", () => {
  const m = fixture(); m.startedAtUtc = "2026-10-09T09:00:00Z";
  assert.equal(check(m).ok, true);
  const staleNow = new Date("2026-10-11T14:00:00Z");
  assert.ok(validateBackupSet(fixture(), { now: staleNow }).issues.some((issue) => issue.code === "older_than_26h"));
});
test("checks cannot predate artifacts or snapshots", () => {
  rejected((m) => { m.databases[0].restoreListCheck.checkedAtUtc = at("11:01"); }, "check_before_artifact");
  rejected((m) => { m.snapshots[0].deepRead.checkedAtUtc = at("11:29"); }, "read_before_snapshot");
  rejected((m) => { m.databases[0].restoreListCheck.evidence.createdAtUtc = at("11:31"); }, "snapshot_before_member");
});
test("every source operation must fit the common stabilization window", () => {
  rejected((m) => { m.minio[0].operationWindow.completedAtUtc = at("11:21"); }, "outside_window");
  rejected((m) => { m.globals.operationWindow.startedAtUtc = at("10:59"); }, "outside_window");
  rejected((m) => { m.stabilization.mutationsExcluded = false; }, "required_true");
});
test("Enabled/Suspended or delete markers are unsupported in v1, even with complete flags", () => {
  rejected((m) => { m.minio[0].source.versioningCounts = { Enabled: 1, Suspended: 0, Unversioned: 0 }; }, "UNSUPPORTED_VERSIONING");
  rejected((m) => { m.minio[1].source.versioningCounts = { Enabled: 0, Suspended: 1, Unversioned: 0 }; }, "UNSUPPORTED_VERSIONING");
  rejected((m) => { m.minio[1].source.deleteMarkerCount = 1; }, "UNSUPPORTED_VERSIONING");
});
test("Unversioned all-version listing includes current objects, not extra payload bytes", () => rejected((m) => { m.minio[0].source.allVersionBytes *= 2; }, "unversioned_counts_mismatch"));
test("equal aggregate counts do not prove the same object set", () => rejected((m) => { m.minio[0].objectHashManifest.sourceSha256 = "b".repeat(64); }, "object_identity_mismatch"));
test("partial empty S3 cannot be misreported as successful zero objects", () => {
  rejected((m) => { m.minio[1].listingComplete.currentObjects = false; }, "required_true");
  rejected((m) => { m.minio[1].listingComplete.versions = false; }, "required_true");
  rejected((m) => { m.minio[1].exportComplete = false; }, "required_true");
});
test("unknown or outstanding multipart uploads fail", () => {
  rejected((m) => { delete m.minio[1].source.multipartUploadCount; }, "invalid_integer");
  rejected((m) => { m.minio[0].source.multipartUploadCount = 1; }, "required_zero");
  rejected((m) => { m.minio[1].listingComplete.multipartUploads = false; }, "required_true");
});
test("missing, unknown and mismatched DB references all fail", () => {
  for (const field of ["missing", "unknown", "hashMismatches"]) rejected((m) => { m.references[field] = 1; }, "required_zero");
});
test("reference evidence cannot predate the DB to S3 check", () => rejected((m) => { m.references.evidence.createdAtUtc = at("11:01"); }, "evidence_before_check"));
test("source and export byte/count mismatches fail even with complete flags", () => rejected((m) => { m.minio[0].exported.currentObjectBytes -= 1; }, "source_export_mismatch"));
test("artifact digests/bytes are bounded claims, not local verification", () => {
  rejected((m) => { m.globals.artifact.sha256 = "not-a-hash"; }, "invalid_sha256");
  rejected((m) => { m.databases[0].dump.artifact.bytes = 0; }, "invalid_integer");
  rejected((m) => { m.minio[0].source.currentObjectBytes = Number.MAX_SAFE_INTEGER + 1; }, "invalid_integer");
});
test("same content can serve two evidence roles but conflicting byte claims cannot", () => {
  const m = fixture(); const minio = m.minio[0]; const previous = minio.metadataArtifact.sha256;
  minio.metadataArtifact = structuredClone(minio.bucketConfigurationArtifact);
  const snapshot = m.snapshots[1];
  snapshot.members = snapshot.members.filter((item) => item.sha256 !== previous);
  snapshot.deepRead.verifiedMembers = structuredClone(snapshot.members);
  assert.equal(check(m).ok, true);
  rejected((item) => { item.minio[0].metadataArtifact.sha256 = item.minio[0].bucketConfigurationArtifact.sha256; item.minio[0].metadataArtifact.bytes += 1; }, "digest_size_mismatch");
});
test("final private manifest must be independently read from later separate delivery", () => {
  rejected((m) => { delete m.manifestOffHost; }, "required_object");
  rejected((m) => { m.manifestOffHost.snapshotId = m.snapshots[0].snapshotId; }, "manifest_snapshot_must_be_later_separate_delivery");
  rejected((m) => { m.manifestOffHost.independentClientRead.sha256 = "c".repeat(64); }, "manifest_read_mismatch");
  rejected((m) => { m.manifestOffHost.independentClientRead.independentClient = false; }, "required_true");
  rejected((m) => { m.manifestOffHost.resticExitCode = 3; }, "required_zero");
});

function cliWithFile(content, fn) {
  const directory = mkdtempSync(path.join(tmpdir(), "f0-backup-validator-test-"));
  const file = path.join(directory, "synthetic-private-file.json");
  try { writeFileSync(file, content); return fn(file); }
  finally { unlinkSync(file); rmdirSync(directory); }
}
function output() { const parts = []; return { parts, write: (value) => { parts.push(value); } }; }

test("CLI success reports only claims, never paths/run/repository/private values", () => {
  const stdout = output(); const stderr = output(); const m = fixture();
  cliWithFile(JSON.stringify(m), (file) => assert.equal(runCli([file], { now: NOW, stdout, stderr }), 0));
  assert.equal(stderr.parts.length, 0); assert.equal(stdout.parts.join(""), `${CONSISTENCY_NOTICE}\n`);
  assert.ok(!stdout.parts.join("").includes(m.runId));
  assert.ok(!stdout.parts.join("").includes(m.snapshots[0].repositoryId));
});
test("CLI JSON/type/read failures never echo raw private text or names", () => {
  const secret = "synthetic-private-secret-do-not-echo";
  for (const content of [`{"secret":"${secret}",`, JSON.stringify({ runId: secret })]) {
    const stdout = output(); const stderr = output();
    cliWithFile(content, (file) => assert.notEqual(runCli([file], { now: NOW, stdout, stderr }), 0));
    assert.ok(![...stdout.parts, ...stderr.parts].join("").includes(secret));
  }
  const stdout = output(); const stderr = output();
  assert.equal(runCli([path.join(tmpdir(), secret, "not-present.json")], { now: NOW, stdout, stderr }), 2);
  assert.ok(!stderr.parts.join("").includes(secret));
});
test("arbitrary JSON timestamp types fail safely, including an invalid toString object", () => {
  for (const value of [{ toString: "synthetic-private-bad-type" }, [], null, 42, true]) {
    const m = fixture(); m.snapshots[0].createdAtUtc = value;
    assert.equal(check(m).ok, false);
    const stdout = output(); const stderr = output();
    cliWithFile(JSON.stringify(m), (file) => assert.equal(runCli([file], { now: NOW, stdout, stderr }), 1));
    assert.ok(!stderr.parts.join("").includes("synthetic-private-bad-type"));
    assert.ok(!stderr.parts.join("").includes("TypeError"));
  }
});
test("CLI rejects URLs, UNC paths, execution switches, extra args and oversized JSON", () => {
  for (const args of [["https://example.invalid/secret.json"], ["\\\\host\\private\\manifest.json"], ["//host/private/manifest.json"], ["--execute"], [], ["a.json", "b.json"]]) {
    assert.equal(runCli(args, { stdout: output(), stderr: output(), now: NOW }), 2);
  }
  cliWithFile(" ".repeat(1024 * 1024 + 1), (file) => assert.equal(runCli([file], { stdout: output(), stderr: output(), now: NOW }), 2));
});
test("help describes exit semantics and the limited v1 format", () => {
  const stdout = output(); assert.equal(runCli(["--help"], { stdout, stderr: output() }), 0);
  assert.match(stdout.parts.join(""), /Exit 0:.*bez potwierdzenia/); assert.match(stdout.parts.join(""), /Unversioned/);
});
test("public NOT_RUN example is intentionally invalid", () => {
  const example = JSON.parse(readFileSync(new URL("../../ops/observability/backup/manifest.example.json", import.meta.url), "utf8"));
  assert.equal(check(example).ok, false);
});
test("module has no executor/network imports and importing leaves CLI uninvoked", async () => {
  const before = process.exitCode;
  const imported = await import(`./check-backup-set.mjs?inert-test=${Date.now()}`);
  assert.equal(typeof imported.validateBackupSet, "function"); assert.equal(process.exitCode, before);
  const source = readFileSync(fileURLToPath(new URL("./check-backup-set.mjs", import.meta.url)), "utf8");
  assert.doesNotMatch(source, /from\s+["']node:(?:child_process|http|https|net|tls|dgram)["']/);
  assert.doesNotMatch(source, /\b(?:fetch|execFile|execSync|spawn)\s*\(/);
});
