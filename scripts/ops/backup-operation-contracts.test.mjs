import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateBackupPreflight, validateBackupConsistency, validateBackupRecovery, validateBackupNotificationReceipt, validateBackupResumeReceipt, snapshotBackupOperationClaim,
} from './backup-operation-contracts.mjs';

const revision = 'face09c57f7de756546e58d092dbe6d280f93c91';
const writers = ['web', 'worker', 'crons', 'database-admin', 's3-upload-delete', 's3-lifecycle', 'supabase-storage'];
const coverage = ['runtime-images-extensions', 'app-worker-config-keys', 'supabase-auth-jwt-storage', 'pgsodium-or-confirmed-unused', 'application-minio-iam-kms', 'supabase-minio-iam-kms'];
const ready = ['sourceInventoryReviewed', 'dumpPrivilegesAndVersionsVerified', 'runtimeSchemaReviewed', 'sourceMapReviewed', 'spaceVerified', 'minioProfilesVerified', 'targetEuOffHostVerified', 'targetIndependentOfStaging', 'keyEscrowVerified', 'independentReaderVerified', 'consistencyProcedureApproved'];
const at = second => '2026-10-11T10:00:' + String(second).padStart(2, '0') + '.000Z';
const ref = char => ({ sha256: char.repeat(64), evidenceRef: 'synthetic-' + char });
const originalState = ref('a'), heldState = ref('b');
const context = extra => ({ runId: 'synthetic-run-001', sourceRevision: revision, mode: 'synthetic', startedAtUtc: at(0), nowUtc: at(9), ...extra });
const base = () => ({ schemaVersion: 1, runId: 'synthetic-run-001', sourceRevision: revision, startedAtUtc: at(1), completedAtUtc: at(5) });
const preflight = () => ({ ...base(), databaseNames: ['postgres', '_supabase'], minioIds: ['application', 'supabase'],
  readiness: Object.fromEntries(ready.map(key => [key, true])),
  targets: Object.fromEntries(['database', 'application', 'supabase'].map((kind, index) => [kind, {
    repositoryId: 'synthetic-repo-' + kind, region: 'EU', offSourceHosts: true, independentOfStaging: true,
    clientSideEncryption: true, escrowEvidence: ref(['c', 'd', 'e'][index]),
  }])) });
const consistency = (phase = 'before') => ({ ...base(), phase, windowId: 'synthetic-window', mutationsExcluded: true,
  sourceOperationsStopped: phase === 'after', entireIntervalVerified: phase === 'after', coveredWriters: [...writers],
  originalState: structuredClone(originalState), heldState: structuredClone(heldState) });
const artifact = () => ({ path: '/synthetic/staging/recovery-bundle.enc', sha256: 'f'.repeat(64), bytes: 128, createdAtUtc: at(4) });
const recovery = () => ({ ...base(), windowId: 'synthetic-window', encrypted: true, configurationIncluded: true, keysIncluded: true,
  coverage: [...coverage], originalState: structuredClone(originalState), heldState: structuredClone(heldState), evidence: ref('c'), artifact: artifact() });
const recoveryContext = () => context({ windowId: 'synthetic-window', originalState, heldState, outputPath: artifact().path, artifact: { ...artifact(), createdAtUtc: at(7) } });
const notification = () => ({ ...base(), status: 'PROVIDER_ACCEPTED', event: 'synthetic-complete', evidence: ref('d') });
const notificationContext = () => context({ event: 'synthetic-complete' });
const reject = (validator, value, ctx, code) => assert.throws(() => validator(value, ctx), error =>
  error.code === code && error.message === code && !error.cause && !error.message.includes('PRIVATE_SECRET'));

test('preflight checks current claims in both modes and returns detached data without proof', () => {
  for (const mode of ['synthetic', 'separately-authorized']) {
    const value = preflight(), result = validateBackupPreflight(value, context({ mode }));
    assert.equal(result.contractStatus, 'VALIDATED_CLAIMS'); assert.equal(result.evidenceVerified, false);
    assert.deepEqual(result.value, value);
    value.targets.database.escrowEvidence.evidenceRef = 'changed-after-validation';
    assert.equal(result.value.targets.database.escrowEvidence.evidenceRef, 'synthetic-c');
  }
});

