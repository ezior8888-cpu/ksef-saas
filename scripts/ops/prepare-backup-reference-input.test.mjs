import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { BackupReferenceInputError, main, prepareBackupReferenceInput } from "./prepare-backup-reference-input.mjs";

const MAP = JSON.parse(readFileSync(new URL("../../ops/observability/backup/storage-reference-map.json", import.meta.url), "utf8"));
const sha = data => createHash("sha256").update(data).digest("hex");
const RUN = "synthetic-private-run";
const PROFILE = "minio-unversioned-s3-v1";
const CONFIG = [
  ["location", "GetBucketLocationCommand"], ["versioning", "GetBucketVersioningCommand"],
  ["policy", "GetBucketPolicyCommand", "NoSuchBucketPolicy"], ["tags", "GetBucketTaggingCommand", "NoSuchTagSet"],
  ["lifecycle", "GetBucketLifecycleConfigurationCommand", "NoSuchLifecycleConfiguration"],
  ["encryption", "GetBucketEncryptionCommand", "ServerSideEncryptionConfigurationNotFoundError"],
  ["objectLock", "GetObjectLockConfigurationCommand", "ObjectLockConfigurationNotFoundError"],
  ["notifications", "GetBucketNotificationConfigurationCommand"],
  ["replication", "GetBucketReplicationCommand", "ReplicationConfigurationNotFoundError"]
];
function references() {
  return { schemaVersion: 1, runId: RUN, mapId: MAP.mapId, sourceRevision: MAP.sourceRevision,
    referenceScope: { complete: true, databaseNames: ["postgres", "_supabase"], mappingIds: MAP.mappings.map(m => m.id),
      rowCounts: Object.fromEntries(MAP.mappings.map(m => [m.id, 0])), unresolvedMappings: 0,
      bucketBindings: { applicationPrimary: "PRIVATE-primary", applicationBackups: { mode: "shared", bucket: "PRIVATE-primary" } } },
    references: [] };
}
function addReference(input, extra = {}) {
  const r = { mappingId: "invoices.xml_storage_path", referenceId: "PRIVATE-row", source: "application",
    bucket: "PRIVATE-primary", key: "PRIVATE/doc.xml", originalKey: "PRIVATE/doc.xml", sha256: sha("hello"), ...extra };
  input.references.push(r); input.referenceScope.rowCounts[r.mappingId]++;
  return r;
}
function fileJSON(filename, value) { writeFileSync(filename, JSON.stringify(value), { mode: 0o600 }); }
function ndjson(directory, name, rows) {
  const data = Buffer.from(rows.map(row => JSON.stringify(row) + "\n").join(""));
  writeFileSync(path.join(directory, name), data, { mode: 0o600 });
  return { path: name, bytes: data.length, sha256: sha(data) };
}
function createExport(directory, source, objects) {
  mkdirSync(directory, { mode: 0o700 }); mkdirSync(path.join(directory, "payloads"), { mode: 0o700 });
  const bucket = source === "application" ? "PRIVATE-primary" : "PRIVATE-supabase";
  const rows = objects.map((object, i) => {
    const data = Buffer.from(object.data), payloadId = String(i + 1).padStart(16, "0") + ".bin";
    writeFileSync(path.join(directory, "payloads", payloadId), data, { flag: "wx", mode: 0o600 });
    return { bucket: object.bucket ?? bucket, key: object.key, bytes: data.length, sha256: sha(data), payloadId,
      metadata: { ContentType: "application/xml", Metadata: { synthetic: "PRIVATE-metadata" } }, tags: [{ Key: "kind", Value: "synthetic" }] };
  });
  const configs = [{ bucket, profile: PROFILE, versioning: "Unversioned", observedListingStable: true, mutationExclusionVerified: false,
    configuration: CONFIG.map(([name, , errorCode]) => errorCode ? { name, state: "absent", errorCode } : { name, state: "present", value: {} }) }];
  const bytes = rows.reduce((sum, row) => sum + row.bytes, 0);
  const summary = { schemaVersion: 1, runId: RUN, source, status: "COMPLETE_WITHIN_DECLARED_SCOPE",
    startedAtUtc: "2026-10-10T12:00:00.000Z", completedAtUtc: "2026-10-10T12:01:00.000Z", versioning: "Unversioned",
    payloadComplete: true, supportedBucketProfileComplete: true, bucketConfigurationComplete: false, overallRecoveryComplete: false,
    observedListingStable: true, mutationsExcluded: false, F0Accepted: false, sharedDatabaseS3ConsistencyVerified: false,
    counts: { bucketCount: 1, currentObjectCount: rows.length, currentObjectBytes: bytes, allVersionCount: rows.length,
      allVersionBytes: bytes, deleteMarkerCount: 0, multipartUploadCount: 0 },
    objectManifest: ndjson(directory, "objects.ndjson", rows), bucketConfig: ndjson(directory, "bucket-config.ndjson", configs),
    profile: { id: PROFILE, supportedBucketGetters: CONFIG.map(([, command]) => command), requiredListObjectsV2Fields: ["IsTruncated", "KeyCount"],
      outsideScope: ["MinIO IAM/users/groups/service accounts", "MinIO service configuration", "KMS/encryption key escrow",
        "bucket quota/tiering/remote target credentials", "CORS", "ACL/ownership/public-access controls", "website/logging/analytics",
        "inventory/metrics/intelligent-tiering/accelerate/request-payment"] },
    listingFlags: { buckets: true, currentObjects: true, versions: true, versioning: true, multipart: true } };
  fileJSON(path.join(directory, "export-summary.json"), summary);
  return { rows, configs, summary };
}
function fixture(t, { app = [{ key: "PRIVATE/doc.xml", data: "hello" }], supabase = [] } = {}) {
  const parent = mkdtempSync(path.join(os.tmpdir(), "f0-reference-adapter-synthetic-"));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(parent)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(parent).startsWith("f0-reference-adapter-synthetic-"));
    rmSync(parent, { recursive: true, force: true });
  });
  const applicationDir = path.join(parent, "application"), supabaseDir = path.join(parent, "supabase");
  const normalizedReferencesPath = path.join(parent, "PRIVATE-references.json");
  const input = references(); addReference(input); fileJSON(normalizedReferencesPath, input);
  return { parent, applicationDir, supabaseDir, normalizedReferencesPath, input,
    application: createExport(applicationDir, "application", app), supabase: createExport(supabaseDir, "supabase", supabase) };
}
function options(f, extra = {}) { return { normalizedReferencesPath: f.normalizedReferencesPath, applicationDir: f.applicationDir, supabaseDir: f.supabaseDir, ...extra }; }
function rewriteRows(f, source, mutate) {
  const dir = source === "application" ? f.applicationDir : f.supabaseDir;
  const state = f[source]; mutate(state.rows);
  state.summary.objectManifest = ndjson(dir, "objects.ndjson", state.rows);
  fileJSON(path.join(dir, "export-summary.json"), state.summary);
}
function rewriteSummary(f, mutate, source = "application") {
  const dir = source === "application" ? f.applicationDir : f.supabaseDir;
  mutate(f[source].summary); fileJSON(path.join(dir, "export-summary.json"), f[source].summary);
}
function rejects(f, extra = {}) {
  assert.throws(() => prepareBackupReferenceInput(options(f, extra)), error => {
    assert.ok(error instanceof BackupReferenceInputError);
    for (const value of ["PRIVATE", f.parent, RUN]) assert.ok(!error.message.includes(value));
    return true;
  });
}

