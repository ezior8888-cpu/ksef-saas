#!/usr/bin/env node
/**
 * Preparation library, not a configured job. Import and CLI never connect.
 * Only a caller-supplied AWS S3 client can perform the explicit export call.
 * Outputs contain PRIVATE bucket/key/config metadata and must stay outside Git.
 * No encryption, shared DB/S3 freeze, IAM/KMS escrow, off-host copy or G09 PASS.
 *
 * Protocol references (reviewed 2026-10-10):
 * https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListBuckets.html
 * https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectsV2.html
 * https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectVersions.html
 * https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListMultipartUploads.html
 * https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html
 * https://docs.min.io/aistor/developers/s3-api-compatibility/
 * Current AIStor compatibility is a profile reference, NOT proof of support
 * in the deployed OSS releases. A supported-profile GET that fails stops export.
 */
import * as S3 from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { link, lstat, mkdir, open } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";

const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const DEFAULTS = Object.freeze({
  requestTimeoutMs: 10000, objectTimeoutMs: 600000, maxDurationMs: 7200000,
  maxPages: 10000, maxBuckets: 10000, maxObjects: 1000000,
  maxRecordBytes: 2 * 1024 * 1024, maxChunkBytes: 1024 * 1024,
  maxObjectBytes: 128 * 1024 ** 3, maxTotalBytes: 1024 ** 4
});
const isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const integer = (v) => Number.isSafeInteger(v) && v >= 0;
const nonempty = (v) => typeof v === "string" && v.length > 0;
const compareKeys = (a, b) => Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));

/** Missing configuration is accepted only for this getter's precise S3 code. */
const CONFIG = [
  ["location", "GetBucketLocationCommand", ["LocationConstraint"], []],
  ["versioning", "GetBucketVersioningCommand", ["Status", "MFADelete"], []],
  ["policy", "GetBucketPolicyCommand", ["Policy"], ["NoSuchBucketPolicy"]],
  ["tags", "GetBucketTaggingCommand", ["TagSet"], ["NoSuchTagSet"]],
  ["lifecycle", "GetBucketLifecycleConfigurationCommand", ["Rules", "TransitionDefaultMinimumObjectSize"], ["NoSuchLifecycleConfiguration"]],
  ["encryption", "GetBucketEncryptionCommand", ["ServerSideEncryptionConfiguration"], ["ServerSideEncryptionConfigurationNotFoundError"]],
  ["objectLock", "GetObjectLockConfigurationCommand", ["ObjectLockConfiguration"], ["ObjectLockConfigurationNotFoundError"]],
  ["notifications", "GetBucketNotificationConfigurationCommand", ["TopicConfigurations", "QueueConfigurations", "LambdaFunctionConfigurations", "EventBridgeConfiguration"], []],
  ["replication", "GetBucketReplicationCommand", ["ReplicationConfiguration"], ["ReplicationConfigurationNotFoundError"]]
];
export const MINIO_PROFILE = Object.freeze({
  id: "minio-unversioned-s3-v1",
  supportedBucketGetters: CONFIG.map((x) => x[1]),
  requiredListObjectsV2Fields: ["IsTruncated", "KeyCount"],
  outsideScope: [
    "MinIO IAM/users/groups/service accounts", "MinIO service configuration",
    "KMS/encryption key escrow", "bucket quota/tiering/remote target credentials",
    "CORS", "ACL/ownership/public-access controls", "website/logging/analytics",
    "inventory/metrics/intelligent-tiering/accelerate/request-payment"
  ]
});
export const HELP = "Preparation only: import exportBackupS3 and supply an explicitly configured client.\n"
  + "CLI has no execution option, credentials, environment reads or network calls.\n"
  + "v1: Unversioned, no delete markers/multipart; new private directory only.\n"
  + "Payload/config in the declared S3 profile do not establish full recovery or G09 PASS.\n"
  + "0700/0600 are POSIX modes; Windows ACLs must be secured independently.\n";

