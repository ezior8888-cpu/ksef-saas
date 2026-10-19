/** Pure structural contracts for injected operation claims. No I/O or providers.
 * Passing cannot authenticate writers, escrow, encryption or notification delivery.
 * Only opaque evidence references belong here; raw configuration and key material
 * belong in independently protected artifacts. Identifier syntax is not a secret
 * detector. Callers remain responsible for reviewing the referenced evidence.
 */
import path from 'node:path';
import { types } from 'node:util';

const REVISION = 'face09c57f7de756546e58d092dbe6d280f93c91';
const WRITERS = ['web', 'worker', 'crons', 'database-admin', 's3-upload-delete', 's3-lifecycle', 'supabase-storage'];
const COVERAGE = ['runtime-images-extensions', 'app-worker-config-keys', 'supabase-auth-jwt-storage', 'pgsodium-or-confirmed-unused', 'application-minio-iam-kms', 'supabase-minio-iam-kms'];
const READY = ['sourceInventoryReviewed', 'dumpPrivilegesAndVersionsVerified', 'runtimeSchemaReviewed', 'sourceMapReviewed', 'spaceVerified', 'minioProfilesVerified', 'targetEuOffHostVerified', 'targetIndependentOfStaging', 'keyEscrowVerified', 'independentReaderVerified', 'consistencyProcedureApproved'];
const GROUPS = ['database', 'application', 'supabase'];
const BASE = ['schemaVersion', 'runId', 'sourceRevision', 'startedAtUtc', 'completedAtUtc'];
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const WINDOW_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const MAX_BYTES = 65_536;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, expected) => Array.isArray(value) && value.length === expected.length && expected.every(item => value.filter(entry => entry === item).length === 1);
const keys = (value, expected) => record(value) && exact(Object.keys(value), expected);
const identifier = value => typeof value === 'string' && ID.test(value);
const digest = value => typeof value === 'string' && HASH.test(value);
const fail = code => { throw Object.assign(new Error(code), { code }); };
function utc(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return NaN;
  const result = Date.parse(value);
  return Number.isFinite(result) && new Date(result).toISOString() === value ? result : NaN;
}
function absolute(value) {
  if (typeof value !== 'string' || value.length > 4096 || /[\0\r\n]/.test(value) || /^[\\/]{2}/.test(value)) return false;
  const style = path.posix.isAbsolute(value) ? path.posix : path.win32;
  return style.isAbsolute(value) && style.normalize(value) === value && value !== style.parse(value).root
    && !value.endsWith(style.sep) && (style !== path.win32 || !value.slice(2).includes(':'));
}

/** Reject executable/non-JSON input before stringify, including getters/toJSON.
 * Limits bound both traversal and final serialized size. Proxies are rejected
 * before inspecting their prototype/keys so their traps cannot run here.
 */