test('all mandatory operations bind schema, run, revision and invocation freshness without legacy fallback', () => {
  for (const [validator, factory, ctx, code] of [
    [validateBackupPreflight, preflight, context(), 'INVALID_BACKUP_PREFLIGHT'],
    [validateBackupConsistency, consistency, context({ phase: 'before' }), 'INVALID_BACKUP_CONSISTENCY'],
    [validateBackupRecovery, recovery, recoveryContext(), 'INVALID_BACKUP_RECOVERY'],
  ]) {
    for (const change of [
      value => { delete value.schemaVersion; }, value => { value.schemaVersion = 2; },
      value => { value.runId = 'different-run'; }, value => { value.sourceRevision = '0'.repeat(40); },
      value => { value.startedAtUtc = at(10); }, value => { value.startedAtUtc = at(6); },
      value => { value.completedAtUtc = at(10); }, value => { value.startedAtUtc = '2026-02-30T10:00:00.000Z'; },
      value => { value.completedAtUtc = '2026-10-11T10:00:05Z'; },
      value => { value.startedAtUtc = '2026-10-11T09:59:59.999Z'; },
    ]) { const value = factory(); change(value); reject(validator, value, ctx, code); }
    reject(validator, true, ctx, code);
    reject(validator, factory(), { ...ctx, mode: 'assumed' }, 'INVALID_BACKUP_OPERATION_CONTEXT');
    reject(validator, factory(), { ...ctx, sourceRevision: '0'.repeat(40) }, 'INVALID_BACKUP_OPERATION_CONTEXT');
  }
});

test('preflight requires exact readiness, two DBs, two MinIOs, three distinct repositories and bounded escrow references', () => {
  for (const change of [
    value => { value.databaseNames.push('postgres'); }, value => { value.minioIds = ['application']; },
    value => { delete value.readiness.keyEscrowVerified; }, value => { value.readiness.spaceVerified = false; },
    value => { value.targets.other = value.targets.database; },
    value => { value.targets.application.repositoryId = value.targets.database.repositoryId; },
    value => { value.targets.database.region = 'US'; }, value => { value.targets.database.independentOfStaging = false; },
    value => { value.targets.database.escrowEvidence = true; },
    value => { value.targets.database.escrowEvidence.evidenceRef = 'https://fixture.invalid/PRIVATE_SECRET'; },
    value => { value.targets.database.escrowEvidence.sha256 = 'invalid'; },
  ]) { const value = preflight(); change(value); reject(validateBackupPreflight, value, context(), 'INVALID_BACKUP_PREFLIGHT'); }
});

test('consistency ties both phases to the same window and original/held state references', () => {
  const before = validateBackupConsistency(consistency(), context({ phase: 'before' }));
  const ctx = context({ phase: 'after', windowId: before.value.windowId, originalState: before.value.originalState, heldState: before.value.heldState });
  assert.equal(validateBackupConsistency(consistency('after'), ctx).evidenceVerified, false);
  for (const change of [
    value => { value.phase = 'before'; }, value => { value.windowId = 'other-window'; },
    value => { value.originalState.sha256 = 'c'.repeat(64); }, value => { value.heldState.evidenceRef = 'other-evidence'; },
    value => { value.sourceOperationsStopped = false; }, value => { value.entireIntervalVerified = false; },
    value => { value.coveredWriters = writers.slice(1); }, value => { value.coveredWriters[0] = writers[1]; },
    value => { value.originalState = { synthetic: true }; }, value => { value.mutationsExcluded = false; },
  ]) { const value = consistency('after'); change(value); reject(validateBackupConsistency, value, ctx, 'INVALID_BACKUP_CONSISTENCY'); }
  reject(validateBackupConsistency, consistency('after'), context({ phase: 'after', windowId: 'synthetic-window' }), 'INVALID_BACKUP_OPERATION_CONTEXT');
});

test('recovery binds all six coverage categories, original/held references, escrow and the actual output artifact', () => {
  assert.equal(validateBackupRecovery(recovery(), recoveryContext()).contractStatus, 'VALIDATED_CLAIMS');
  for (const change of [
    value => { value.coverage.pop(); }, value => { value.coverage[0] = coverage[1]; },
    value => { value.encrypted = false; }, value => { value.keysIncluded = false; },
    value => { value.windowId = 'other-window'; }, value => { value.originalState.evidenceRef = 'other-evidence'; },
    value => { value.heldState.sha256 = 'c'.repeat(64); }, value => { value.evidence = true; },
    value => { value.artifact.path = '/synthetic/staging/other.enc'; }, value => { value.artifact.sha256 = 'a'.repeat(64); },
    value => { value.artifact.bytes = 127; }, value => { value.artifact.createdAtUtc = at(6); },
  ]) { const value = recovery(); change(value); reject(validateBackupRecovery, value, recoveryContext(), 'INVALID_BACKUP_RECOVERY'); }
  const ctx = recoveryContext(); ctx.artifact.path = '/synthetic/staging/other.enc';
  reject(validateBackupRecovery, recovery(), ctx, 'INVALID_BACKUP_RECOVERY');
});

