import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, open, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { createHash } from "node:crypto";
import { exportBackupS3, main, MINIO_PROFILE, BackupS3ExportError } from "./export-backup-s3.mjs";

const date = new Date("2026-10-10T00:00:00Z");
const digest = (data) => createHash("sha256").update(data).digest("hex");
const absent = (name) => Object.assign(new Error("PRIVATE service message"), { name, $metadata: { httpStatusCode: 404 } });
const noConfig = {
  GetBucketLocationCommand: { LocationConstraint: "eu-test-1" },
  GetBucketVersioningCommand: {},
  GetBucketPolicyCommand: absent("NoSuchBucketPolicy"),
  GetBucketTaggingCommand: absent("NoSuchTagSet"),
  GetBucketLifecycleConfigurationCommand: absent("NoSuchLifecycleConfiguration"),
  GetBucketEncryptionCommand: absent("ServerSideEncryptionConfigurationNotFoundError"),
  GetObjectLockConfigurationCommand: absent("ObjectLockConfigurationNotFoundError"),
  GetBucketNotificationConfigurationCommand: {},
  GetBucketReplicationCommand: absent("ReplicationConfigurationNotFoundError")
};
function listed(key, data) {
  return { Key: encodeURIComponent(key), Size: Buffer.byteLength(data), ETag: '"etag-' + digest(data) + '"', LastModified: date };
}
function fake({ buckets = { fixture: [{ key: "doc.xml", data: Buffer.from("hello") }] }, pageSize = 1000, override } = {}) {
  const calls = [];
  const counts = {};
  return {
    calls,
    async send(command, options) {
      const name = command.constructor.name, input = command.input;
      calls.push({ name, input, options });
      counts[name] = (counts[name] || 0) + 1;
      if (override) {
        const intercepted = await override({ name, input, count: counts[name], calls, options });
        if (intercepted !== undefined) return intercepted;
      }
      if (name === "ListBucketsCommand") {
        const names = Object.keys(buckets), start = Number(input.ContinuationToken || 0);
        const end = Math.min(start + pageSize, names.length);
        return { Buckets: names.slice(start, end).map((Name) => ({ Name })), ...(end < names.length ? { ContinuationToken: String(end) } : {}) };
      }
      if (Object.hasOwn(noConfig, name)) {
        const result = noConfig[name];
        if (result instanceof Error) throw result;
        return structuredClone(result);
      }
      const objects = buckets[input.Bucket].slice().sort((a, b) => Buffer.compare(Buffer.from(a.key), Buffer.from(b.key)));
      if (name === "ListMultipartUploadsCommand") return { IsTruncated: false, Uploads: [] };
      if (name === "ListObjectsV2Command" || name === "ListObjectVersionsCommand") {
        const start = Number(input.ContinuationToken || input.KeyMarker || 0), end = Math.min(start + pageSize, objects.length);
        const entries = objects.slice(start, end).map((o) => listed(o.key, o.data));
        const truncated = end < objects.length;
        return name === "ListObjectsV2Command"
          ? { IsTruncated: truncated, Contents: entries, KeyCount: entries.length, EncodingType: "url", ...(truncated ? { NextContinuationToken: String(end) } : {}) }
          : { IsTruncated: truncated, Versions: entries.map((o) => ({ ...o, IsLatest: true, VersionId: "null" })), EncodingType: "url",
            ...(truncated ? { NextKeyMarker: String(end), NextVersionIdMarker: "null" } : {}) };
      }
      const object = objects.find((o) => o.key === input.Key);
      if (name === "GetObjectCommand") {
        assert.equal(input.IfMatch, listed(object.key, object.data).ETag);
        return { Body: Readable.from([object.data]), ContentLength: object.data.length, ETag: listed(object.key, object.data).ETag,
          ContentType: "application/xml", Metadata: { fixture: "safe" }, LastModified: date,
          ChecksumSHA256: Buffer.from(digest(object.data), "hex").toString("base64"), ChecksumType: "FULL_OBJECT", TagCount: 1 };
      }
      if (name === "GetObjectTaggingCommand") return { TagSet: [{ Key: "class", Value: "fixture" }] };
      throw new Error("Unexpected fake operation " + name);
    }
  };
}
async function fixture(t) {
  const parent = await mkdtemp(path.join(os.tmpdir(), "f0-s3-offline-test-"));
  t.after(() => {
    if (path.dirname(path.resolve(parent)) !== path.resolve(os.tmpdir()) || !path.basename(parent).startsWith("f0-s3-offline-test-")) throw new Error("Unsafe test cleanup target");
    return rm(parent, { recursive: true, force: true });
  });
  return { parent, destinationDir: path.join(parent, "new-export") };
}
async function invoke(t, client, extra = {}) {
  const paths = await fixture(t);
  const result = await exportBackupS3({ client, runId: "fixture-001", source: "application", ...paths, ...extra });
  return { result, ...paths };
}
async function rejectExport(t, client, code, extra = {}) {
  const paths = await fixture(t);
  await assert.rejects(exportBackupS3({ client, runId: "fixture-001", source: "application", ...paths, ...extra }), (error) => {
    assert.ok(error instanceof BackupS3ExportError);
    if (code) assert.equal(error.code, code);
    assert.ok(!error.message.includes("PRIVATE"));
    return true;
  });
  await assert.rejects(readFile(path.join(paths.destinationDir, "export-summary.json")), { code: "ENOENT" });
  return paths;
}