function detachedJson(input, code) {
  const ancestors = new Set(); let nodes = 0, bytes = 0;
  function visit(value, depth) {
    if (++nodes > 2048 || depth > 12) fail(code);
    if (value === null || typeof value === 'boolean') { bytes += 5; return value; }
    if (typeof value === 'number') { if (!Number.isFinite(value)) fail(code); bytes += 32; return value; }
    if (typeof value === 'string') { bytes += Buffer.byteLength(value); if (bytes > MAX_BYTES) fail(code); return value; }
    if (typeof value !== 'object' || types.isProxy(value) || ancestors.has(value)) fail(code);
    const array = Array.isArray(value);
    if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype)) fail(code);
    const own = Reflect.ownKeys(value);
    if (own.length > 2048 || own.some(key => typeof key !== 'string')) fail(code);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (array && (!Number.isSafeInteger(value.length) || value.length > 2048 || own.length !== value.length + 1)) fail(code);
    const result = array ? [] : {};
    ancestors.add(value);
    for (const key of own) {
      if (array && key === 'length') continue;
      const descriptor = descriptors[key];
      if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable
        || key.length > 128 || ['__proto__', 'prototype', 'constructor'].includes(key)
        || (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length))) fail(code);
      bytes += Buffer.byteLength(key) + 4; if (bytes > MAX_BYTES) fail(code);
      Object.defineProperty(result, key, { value: visit(descriptor.value, depth + 1), enumerable: true, writable: true, configurable: true });
    }
    ancestors.delete(value);
    return result;
  }
  const value = visit(input, 0);
  if (Buffer.byteLength(JSON.stringify(value)) > MAX_BYTES) fail(code);
  return value;
}
function invocation(ctx) {
  if (!record(ctx) || !identifier(ctx.runId) || ctx.sourceRevision !== REVISION
    || !['synthetic', 'separately-authorized'].includes(ctx.mode)
    || !Number.isFinite(utc(ctx.startedAtUtc)) || !Number.isFinite(utc(ctx.nowUtc))
    || utc(ctx.startedAtUtc) > utc(ctx.nowUtc)) fail('INVALID_BACKUP_OPERATION_CONTEXT');
}
function base(value, ctx, fields, code) {
  invocation(ctx);
  if (!keys(value, [...BASE, ...fields]) || value.schemaVersion !== 1 || value.runId !== ctx.runId || value.sourceRevision !== ctx.sourceRevision
    || !Number.isFinite(utc(value.startedAtUtc)) || !Number.isFinite(utc(value.completedAtUtc))
    || utc(value.startedAtUtc) < utc(ctx.startedAtUtc) || utc(value.completedAtUtc) > utc(ctx.nowUtc)
    || utc(value.startedAtUtc) > utc(value.completedAtUtc)) fail(code);
}
function reference(value) { return keys(value, ['sha256', 'evidenceRef']) && digest(value.sha256) && identifier(value.evidenceRef); }
function sameReference(value, expected) { return reference(value) && reference(expected) && value.sha256 === expected.sha256 && value.evidenceRef === expected.evidenceRef; }
function boundStates(value, ctx, code) {
  if (!reference(ctx.originalState) || !reference(ctx.heldState) || !WINDOW_ID.test(ctx.windowId ?? '')) fail('INVALID_BACKUP_OPERATION_CONTEXT');
  if (value.windowId !== ctx.windowId || !sameReference(value.originalState, ctx.originalState) || !sameReference(value.heldState, ctx.heldState)) fail(code);
}
const result = value => ({ contractStatus: 'VALIDATED_CLAIMS', evidenceVerified: false, value });

export function validateBackupPreflight(input, ctx) {
  const code = 'INVALID_BACKUP_PREFLIGHT', value = detachedJson(input, code);
  base(value, ctx, ['databaseNames', 'minioIds', 'readiness', 'targets'], code);
  if (!exact(value.databaseNames, ['postgres', '_supabase']) || !exact(value.minioIds, ['application', 'supabase'])
    || !keys(value.readiness, READY) || READY.some(key => value.readiness[key] !== true) || !keys(value.targets, GROUPS)) fail(code);
  const repositories = new Set();
  for (const kind of GROUPS) {
    const target = value.targets[kind];
    if (!keys(target, ['repositoryId', 'region', 'offSourceHosts', 'independentOfStaging', 'clientSideEncryption', 'escrowEvidence'])
      || !identifier(target.repositoryId) || target.region !== 'EU' || target.offSourceHosts !== true
      || target.independentOfStaging !== true || target.clientSideEncryption !== true || !reference(target.escrowEvidence)) fail(code);
    repositories.add(target.repositoryId);
  }
  if (repositories.size !== GROUPS.length) fail(code);
  return result(value);
}

export function validateBackupConsistency(input, ctx) {
  const code = 'INVALID_BACKUP_CONSISTENCY', value = detachedJson(input, code);
  base(value, ctx, ['phase', 'windowId', 'mutationsExcluded', 'sourceOperationsStopped', 'entireIntervalVerified', 'coveredWriters', 'originalState', 'heldState'], code);
  if (!['before', 'after'].includes(ctx.phase)) fail('INVALID_BACKUP_OPERATION_CONTEXT');
  if (value.phase !== ctx.phase || typeof value.windowId !== 'string' || !WINDOW_ID.test(value.windowId)
    || value.mutationsExcluded !== true || !exact(value.coveredWriters, WRITERS) || !reference(value.originalState) || !reference(value.heldState)
    || value.sourceOperationsStopped !== (ctx.phase === 'after') || value.entireIntervalVerified !== (ctx.phase === 'after')) fail(code);
  if (ctx.phase === 'after') boundStates(value, ctx, code);
  else if (ctx.windowId !== undefined && ctx.windowId !== value.windowId) fail(code);
  return result(value);
}