test("real synthetic files yield checker input, verified local integrity and no recovery/authenticity claim", t => {
  const f = fixture(t); const before = readFileSync(f.normalizedReferencesPath, "utf8");
  const { bundle, report } = prepareBackupReferenceInput(options(f));
  assert.equal(report.ok, true); assert.equal(report.localArtifactIntegrityVerified, true);
  assert.equal(report.databaseReferenceExtractionVerified, false); assert.equal(report.sourceAuthenticityVerified, false);
  assert.equal(report.evidenceVerified, false); assert.equal(report.g09Accepted, false); assert.equal(report.overallRecoveryComplete, false);
  assert.equal(report.counts.matchedReferences, 1); assert.equal(report.counts.exportedObjects, 1);
  assert.equal(bundle.objectManifests.length, 2); assert.deepEqual(bundle.references, f.input.references);
  assert.deepEqual(bundle.objectManifests[0].objects[0], { bucket: "PRIVATE-primary", key: "PRIVATE/doc.xml", bytes: 5, sha256: sha("hello") });
  assert.equal(readFileSync(f.normalizedReferencesPath, "utf8"), before);
  const publicReport = JSON.stringify(report); for (const value of ["PRIVATE", RUN, f.parent, sha("hello")]) assert.ok(!publicReport.includes(value));
});
test("CLI never reads arguments or exposes private contents and has no execute option", () => {
  let text = ""; const write = value => { text += value; };
  assert.equal(main([], write), 0); assert.equal(main(["--help"], write), 0);
  assert.equal(main(["--execute", "PRIVATE/file"], write), 2); assert.equal(main(["PRIVATE/file"], write), 2);
  assert.match(text, /Preparation only/); assert.ok(!text.includes("PRIVATE/file"));
});
test("same-length payload tamper is rejected by actual SHA-256", t => {
  const f = fixture(t); writeFileSync(path.join(f.applicationDir, "payloads", "0000000000000001.bin"), "other"); rejects(f);
});
test("short or missing payload cannot become a complete object", t => {
  const f = fixture(t); const file = path.join(f.applicationDir, "payloads", "0000000000000001.bin");
  writeFileSync(file, "he"); rejects(f); rmSync(file); rejects(f);
});
test("object metadata edit is checked against actual NDJSON SHA and bytes", t => {
  const f = fixture(t); f.application.rows[0].metadata.Metadata.synthetic = "OTHER-metadata";
  ndjson(f.applicationDir, "objects.ndjson", f.application.rows); rejects(f);
});
test("bucket configuration edit is checked against actual NDJSON SHA and bytes", t => {
  const f = fixture(t); f.application.configs[0].configuration[0].value.LocationConstraint = "OTHER-region";
  ndjson(f.applicationDir, "bucket-config.ndjson", f.application.configs); rejects(f);
});
test("summary artifact paths are fixed and cannot redirect reads outside export", t => {
  const f = fixture(t); rewriteSummary(f, summary => { summary.objectManifest.path = "../PRIVATE-references.json"; }); rejects(f);
});
test("payload paths are exact 16-digit file names and cannot traverse or use ADS", t => {
  for (const payloadId of ["../escape.bin", "/tmp/private", "C:\\private", "0000000000000001.bin:secret", "000000000000001.bin", "0000000000000001.BIN"]) {
    const f = fixture(t); rewriteRows(f, "application", rows => { rows[0].payloadId = payloadId; }); rejects(f);
  }
});
test("duplicate payload IDs are rejected, even with self-consistent metadata hash", t => {
  const f = fixture(t, { app: [{ key: "PRIVATE/doc.xml", data: "hello" }, { key: "second", data: "hello" }] });
  rewriteRows(f, "application", rows => { rows[1].payloadId = rows[0].payloadId; }); rejects(f);
});
test("duplicate object identities and key conflicts are rejected", t => {
  const f = fixture(t, { app: [{ key: "PRIVATE/doc.xml", data: "hello" }, { key: "PRIVATE/doc.xml", data: "other" }] }); rejects(f);
});
test("wrong source/run/profile/versioning/listing/completeness claims fail closed", t => {
  for (const mutate of [s => { s.runId = "different"; }, s => { s.source = "supabase"; }, s => { s.profile.id = "unknown-profile"; },
    s => { s.profile.supportedBucketGetters.pop(); }, s => { s.versioning = "Enabled"; }, s => { s.listingFlags.versions = false; },
    s => { s.payloadComplete = false; }, s => { s.supportedBucketProfileComplete = false; }, s => { s.status = "PARTIAL"; },
    s => { s.overallRecoveryComplete = true; }, s => { s.F0Accepted = true; }]) {
    const f = fixture(t); rewriteSummary(f, mutate); rejects(f);
  }
});
test("counts, object bytes and bucket count must match actual records", t => {
  for (const field of ["bucketCount", "currentObjectCount", "currentObjectBytes", "allVersionCount", "allVersionBytes", "deleteMarkerCount", "multipartUploadCount"]) {
    const f = fixture(t); rewriteSummary(f, s => { s.counts[field]++; }); rejects(f);
  }
});
test("objects cannot name a bucket absent from bucket configuration", t => {
  const f = fixture(t); rewriteRows(f, "application", rows => { rows[0].bucket = "OTHER-bucket"; }); rejects(f);
});
test("omitted or malformed configuration/profile cannot pass just by changing its hash", t => {
  const f = fixture(t); f.application.configs[0].configuration.pop();
  rewriteSummary(f, s => { s.bucketConfig = ndjson(f.applicationDir, "bucket-config.ndjson", f.application.configs); }); rejects(f);
});
test("unlisted payload and subdirectory are rejected instead of silently ignored", t => {
  const f = fixture(t); writeFileSync(path.join(f.applicationDir, "payloads", "0000000000000002.bin"), "extra"); rejects(f);
  rmSync(path.join(f.applicationDir, "payloads", "0000000000000002.bin")); mkdirSync(path.join(f.applicationDir, "payloads", "directory")); rejects(f);
});
test("missing DB targets remain missing; adapter does not invent objects or rows", t => {
  const f = fixture(t, { app: [] }); const { bundle, report } = prepareBackupReferenceInput(options(f));
  assert.equal(report.ok, false); assert.equal(report.counts.missing, 1); assert.equal(report.localArtifactIntegrityVerified, true);
  assert.equal(bundle.references.length, 1); assert.equal(bundle.objectManifests[0].objects.length, 0);
});
test("unknown original key and unsupported Supabase translation remain unknown", t => {
  const f = fixture(t); f.input.references[0].originalKey = "different-original";
  addReference(f.input, { mappingId: "storage.objects.name", referenceId: "PRIVATE-storage-row", source: "supabase", bucket: "PRIVATE-supabase", key: "physical/name", originalKey: "name", sha256: null });
  fileJSON(f.normalizedReferencesPath, f.input);
  const { bundle, report } = prepareBackupReferenceInput(options(f));
  assert.equal(report.ok, false); assert.equal(report.counts.unknown, 2); assert.deepEqual(bundle.references, f.input.references);
});
test("reported partial DB scope stays partial; prefilled object manifests are refused", t => {
  const f = fixture(t); f.input.referenceScope.complete = false; fileJSON(f.normalizedReferencesPath, f.input);
  const { bundle, report } = prepareBackupReferenceInput(options(f)); assert.equal(report.ok, false); assert.equal(bundle.referenceScope.complete, false);
  f.input.objectManifests = []; fileJSON(f.normalizedReferencesPath, f.input); rejects(f);
});
test("raw keys keep case, dot segments, percent and Unicode without becoming filenames", t => {
  const keys = ["../escape", "/absolute", "a/b", "a%2Fb", "é", "e\u0301", "A", "a"];
  const f = fixture(t, { app: keys.map(key => ({ key, data: key })) }); f.input.references = []; f.input.referenceScope.rowCounts["invoices.xml_storage_path"] = 0;
  keys.forEach((key, i) => addReference(f.input, { referenceId: "PRIVATE-" + i, key, originalKey: key, sha256: sha(key) }));
  fileJSON(f.normalizedReferencesPath, f.input);
  const { bundle, report } = prepareBackupReferenceInput(options(f)); assert.equal(report.ok, true); assert.deepEqual(bundle.objectManifests[0].objects.map(o => o.key), keys);
});
test("invalid UTF-8 cannot silently normalize raw object identity", t => {
  const f = fixture(t); const data = Buffer.from([0x7b,0x22,0x6b,0x65,0x79,0x22,0x3a,0x22,0xff,0x22,0x7d,0x0a]);
  writeFileSync(path.join(f.applicationDir, "objects.ndjson"), data);
  rewriteSummary(f, s => { s.objectManifest = { path: "objects.ndjson", bytes: data.length, sha256: sha(data) }; }); rejects(f);
});
test("bounded metadata, record and total payload limits fail instead of truncating", t => {
  const f = fixture(t); for (const limits of [{ maxNdjsonBytes: 10 }, { maxRecordBytes: 10 }, { maxPayloadBytes: 4 }, { maxTotalPayloadBytes: 4 }, { maxJsonBytes: 10 }]) rejects(f, { limits });
});
test("invalid options, remote paths and caller attempts to relax caps are rejected", t => {
  const f = fixture(t); rejects(f, { applicationDir: "https://PRIVATE.invalid/export" }); rejects(f, { normalizedReferencesPath: "\\\\PRIVATE\\share\\input.json" });
  rejects(f, { limits: { maxPayloadBytes: Number.MAX_SAFE_INTEGER } });
  assert.throws(() => prepareBackupReferenceInput(null), BackupReferenceInputError);
});
test("real symlinked payload/parent is refused", { skip: process.platform === "win32" }, t => {
  const f = fixture(t); const file = path.join(f.applicationDir, "payloads", "0000000000000001.bin"); rmSync(file);
  const target = path.join(f.parent, "target.bin"); writeFileSync(target, "hello"); symlinkSync(target, file); rejects(f);
  rmSync(file); writeFileSync(file, "hello"); const alias = path.join(f.parent, "alias"); symlinkSync(f.applicationDir, alias, "dir"); rejects(f, { applicationDir: alias });
});
test("recognized directory symlinks/junctions are refused on Windows too", t => {
  const f = fixture(t); const alias = path.join(f.parent, "alias");
  symlinkSync(f.applicationDir, alias, process.platform === "win32" ? "junction" : "dir"); rejects(f, { applicationDir: alias });
});
test("zero-byte payload and NDJSON crossing many FD chunks retain exact bytes", t => {
  const f = fixture(t, { app: [{ key: "PRIVATE/doc.xml", data: "" }, { key: "orphan", data: "x".repeat(150000) }] });
  f.input.references[0].sha256 = sha(""); fileJSON(f.normalizedReferencesPath, f.input);
  rewriteRows(f, "application", rows => { rows[1].metadata.Metadata.large = "x".repeat(130000); });
  const { report } = prepareBackupReferenceInput(options(f)); assert.equal(report.ok, true);
  assert.equal(report.checkedPayloadBytes, 150000); assert.equal(report.counts.exportedOrphans, 1);
});
test("blank/truncated NDJSON and a missing manifest member fail despite updated descriptor", t => {
  for (const variant of ["blank", "unterminated", "omitted"]) {
    const f = fixture(t); let data = readFileSync(path.join(f.applicationDir, "objects.ndjson"));
    data = variant === "blank" ? Buffer.concat([data, Buffer.from("\n")]) : variant === "unterminated" ? data.subarray(0, data.length - 1) : Buffer.alloc(0);
    writeFileSync(path.join(f.applicationDir, "objects.ndjson"), data);
    rewriteSummary(f, s => { s.objectManifest.bytes = data.length; s.objectManifest.sha256 = sha(data); if (variant === "omitted") { s.counts.currentObjectCount = s.counts.allVersionCount = 0; s.counts.currentObjectBytes = s.counts.allVersionBytes = 0; } });
    rejects(f);
  }
});
test("duplicate bucket config and a claimed enabled versioning profile cannot hide in rehashed metadata", t => {
  for (const variant of ["duplicate", "versioned"]) {
    const f = fixture(t);
    if (variant === "duplicate") { f.application.configs.push(structuredClone(f.application.configs[0])); f.application.summary.counts.bucketCount = 2; }
    else f.application.configs[0].configuration.find(c => c.name === "versioning").value.Status = "Enabled";
    rewriteSummary(f, s => { s.bucketConfig = ndjson(f.applicationDir, "bucket-config.ndjson", f.application.configs); }); rejects(f);
  }
});
test("payload budget covers both sources rather than independently accepting each", t => {
  const f = fixture(t, { supabase: [{ key: "orphan", data: "hello" }] }); rejects(f, { limits: { maxTotalPayloadBytes: 6 } });
});

