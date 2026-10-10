import test from "node:test";
import assert from "node:assert/strict";
import { closeSync, fstatSync, mkdtempSync, openSync, readFileSync, readSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { planBackupRetention, runCli } from "./plan-backup-retention.mjs";
import { validateBackupSet } from "./check-backup-set.mjs";

let sequence = 0;
/** Complete synthetic claims only; no repository, account or real backup. */
function fullRun(completedAtUtc, runId = `synthetic-${++sequence}`) {
  let nextHash = sequence * 1000;
  const start = Date.parse(completedAtUtc) - 50 * 60000;
  const at = (minutes) => new Date(start + minutes * 60000).toISOString();
  const artifact = (minutes = 10) => ({ sha256: (++nextHash).toString(16).padStart(64, "0"), bytes: 100, createdAtUtc: at(minutes) });
  const operationWindow = () => ({ startedAtUtc: at(1), completedAtUtc: at(10) });
  const manifest = {
    schemaVersion: 1, runId, startedAtUtc: at(0), completedAtUtc: at(50),
    stabilization: { startedAtUtc: at(0), completedAtUtc: at(20), mutationsExcluded: true, evidence: artifact(21) },
    sourceInventory: { runId, complete: true, databaseNames: ["postgres", "_supabase"], minioIds: ["application", "supabase"], operationWindow: operationWindow(), artifact: artifact() },
    databases: ["postgres", "_supabase"].map((name) => ({ name, host: "db-1", runId, operationWindow: operationWindow(), dump: { format: "custom", exitCode: 0, allSchemas: true, artifact: artifact() }, restoreListCheck: { exitCode: 0, checkedAtUtc: at(22), evidence: artifact(23) } })),
    globals: { runId, scope: "globals-only", exitCode: 0, rolesIncluded: true, tablespacesIncluded: true, operationWindow: operationWindow(), artifact: artifact() },
    recoveryBundle: { runId, encrypted: true, configurationIncluded: true, keysIncluded: true, operationWindow: operationWindow(), artifact: artifact() },
    minio: ["application", "supabase"].map((id) => {
      const counts = { bucketCount: 1, currentObjectCount: 0, currentObjectBytes: 0, allVersionCount: 0, allVersionBytes: 0, deleteMarkerCount: 0, multipartUploadCount: 0, versioningCounts: { Enabled: 0, Suspended: 0, Unversioned: 1 } };
      const hashes = artifact();
      return { id, host: id === "application" ? "ops-1" : "db-1", runId, operationWindow: operationWindow(), source: counts, exported: structuredClone(counts), listingComplete: { buckets: true, currentObjects: true, versions: true, versioning: true, multipartUploads: true }, exportComplete: true, metadataComplete: true, bucketConfigurationComplete: true, objectHashManifest: { complete: true, sourceSha256: hashes.sha256, exportedSha256: hashes.sha256, artifact: hashes }, sourceListingArtifact: artifact(), exportArtifact: artifact(), metadataArtifact: artifact(), bucketConfigurationArtifact: artifact() };
    }),
    references: { runId, complete: true, missing: 0, unknown: 0, hashMismatches: 0, operationWindow: operationWindow(), checkedAtUtc: at(9), evidence: artifact() },
  };
  const dbArtifacts = [manifest.sourceInventory.artifact, manifest.stabilization.evidence, ...manifest.databases.flatMap((db) => [db.dump.artifact, db.restoreListCheck.evidence]), manifest.globals.artifact, manifest.recoveryBundle.artifact, manifest.references.evidence];
  manifest.snapshots = ["database", "application", "supabase"].map((kind) => {
    const repositoryId = `synthetic-${kind}-repository`;
    const snapshotId = artifact().sha256;
    const minio = manifest.minio.find((entry) => entry.id === kind);
    const items = kind === "database" ? dbArtifacts : [minio.objectHashManifest.artifact, minio.sourceListingArtifact, minio.exportArtifact, minio.metadataArtifact, minio.bucketConfigurationArtifact];
    const members = items.map(({ sha256, bytes }) => ({ sha256, bytes }));
    return { kind, runId, repositoryId, snapshotId, createdAtUtc: at(30), resticExitCode: 0, destination: { offSourceHosts: true, independentOfStaging: true, region: "EU", clientSideEncryption: true }, members, keyEscrow: { independent: true, repositoryRecoveryKeyIncluded: true, evidence: artifact(24) }, deepRead: { runId, repositoryId, snapshotId, exitCode: 0, complete: true, independentClientRead: true, checkedAtUtc: at(35), verifiedMembers: structuredClone(members), evidence: artifact(36) } };
  });
  const finalArtifact = artifact(40);
  const snapshotId = artifact().sha256;
  const repositoryId = manifest.snapshots[0].repositoryId;
  manifest.manifestOffHost = { runId, repositoryId, snapshotId, resticExitCode: 0, artifact: finalArtifact, copiedAtUtc: at(42), independentClientRead: { runId, repositoryId, snapshotId, exitCode: 0, complete: true, independentClient: true, checkedAtUtc: at(45), sha256: finalArtifact.sha256, bytes: finalArtifact.bytes, evidence: artifact(46) } };
  assert.equal(validateBackupSet(manifest, { now: new Date(completedAtUtc) }).ok, true);
  return manifest;
}
const input = (manifests, asOfUtc = "2026-10-10T23:59:59Z") => ({ schemaVersion: 1, asOfUtc, manifests });
const selectedIds = (plan) => plan.keepRuns.map((run) => run.runId);
const output = () => { const parts = []; return { parts, write: (value) => parts.push(value) }; };

test("a complete run protects all three data snapshots and the later manifest, without authenticating evidence", () => {
  const run = fullRun("2026-10-10T03:00:00Z");
  const plan = planBackupRetention(input([run]));
  assert.equal(plan.deletionPlanBlocked, false);
  assert.deepEqual(selectedIds(plan), [run.runId]);
  assert.equal(plan.keepRuns[0].snapshots.length, 4);
  assert.ok(plan.keepRuns[0].snapshots.some((entry) => entry.snapshotId === run.manifestOffHost.snapshotId));
  assert.equal(plan.evidenceVerified, false); assert.equal(plan.g09Accepted, false); assert.equal(plan.executable, false);
  assert.equal(plan.deletionAuthorized, false); assert.equal(plan.history.retentionVerified, false);
  assert.deepEqual(plan.selectedPeriodCounts, { daily: 1, weekly: 1, monthly: 1 });
});

test("daily, ISO-week and monthly retention is a union of latest complete runs in nonempty UTC periods", () => {
  const runs = [];
  for (let day = 1; day <= 10; day += 1) runs.push(fullRun(`2026-10-${String(day).padStart(2, "0")}T03:00:00Z`));
  runs.push(fullRun("2026-10-10T04:00:00Z"));
  for (const date of ["2026-09-27", "2026-09-20", "2026-09-13", "2026-08-31", "2026-07-31", "2025-02-01"]) runs.push(fullRun(`${date}T03:00:00Z`));
  const plan = planBackupRetention(input(runs));
  assert.equal(plan.deletionPlanBlocked, false, JSON.stringify(plan.issues));
  assert.deepEqual(plan.selectedPeriodCounts, { daily: 7, weekly: 4, monthly: 5 });
  assert.ok(selectedIds(plan).includes(runs.at(-1).runId), "a much older nonempty month is retained rather than inventing empty months");
  assert.ok(!selectedIds(plan).includes(runs[9].runId), "later full run replaces an earlier run of the same UTC day");
  assert.ok(selectedIds(plan).includes(runs[10].runId));
  assert.ok(plan.reviewCandidates.some((entry) => entry.runId === runs[9].runId));
  assert.ok(plan.keepRuns.every((run) => run.snapshots.length === 4));
});

test("retention uses completion day, keeps historical manifests beyond 26h, and reports stale latest success separately", () => {
  const before = fullRun("2026-10-09T23:59:59Z");
  const after = fullRun("2026-10-10T00:00:00Z");
  const plan = planBackupRetention(input([before, after], "2026-11-10T12:00:00Z"));
  assert.equal(plan.deletionPlanBlocked, false);
  assert.deepEqual(plan.periods.daily.map((entry) => entry.period), ["2026-10-10", "2026-10-09"]);
  assert.equal(plan.freshness.lastCompleteOlderThan26h, true);
  assert.equal(plan.history.retentionVerified, false);
});

test("ISO week starts Monday and belongs to the correct week-year across New Year", () => {
  const dates = ["2020-12-28T03:00:00Z", "2021-01-03T23:59:59Z", "2021-01-04T00:00:00Z"];
  const plan = planBackupRetention(input(dates.map((date) => fullRun(date)), "2021-01-05T00:00:00Z"));
  assert.deepEqual(plan.periods.weekly.map((entry) => entry.period), ["2021-W01", "2020-W53"]);
  assert.equal(plan.periods.weekly[1].startUtc, "2020-12-28T00:00:00.000Z");
  assert.equal(plan.periods.weekly[1].endExclusiveUtc, "2021-01-04T00:00:00.000Z");
  assert.deepEqual(plan.periods.monthly.map((entry) => entry.period), ["2021-01", "2020-12"]);
});

test("12 nonempty months means 12 selections, not fabricated or authenticated year-long retention", () => {
  const runs = Array.from({ length: 14 }, (_, index) => fullRun(new Date(Date.UTC(2025, index, 15, 3)).toISOString()));
  const plan = planBackupRetention(input(runs, "2026-03-01T00:00:00Z"));
  assert.equal(plan.selectedPeriodCounts.monthly, 12);
  assert.equal(plan.periods.monthly.at(-1).period, "2025-03");
  assert.equal(plan.history.availableNonemptyPeriods.monthly, 14);
  assert.equal(plan.history.retentionVerified, false);
  const short = planBackupRetention(input([fullRun("2026-10-10T03:00:00Z")]));
  assert.equal(short.selectedPeriodCounts.monthly, 1);
});

test("every incomplete run blocks review candidates and protects all input, including partial snapshot references", () => {
  const good = fullRun("2026-10-09T03:00:00Z");
  const incomplete = fullRun("2026-10-10T03:00:00Z"); incomplete.snapshots[1].resticExitCode = 3;
  const plan = planBackupRetention(input([good, incomplete]));
  assert.equal(plan.deletionPlanBlocked, true); assert.equal(plan.protectAllInput, true);
  assert.deepEqual(plan.reviewCandidates, []); assert.deepEqual(plan.protectedInputIndices, [0, 1]);
  assert.ok(plan.keepRuns.some((entry) => entry.runId === good.runId));
  assert.equal(plan.protectedRuns[1].snapshots.length, 4);
});

test("identical duplicate run IDs and conflicting declarations both block the plan", () => {
  const run = fullRun("2026-10-10T03:00:00Z");
  const duplicate = planBackupRetention(input([run, structuredClone(run)]));
  assert.ok(duplicate.issues.some((entry) => entry.code === "duplicate_run_id"));
  assert.equal(duplicate.protectAllInput, true); assert.deepEqual(duplicate.reviewCandidates, []);
  const conflict = structuredClone(run); conflict.globals.rolesIncluded = false;
  const conflicting = planBackupRetention(input([run, conflict]));
  assert.ok(conflicting.issues.some((entry) => entry.code === "conflicting_run_identity"));
});

test("the same repository/snapshot pair cannot be attributed to different runs", () => {
  const first = fullRun("2026-10-09T03:00:00Z"); const second = fullRun("2026-10-10T03:00:00Z");
  second.snapshots[0].snapshotId = first.snapshots[0].snapshotId; second.snapshots[0].deepRead.snapshotId = first.snapshots[0].snapshotId;
  const plan = planBackupRetention(input([first, second]));
  assert.ok(plan.issues.some((entry) => entry.code === "snapshot_claimed_by_multiple_runs"));
  assert.equal(plan.deletionPlanBlocked, true); assert.deepEqual(plan.reviewCandidates, []);
});

test("repository identity cannot change source kind, but repository rotation is kept as explicit references", () => {
  const first = fullRun("2026-10-09T03:00:00Z"); const second = fullRun("2026-10-10T03:00:00Z");
  const rotated = structuredClone(second);
  rotated.snapshots[1].repositoryId = "synthetic-rotated-application"; rotated.snapshots[1].deepRead.repositoryId = "synthetic-rotated-application";
  assert.equal(planBackupRetention(input([first, rotated])).deletionPlanBlocked, false);
  second.snapshots[1].repositoryId = first.snapshots[2].repositoryId; second.snapshots[1].deepRead.repositoryId = first.snapshots[2].repositoryId;
  second.snapshots[2].repositoryId = "synthetic-new-supabase"; second.snapshots[2].deepRead.repositoryId = "synthetic-new-supabase";
  const plan = planBackupRetention(input([first, second]));
  assert.ok(plan.issues.some((entry) => entry.code === "conflicting_repository_kind"));
  assert.equal(plan.deletionPlanBlocked, true);
});

test("equal snapshot hashes in distinct repositories do not conflate identity", () => {
  const first = fullRun("2026-10-09T03:00:00Z"); const second = fullRun("2026-10-10T03:00:00Z");
  second.snapshots[1].snapshotId = first.snapshots[0].snapshotId; second.snapshots[1].deepRead.snapshotId = first.snapshots[0].snapshotId;
  assert.equal(planBackupRetention(input([first, second])).deletionPlanBlocked, false);
});

test("ties keep every latest complete run and input order cannot change the decision", () => {
  const first = fullRun("2026-10-10T03:00:00Z"); const second = fullRun("2026-10-10T03:00:00Z");
  const forward = planBackupRetention(input([first, second])); const reversed = planBackupRetention(input([second, first]));
  assert.deepEqual(selectedIds(forward).sort(), selectedIds(reversed).sort());
  assert.equal(forward.keepRuns.length, 2); assert.deepEqual(forward.reviewCandidates, []);
});

test("future runs, invalid clock/calendar dates, missing sources and empty input fail closed", () => {
  for (const request of [input([], "2026-10-10T12:00:00Z"), input([fullRun("2026-10-11T03:00:00Z")]), input([fullRun("2026-10-10T03:00:00Z")], "2026-02-30T12:00:00Z"), input([null]), { schemaVersion: 1, manifests: [] }]) {
    const plan = planBackupRetention(request); assert.equal(plan.deletionPlanBlocked, true); assert.equal(plan.protectAllInput, true); assert.deepEqual(plan.reviewCandidates, []);
  }
});

test("calendar selection stays in UTC across leap day and Polish daylight saving changes", () => {
  const dates = ["2024-02-29T23:59:59Z", "2024-03-01T00:00:00Z", "2024-03-31T00:30:00Z", "2024-03-31T01:30:00Z"];
  const runs = dates.map((date) => fullRun(date));
  const plan = planBackupRetention(input(runs, "2024-04-01T00:00:00Z"));
  assert.deepEqual(plan.periods.daily.map((entry) => entry.period), ["2024-03-31", "2024-03-01", "2024-02-29"]);
  assert.deepEqual(plan.periods.monthly.map((entry) => entry.period), ["2024-03", "2024-02"]);
  assert.deepEqual(plan.periods.daily[0].runIds, [runs[3].runId]);
});

test("too many manifests protects the entire unresolved input without producing candidates", () => {
  const plan = planBackupRetention(input(Array(4097).fill(null)));
  assert.equal(plan.protectAllInput, true); assert.equal(plan.protectedInputIndices, null);
  assert.equal(plan.protectionScope, "ALL_INPUT_AND_UNRESOLVED_REFERENCES");
  assert.deepEqual(plan.reviewCandidates, []);
  assert.ok(plan.issues.some((entry) => entry.code === "manifest_count_limit"));
});

test("planning does not mutate manifests or return aliases to snapshot declarations", () => {
  const run = fullRun("2026-10-10T03:00:00Z"); const original = structuredClone(run);
  const plan = planBackupRetention(input([run]));
  plan.keepRuns[0].snapshots[0].repositoryId = "synthetic-changed-output";
  assert.deepEqual(run, original);
});

function withFile(content, action) {
  const directory = mkdtempSync(path.join(tmpdir(), "f0-retention-test-")); const file = path.join(directory, "synthetic.json");
  try { writeFileSync(file, content); return action(file); } finally { unlinkSync(file); rmdirSync(directory); }
}
test("CLI outputs only a sanitized summary, never private identities, input values or paths", () => {
  const run = fullRun("2026-10-10T03:00:00Z", "synthetic-private-run-do-not-print"); const stdout = output(); const stderr = output();
  withFile(JSON.stringify(input([run])), (file) => assert.equal(runCli([file], { stdout, stderr }), 0));
  const result = [...stdout.parts, ...stderr.parts].join("");
  for (const secret of [run.runId, run.snapshots[0].repositoryId, run.snapshots[0].snapshotId]) assert.ok(!result.includes(secret));
  assert.match(result, /PREPARATION_ONLY/); assert.match(result, /"evidenceVerified":false/);
  for (const content of ["{\"synthetic-private-malformed\":", JSON.stringify({ asOfUtc: "synthetic-private-invalid" })]) {
    const badOut = output(); const badErr = output(); withFile(content, (file) => assert.notEqual(runCli([file], { stdout: badOut, stderr: badErr }), 0));
    assert.ok(![...badOut.parts, ...badErr.parts].join("").includes("synthetic-private"));
  }
});

test("CLI checks and reads one descriptor despite path replacement; growth is bounded and the handle closes", () => {
  const original = JSON.stringify(input([fullRun("2026-10-10T03:00:00Z")]));
  withFile(original, (file) => {
    const moved = path.join(path.dirname(file), "opened-original.json"); let opened; let closed = false; let renamed = false; let renameFailure;
    const files = { openSync: (name, flags) => { opened = openSync(name, flags); return opened; }, fstatSync: (fd) => { assert.equal(fd, opened); const stat = fstatSync(fd); try { renameSync(file, moved); renamed = true; } catch (error) { renameFailure = error.code; throw error; } writeFileSync(file, "synthetic-invalid-replacement"); return stat; }, readSync: (fd, ...args) => { assert.equal(fd, opened); return readSync(fd, ...args); }, closeSync: (fd) => { closeSync(fd); closed = true; } };
    try { const result = runCli([file], { stdout: output(), stderr: output(), files }); assert.equal(renameFailure, undefined); assert.equal(result, 0); assert.equal(closed, true); assert.equal(readFileSync(moved, "utf8"), original); } finally { if (renamed) unlinkSync(moved); }
  });
  let total = 0; let closed = false;
  const files = { openSync: () => 37, fstatSync: () => ({ isFile: () => true, size: 1 }), readSync: (_fd, buffer, offset, length) => { assert.ok(buffer.length <= 16 * 1024 * 1024 + 1); buffer.fill(32, offset, offset + length); total += length; return length; }, closeSync: () => { closed = true; } };
  assert.equal(runCli(["synthetic.json"], { stdout: output(), stderr: output(), files }), 2); assert.equal(total, 16 * 1024 * 1024 + 1); assert.equal(closed, true);
});

test("CLI rejects URLs, UNC paths, execution switches and extra arguments", () => {
  for (const args of [["--execute"], ["https://example.invalid/private"], ["\\\\host\\private\\input.json"], [], ["one", "two"]]) assert.equal(runCli(args, { stdout: output(), stderr: output() }), 2);
});