test('callback return alone cannot prove notification delivery', () => {
  const absent = validateBackupNotificationReceipt(undefined, notificationContext());
  assert.deepEqual(absent, { status: 'UNCONFIRMED', deliveryVerified: false, evidenceVerified: false });
  const accepted = validateBackupNotificationReceipt(notification(), notificationContext());
  assert.equal(accepted.status, 'PROVIDER_ACCEPTED'); assert.equal(accepted.deliveryVerified, false); assert.equal(accepted.evidenceVerified, false);
  for (const value of [true, {}, { ...notification(), status: 'DELIVERED' }, { ...notification(), event: 'backup-failed' },
    { ...notification(), completedAtUtc: at(10) }, { ...notification(), deliveryVerified: true }]) {
    reject(validateBackupNotificationReceipt, value, notificationContext(), 'INVALID_BACKUP_NOTIFICATION_RECEIPT');
  }
});

test('data boundaries reject secrets fields, URLs, accessors, custom prototypes, proxies, cycles and oversized JSON without invoking code', () => {
  let touched = 0;
  const getter = preflight(); Object.defineProperty(getter, 'PRIVATE_SECRET', { enumerable: true, get() { touched++; return 'PRIVATE_SECRET'; } });
  const custom = Object.assign(Object.create({ unsafe: true }), preflight());
  const proxy = new Proxy(preflight(), { ownKeys() { touched++; throw Error('PRIVATE_SECRET'); } });
  const cycle = preflight(); cycle.self = cycle;
  const functionField = preflight(); functionField.toJSON = () => { touched++; return {}; };
  const sparse = preflight(); sparse.databaseNames = new Array(2);
  const symbol = preflight(); symbol[Symbol('PRIVATE_SECRET')] = true;
  const nested = preflight(); nested.extra = {}; let current = nested.extra;
  for (let i = 0; i < 20; i++) { current.next = {}; current = current.next; }
  const huge = preflight(); huge.extra = Array.from({ length: 1000 }, () => 'x'.repeat(1024));
  for (const value of [getter, custom, proxy, cycle, functionField, sparse, symbol, nested, huge,
    { ...preflight(), credentials: { password: 'PRIVATE_SECRET' } },
    { ...preflight(), targets: { ...preflight().targets, database: { ...preflight().targets.database, env: { SECRET: 'PRIVATE_SECRET' } } } }]) {
    reject(validateBackupPreflight, value, context(), 'INVALID_BACKUP_PREFLIGHT');
  }
  assert.equal(touched, 0);
});


test('the shared synthetic fixture explicitly implements the current contracts', async t => {
  const { fixture } = await import('./fixtures/backup-sequence-fixture.mjs');
  const { hashBackupArtifact } = await import('./backup-artifacts.mjs');
  const { default: path } = await import('node:path');
  const f = await fixture(t);
  const ctx = { runId: f.options.runId, sourceRevision: revision, mode: 'synthetic', runRoot: f.root };
  const preflightStart = new Date().toISOString();
  const p = await f.adapters.preflight(ctx);
  validateBackupPreflight(p, { ...ctx, startedAtUtc: preflightStart, nowUtc: new Date().toISOString() });
  const beforeStart = new Date().toISOString();
  const b = await f.adapters.observeConsistency({ ...ctx, phase: 'before' });
  validateBackupConsistency(b, { ...ctx, phase: 'before', startedAtUtc: beforeStart, nowUtc: new Date().toISOString() });
  const bound = { ...ctx, windowId: b.windowId, originalState: b.originalState, heldState: b.heldState };
  const outputPath = path.join(f.root, 'recovery-bundle.enc'), recoveryStart = new Date().toISOString();
  const r = await f.adapters.captureRecovery({ ...bound, outputPath });
  const actual = await hashBackupArtifact(outputPath);
  validateBackupRecovery(r, { ...bound, outputPath, artifact: actual, startedAtUtc: recoveryStart, nowUtc: new Date().toISOString() });
  const afterStart = new Date().toISOString();
  const a = await f.adapters.observeConsistency({ ...bound, phase: 'after' });
  validateBackupConsistency(a, { ...bound, phase: 'after', startedAtUtc: afterStart, nowUtc: new Date().toISOString() });
});


