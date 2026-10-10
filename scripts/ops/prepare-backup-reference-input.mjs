#!/usr/bin/env node
/** Explicit local integrity adapter; import and help-only CLI are inert.
 * Reads a reported normalized-reference JSON, two private S3 export directories,
 * and the fixed repository map. No DB/S3/SSH/client/env, writes or subprocesses.
 * Return `bundle` is PRIVATE. Only `report` is safe for public output.
 * This is not a DB extractor, source-authenticity check, backup or G09 acceptance.
 */
import { closeSync, constants, fstatSync, lstatSync, openSync, opendirSync, readSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateBackupReferences } from "./check-backup-references.mjs";

const MAP_PATH = fileURLToPath(new URL("../../ops/observability/backup/storage-reference-map.json", import.meta.url));
const SOURCES = ["application", "supabase"];
const PROFILE_ID = "minio-unversioned-s3-v1";
// Pinned to export-backup-s3's declared v1 protocol, not deployed MinIO support.
const CONFIG = [
  ["location", "GetBucketLocationCommand", ["LocationConstraint"]],
  ["versioning", "GetBucketVersioningCommand", ["Status", "MFADelete"]],
  ["policy", "GetBucketPolicyCommand", ["Policy"], "NoSuchBucketPolicy"],
  ["tags", "GetBucketTaggingCommand", ["TagSet"], "NoSuchTagSet"],
  ["lifecycle", "GetBucketLifecycleConfigurationCommand", ["Rules", "TransitionDefaultMinimumObjectSize"], "NoSuchLifecycleConfiguration"],
  ["encryption", "GetBucketEncryptionCommand", ["ServerSideEncryptionConfiguration"], "ServerSideEncryptionConfigurationNotFoundError"],
  ["objectLock", "GetObjectLockConfigurationCommand", ["ObjectLockConfiguration"], "ObjectLockConfigurationNotFoundError"],
  ["notifications", "GetBucketNotificationConfigurationCommand", ["TopicConfigurations", "QueueConfigurations", "LambdaFunctionConfigurations", "EventBridgeConfiguration"]],
  ["replication", "GetBucketReplicationCommand", ["ReplicationConfiguration"], "ReplicationConfigurationNotFoundError"]
];
const OUTSIDE_SCOPE = ["MinIO IAM/users/groups/service accounts", "MinIO service configuration", "KMS/encryption key escrow",
  "bucket quota/tiering/remote target credentials", "CORS", "ACL/ownership/public-access controls", "website/logging/analytics",
  "inventory/metrics/intelligent-tiering/accelerate/request-payment"];
const LIMITS = Object.freeze({ maxJsonBytes: 1024 * 1024, maxNdjsonBytes: 64 * 1024 * 1024,
  maxRecordBytes: 2 * 1024 * 1024, maxObjects: 10_000, maxBuckets: 10_000,
  maxPayloadBytes: 128 * 1024 ** 3, maxTotalPayloadBytes: 1024 ** 4 });
const CHUNK_BYTES = 64 * 1024;
const FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);
const SHA = /^[a-fA-F0-9]{64}$/;
const RUN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const PAYLOAD = /^[0-9]{16}\.bin$/;
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const text = (value, max = 1024) => typeof value === "string" && value.length > 0 && Buffer.byteLength(value, "utf8") <= max && !value.includes("\0");
const digest = value => typeof value === "string" && SHA.test(value);
const keysOnly = (value, allowed) => record(value) && Object.keys(value).every(key => allowed.includes(key));
const exactList = (value, expected) => Array.isArray(value) && value.length === expected.length
  && expected.every(item => value.filter(entry => entry === item).length === 1);
export const HELP = "Preparation only: import prepareBackupReferenceInput({normalizedReferencesPath, applicationDir, supabaseDir}).\n"
  + "CLI has no execution option and never reads supplied paths. Return bundle is PRIVATE.\n"
  + "Library reads only local files, fixed repository map and payloads with 16-digit names.\n"
  + "Limits: JSON 1 MiB, NDJSON 64 MiB/file and 2 MiB/row; 10000 objects/source.\n"
  + "Parents must be trusted and stable throughout. Same FD checked/read; detected symlink paths rejected after open.\n"
  + "Portable Node cannot guarantee refusal of all Windows reparse points or protect mutable ancestor paths.\n"
  + "No Windows ACL verification, source authenticity, DB extraction, shared DB/S3 consistency or G09 PASS.\n";