test("CLI/import expose preparation only and do not construct a configured client", () => {
  let output = "";
  assert.equal(main([], (v) => { output += v; }), 0);
  assert.equal(main(["--execute"], () => {}), 2);
  assert.match(output, /Preparation only/);
  assert.ok(MINIO_PROFILE.outsideScope.includes("MinIO IAM/users/groups/service accounts"));
});

test("streams real local payload with hash/size/metadata/tags and private NDJSON", async (t) => {
  const client = fake();
  const { result, destinationDir } = await invoke(t, client);
  const rows = (await readFile(path.join(destinationDir, "objects.ndjson"), "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].bucket, rows[0].key, rows[0].bytes, rows[0].sha256], ["fixture", "doc.xml", 5, digest("hello")]);
  assert.equal(await readFile(path.join(destinationDir, "payloads", rows[0].payloadId), "utf8"), "hello");
  assert.equal(rows[0].metadata.ContentType, "application/xml");
  assert.deepEqual(rows[0].metadata.Metadata, { fixture: "safe" });
  assert.deepEqual(rows[0].tags, [{ Key: "class", Value: "fixture" }]);
  assert.equal(result.objectManifest.sha256, digest(await readFile(path.join(destinationDir, "objects.ndjson"))));
  assert.equal(result.payloadComplete, true);
  assert.equal(result.bucketConfigurationComplete, false);
  assert.equal(result.overallRecoveryComplete, false);
  assert.equal(result.mutationsExcluded, false);
  assert.equal(result.F0Accepted, false);
  assert.equal(result.counts.currentObjectCount, 1);
  assert.ok(client.calls.every((call) => /^(List|Get)/.test(call.name)));
  assert.ok(client.calls.every((call) => call.options.abortSignal instanceof AbortSignal));
});

test("malicious raw keys never become paths or collide and survive exact mapping", async (t) => {
  const keys = ["../escape", "/absolute", "C:\\escape", "CON", "a/b", "a\\b", "percent%2F", "é/✅", "a\nb"];
  const { destinationDir } = await invoke(t, fake({ buckets: { fixture: keys.map((key) => ({ key, data: Buffer.from(key) })) } }));
  const rows = (await readFile(path.join(destinationDir, "objects.ndjson"), "utf8")).trim().split("\n").map(JSON.parse);
  assert.deepEqual(new Set(rows.map((row) => row.key)), new Set(keys));
  assert.equal(new Set(rows.map((row) => row.payloadId)).size, keys.length);
  for (const row of rows) {
    assert.match(row.payloadId, /^\d{16}\.bin$/);
    assert.equal(await readFile(path.join(destinationDir, "payloads", row.payloadId), "utf8"), row.key);
  }
  assert.deepEqual((await readdir(destinationDir)).sort(), ["bucket-config.ndjson", "export-summary.json", "export-summary.pending.json", "objects.ndjson", "payloads"]);
});

test("paginates buckets/current objects/versions with explicit markers", async (t) => {
  const client = fake({ pageSize: 1, buckets: { one: [{ key: "a", data: Buffer.from("1") }, { key: "b", data: Buffer.from("2") }], two: [] } });
  const { result } = await invoke(t, client);
  assert.equal(result.counts.bucketCount, 2);
  assert.equal(result.counts.currentObjectCount, 2);
  assert.ok(client.calls.some((call) => call.name === "ListBucketsCommand" && call.input.ContinuationToken));
  assert.ok(client.calls.some((call) => call.name === "ListObjectsV2Command" && call.input.ContinuationToken));
  assert.ok(client.calls.some((call) => call.name === "ListObjectVersionsCommand" && call.input.KeyMarker));
});

test("empty bucket retains explicit absent/present configuration and zero manifest", async (t) => {
  const { result, destinationDir } = await invoke(t, fake({ buckets: { empty: [] } }), { source: "supabase" });
  assert.equal(result.source, "supabase");
  assert.equal(result.counts.currentObjectBytes, 0);
  assert.equal(result.objectManifest.bytes, 0);
  const config = JSON.parse((await readFile(path.join(destinationDir, "bucket-config.ndjson"), "utf8")).trim());
  assert.equal(config.configuration.length, 9);
  assert.equal(config.configuration.find((x) => x.name === "lifecycle").state, "absent");
  assert.deepEqual(config.configuration.find((x) => x.name === "versioning").value, {});
});

test("POSIX permissions are directory0700/file0600; Windows ACL not claimed", async (t) => {
  const { result, destinationDir } = await invoke(t, fake());
  assert.equal(result.windowsACLVerified, false);
  if (process.platform === "win32") return;
  assert.equal((await stat(destinationDir)).mode & 0o777, 0o700);
  for (const file of ["objects.ndjson", "bucket-config.ndjson", "export-summary.json", "payloads/0000000000000001.bin"]) {
    assert.equal((await stat(path.join(destinationDir, file))).mode & 0o777, 0o600);
  }
});

test("refuses existing destination and preserves existing files without S3 calls", async (t) => {
  const { destinationDir } = await fixture(t);
  await mkdir(destinationDir);
  await writeFile(path.join(destinationDir, "keep"), "original");
  const client = fake();
  await assert.rejects(exportBackupS3({ client, runId: "fixture", source: "application", destinationDir }), { code: "EXPORT_FAILED" });
  assert.equal(await readFile(path.join(destinationDir, "keep"), "utf8"), "original");
  assert.equal(client.calls.length, 0);
});

test("rejects symlinked parent", { skip: process.platform === "win32" }, async (t) => {
  const { parent } = await fixture(t);
  const actual = path.join(parent, "actual"), link = path.join(parent, "link");
  await mkdir(actual); await symlink(actual, link, "dir");
  const client = fake();
  await assert.rejects(exportBackupS3({ client, runId: "fixture", source: "supabase", destinationDir: path.join(link, "new") }), { code: "UNSAFE_DESTINATION_PARENT" });
  assert.equal(client.calls.length, 0);
});

for (const versioning of ["Enabled", "Suspended"]) {
  test("refuses " + versioning + " bucket before payload", async (t) => {
    const client = fake({ override: ({ name }) => name === "GetBucketVersioningCommand" ? { Status: versioning } : undefined });
    await rejectExport(t, client, "UNSUPPORTED_VERSIONING");
    assert.ok(!client.calls.some((call) => call.name === "GetObjectCommand"));
  });
}

for (const [name, value, code] of [
  ["ListObjectsV2Command", { IsTruncated: true, Contents: [], KeyCount: 0 }, "PAGINATION_TOKEN_INVALID"],
  ["ListObjectVersionsCommand", { IsTruncated: true, Versions: [] }, "PAGINATION_TOKEN_INVALID"],
  ["ListMultipartUploadsCommand", { IsTruncated: true, Uploads: [] }, "PAGINATION_TOKEN_INVALID"],
  ["ListBucketsCommand", { Buckets: [], IsTruncated: true }, "PAGINATION_TOKEN_INVALID"],
  ["ListObjectsV2Command", { Contents: [] }, "MISSING_TRUNCATION_FLAG"],
  ["ListObjectsV2Command", { IsTruncated: false, CommonPrefixes: [{ Prefix: "hidden/" }] }, "FILTERED_LISTING"],
  ["ListObjectVersionsCommand", { IsTruncated: false, DeleteMarkers: [{ Key: "deleted" }] }, "DELETE_MARKERS_PRESENT"],
  ["ListMultipartUploadsCommand", { IsTruncated: false, Uploads: [{ Key: "pending" }] }, "MULTIPART_PRESENT"]
]) {
  test("fails closed malformed/unsupported listing " + name + " " + code, async (t) => {
    await rejectExport(t, fake({ override: ({ name: current }) => current === name ? value : undefined }), code);
  });
}

for (const name of ["ListBucketsCommand", "ListObjectsV2Command", "ListObjectVersionsCommand", "ListMultipartUploadsCommand"]) {
  test("detects pagination token loop for " + name, async (t) => {
    const responses = {
      ListBucketsCommand: { Buckets: [], ContinuationToken: "same" },
      ListObjectsV2Command: { Contents: [], KeyCount: 0, IsTruncated: true, NextContinuationToken: "same" },
      ListObjectVersionsCommand: { Versions: [], IsTruncated: true, NextKeyMarker: "same", NextVersionIdMarker: "null" },
      ListMultipartUploadsCommand: { Uploads: [], IsTruncated: true, NextKeyMarker: "same", NextUploadIdMarker: "same" }
    };
    await rejectExport(t, fake({ override: ({ name: current }) => current === name ? responses[name] : undefined }), "PAGINATION_TOKEN_INVALID");
  });
}

test("null version inventory must match current objects, not merely count", async (t) => {
  const wrong = listed("different", "hello");
  await rejectExport(t, fake({ override: ({ name }) => name === "ListObjectVersionsCommand"
    ? { IsTruncated: false, EncodingType: "url", Versions: [{ ...wrong, VersionId: "null", IsLatest: true }] } : undefined }), "VERSION_INVENTORY_MISMATCH");
});

test("non-null version is rejected", async (t) => {
  const entry = listed("doc.xml", "hello");
  await rejectExport(t, fake({ override: ({ name }) => name === "ListObjectVersionsCommand"
    ? { IsTruncated: false, EncodingType: "url", Versions: [{ ...entry, VersionId: "private-version", IsLatest: true }] } : undefined }), "UNSUPPORTED_VERSION_HISTORY");
});

test("unsupported/getter403 never becomes absent configuration", async (t) => {
  for (const name of ["AccessDenied", "NotImplemented", "NoSuchBucketPolicy"]) {
    const client = fake({ override: ({ name: command }) => {
      if (command === "GetBucketEncryptionCommand") throw Object.assign(new Error("PRIVATE endpoint/key"), { name, $metadata: { httpStatusCode: name === "NotImplemented" ? 501 : 403 } });
    } });
    await rejectExport(t, client, "EXPORT_FAILED");
  }
});

test("unexpected configuration field is not silently omitted", async (t) => {
  await rejectExport(t, fake({ override: ({ name }) => name === "GetBucketVersioningCommand" ? { NewUnsupportedFeature: true } : undefined }), "UNSUPPORTED_CONFIGURATION_FIELD");
});

test("empty malformed encryption config is refused rather than treated absent", async (t) => {
  await rejectExport(t, fake({ override: ({ name }) => name === "GetBucketEncryptionCommand" ? {} : undefined }), "INVALID_CONFIGURATION");
});

function getResponse(body, extra = {}) {
  return { Body: body, ContentLength: 5, ETag: listed("doc.xml", "hello").ETag, ...extra };
}
test("partial stream keeps partial payload and never publishes success", async (t) => {
  const client = fake({ override: ({ name }) => name === "GetObjectCommand" ? getResponse(Readable.from([Buffer.from("he")])) : undefined });
  const { destinationDir } = await rejectExport(t, client, "OBJECT_SIZE_MISMATCH");
  assert.equal(await readFile(path.join(destinationDir, "payloads", "0000000000000001.bin"), "utf8"), "he");
});
test("stream error is private and keeps partial directory", async (t) => {
  async function* broken() { yield Buffer.from("he"); throw new Error("PRIVATE source URL and credentials"); }
  const { destinationDir } = await rejectExport(t, fake({ override: ({ name }) => name === "GetObjectCommand" ? getResponse(Readable.from(broken())) : undefined }), "BODY_READ_FAILED");
  assert.ok((await readdir(destinationDir)).includes("payloads"));
});
test("overlong stream is refused", async (t) => {
  await rejectExport(t, fake({ override: ({ name }) => name === "GetObjectCommand" ? getResponse(Readable.from([Buffer.from("hello-extra")])) : undefined }), "OBJECT_SIZE_MISMATCH");
});
test("GET content length/etag disagreement fails before writing", async (t) => {
  await rejectExport(t, fake({ override: ({ name }) => name === "GetObjectCommand" ? getResponse(Readable.from([Buffer.from("hello")]), { ContentLength: 4 }) : undefined }), "OBJECT_CHANGED_OR_PARTIAL");
});
test("full object upstream SHA256 must match downloaded bytes", async (t) => {
  await rejectExport(t, fake({ override: ({ name }) => name === "GetObjectCommand"
    ? getResponse(Readable.from([Buffer.from("hello")]), { ChecksumType: "FULL_OBJECT", ChecksumSHA256: Buffer.alloc(32).toString("base64") }) : undefined }), "OBJECT_SHA256_MISMATCH");
});
test("composite checksum is not passed off as full object hash", async (t) => {
  await rejectExport(t, fake({ override: ({ name }) => name === "GetObjectCommand"
    ? getResponse(Readable.from([Buffer.from("hello")]), { ChecksumType: "COMPOSITE", ChecksumSHA256: "private-part-hash" }) : undefined }), "UNSUPPORTED_COMPOSITE_CHECKSUM");
});
test("request timeout aborts fake request, retains directory, hides raw error", async (t) => {
  let signal;
  const client = fake({ override: ({ name, options }) => {
    if (name === "ListBucketsCommand") { signal = options.abortSignal; return new Promise(() => {}); }
  } });
  await rejectExport(t, client, "REQUEST_TIMEOUT", { requestTimeoutMs: 20 });
  assert.equal(signal.aborted, true);
});
test("object stall is bounded and fake body is destroyed", async (t) => {
  const body = new Readable({ read() {} });
  await rejectExport(t, fake({ override: ({ name }) => name === "GetObjectCommand" ? getResponse(body) : undefined }), "OBJECT_TIMEOUT", { objectTimeoutMs: 20 });
  assert.equal(body.destroyed, true);
});
test("page and object memory caps fail closed", async (t) => {
  await rejectExport(t, fake(), "PAGE_LIMIT", { maxPages: 1 });
  await rejectExport(t, fake({ buckets: { fixture: [{ key: "a", data: Buffer.from("1") }, { key: "b", data: Buffer.from("2") }] } }), "OBJECT_LIMIT", { maxObjects: 1 });
});
test("post-export listing change invalidates otherwise good payload", async (t) => {
  await rejectExport(t, fake({ override: ({ name, count }) => name === "ListObjectsV2Command" && count === 2
    ? { IsTruncated: false, Contents: [], KeyCount: 0, EncodingType: "url" } : undefined }), "SOURCE_CHANGED");
});
test("bucket creation during export fails completion", async (t) => {
  await rejectExport(t, fake({ override: ({ name, count }) => name === "ListBucketsCommand" && count === 2
    ? { Buckets: [{ Name: "fixture" }, { Name: "new-bucket" }] } : undefined }), "BUCKET_INVENTORY_CHANGED");
});
test("invalid runId/source cannot touch filesystem/client", async (t) => {
  const paths = await fixture(t);
  const client = fake();
  for (const extra of [{ runId: "../escape" }, { source: "guessed" }, { maxRecordBytes: 999999999 }]) {
    await assert.rejects(exportBackupS3({ client, runId: "fixture", source: "application", ...paths, ...extra }), BackupS3ExportError);
  }
  assert.equal(client.calls.length, 0);
  await assert.rejects(stat(paths.destinationDir), { code: "ENOENT" });
});

test("UNC/network output is rejected before any filesystem or S3 access", async () => {
  const client = fake();
  const destinationDir = process.platform === "win32" ? "\\\\server\\share\\export" : "//server/share/export";
  await assert.rejects(exportBackupS3({ client, runId: "fixture", source: "application", destinationDir }), { code: "LOCAL_DESTINATION_REQUIRED" });
  assert.equal(client.calls.length, 0);
});

test("POSIX requires owner-only private immediate parent", { skip: process.platform === "win32" }, async (t) => {
  const paths = await fixture(t);
  await chmod(paths.parent, 0o755);
  const client = fake();
  await assert.rejects(exportBackupS3({ client, runId: "fixture", source: "supabase", ...paths }), { code: "PRIVATE_PARENT_REQUIRED" });
  assert.equal(client.calls.length, 0);
});

test("metadata and explicit total byte limits are enforced", async (t) => {
  await rejectExport(t, fake(), "PAYLOAD_BYTE_LIMIT", { maxTotalBytes: 4 });
  await rejectExport(t, fake({ override: ({ name }) => name === "GetBucketPolicyCommand"
    ? { Policy: JSON.stringify({ Statement: "x".repeat(2000) }) } : undefined }), "METADATA_LIMIT", { maxRecordBytes: 1000 });
});

test("hanging async next()/return() cannot prolong payload timeout", { timeout: 1000 }, async (t) => {
  const body = {
    [Symbol.asyncIterator]() { return this; },
    next() { return new Promise(() => {}); },
    return() { return new Promise(() => {}); }
  };
  await rejectExport(t, fake({ override: ({ name }) => name === "GetObjectCommand" ? getResponse(body) : undefined }), "OBJECT_TIMEOUT", { objectTimeoutMs: 20 });
});

test("global run deadline also bounds a hanging body iterator", { timeout: 3000 }, async (t) => {
  const body = { [Symbol.asyncIterator]() { return this; }, next() { return new Promise(() => {}); } };
  await rejectExport(t, fake({ override: ({ name }) => name === "GetObjectCommand" ? getResponse(body) : undefined }), "OBJECT_TIMEOUT",
    { maxDurationMs: 1000, objectTimeoutMs: 5000 });
});

test("late resolution of a timed-out request cannot publish success", { timeout: 1000 }, async (t) => {
  let resolve;
  const client = fake({ override: ({ name }) => name === "ListBucketsCommand" ? new Promise((done) => { resolve = done; }) : undefined });
  const { destinationDir } = await rejectExport(t, client, "REQUEST_TIMEOUT", { requestTimeoutMs: 20 });
  resolve({ Buckets: [] });
  await new Promise((done) => setTimeout(done, 20));
  await assert.rejects(readFile(path.join(destinationDir, "export-summary.json")), { code: "ENOENT" });
});

test("final publication cannot overwrite a competing existing path", async (t) => {
  const paths = await fixture(t);
  const client = fake({ override: async ({ name, count }) => {
    if (name === "ListBucketsCommand" && count === 2) {
      await writeFile(path.join(paths.destinationDir, "export-summary.json"), "existing-private-file", { flag: "wx", mode: 0o600 });
    }
  } });
  await assert.rejects(exportBackupS3({ client, runId: "fixture", source: "application", ...paths }), { code: "EXPORT_FAILED" });
  assert.equal(await readFile(path.join(paths.destinationDir, "export-summary.json"), "utf8"), "existing-private-file");
  assert.ok((await stat(path.join(paths.destinationDir, "export-summary.pending.json"))).isFile());
});

test("summary fsync failure leaves only pending artifact, never success name", async (t) => {
  const paths = await fixture(t);
  const probe = await open(path.join(paths.parent, "probe"), "wx", 0o600);
  const prototype = Object.getPrototypeOf(probe);
  const originalSync = prototype.sync;
  await probe.close();
  let syncCalls = 0;
  t.mock.method(prototype, "sync", async function () {
    if (++syncCalls === 3) throw new Error("PRIVATE filesystem details");
    return originalSync.call(this);
  });
  await assert.rejects(exportBackupS3({ client: fake(), runId: "fixture", source: "application", ...paths }), { code: "EXPORT_FAILED" });
  assert.equal(syncCalls, 3);
  await assert.rejects(stat(path.join(paths.destinationDir, "export-summary.json")), { code: "ENOENT" });
  assert.ok((await stat(path.join(paths.destinationDir, "export-summary.pending.json"))).isFile());
});

test("reported KeyCount without Contents cannot certify an empty export", async (t) => {
  await rejectExport(t, fake({ buckets: { empty: [] }, override: ({ name }) => name === "ListObjectsV2Command"
    ? { IsTruncated: false, KeyCount: 31 } : undefined }), "KEY_COUNT_MISMATCH");
});
for (const [command, value] of [
  ["ListObjectsV2Command", { IsTruncated: false, Contents: [], KeyCount: 0, NextContinuationToken: "hidden-next-page" }],
  ["ListObjectVersionsCommand", { IsTruncated: false, Versions: [], NextKeyMarker: "hidden-next-key", NextVersionIdMarker: "hidden-next-version" }],
  ["ListMultipartUploadsCommand", { IsTruncated: false, Uploads: [], NextKeyMarker: "hidden-next-key", NextUploadIdMarker: "hidden-next-upload" }]
]) {
  test("final page cannot claim completion with nonempty next marker " + command, async (t) => {
    await rejectExport(t, fake({ buckets: { empty: [] }, override: ({ name }) => name === command ? value : undefined }),
      "UNEXPECTED_FINAL_PAGINATION_MARKER");
  });
}

for (const keyCount of [undefined, -1, 0.5, "0", 1]) {
  test("KeyCount is required integer equal to decoded Contents length: " + String(keyCount), async (t) => {
    await rejectExport(t, fake({ buckets: { empty: [] }, override: ({ name }) => name === "ListObjectsV2Command"
      ? { IsTruncated: false, Contents: [], ...(keyCount === undefined ? {} : { KeyCount: keyCount }) } : undefined }), "KEY_COUNT_MISMATCH");
  });
}
test("empty final pagination markers and unfiltered empty prefixes are accepted", async (t) => {
  const client = fake({ buckets: { empty: [] }, override: ({ name }) => {
    if (name === "ListObjectsV2Command") return { IsTruncated: false, KeyCount: 0, Contents: [], NextContinuationToken: "", Prefix: "", Delimiter: "" };
    if (name === "ListObjectVersionsCommand") return { IsTruncated: false, Versions: [], NextKeyMarker: "", NextVersionIdMarker: "" };
    if (name === "ListMultipartUploadsCommand") return { IsTruncated: false, Uploads: [], NextKeyMarker: "", NextUploadIdMarker: "" };
  } });
  const { result } = await invoke(t, client);
  assert.equal(result.payloadComplete, true);
  assert.equal(result.counts.currentObjectCount, 0);
});
test("malformed prefix cannot silently become unfiltered listing", async (t) => {
  await rejectExport(t, fake({ override: ({ name }) => name === "ListObjectsV2Command"
    ? { IsTruncated: false, KeyCount: 0, Contents: [], Prefix: 0 } : undefined }), "FILTERED_LISTING");
});


test("caller signal pre-abort refuses destination creation and all SDK calls", async (t) => {
  const paths = await fixture(t), client = fake();
  await assert.rejects(exportBackupS3({ client, runId: "fixture", source: "application", ...paths, signal: AbortSignal.abort() }), { code: "ABORTED" });
  await assert.rejects(stat(paths.destinationDir), { code: "ENOENT" });
  assert.equal(client.calls.length, 0);
});
test("caller signal aborts the SDK request even when send ignores cancellation", async (t) => {
  const controller = new AbortController(); let sdkSignal;
  const client = fake({ override: ({ name, options }) => {
    if (name === "ListBucketsCommand") { sdkSignal = options.abortSignal; controller.abort(); return new Promise(() => {}); }
  } });
  await rejectExport(t, client, "ABORTED", { signal: controller.signal, requestTimeoutMs: 30 });
  assert.equal(sdkSignal.aborted, true); assert.equal(client.calls.length, 1);
});
test("caller signal aborts payload pipeline and prevents later file growth", async (t) => {
  const controller = new AbortController(); let started = false;
  const body = new Readable({ read() { if (!started) { started = true; this.push(Buffer.from("he")); setTimeout(() => controller.abort(), 10); } } });
  const paths = await rejectExport(t, fake({ override: ({ name }) => name === "GetObjectCommand" ? getResponse(body) : undefined }),
    "ABORTED", { signal: controller.signal, objectTimeoutMs: 40 });
  assert.equal(body.destroyed, true);
  const file = path.join(paths.destinationDir,"payloads","0000000000000001.bin"), size = (await stat(file)).size;
  body.push(Buffer.from("llo")); await new Promise(resolve => setTimeout(resolve,10));
  assert.equal((await stat(file)).size,size);
});
test("late timed-out GetObject response destroys its unused Body and cannot write payload", async (t) => {
  let resolve;
  const client = fake({ override: ({ name }) => name === "GetObjectCommand" ? new Promise(done => { resolve = done; }) : undefined });
  const paths = await rejectExport(t,client,"REQUEST_TIMEOUT",{requestTimeoutMs:20});
  const body = new Readable({ read() {} }); resolve(getResponse(body));
  await new Promise(done => setTimeout(done,10));
  assert.equal(body.destroyed,true); assert.deepEqual(await readdir(path.join(paths.destinationDir,"payloads")),[]);
});
test("caller signal late GetObject resolution destroys Body without resuming writes", async (t) => {
  const controller = new AbortController(); let resolve;
  const client = fake({ override: ({ name }) => {
    if (name === "GetObjectCommand") { controller.abort(); return new Promise(done => { resolve = done; }); }
  } });
  const paths = await rejectExport(t,client,"ABORTED",{signal:controller.signal,requestTimeoutMs:30});
  const body = new Readable({ read() {} }); resolve(getResponse(body));
  await new Promise(done => setTimeout(done,10));
  assert.equal(body.destroyed,true); assert.deepEqual(await readdir(path.join(paths.destinationDir,"payloads")),[]);
});
test("caller signal on final listing prevents complete summary publication", async (t) => {
  const controller = new AbortController();
  await rejectExport(t,fake({override:({name,count})=> { if(name === "ListBucketsCommand" && count === 2) controller.abort(); }}),
    "ABORTED",{signal:controller.signal});
});

test("caller signal during pending summary fsync cannot publish the success name", async (t) => {
  const paths = await fixture(t), controller = new AbortController();
  const probe = await open(path.join(paths.parent,"probe"),"wx",0o600), prototype = Object.getPrototypeOf(probe);
  const originalSync = prototype.sync; await probe.close(); let calls = 0;
  t.mock.method(prototype,"sync",async function() {
    const result = await originalSync.call(this);
    if (++calls === 3) controller.abort();
    return result;
  });
  await assert.rejects(exportBackupS3({client:fake(),runId:"fixture",source:"application",...paths,signal:controller.signal}),{code:"ABORTED"});
  assert.equal(calls,3);
  await assert.rejects(stat(path.join(paths.destinationDir,"export-summary.json")),{code:"ENOENT"});
  assert.ok((await stat(path.join(paths.destinationDir,"export-summary.pending.json"))).isFile());
});