export class BackupS3ExportError extends Error {
  constructor(code) { super("S3 export incomplete: " + code); this.name = "BackupS3ExportError"; this.code = code; }
}
const fail = (code) => { throw new BackupS3ExportError(code); };
function privateFailure(error, fallback) {
  return error instanceof BackupS3ExportError ? error : new BackupS3ExportError(fallback);
}
function checkStatus(value) {
  if (!isRecord(value)) fail("INVALID_RESPONSE");
  const status = value.$metadata?.httpStatusCode;
  if (status !== undefined && status !== 200) fail("NON_200_RESPONSE");
}
function safeJSON(value, limit) {
  let json;
  try { json = JSON.stringify(value); } catch { fail("INVALID_METADATA"); }
  if (typeof json !== "string" || Buffer.byteLength(json) > limit) fail("METADATA_LIMIT");
  return json;
}
function keyValue(value, response) {
  if (typeof value !== "string" || value.length === 0) fail("INVALID_KEY");
  if (response.EncodingType === "url") {
    try { return decodeURIComponent(value); } catch { fail("INVALID_KEY_ENCODING"); }
  }
  if (response.EncodingType !== undefined) fail("UNSUPPORTED_KEY_ENCODING");
  return value;
}
function objectIdentity(value, response) {
  if (!isRecord(value) || !integer(value.Size) || !nonempty(value.ETag)) fail("INVALID_OBJECT_LISTING");
  const key = keyValue(value.Key, response);
  if (Buffer.byteLength(key, "utf8") > 1024 || key.includes("\0")) fail("INVALID_KEY");
  const date = value.LastModified instanceof Date ? value.LastModified : new Date(value.LastModified);
  if (!Number.isFinite(date.getTime())) fail("INVALID_OBJECT_TIME");
  return { key, bytes: value.Size, etag: value.ETag, lastModified: date.toISOString() };
}
function updateInventory(hash, item) { hash.update(JSON.stringify(item) + "\n"); }
function truncation(response) {
  if (typeof response.IsTruncated !== "boolean") fail("MISSING_TRUNCATION_FLAG");
  if (response.CommonPrefixes !== undefined && (!Array.isArray(response.CommonPrefixes) || response.CommonPrefixes.length > 0)) fail("FILTERED_LISTING");
  for (const field of ["Prefix", "Delimiter"]) {
    if (response[field] !== undefined && response[field] !== "") fail("FILTERED_LISTING");
  }
  return response.IsTruncated;
}
function finalMarkers(response, fields) {
  // Empty XML elements may deserialize as empty strings on a final page.
  // Any nonempty or non-string next marker contradicts finality.
  for (const field of fields) {
    if (response[field] !== undefined && response[field] !== "") fail("UNEXPECTED_FINAL_PAGINATION_MARKER");
  }
}
function pageArray(response, field) {
  const value = response[field] === undefined ? [] : response[field];
  if (!Array.isArray(value) || value.length > 1000) fail("INVALID_LIST_PAGE");
  return value;
}
function assertToken(token, seen) {
  if (!nonempty(token) || token.length > 4096 || seen.has(token)) fail("PAGINATION_TOKEN_INVALID");
  seen.add(token);
}
function projectConfig(response, fields) {
  checkStatus(response);
  for (const key of Object.keys(response)) {
    if (key !== "$metadata" && !fields.includes(key)) fail("UNSUPPORTED_CONFIGURATION_FIELD");
  }
  return Object.fromEntries(fields.filter((key) => response[key] !== undefined).map((key) => [key, response[key]]));
}
function validateConfig(name, value) {
  if (name === "versioning") {
    if (value.Status !== undefined || value.MFADelete !== undefined) fail("UNSUPPORTED_VERSIONING");
  } else if (name === "policy") {
    if (!nonempty(value.Policy)) fail("INVALID_CONFIGURATION");
    try { if (!isRecord(JSON.parse(value.Policy))) fail("INVALID_CONFIGURATION"); }
    catch { fail("INVALID_CONFIGURATION"); }
  } else if (name === "tags") {
    validateTags(value.TagSet);
  } else if (name === "lifecycle") {
    if (!Array.isArray(value.Rules) || value.Rules.length === 0) fail("INVALID_CONFIGURATION");
  } else if (name === "encryption") {
    if (!isRecord(value.ServerSideEncryptionConfiguration) || !Array.isArray(value.ServerSideEncryptionConfiguration.Rules)
      || value.ServerSideEncryptionConfiguration.Rules.length === 0) fail("INVALID_CONFIGURATION");
  } else if (name === "objectLock") {
    // Object Lock requires versioning; even a present lock config is outside v1.
    fail("UNSUPPORTED_OBJECT_LOCK");
  } else if (name === "replication") {
    if (!isRecord(value.ReplicationConfiguration) || !nonempty(value.ReplicationConfiguration.Role)
      || !Array.isArray(value.ReplicationConfiguration.Rules)) fail("INVALID_CONFIGURATION");
  } else if (name === "notifications") {
    for (const [key, entry] of Object.entries(value)) {
      if (key === "EventBridgeConfiguration" ? !isRecord(entry) : !Array.isArray(entry)) fail("INVALID_CONFIGURATION");
    }
  }
}
function validateTags(value) {
  if (!Array.isArray(value) || value.some((tag) => !isRecord(tag) || typeof tag.Key !== "string" || typeof tag.Value !== "string")) fail("INVALID_TAGS");
  if (new Set(value.map((tag) => tag.Key)).size !== value.length) fail("DUPLICATE_TAG");
}
/** Reject symlinked parents. The trusted private parent must not be mutated
 * concurrently: portable Node has no openat directory-fd creation primitive. */