export class BackupReferenceInputError extends Error {
  constructor(code) { super("Local reference input incomplete: " + code); this.name = "BackupReferenceInputError"; this.code = code; }
}
const fail = code => { throw new BackupReferenceInputError(code); };

function localPath(value) {
  if (!text(value, 32768) || !path.isAbsolute(value) || /^[\\/]{2}/.test(value) || /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value)) fail("LOCAL_ABSOLUTE_PATH_REQUIRED");
  return path.resolve(value);
}
function safeDirectory(directory) {
  let current = directory;
  while (true) {
    const stat = lstatSync(current, { bigint: true });
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail("UNSAFE_DIRECTORY");
    const parent = path.dirname(current); if (parent === current) break; current = parent;
  }
}
function identity(stat, other) { return stat.dev === other.dev && stat.ino === other.ino; }
function stable(stat, other) { return identity(stat, other) && stat.size === other.size && stat.mtimeNs === other.mtimeNs && stat.ctimeNs === other.ctimeNs; }
/** Open first, then inspect the path. No lstat-before-open permission decision.
 * Pin a regular FD; post-open lstat refuses recognized symlinks/junctions
 * and checks its identity. Portable Node cannot protect mutable ancestor paths.
 */
function readFileBounded(filename, maxBytes, consume) {
  let fd; let bytes = 0; let result; let caught;
  try {
    fd = openSync(filename, FLAGS);
    const initial = fstatSync(fd, { bigint: true });
    if (!initial.isFile() || initial.size < 0n || initial.size > BigInt(maxBytes)) fail("FILE_TYPE_OR_BYTE_LIMIT");
    const pathname = lstatSync(filename, { bigint: true });
    if (pathname.isSymbolicLink() || !pathname.isFile() || !identity(initial, pathname)) fail("UNSAFE_OR_REPLACED_FILE");
    const hash = createHash("sha256"), buffer = Buffer.alloc(Math.min(CHUNK_BYTES, maxBytes + 1));
    while (bytes <= maxBytes) {
      const length = Math.min(buffer.length, maxBytes + 1 - bytes);
      const n = readSync(fd, buffer, 0, length, null);
      if (!integer(n) || n > length) fail("INVALID_FILE_READ");
      if (n === 0) break;
      bytes += n; if (bytes > maxBytes) fail("FILE_BYTE_LIMIT");
      const chunk = buffer.subarray(0, n); hash.update(chunk); consume(chunk);
    }
    const after = fstatSync(fd, { bigint: true });
    const pathAfter = lstatSync(filename, { bigint: true });
    if (!stable(initial, after) || after.size !== BigInt(bytes) || pathAfter.isSymbolicLink()
      || !pathAfter.isFile() || !identity(after, pathAfter)) fail("FILE_CHANGED_DURING_READ");
    result = { bytes, sha256: hash.digest("hex") };
  } catch (error) { caught = error; }
  finally { if (fd !== undefined) { try { closeSync(fd); } catch { caught ??= new BackupReferenceInputError("FILE_CLOSE_FAILED"); } } }
  if (caught) throw caught;
  return result;
}
function jsonFile(filename, maxBytes) {
  const chunks = []; readFileBounded(filename, maxBytes, chunk => chunks.push(Buffer.from(chunk)));
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { fail("INVALID_LOCAL_JSON"); }
}
function checkDescriptor(value, expectedPath, maxBytes) {
  if (!keysOnly(value, ["path", "bytes", "sha256"]) || value.path !== expectedPath
    || !integer(value.bytes) || value.bytes > maxBytes || !digest(value.sha256)) fail("INVALID_ARTIFACT_DESCRIPTOR");
}
function ndjson(filename, descriptor, limits, maxRows, consume) {
  let pending = Buffer.alloc(0), count = 0;
  const parse = line => {
    if (line.length > limits.maxRecordBytes || line.length === 0) fail("INVALID_NDJSON_RECORD");
    if (line.at(-1) === 13) line = line.subarray(0, -1);
    let value;
    try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(line)); }
    catch { fail("INVALID_NDJSON_RECORD"); }
    if (++count > maxRows) fail("RECORD_COUNT_LIMIT");
    consume(value);
  };
  const actual = readFileBounded(filename, Math.min(descriptor.bytes, limits.maxNdjsonBytes), chunk => {
    let offset = 0;
    while (offset < chunk.length) {
      const newline = chunk.indexOf(10, offset), end = newline === -1 ? chunk.length : newline;
      if (pending.length + end - offset > limits.maxRecordBytes) fail("RECORD_BYTE_LIMIT");
      const part = chunk.subarray(offset, end);
      pending = pending.length === 0 ? Buffer.from(part) : Buffer.concat([pending, part]);
      if (newline === -1) break;
      parse(pending); pending = Buffer.alloc(0); offset = newline + 1;
    }
  });
  if (pending.length !== 0) fail("UNTERMINATED_NDJSON_RECORD");
  if (actual.bytes !== descriptor.bytes || actual.sha256 !== descriptor.sha256.toLowerCase()) fail("ARTIFACT_HASH_OR_SIZE_MISMATCH");
  return count;
}
function tags(value) {
  if (!Array.isArray(value) || value.length > 50 || value.some(item => !keysOnly(item, ["Key", "Value"])
    || typeof item.Key !== "string" || typeof item.Value !== "string") || new Set(value.map(item => item.Key)).size !== value.length) fail("INVALID_TAGS");
}
function bucketConfiguration(row) {
  if (!keysOnly(row, ["bucket", "profile", "versioning", "observedListingStable", "mutationExclusionVerified", "configuration"])
    || !text(row.bucket, 1024) || row.profile !== PROFILE_ID || row.versioning !== "Unversioned"
    || row.observedListingStable !== true || row.mutationExclusionVerified !== false
    || !Array.isArray(row.configuration) || row.configuration.length !== CONFIG.length) fail("INVALID_BUCKET_CONFIGURATION");
  for (const [name, , fields, absentCode] of CONFIG) {
    const entries = row.configuration.filter(entry => record(entry) && entry.name === name);
    if (entries.length !== 1) fail("INVALID_BUCKET_CONFIGURATION");
    const entry = entries[0];
    if (entry.state === "absent") {
      if (!absentCode || !keysOnly(entry, ["name", "state", "errorCode"]) || entry.errorCode !== absentCode) fail("INVALID_BUCKET_CONFIGURATION");
      continue;
    }
    if (entry.state !== "present" || !keysOnly(entry, ["name", "state", "value"]) || !keysOnly(entry.value, fields)) fail("INVALID_BUCKET_CONFIGURATION");
    const value = entry.value;
    if (name === "versioning" && Object.keys(value).length !== 0) fail("UNSUPPORTED_BUCKET_VERSIONING");
    if (name === "objectLock") fail("UNSUPPORTED_OBJECT_LOCK");
    if (name === "tags") tags(value.TagSet);
    if (name === "policy") {
      let policy; try { policy = JSON.parse(value.Policy); } catch { fail("INVALID_BUCKET_CONFIGURATION"); }
      if (!record(policy)) fail("INVALID_BUCKET_CONFIGURATION");
    }
    if (name === "lifecycle" && (!Array.isArray(value.Rules) || value.Rules.length === 0)) fail("INVALID_BUCKET_CONFIGURATION");
    if (name === "encryption" && (!record(value.ServerSideEncryptionConfiguration) || !Array.isArray(value.ServerSideEncryptionConfiguration.Rules)
      || value.ServerSideEncryptionConfiguration.Rules.length === 0)) fail("INVALID_BUCKET_CONFIGURATION");
    if (name === "replication" && (!record(value.ReplicationConfiguration) || !text(value.ReplicationConfiguration.Role)
      || !Array.isArray(value.ReplicationConfiguration.Rules))) fail("INVALID_BUCKET_CONFIGURATION");
    if (name === "notifications" && Object.entries(value).some(([key, item]) => key === "EventBridgeConfiguration" ? !record(item) : !Array.isArray(item))) fail("INVALID_BUCKET_CONFIGURATION");
  }
}
function validateSummary(summary, source, runId, limits) {
  if (!record(summary) || summary.schemaVersion !== 1 || summary.runId !== runId || summary.source !== source
    || summary.status !== "COMPLETE_WITHIN_DECLARED_SCOPE" || summary.versioning !== "Unversioned"
    || summary.payloadComplete !== true || summary.supportedBucketProfileComplete !== true || summary.observedListingStable !== true
    || summary.mutationsExcluded !== false || summary.bucketConfigurationComplete !== false || summary.overallRecoveryComplete !== false
    || summary.F0Accepted !== false || summary.sharedDatabaseS3ConsistencyVerified !== false) fail("INVALID_EXPORT_SUMMARY");
  const profile = summary.profile;
  if (!keysOnly(profile, ["id", "supportedBucketGetters", "requiredListObjectsV2Fields", "outsideScope"]) || profile.id !== PROFILE_ID
    || !exactList(profile.supportedBucketGetters, CONFIG.map(([, command]) => command))
    || !exactList(profile.requiredListObjectsV2Fields, ["IsTruncated", "KeyCount"]) || !exactList(profile.outsideScope, OUTSIDE_SCOPE)) fail("UNSUPPORTED_EXPORT_PROFILE");
  const flags = summary.listingFlags;
  const names = ["buckets", "currentObjects", "versions", "versioning", "multipart"];
  if (!keysOnly(flags, names) || names.some(name => flags[name] !== true)) fail("INCOMPLETE_LISTING_FLAGS");
  const c = summary.counts;
  if (!keysOnly(c, ["bucketCount", "currentObjectCount", "currentObjectBytes", "allVersionCount", "allVersionBytes", "deleteMarkerCount", "multipartUploadCount"])
    || !integer(c.bucketCount) || c.bucketCount > limits.maxBuckets || !integer(c.currentObjectCount) || c.currentObjectCount > limits.maxObjects
    || !integer(c.currentObjectBytes) || c.currentObjectBytes > limits.maxTotalPayloadBytes
    || c.allVersionCount !== c.currentObjectCount || c.allVersionBytes !== c.currentObjectBytes
    || c.deleteMarkerCount !== 0 || c.multipartUploadCount !== 0) fail("INVALID_EXPORT_COUNTS");
  checkDescriptor(summary.objectManifest, "objects.ndjson", limits.maxNdjsonBytes);
  checkDescriptor(summary.bucketConfig, "bucket-config.ndjson", limits.maxNdjsonBytes);
}
function verifyPayloadDirectory(directory, expected, limit) {
  let handle; let count = 0;
  try {
    handle = opendirSync(directory); let entry;
    while ((entry = handle.readSync()) !== null) {
      if (++count > limit || !entry.isFile() || !PAYLOAD.test(entry.name) || !expected.has(entry.name)) fail("UNLISTED_OR_UNSAFE_PAYLOAD");
    }
    if (count !== expected.size) fail("MISSING_PAYLOAD");
  } finally { handle?.closeSync(); }
}
function loadExport(directory, source, runId, limits, budget) {
  safeDirectory(directory); const payloads = path.join(directory, "payloads"); safeDirectory(payloads);
  const summary = jsonFile(path.join(directory, "export-summary.json"), limits.maxJsonBytes);
  validateSummary(summary, source, runId, limits);
  const buckets = new Set();
  ndjson(path.join(directory, "bucket-config.ndjson"), summary.bucketConfig, limits, limits.maxBuckets, row => {
    bucketConfiguration(row); if (buckets.has(row.bucket)) fail("DUPLICATE_BUCKET_CONFIGURATION"); buckets.add(row.bucket);
  });
  if (buckets.size !== summary.counts.bucketCount) fail("BUCKET_COUNT_MISMATCH");
  const objects = [], identities = new Set(), payloadIds = new Set(); let bytes = 0;
  ndjson(path.join(directory, "objects.ndjson"), summary.objectManifest, limits, limits.maxObjects, row => {
    if (!keysOnly(row, ["bucket", "key", "bytes", "sha256", "payloadId", "metadata", "tags"]) || !text(row.bucket)
      || !buckets.has(row.bucket) || !text(row.key) || !integer(row.bytes) || row.bytes > limits.maxPayloadBytes
      || !digest(row.sha256) || typeof row.payloadId !== "string" || !PAYLOAD.test(row.payloadId) || !record(row.metadata)) fail("INVALID_OBJECT_RECORD");
    if (row.metadata.Metadata !== undefined && (!record(row.metadata.Metadata) || Object.values(row.metadata.Metadata).some(v => typeof v !== "string"))) fail("INVALID_OBJECT_METADATA");
    tags(row.tags);
    const id = JSON.stringify([row.bucket, row.key]);
    if (identities.has(id) || payloadIds.has(row.payloadId)) fail("DUPLICATE_OBJECT_OR_PAYLOAD");
    identities.add(id); payloadIds.add(row.payloadId);
    bytes += row.bytes; budget.bytes += row.bytes;
    if (!integer(bytes) || !integer(budget.bytes) || budget.bytes > limits.maxTotalPayloadBytes) fail("TOTAL_PAYLOAD_BYTE_LIMIT");
    const actual = readFileBounded(path.join(payloads, row.payloadId), row.bytes, () => {});
    if (actual.bytes !== row.bytes || actual.sha256 !== row.sha256.toLowerCase()) fail("PAYLOAD_HASH_OR_SIZE_MISMATCH");
    objects.push({ bucket: row.bucket, key: row.key, bytes: row.bytes, sha256: actual.sha256 });
  });
  if (objects.length !== summary.counts.currentObjectCount || bytes !== summary.counts.currentObjectBytes) fail("OBJECT_COUNT_OR_BYTE_MISMATCH");
  verifyPayloadDirectory(payloads, payloadIds, limits.maxObjects);
  return { source, runId, complete: true, versioning: "Unversioned", objects };
}