test("verified payload files bind actual private paths and bytes from both exports without changing checker input", t => {
  const f = fixture(t, {
    app: [{ key: "PRIVATE/doc.xml", data: "hello" }, { key: "../../PRIVATE/never-a-local-filename", data: "" }],
    supabase: [{ key: "/PRIVATE/remote/object", data: Buffer.from([0, 1, 255, 10]) }, { key: "PRIVATE/Unicode-é", data: "payload-not-a-key" }],
  });
  const result = prepareBackupReferenceInput(options(f));
  const expectedPaths = [f.applicationDir, f.supabaseDir].flatMap(directory => [
    path.join(directory, "payloads", "0000000000000001.bin"),
    path.join(directory, "payloads", "0000000000000002.bin"),
  ]);
  assert.deepEqual(result.verifiedPayloadFiles, expectedPaths.map(filename => {
    const content = readFileSync(filename);
    return { path: filename, sha256: sha(content), bytes: content.byteLength };
  }));
  assert.ok(result.verifiedPayloadFiles.every(item => path.isAbsolute(item.path) && Object.keys(item).sort().join(",") === "bytes,path,sha256"));
  for (const manifest of result.bundle.objectManifests) {
    assert.deepEqual(Object.keys(manifest).sort(), ["complete", "objects", "runId", "source", "versioning"]);
    assert.ok(manifest.objects.every(object => !Object.hasOwn(object, "path") && !Object.hasOwn(object, "payloadId")));
  }
  const publicReport = JSON.stringify(result.report);
  for (const filename of expectedPaths) assert.ok(!publicReport.includes(filename));
  assert.equal(JSON.stringify(result.bundle).includes(f.parent), false);
});

test("empty verified exports return no invented payload files even when references are missing", t => {
  const f = fixture(t, { app: [], supabase: [] });
  const result = prepareBackupReferenceInput(options(f));
  assert.deepEqual(result.verifiedPayloadFiles, []);
  assert.equal(result.report.ok, false);
});