async function newDirectory(destination) {
  if (typeof destination !== "string" || !path.isAbsolute(destination)) fail("ABSOLUTE_DESTINATION_REQUIRED");
  if (destination.startsWith("\\\\") || destination.startsWith("//") || destination.includes("\0")) fail("LOCAL_DESTINATION_REQUIRED");
  const resolved = path.resolve(destination);
  if (resolved === path.parse(resolved).root) fail("INVALID_DESTINATION");
  const immediateParent = path.dirname(resolved);
  let current = immediateParent;
  while (true) {
    const stat = await lstat(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail("UNSAFE_DESTINATION_PARENT");
    if (current === immediateParent && process.platform !== "win32"
      && ((stat.mode & 0o077) !== 0 || (typeof process.getuid === "function" && stat.uid !== process.getuid()))) fail("PRIVATE_PARENT_REQUIRED");
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  await mkdir(resolved, { mode: 0o700, recursive: false });
  return resolved;
}
async function jsonWriter(filename, limit) {
  const handle = await open(filename, "wx", 0o600);
  const hash = createHash("sha256");
  let bytes = 0;
  return {
    async append(value) {
      const data = Buffer.from(safeJSON(value, limit) + "\n");
      await handle.writeFile(data);
      bytes += data.length; hash.update(data);
    },
    async close() { await handle.sync(); await handle.close(); return { bytes, sha256: hash.digest("hex") }; },
    async abort() { await handle.close().catch(() => {}); }
  };
}

/**
 * Execute only when a caller explicitly invokes this library. Tests supply a
 * fake send(command,{abortSignal}); this module never constructs S3Client.
 * Overall recovery and bucketConfigurationComplete intentionally remain false.
 */
export async function exportBackupS3(options) {
  let manifestWriter, configWriter;
  const startedAtUtc = new Date().toISOString();
  const start = Date.now();
  try {
    if (!isRecord(options) || !options.client || typeof options.client.send !== "function") fail("CLIENT_REQUIRED");
    const { client, runId, source, destinationDir } = options;
    if (typeof runId !== "string" || !RUN_ID.test(runId)) fail("INVALID_RUN_ID");
    if (source !== "application" && source !== "supabase") fail("INVALID_SOURCE");
    const limits = Object.fromEntries(Object.entries(DEFAULTS).map(([key, value]) => [key, options[key] ?? value]));
    for (const value of Object.values(limits)) if (!Number.isSafeInteger(value) || value < 1) fail("INVALID_LIMIT");
    // Avoid caller-selected unbounded caps for pages/records/chunks.
    for (const key of Object.keys(DEFAULTS)) {
      if (limits[key] > DEFAULTS[key]) fail("INVALID_LIMIT");
    }
    const checkDeadline = () => { if (Date.now() - start >= limits.maxDurationMs) fail("RUN_TIMEOUT"); };
    const request = async (commandName, input) => {
      checkDeadline();
      const controller = new AbortController();
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new BackupS3ExportError("REQUEST_TIMEOUT")); },
          Math.min(limits.requestTimeoutMs, Math.max(1, limits.maxDurationMs - (Date.now() - start))));
      });
      try {
        const value = await Promise.race([client.send(new S3[commandName](input), { abortSignal: controller.signal }), timeout]);
        checkStatus(value);
        if (commandName !== "GetObjectCommand") safeJSON(value, limits.maxRecordBytes);
        return value;
      } finally { clearTimeout(timer); }
    };
    const dir = await newDirectory(destinationDir);
    await mkdir(path.join(dir, "payloads"), { mode: 0o700 });
    manifestWriter = await jsonWriter(path.join(dir, "objects.ndjson"), limits.maxRecordBytes);
    configWriter = await jsonWriter(path.join(dir, "bucket-config.ndjson"), limits.maxRecordBytes);
    let bucketCount = 0, objectCount = 0, objectBytes = 0, payloadSequence = 0, plannedPayloadBytes = 0;
    let totalPages = 0;
    const page = () => { checkDeadline(); if (++totalPages > limits.maxPages) fail("PAGE_LIMIT"); };
    const listBuckets = async () => {
      const buckets = new Set(), tokens = new Set();
      let token;
      do {
        page();
        const response = await request("ListBucketsCommand", { MaxBuckets: 1000, ...(token === undefined ? {} : { ContinuationToken: token }) });
        if (!Array.isArray(response.Buckets) || response.Buckets.length > limits.maxBuckets) fail("INVALID_BUCKET_LIST");
        if (response.Prefix || response.BucketRegion) fail("FILTERED_BUCKET_LIST");
        for (const bucket of response.Buckets) {
          if (!isRecord(bucket) || !nonempty(bucket.Name) || bucket.Name.length > 255 || buckets.has(bucket.Name)) fail("INVALID_BUCKET_LIST");
          buckets.add(bucket.Name);
          if (buckets.size > limits.maxBuckets) fail("BUCKET_LIMIT");
        }
        token = response.ContinuationToken;
        if (token !== undefined) assertToken(token, tokens);
        if (response.IsTruncated === true && token === undefined) fail("PAGINATION_TOKEN_INVALID");
        if (response.IsTruncated === false && token !== undefined) fail("INVALID_LIST_PAGE");
      } while (token !== undefined);
      return [...buckets].sort(compareKeys);
    };
    const readConfig = async (bucket) => {
      const entries = [];
      for (const [name, command, fields, absentCodes] of CONFIG) {
        let value;
        try {
          const response = await request(command, { Bucket: bucket });
          value = projectConfig(response, fields);
          validateConfig(name, value);
          entries.push({ name, state: "present", value });
        } catch (error) {
          const status = error?.$metadata?.httpStatusCode;
          if (!absentCodes.includes(error?.name) || (status !== undefined && status !== 404)) throw error;
          entries.push({ name, state: "absent", errorCode: error.name });
        }
      }
      return entries;
    };
    const noMultipart = async (bucket) => {
      const tokens = new Set(); let marker;
      while (true) {
        page();
        const response = await request("ListMultipartUploadsCommand", { Bucket: bucket, MaxUploads: 1000, ...(marker || {}) });
        if (pageArray(response, "Uploads").length !== 0) fail("MULTIPART_PRESENT");
        if (!truncation(response)) {
          finalMarkers(response, ["NextKeyMarker", "NextUploadIdMarker"]); break;
        }
        if (!nonempty(response.NextKeyMarker) || !nonempty(response.NextUploadIdMarker)) fail("PAGINATION_TOKEN_INVALID");
        const token = JSON.stringify([response.NextKeyMarker, response.NextUploadIdMarker]);
        assertToken(token, tokens);
        marker = { KeyMarker: response.NextKeyMarker, UploadIdMarker: response.NextUploadIdMarker };
      }
    };
    const readVersions = async (bucket) => {
      let marker, previous;
      const tokens = new Set(), hash = createHash("sha256");
      let count = 0, bytes = 0;
      while (true) {
        page();
        const response = await request("ListObjectVersionsCommand", { Bucket: bucket, MaxKeys: 1000, EncodingType: "url", ...(marker || {}) });
        if (pageArray(response, "DeleteMarkers").length !== 0) fail("DELETE_MARKERS_PRESENT");
        for (const version of pageArray(response, "Versions")) {
          if (version.VersionId !== "null" || version.IsLatest !== true) fail("UNSUPPORTED_VERSION_HISTORY");
          const item = objectIdentity(version, response);
          if (previous !== undefined && compareKeys(previous, item.key) >= 0) fail("DUPLICATE_OR_UNSORTED_KEYS");
          previous = item.key; updateInventory(hash, item);
          count++; bytes += item.bytes;
          if (count > limits.maxObjects || !integer(bytes)) fail("OBJECT_LIMIT");
        }
        if (!truncation(response)) {
          finalMarkers(response, ["NextKeyMarker", "NextVersionIdMarker"]); break;
        }
        if (!nonempty(response.NextKeyMarker) || !nonempty(response.NextVersionIdMarker)) fail("PAGINATION_TOKEN_INVALID");
        assertToken(JSON.stringify([response.NextKeyMarker, response.NextVersionIdMarker]), tokens);
        marker = { KeyMarker: keyValue(response.NextKeyMarker, response), VersionIdMarker: response.NextVersionIdMarker };
      }
      return { count, bytes, sha256: hash.digest("hex") };
    };
    const download = async (bucket, item) => {
      plannedPayloadBytes += item.bytes;
      if (item.bytes > limits.maxObjectBytes || !integer(plannedPayloadBytes) || plannedPayloadBytes > limits.maxTotalBytes) fail("PAYLOAD_BYTE_LIMIT");
      const response = await request("GetObjectCommand", { Bucket: bucket, Key: item.key, IfMatch: item.etag, ChecksumMode: "ENABLED" });
      if (response.ContentLength !== item.bytes || response.ETag !== item.etag || response.DeleteMarker
        || (response.VersionId !== undefined && response.VersionId !== "null") || response.ContentRange !== undefined) {
        response.Body?.destroy?.(); fail("OBJECT_CHANGED_OR_PARTIAL");
      }
      const body = response.Body;
      if (!body || typeof body[Symbol.asyncIterator] !== "function") fail("BODY_STREAM_REQUIRED");
      const payloadId = String(++payloadSequence).padStart(16, "0") + ".bin";
      const hash = createHash("sha256"); let bytes = 0;
      const transform = new Transform({
        transform(chunk, _encoding, callback) {
          try {
            if (!(chunk instanceof Uint8Array) || chunk.byteLength > limits.maxChunkBytes) fail("INVALID_BODY_CHUNK");
            bytes += chunk.byteLength;
            if (!integer(bytes) || bytes > item.bytes) fail("OBJECT_SIZE_MISMATCH");
            hash.update(chunk); callback(null, chunk);
          } catch (error) { callback(privateFailure(error, "BODY_READ_FAILED")); }
        }
      });
      const controller = new AbortController();
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort(); body.destroy?.();
          reject(new BackupS3ExportError("OBJECT_TIMEOUT"));
        }, Math.min(limits.objectTimeoutMs, Math.max(1, limits.maxDurationMs - (Date.now() - start))));
      });
      try {
        const readable = body instanceof Readable ? body : Readable.from(body, { objectMode: false });
        // AbortSignal stops the file writer; the race also bounds iterators
        // whose next()/return() never settles during stream teardown.
        await Promise.race([pipeline(readable, transform,
          createWriteStream(path.join(dir, "payloads", payloadId), { flags: "wx", mode: 0o600 }),
          { signal: controller.signal }), timeout]);
      } catch (error) {
        throw controller.signal.aborted ? new BackupS3ExportError("OBJECT_TIMEOUT") : privateFailure(error, "BODY_READ_FAILED");
      } finally { clearTimeout(timer); }
      if (bytes !== item.bytes) fail("OBJECT_SIZE_MISMATCH");
      const sha256 = hash.digest("hex");
      // Composite checksums are not hashes of payload bytes; refuse rather than
      // treating ETag/part hashes as full-object SHA256.
      if (response.ChecksumSHA256 !== undefined) {
        if (response.ChecksumType === "COMPOSITE") fail("UNSUPPORTED_COMPOSITE_CHECKSUM");
        const expected = Buffer.from(sha256, "hex").toString("base64");
        if (response.ChecksumSHA256 !== expected) fail("OBJECT_SHA256_MISMATCH");
      }
      const tags = await request("GetObjectTaggingCommand", { Bucket: bucket, Key: item.key });
      validateTags(tags.TagSet);
      const metadataFields = ["ContentType", "ContentEncoding", "ContentDisposition", "ContentLanguage", "CacheControl",
        "Expires", "Metadata", "ETag", "LastModified", "StorageClass", "ServerSideEncryption", "SSEKMSKeyId",
        "BucketKeyEnabled", "ChecksumSHA256", "ChecksumType", "WebsiteRedirectLocation", "TagCount"];
      const metadata = Object.fromEntries(metadataFields.filter((key) => response[key] !== undefined).map((key) => [key, response[key]]));
      if (metadata.Metadata !== undefined && (!isRecord(metadata.Metadata) || Object.values(metadata.Metadata).some((v) => typeof v !== "string"))) fail("INVALID_OBJECT_METADATA");
      if (response.TagCount !== undefined && response.TagCount !== tags.TagSet.length) fail("OBJECT_TAGS_CHANGED");
      await manifestWriter.append({ bucket, key: item.key, bytes, sha256, payloadId, metadata, tags: tags.TagSet });
    };
    const readObjects = async (bucket, exportPayload) => {
      let token, previous; const tokens = new Set(), hash = createHash("sha256");
      let count = 0, bytes = 0;
      while (true) {
        page();
        const response = await request("ListObjectsV2Command", { Bucket: bucket, MaxKeys: 1000, EncodingType: "url", ...(token === undefined ? {} : { ContinuationToken: token }) });
        const isTruncated = truncation(response);
        const contents = pageArray(response, "Contents");
        // This explicit v1 profile requires KeyCount, including on empty pages.
        // A service omitting it is unverified, never an inferred zero listing.
        if (!integer(response.KeyCount) || response.KeyCount !== contents.length) fail("KEY_COUNT_MISMATCH");
        for (const object of contents) {
          const item = objectIdentity(object, response);
          if (previous !== undefined && compareKeys(previous, item.key) >= 0) fail("DUPLICATE_OR_UNSORTED_KEYS");
          previous = item.key; updateInventory(hash, item);
          count++; bytes += item.bytes;
          if (count > limits.maxObjects || !integer(bytes)) fail("OBJECT_LIMIT");
          if (exportPayload) await download(bucket, item);
        }
        if (!isTruncated) {
          finalMarkers(response, ["NextContinuationToken"]); break;
        }
        token = response.NextContinuationToken; assertToken(token, tokens);
      }
      return { count, bytes, sha256: hash.digest("hex") };
    };
    const buckets = await listBuckets();
    for (const bucket of buckets) {
      const configuration = await readConfig(bucket);
      await noMultipart(bucket);
      const versions = await readVersions(bucket);
      const current = await readObjects(bucket, true);
      if (JSON.stringify(versions) !== JSON.stringify(current)) fail("VERSION_INVENTORY_MISMATCH");
      const after = await readObjects(bucket, false);
      const versionsAfter = await readVersions(bucket);
      await noMultipart(bucket);
      const configAfter = await readConfig(bucket);
      if (JSON.stringify(current) !== JSON.stringify(after) || JSON.stringify(current) !== JSON.stringify(versionsAfter)
        || safeJSON(configuration, limits.maxRecordBytes) !== safeJSON(configAfter, limits.maxRecordBytes)) fail("SOURCE_CHANGED");
      await configWriter.append({ bucket, profile: MINIO_PROFILE.id, versioning: "Unversioned", configuration,
        observedListingStable: true, mutationExclusionVerified: false });
      bucketCount++; objectCount += current.count; objectBytes += current.bytes;
      if (objectCount > limits.maxObjects || !integer(objectBytes)) fail("OBJECT_LIMIT");
    }
    if (JSON.stringify(buckets) !== JSON.stringify(await listBuckets())) fail("BUCKET_INVENTORY_CHANGED");
    const objectManifest = { path: "objects.ndjson", ...await manifestWriter.close() }; manifestWriter = null;
    const bucketConfig = { path: "bucket-config.ndjson", ...await configWriter.close() }; configWriter = null;
    checkDeadline();
    const summary = {
      schemaVersion: 1, runId, source, status: "COMPLETE_WITHIN_DECLARED_SCOPE",
      startedAtUtc, completedAtUtc: new Date().toISOString(), versioning: "Unversioned",
      payloadComplete: true, supportedBucketProfileComplete: true,
      bucketConfigurationComplete: false, overallRecoveryComplete: false,
      observedListingStable: true, mutationsExcluded: false, F0Accepted: false,
      counts: { bucketCount, currentObjectCount: objectCount, currentObjectBytes: objectBytes,
        allVersionCount: objectCount, allVersionBytes: objectBytes, deleteMarkerCount: 0, multipartUploadCount: 0 },
      objectManifest, bucketConfig, profile: MINIO_PROFILE,
      listingFlags: { buckets: true, currentObjects: true, versions: true, versioning: true, multipart: true },
      privateOutput: true, posixModes: { directory: "0700", file: "0600" },
      deployedMinIOProfileCompatibilityVerified: false,
      trustedParentMustNotChangeConcurrently: true, POSIXPrivateParentChecked: process.platform !== "win32",
      windowsACLVerified: false, sharedDatabaseS3ConsistencyVerified: false
    };
    // Only publish the success name after the complete private file is synced
    // and closed. Keep pending artifacts on failure; link() refuses overwrite.
    const pendingSummary = path.join(dir, "export-summary.pending.json");
    const writer = await jsonWriter(pendingSummary, limits.maxRecordBytes);
    try { await writer.append(summary); await writer.close(); } catch (error) { await writer.abort(); throw error; }
    checkDeadline();
    await link(pendingSummary, path.join(dir, "export-summary.json"));
    return summary;
  } catch (error) {
    await manifestWriter?.abort(); await configWriter?.abort();
    throw privateFailure(error, "EXPORT_FAILED");
  }
}
export function main(args = [], write = (value) => process.stdout.write(value)) {
  write(HELP);
  return args.length === 0 || (args.length === 1 && args[0] === "--help") ? 0 : 2;
}
const directlyRun = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (directlyRun) process.exitCode = main(process.argv.slice(2));