/** Only explicit local reads. `bundle` has real locally-hashed object members,
 * but the DB rows/coverage remain exactly the supplied reported declarations.
 * Trusted parents/files must remain stable for the entire multi-file read.
 * Per-file descriptor checks do not create a transactional directory snapshot.
 */
export function prepareBackupReferenceInput(options) {
  try {
    if (!keysOnly(options, ["normalizedReferencesPath", "applicationDir", "supabaseDir", "limits"])) fail("INVALID_OPTIONS");
    if (options.limits !== undefined && !keysOnly(options.limits, Object.keys(LIMITS))) fail("INVALID_LIMITS");
    const limits = { ...LIMITS, ...options.limits };
    for (const [key, value] of Object.entries(limits)) if (!Number.isSafeInteger(value) || value < 1 || value > LIMITS[key]) fail("INVALID_LIMITS");
    const normalizedPath = localPath(options.normalizedReferencesPath);
    const directories = SOURCES.map(source => localPath(options[source + "Dir"]));
    safeDirectory(path.dirname(normalizedPath)); safeDirectory(path.dirname(MAP_PATH));
    const reported = jsonFile(normalizedPath, limits.maxJsonBytes);
    if (!keysOnly(reported, ["schemaVersion", "runId", "mapId", "sourceRevision", "referenceScope", "references"])
      || reported.schemaVersion !== 1 || typeof reported.runId !== "string" || !RUN.test(reported.runId)
      || !record(reported.referenceScope) || !Array.isArray(reported.references) || reported.references.length > 10_000) fail("INVALID_NORMALIZED_REFERENCES");
    const referenceMap = jsonFile(MAP_PATH, LIMITS.maxJsonBytes);
    const budget = { bytes: 0 };
    const objectManifests = SOURCES.map((source, i) => loadExport(directories[i], source, reported.runId, limits, budget));
    const bundle = { ...reported, objectManifests };
    const checked = validateBackupReferences(bundle, referenceMap);
    const report = { ...checked, status: checked.ok ? "LOCAL_ARTIFACTS_AND_REPORTED_REFERENCES_CONSISTENT" : "LOCAL_ARTIFACTS_VERIFIED_REFERENCES_INCOMPLETE_OR_INCONSISTENT",
      localArtifactIntegrityVerified: true, databaseReferenceExtractionVerified: false, sourceAuthenticityVerified: false,
      sharedDatabaseS3ConsistencyVerified: false, overallRecoveryComplete: false, evidenceVerified: false, g09Accepted: false,
      checkedSources: 2, checkedPayloadBytes: budget.bytes, trustedStableParentsRequired: true, windowsACLVerified: false,
      windowsReparseProtectionGuaranteed: false,
      notice: "Verified local file bytes/hashes only. Reported DB references are not an authenticated DB extraction; no backup, restore or G09 acceptance." };
    return { bundle, report };
  } catch (error) {
    if (error instanceof BackupReferenceInputError) throw error;
    throw new BackupReferenceInputError("LOCAL_ARTIFACT_READ_OR_STRUCTURE_FAILED");
  }
}
export function main(args = [], write = value => process.stdout.write(value)) {
  write(HELP); return args.length === 0 || (args.length === 1 && args[0] === "--help") ? 0 : 2;
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) process.exitCode = main(process.argv.slice(2));