test('resume receipt is plain bounded current metadata bound to run, window, source and seal', () => {
  const value = { ...base(), status: 'RESUMED', windowId: 'synthetic-window', sealSha256: 'a'.repeat(64),
    coveredWriters: [...writers], sourceReadsStopped: true, originalStateRestored: true, verificationEvidence: { synthetic: true } };
  const ctx = context({ windowId: value.windowId, sealSha256: value.sealSha256 });
  const checked = validateBackupResumeReceipt(value, ctx);
  assert.deepEqual(checked.value, value); assert.equal(checked.evidenceVerified, false);
  value.verificationEvidence.synthetic = false; assert.equal(checked.value.verificationEvidence.synthetic, true);
  const real = { ...value, verificationEvidence: { profile: 'docker-services-v1', planSha256: 'b'.repeat(64), actionCount: 4,
    observerEvidence: 'synthetic-observer', evidenceVerified: false, journalDirectory: 'resume-steps', trustedExclusiveControlRequired: true } };
  assert.equal(validateBackupResumeReceipt(real, { ...ctx, mode: 'separately-authorized' }).evidenceVerified, false);
  reject(validateBackupResumeReceipt, { ...real, verificationEvidence: { synthetic: true } }, { ...ctx, mode: 'separately-authorized' }, 'INVALID_BACKUP_RESUME_RECEIPT');
  for (const change of [
    v => { v.status = 'RESUME_UNKNOWN'; }, v => { v.windowId = 'other-window'; }, v => { v.sealSha256 = 'c'.repeat(64); },
    v => { v.coveredWriters.pop(); }, v => { v.coveredWriters[0] = writers[1]; }, v => { v.sourceReadsStopped = false; },
    v => { v.originalStateRestored = false; }, v => { v.verificationEvidence = {}; }, v => { v.verificationEvidence = []; },
    v => { v.startedAtUtc = at(10); }, v => { v.completedAtUtc = at(0); }, v => { v.completedAtUtc = at(10); },
    v => { v.runId = 'other-run'; }, v => { v.sourceRevision = '0'.repeat(40); }, v => { v.extra = true; },
  ]) { const changed = structuredClone(real); change(changed); reject(validateBackupResumeReceipt, changed, ctx, 'INVALID_BACKUP_RESUME_RECEIPT'); }
  for (const invalidContext of [{ ...ctx, sealSha256: 'invalid' }, { ...ctx, windowId: '' }]) {
    reject(validateBackupResumeReceipt, real, invalidContext, 'INVALID_BACKUP_OPERATION_CONTEXT');
  }
});

test('resume receipt refuses getters, proxies and oversized provider evidence before executing code', () => {
  let touched = 0;
  const ctx = context({ windowId: 'synthetic-window', sealSha256: 'a'.repeat(64) });
  const value = { ...base(), status: 'RESUMED', windowId: ctx.windowId, sealSha256: ctx.sealSha256,
    coveredWriters: [...writers], sourceReadsStopped: true, originalStateRestored: true, verificationEvidence: { synthetic: true } };
  const getter = structuredClone(value);
  Object.defineProperty(getter, 'status', { enumerable: true, get() { touched++; return 'RESUMED'; } });
  const evidenceGetter = structuredClone(value);
  Object.defineProperty(evidenceGetter.verificationEvidence, 'proof', { enumerable: true, get() { touched++; return true; } });
  const proxy = new Proxy(value, { ownKeys() { touched++; throw Error('PRIVATE_SECRET'); } });
  for (const invalid of [getter, evidenceGetter, proxy, { ...value, verificationEvidence: { oversized: 'x'.repeat(65_537) } }]) {
    reject(validateBackupResumeReceipt, invalid, ctx, 'INVALID_BACKUP_RESUME_RECEIPT');
  }
  assert.equal(touched, 0);
});

test('operation snapshot detaches raw claims before another await and refuses executable input', () => {
  const value = recovery(), detached = snapshotBackupOperationClaim(value);
  value.artifact.sha256 = 'a'.repeat(64); value.originalState.evidenceRef = 'changed';
  assert.equal(detached.artifact.sha256, 'f'.repeat(64)); assert.equal(detached.originalState.evidenceRef, 'synthetic-a');
  let touched = 0;
  const getter = { get proof() { touched++; return true; } };
  for (const invalid of [getter, new Proxy({}, { ownKeys() { touched++; return []; } }), { body: 'x'.repeat(65_537) }]) {
    assert.throws(() => snapshotBackupOperationClaim(invalid), { code: 'INVALID_BACKUP_OPERATION_CLAIM' });
  }
  assert.equal(touched, 0);
});
