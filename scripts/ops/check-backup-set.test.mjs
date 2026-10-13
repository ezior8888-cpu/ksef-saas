import test from "node:test";
import assert from "node:assert/strict";
import { closeSync, constants, fstatSync, mkdtempSync, openSync, readFileSync, readSync, renameSync, rmdirSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
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
test("path replacement after fstat cannot redirect the descriptor read or mutate either object", () => {
  const original = JSON.stringify(fixture());
  const replacement = '{"private":"synthetic-replacement-secret",';
  const stdout = output(); const stderr = output();
  cliWithFile(original, (file) => {
    const moved = path.join(path.dirname(file), "opened-original.json");
    let opened; let opens = 0; let replaced = false; let closed = false;
    const files = {
      openSync: (name, flags) => {
        opens += 1; assert.equal(name, file); assert.equal(typeof flags, "number");
        assert.equal(flags & (constants.O_WRONLY | constants.O_RDWR | constants.O_CREAT | constants.O_TRUNC), 0);
        if (typeof constants.O_NOFOLLOW === "number") assert.equal(flags & constants.O_NOFOLLOW, constants.O_NOFOLLOW);
        opened = openSync(name, flags); return opened;
      },
      fstatSync: (fd) => {
        assert.equal(fd, opened); const stat = fstatSync(fd);
        renameSync(file, moved); writeFileSync(file, replacement); replaced = true;
        return stat;
      },
      readSync: (fd, ...args) => { assert.equal(fd, opened); assert.equal(replaced, true); return readSync(fd, ...args); },
      closeSync: (fd) => { assert.equal(fd, opened); closeSync(fd); closed = true; },
    };
    try {
      assert.equal(runCli([file], { now: NOW, stdout, stderr, files }), 0);
      assert.equal(opens, 1); assert.equal(closed, true);
      assert.equal(readFileSync(moved, "utf8"), original);
      assert.equal(readFileSync(file, "utf8"), replacement);
      assert.equal(stderr.parts.length, 0);
      assert.ok(!stdout.parts.join("").includes("synthetic-replacement-secret"));
    } finally { if (replaced) unlinkSync(moved); }
  });
});
test("ordinary validation never writes or truncates the supplied manifest", () => {
  const original = Buffer.from(`\uFEFF${JSON.stringify(fixture())}\n`);
  cliWithFile(original, (file) => {
    assert.equal(runCli([file], { now: NOW, stdout: output(), stderr: output() }), 0);
    assert.deepEqual(readFileSync(file), original);
  });
});
test("nonregular descriptor is rejected and closed before any read", () => {
  let opened = 0; let closed = 0;
  const files = {
    openSync: (_file, flags) => { assert.equal(typeof flags, "number"); opened += 1; return 37; },
    fstatSync: (fd) => { assert.equal(fd, 37); return { isFile: () => false, size: 10 }; },
    readSync: () => assert.fail("nonregular input must not be read"),
    closeSync: (fd) => { assert.equal(fd, 37); closed += 1; },
  };
  assert.equal(runCli(["synthetic-input.json"], { now: NOW, stdout: output(), stderr: output(), files }), 2);
  assert.equal(opened, 1); assert.equal(closed, 1);
});
test("growth after fstat is bounded to the input limit plus one detection byte", () => {
  let total = 0; let closed = false;
  const files = {
    openSync: () => 37,
    fstatSync: () => ({ isFile: () => true, size: 1 }),
    readSync: (fd, buffer, offset, length) => {
      assert.equal(fd, 37); assert.ok(buffer.byteLength <= 1024 * 1024 + 1);
      buffer.fill(32, offset, offset + length); total += length; return length;
    },
    closeSync: () => { closed = true; },
  };
  assert.equal(runCli(["synthetic-growing.json"], { now: NOW, stdout: output(), stderr: output(), files }), 2);
  assert.equal(total, 1024 * 1024 + 1); assert.equal(closed, true);
});
test("descriptor errors are sanitized and still attempt closing the handle", () => {
  const secret = "synthetic-private-fs-error";
  for (const failingStep of ["open", "stat", "read", "close"]) {
    const stdout = output(); const stderr = output(); let closeAttempts = 0;
    const files = {
      openSync: () => { if (failingStep === "open") throw new Error(secret); return 37; },
      fstatSync: () => { if (failingStep === "stat") throw new Error(secret); return { isFile: () => true, size: 1 }; },
      readSync: () => { if (failingStep === "read") throw new Error(secret); return 0; },
      closeSync: () => { closeAttempts += 1; if (failingStep === "close") throw new Error(secret); },
    };
    assert.equal(runCli(["synthetic-input.json"], { now: NOW, stdout, stderr, files }), 2);
    assert.equal(closeAttempts, failingStep === "open" ? 0 : 1);
    assert.ok(![...stdout.parts, ...stderr.parts].join("").includes(secret));
  }
});
test("POSIX O_NOFOLLOW rejects a final symlink without altering its target", { skip: typeof constants.O_NOFOLLOW !== "number" }, () => {
  const original = JSON.stringify(fixture());
  cliWithFile(original, (file) => {
    const link = path.join(path.dirname(file), "manifest-link.json");
    symlinkSync(file, link);
    try {
      assert.equal(runCli([link], { now: NOW, stdout: output(), stderr: output() }), 2);
      assert.equal(readFileSync(file, "utf8"), original);
    } finally { unlinkSync(link); }
  });
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


const SOURCE_REVISION_V2 = "face09c57f7de756546e58d092dbe6d280f93c91";
const WRITERS_V2 = ["web", "worker", "crons", "database-admin", "s3-upload-delete", "s3-lifecycle", "supabase-storage"];
function fixtureV2() {
  const m = fixture();
  m.schemaVersion = 2; m.mode = "synthetic"; m.sourceRevision = SOURCE_REVISION_V2;
  const sealEvidence = { sha256: "f".repeat(64), bytes: 333, createdAtUtc: at("11:25") };
  const resumeEvidence = { sha256: "e".repeat(64), bytes: 444, createdAtUtc: at("11:28") };
  m.sourceBoundary = {
    windowId: "synthetic-window",
    seal: { runId: m.runId, windowId: "synthetic-window", sourceRevision: SOURCE_REVISION_V2,
      status: "LOCAL_SOURCES_SEALED", closedSourceClients: true, durability: "SYNTHETIC_ONLY",
      completedAtUtc: at("11:25"), evidence: sealEvidence },
    resume: { runId: m.runId, windowId: "synthetic-window", sourceRevision: SOURCE_REVISION_V2,
      sealSha256: sealEvidence.sha256, status: "RESUMED", coveredWriters: [...WRITERS_V2],
      sourceReadsStopped: true, originalStateRestored: true, startedAtUtc: at("11:26"),
      completedAtUtc: at("11:27"), evidence: resumeEvidence }
  };
  const extra = [sealEvidence, resumeEvidence].map(({ sha256, bytes }) => ({ sha256, bytes }));
  m.snapshots[0].members.push(...extra);
  m.snapshots[0].deepRead.verifiedMembers.push(...structuredClone(extra));
  return m;
}
function rejectedV2(change, code) {
  const m = fixtureV2(); change(m);
  const result = check(m);
  assert.equal(result.ok, false);
  if (code) assert.ok(result.issues.some(issue => issue.code === code), JSON.stringify(result.issues));
  assert.equal(result.evidenceVerified, false); assert.equal(result.g09Accepted, false);
  return result;
}

test("v2 accepts coherent sealed-and-resumed synthetic claims without authenticating them", () => {
  const result = check(fixtureV2());
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.equal(result.evidenceVerified, false); assert.equal(result.g09Accepted, false);
});
test("v2 operational mode requires POSIX durability while synthetic mode may report either supported kind", () => {
  const m = fixtureV2(); m.mode = "separately-authorized"; m.sourceBoundary.seal.durability = "POSIX_FSYNC";
  assert.equal(check(m).ok, true);
  m.mode = "synthetic"; assert.equal(check(m).ok, true);
  rejectedV2(m => { m.mode = "separately-authorized"; }, "posix_durability_required");
  rejectedV2(m => { m.sourceBoundary.seal.durability = "PRIVATE arbitrary durability"; }, "unsupported_durability");
  rejectedV2(m => { delete m.mode; }, "unsupported_mode");
});
test("v2 requires the boundary, seal and resume objects instead of booleans or missing receipts", () => {
  for (const key of ["seal", "resume"]) for (const value of [undefined, null, true, []]) {
    rejectedV2(m => { m.sourceBoundary[key] = value; }, "required_object");
  }
  rejectedV2(m => { delete m.sourceBoundary; }, "required_object");
});
test("v2 seal and resume identities bind the same run, window and pinned source revision", () => {
  for (const key of ["seal", "resume"]) {
    rejectedV2(m => { m.sourceBoundary[key].runId = "PRIVATE other run"; }, "run_id_mismatch");
    rejectedV2(m => { m.sourceBoundary[key].windowId = "PRIVATE other window"; }, "window_id_mismatch");
    rejectedV2(m => { m.sourceBoundary[key].sourceRevision = "a".repeat(40); }, "source_revision_mismatch");
  }
  rejectedV2(m => { m.sourceBoundary.windowId = ""; }, "required_string");
  rejectedV2(m => { m.sourceBoundary.resume.sealSha256 = "d".repeat(64); }, "seal_digest_mismatch");
  rejectedV2(m => { m.sourceBoundary.resume.sealSha256 = "PRIVATE invalid hash"; }, "invalid_sha256");
});
test("v2 only accepts explicitly sealed sources and a completed resume", () => {
  for (const status of ["FAILED", "UNKNOWN", "PENDING", true, undefined]) {
    rejectedV2(m => { m.sourceBoundary.seal.status = status; }, "sources_not_sealed");
    rejectedV2(m => { m.sourceBoundary.resume.status = status; }, "writes_not_resumed");
  }
  for (const key of ["sourceReadsStopped", "originalStateRestored"]) {
    rejectedV2(m => { m.sourceBoundary.resume[key] = false; }, "required_true");
    rejectedV2(m => { delete m.sourceBoundary.resume[key]; }, "required_true");
  }
  rejectedV2(m => { m.sourceBoundary.seal.closedSourceClients = false; }, "required_true");
});
test("v2 resume covers each required writer exactly once", () => {
  for (const writers of [undefined, [], WRITERS_V2.slice(1), [...WRITERS_V2, "extra"],
    [WRITERS_V2[0], ...WRITERS_V2.slice(0, -1)]]) {
    rejectedV2(m => { m.sourceBoundary.resume.coveredWriters = writers; }, "incomplete_or_duplicate_sources");
  }
});
test("v2 sealing cannot predate stabilization, source artifacts or its own evidence", () => {
  rejectedV2(m => { m.sourceBoundary.seal.completedAtUtc = at("11:19"); }, "seal_before_stabilization_end");
  rejectedV2(m => { m.databases[0].restoreListCheck.evidence.createdAtUtc = at("11:26"); }, "seal_before_source_artifact");
  rejectedV2(m => { m.sourceBoundary.seal.evidence.createdAtUtc = at("11:24"); }, "evidence_before_seal");
  rejectedV2(m => { m.sourceBoundary.seal.evidence.createdAtUtc = at("11:27"); }, "resume_before_seal_evidence");
});
test("v2 resume chronology requires seal then request, completion and receipt", () => {
  rejectedV2(m => { m.sourceBoundary.resume.startedAtUtc = at("11:24"); }, "resume_before_seal");
  rejectedV2(m => { m.sourceBoundary.resume.completedAtUtc = at("11:25"); }, "reversed_window");
  rejectedV2(m => { m.sourceBoundary.resume.evidence.createdAtUtc = at("11:26"); }, "evidence_before_resume");
});
test("v2 every boundary timestamp is valid UTC and lies within the run", () => {
  const paths = [["seal", "completedAtUtc"], ["seal", "evidence", "createdAtUtc"],
    ["resume", "startedAtUtc"], ["resume", "completedAtUtc"], ["resume", "evidence", "createdAtUtc"]];
  for (const keys of paths) {
    const change = value => m => {
      let valueAt = m.sourceBoundary;
      for (const key of keys.slice(0, -1)) valueAt = valueAt[key];
      valueAt[keys.at(-1)] = value;
    };
    rejectedV2(change("not-a-date"), "invalid_utc_timestamp");
    rejectedV2(change(at("12:01")), "future_timestamp");
    rejectedV2(change(at("11:51")), "outside_window");
  }
});
test("v2 every snapshot must follow the durable resume receipt", () => {
  for (let i = 0; i < 3; i++) {
    rejectedV2(m => { m.snapshots[i].createdAtUtc = at("11:27"); }, "snapshot_before_resume_evidence");
  }
});
test("v2 seal and resume receipts are required in both database snapshot and independent read coverage", () => {
  for (const key of ["seal", "resume"]) for (const side of ["snapshot", "read"]) {
    rejectedV2(m => {
      const sha = m.sourceBoundary[key].evidence.sha256;
      if (side === "snapshot") m.snapshots[0].members = m.snapshots[0].members.filter(x => x.sha256 !== sha);
      else m.snapshots[0].deepRead.verifiedMembers = m.snapshots[0].deepRead.verifiedMembers.filter(x => x.sha256 !== sha);
    }, side === "snapshot" ? "artifact_coverage_mismatch" : "read_coverage_mismatch");
  }
});
test("v2 zero-byte, malformed and mismatched boundary evidence cannot be accepted", () => {
  for (const key of ["seal", "resume"]) {
    rejectedV2(m => { m.sourceBoundary[key].evidence.bytes = 0; }, "invalid_integer");
    rejectedV2(m => { m.sourceBoundary[key].evidence.sha256 = "PRIVATE"; }, "invalid_sha256");
    rejectedV2(m => { m.sourceBoundary[key].evidence.bytes++; }, "artifact_coverage_mismatch");
  }
});
test("legacy v1 remains readable but cannot carry v2 or alternate lifecycle claims", () => {
  assert.equal(check(fixture()).ok, true);
  for (const key of ["mode", "sourceBoundary", "sourceSeal", "writeResume", "writeLifecycle",
    "sourceLifecycle", "writeWindow", "seal", "resume", "resumeReceipt", "sealReceipt", "resumed", "sealed"]) {
    const m = fixture(); m[key] = key === "mode" ? "synthetic" : { status: "FAILED" };
    const result = check(m);
    assert.equal(result.ok, false, key);
    assert.ok(result.issues.some(issue => issue.code === "v2_field_in_legacy_manifest"));
  }
});
test("v2 cannot be downgraded by relabeling its schemaVersion", () => {
  const m = fixtureV2(); m.schemaVersion = 1;
  assert.ok(check(m).issues.some(issue => issue.code === "v2_field_in_legacy_manifest"));
});
test("v2 CLI uses static field codes and never prints private receipt identifiers or raw states", () => {
  const m = fixtureV2(); m.sourceBoundary.resume.windowId = "PRIVATE_WINDOW_SECRET";
  m.sourceBoundary.resume.status = "PRIVATE_STATUS_SECRET";
  const stdout = output(), stderr = output();
  cliWithFile(JSON.stringify(m), file => assert.equal(runCli([file], { now: NOW, stdout, stderr }), 1));
  assert.ok(!stderr.parts.join("").includes("PRIVATE")); assert.equal(stdout.parts.length, 0);
});
test("retention supports valid mixed v1 and v2 history and protects all input for incomplete v2", async () => {
  const { planBackupRetention } = await import("./plan-backup-retention.mjs");
  const legacy = fixture(), current = JSON.parse(JSON.stringify(fixtureV2()).replaceAll("synthetic-run-1", "synthetic-run-2"));
  current.snapshots.forEach((item, i) => {
    item.snapshotId = (4096 + i).toString(16).padStart(64, "0");
    item.deepRead.snapshotId = item.snapshotId;
  });
  current.manifestOffHost.snapshotId = "c".repeat(64);
  current.manifestOffHost.independentClientRead.snapshotId = current.manifestOffHost.snapshotId;
  const input = { schemaVersion: 1, asOfUtc: NOW.toISOString(), manifests: [legacy, current] };
  const valid = planBackupRetention(input);
  assert.equal(valid.deletionPlanBlocked, false, JSON.stringify(valid.issues));
  assert.equal(valid.completeRunCount, 2);
  delete current.sourceBoundary.resume;
  const invalid = planBackupRetention(input);
  assert.equal(invalid.deletionPlanBlocked, true); assert.equal(invalid.protectAllInput, true);
});

test("v2 requires the pinned top-level source revision and legacy cannot carry that declaration", () => {
  rejectedV2(m => { delete m.sourceRevision; }, "source_revision_mismatch");
  rejectedV2(m => { m.sourceRevision = "a".repeat(40); }, "source_revision_mismatch");
  const legacy = fixture(); legacy.sourceRevision = SOURCE_REVISION_V2;
  assert.ok(check(legacy).issues.some(issue => issue.code === "v2_field_in_legacy_manifest"));
});