function artifact(value) {
  return keys(value, ['path', 'sha256', 'bytes', 'createdAtUtc']) && absolute(value.path) && digest(value.sha256)
    && Number.isSafeInteger(value.bytes) && value.bytes > 0 && value.bytes <= 32 * 1024 ** 3 && Number.isFinite(utc(value.createdAtUtc));
}
export function validateBackupRecovery(input, ctx) {
  const code = 'INVALID_BACKUP_RECOVERY', value = detachedJson(input, code);
  base(value, ctx, ['windowId', 'encrypted', 'configurationIncluded', 'keysIncluded', 'coverage', 'originalState', 'heldState', 'evidence', 'artifact'], code);
  boundStates(value, ctx, code);
  if (!absolute(ctx.outputPath) || !artifact(ctx.artifact)) fail('INVALID_BACKUP_OPERATION_CONTEXT');
  if (value.encrypted !== true || value.configurationIncluded !== true || value.keysIncluded !== true || !exact(value.coverage, COVERAGE)
    || !reference(value.evidence) || !artifact(value.artifact) || value.artifact.path !== ctx.outputPath || ctx.artifact.path !== ctx.outputPath
    || value.artifact.sha256 !== ctx.artifact.sha256 || value.artifact.bytes !== ctx.artifact.bytes
    || utc(value.artifact.createdAtUtc) < utc(value.startedAtUtc) || utc(value.artifact.createdAtUtc) > utc(value.completedAtUtc)
    || utc(ctx.artifact.createdAtUtc) < utc(value.artifact.createdAtUtc) || utc(ctx.artifact.createdAtUtc) > utc(ctx.nowUtc)) fail(code);
  return result(value);
}

export function validateBackupNotificationReceipt(input, ctx) {
  invocation(ctx);
  if (!['synthetic-complete', 'backup-complete', 'backup-failed', 'backup-cleanup-failed'].includes(ctx.event)
    || (ctx.event === 'synthetic-complete' && ctx.mode !== 'synthetic')
    || (ctx.event === 'backup-complete' && ctx.mode !== 'separately-authorized')) fail('INVALID_BACKUP_OPERATION_CONTEXT');
  if (input === undefined) return { status: 'UNCONFIRMED', deliveryVerified: false, evidenceVerified: false };
  const code = 'INVALID_BACKUP_NOTIFICATION_RECEIPT', value = detachedJson(input, code);
  base(value, ctx, ['status', 'event', 'evidence'], code);
  if (value.status !== 'PROVIDER_ACCEPTED' || value.event !== ctx.event || !reference(value.evidence)) fail(code);
  return { status: 'PROVIDER_ACCEPTED', deliveryVerified: false, evidenceVerified: false, value };
}


/** Capture plain bounded callback data before yielding to another operation.
 * This does not establish its schema, freshness or the truth of its claims.
 */
export function snapshotBackupOperationClaim(value) {
  return detachedJson(value, 'INVALID_BACKUP_OPERATION_CLAIM');
}

/** Provider evidence remains unverified metadata. Its keys may vary by provider;
 * raw configuration/credentials do not belong in this receipt. A synthetic
 * marker is accepted only in synthetic mode, never as operational evidence.
 */
export function validateBackupResumeReceipt(input, ctx) {
  const code = 'INVALID_BACKUP_RESUME_RECEIPT', value = detachedJson(input, code);
  base(value, ctx, ['status', 'windowId', 'sealSha256', 'coveredWriters', 'sourceReadsStopped', 'originalStateRestored', 'verificationEvidence'], code);
  if (typeof ctx.windowId !== 'string' || !WINDOW_ID.test(ctx.windowId) || !digest(ctx.sealSha256)) fail('INVALID_BACKUP_OPERATION_CONTEXT');
  if (value.status !== 'RESUMED' || value.windowId !== ctx.windowId || value.sealSha256 !== ctx.sealSha256
    || !exact(value.coveredWriters, WRITERS) || value.sourceReadsStopped !== true || value.originalStateRestored !== true
    || !record(value.verificationEvidence) || Object.keys(value.verificationEvidence).length === 0
    || (ctx.mode !== 'synthetic' && Object.hasOwn(value.verificationEvidence, 'synthetic'))) fail(code);
  return result(value);
}
