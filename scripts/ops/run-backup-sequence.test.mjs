import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { runBackupSequence, main, RECOVERY_COVERAGE } from './run-backup-sequence.mjs';
import { syntheticReferenceRow } from './fixtures/backup-db-client.mjs';
import { fixture } from './fixtures/backup-sequence-fixture.mjs';
import { hashBackupArtifact } from './backup-artifacts.mjs';
import { validateBackupSet } from './check-backup-set.mjs';
const readyKeys = ['sourceInventoryReviewed','dumpPrivilegesAndVersionsVerified','runtimeSchemaReviewed','sourceMapReviewed','spaceVerified','minioProfilesVerified','targetEuOffHostVerified','targetIndependentOfStaging','keyEscrowVerified','independentReaderVerified','consistencyProcedureApproved'];
test('CLI rejects execution and imports no configured services', () => {
  let output = ''; assert.equal(main(['--execute'], text => output += text), 2);
  assert.match(output, /No configured production/);
});
test('full synthetic sequence combines actual local artifacts, real extractors/checkers, 4 snapshots and retention', async t => {
  const f = await fixture(t); const result = await runBackupSequence(f.options);
  assert.equal(result.status, 'SEQUENCE_COMPLETE_REQUIRES_ACCEPTANCE', JSON.stringify(result));
  assert.equal(validateBackupSet(result.manifest).ok, true);
  assert.equal(result.g09Accepted, false); assert.equal(result.evidenceVerified, false);
  assert.equal(result.retention.keepRuns[0].snapshots.length, 4);
  assert.deepEqual(f.events, ['synthetic-complete']);
  assert.equal(f.snapshots.size, 4);
  assert.ok(f.calls.indexOf('consistency-after') < f.calls.indexOf('upload-database'));
  assert.ok(f.calls.indexOf('read-supabase') < f.calls.indexOf('upload-manifest'));
  assert.ok(f.db.queries.some(q => q.database === '_supabase'));
  const receipt = JSON.parse(await readFile(path.join(f.root, f.options.runId, 'delivery-receipt.json'), 'utf8'));
  assert.equal(receipt.manifestOffHost.snapshotId, result.manifest.manifestOffHost.snapshotId);
  const storedManifest = JSON.parse(await readFile(path.join(f.root, f.options.runId, 'manifest', 'manifest.json'), 'utf8'));
  assert.equal(storedManifest.manifestOffHost, undefined);
  assert.deepEqual(await readdir(f.root), [f.options.runId]);
});
for (const missing of readyKeys) test('preflight refuses missing ' + missing + ' before any source operation', async t => {
  const f = await fixture(t); f.preflight.readiness[missing] = false;
  const r = await runBackupSequence(f.options); assert.equal(r.status, 'INCOMPLETE');
  assert.equal(r.code, 'PREFLIGHT_INCOMPLETE'); assert.deepEqual(f.calls, ['preflight']); assert.deepEqual(f.events, ['backup-failed']);
});
for (const failure of ['dump-postgres','inspect-postgres','dump-_supabase','inspect-_supabase','dump-globals']) test('failed ' + failure + ' cannot upload or advance previous complete marker', async t => {
  const f = await fixture(t), original = f.adapters.databaseCommand;
  const previous = path.join(f.root, 'previous-complete.json'); await writeFile(previous, 'old-safe-copy');
  f.adapters.databaseCommand = async (spec, ctx) => { const result = await original(spec, ctx); return spec.id === failure ? { exitCode: 3 } : result; };
  const r = await runBackupSequence(f.options); assert.equal(r.status, 'INCOMPLETE'); assert.equal(r.stage, failure);
  assert.equal(f.snapshots.size, 0); assert.deepEqual(f.events, ['backup-failed']); assert.equal(await readFile(previous, 'utf8'), 'old-safe-copy');
});
test('incomplete IAM/KMS recovery blocks before S3 or upload', async t => {
  const f = await fixture(t), original = f.adapters.captureRecovery;
  f.adapters.captureRecovery = async ctx => ({ ...await original(ctx), coverage: RECOVERY_COVERAGE.slice(1) });
  const r = await runBackupSequence(f.options); assert.equal(r.code, 'RECOVERY_CONFIGURATION_INCOMPLETE'); assert.equal(f.snapshots.size, 0);
});
test('nonempty unresolved Glacier references cannot pass through zero S3 exports', async t => {
  const f = await fixture(t, { references: { 'invoices.archive_storage_path': [syntheticReferenceRow()] } });
  const r = await runBackupSequence(f.options); assert.equal(r.code, 'REFERENCES_INCOMPLETE_OR_INCONSISTENT'); assert.equal(f.snapshots.size, 0);
});
test('a missing app object is detected by the real adapter', async t => {
  const f = await fixture(t, { references: { 'invoices.xml_storage_path': [syntheticReferenceRow()] } });
  const r = await runBackupSequence(f.options); assert.equal(r.code, 'REFERENCES_INCOMPLETE_OR_INCONSISTENT'); assert.equal(f.snapshots.size, 0);
});
test('different consistency interval is rejected after exports and before uploads', async t => {
  const f = await fixture(t), original = f.adapters.observeConsistency;
  f.adapters.observeConsistency = async ctx => ({ ...await original(ctx), windowId: ctx.phase });
  const r = await runBackupSequence(f.options); assert.equal(r.code, 'CONSISTENCY_INTERVAL_NOT_VERIFIED'); assert.equal(f.snapshots.size, 0);
});
for (const kind of ['database','application','supabase']) test('partial restic snapshot of ' + kind + ' never signals success', async t => {
  const f = await fixture(t), original = f.adapters.repositories.backup;
  f.adapters.repositories.backup = async ctx => ({ ...await original(ctx), resticExitCode: ctx.kind === kind ? 3 : 0 });
  const r = await runBackupSequence(f.options); assert.equal(r.code, 'SNAPSHOT_UPLOAD_INCOMPLETE'); assert.deepEqual(f.events, ['backup-failed']);
});
test('independent read must include every payload file, not only manifest summary members', async t => {
  const f = await fixture(t), original = f.adapters.repositories.read;
  f.adapters.repositories.read = async ctx => ({ ...await original(ctx), files: ctx.files.slice(1) });
  const r = await runBackupSequence(f.options); assert.equal(r.code, 'SNAPSHOT_READ_INCOMPLETE'); assert.deepEqual(f.events, ['backup-failed']);
});
test('failure reading the separately uploaded manifest leaves whole run incomplete', async t => {
  const f = await fixture(t), original = f.adapters.repositories.read;
  f.adapters.repositories.read = async ctx => { if (path.basename(ctx.files[0].path) === 'manifest.json') throw new Error('PRIVATE host and credentials'); return original(ctx); };
  const r = await runBackupSequence(f.options); assert.equal(r.status, 'INCOMPLETE'); assert.equal(r.stage, 'read-manifest');
  assert.equal(f.snapshots.size, 4); assert.deepEqual(f.events, ['backup-failed']); assert.ok(!JSON.stringify(r).includes('PRIVATE'));
});
test('notification failure is not silently converted to success', async t => {
  const f = await fixture(t); f.adapters.notify = async () => { throw new Error('PRIVATE notification URL'); };
  const r = await runBackupSequence(f.options); assert.equal(r.status, 'INCOMPLETE'); assert.equal(r.stage, 'signal-success');
  const receipt = JSON.parse(await readFile(path.join(f.root, f.options.runId, 'sequence-complete.json'), 'utf8'));
  assert.equal(receipt.signalDelivery, 'NOT_CONFIRMED_BY_LOCAL_RECEIPT');
});
test('same root excludes parallel run IDs and timeout retains the lock until operator review', async t => {
  const f = await fixture(t); let began;
  const entered = new Promise(resolve => { began = resolve; });
  f.adapters.preflight = () => { began(); return new Promise(() => {}); };
  const first = runBackupSequence({ ...f.options, stepTimeoutMs: 100, maxDurationMs: 2000 });
  await entered;
  const second = await runBackupSequence({ ...f.options, runId: 'synthetic-run-002' });
  assert.equal(second.status, 'INCOMPLETE'); assert.equal(second.stage, 'lock');
  const r = await first; assert.equal(r.lockRetained, true); assert.equal(r.status, 'INCOMPLETE');
  const third = await runBackupSequence({ ...f.options, runId: 'synthetic-run-003' }); assert.equal(third.stage, 'lock');
});
test('remote process uncertainty retains the scope lock despite settled local transport', async t => {
  const f = await fixture(t); f.adapters.databaseCommand = async () => { throw Object.assign(new Error('PRIVATE'), { discardClientRequired: true }); };
  const r = await runBackupSequence(f.options); assert.equal(r.lockRetained, true); assert.equal(r.status, 'INCOMPLETE');
});
test('same run ID cannot reuse partial files', async t => {
  const f = await fixture(t); f.preflight.readiness.spaceVerified = false;
  await runBackupSequence(f.options); f.preflight.readiness.spaceVerified = true;
  const r = await runBackupSequence(f.options); assert.equal(r.status, 'INCOMPLETE'); assert.deepEqual(f.calls, ['preflight']);
});
test('separate operational authorization is required before adapters', async t => {
  const f = await fixture(t); await assert.rejects(runBackupSequence({ ...f.options, mode: 'separately-authorized' }), /SEPARATE_AUTHORIZATION_REQUIRED/);
  assert.deepEqual(f.calls, []);
});
test('bounded file hash detects actual file bytes', async t => {
  const f = await fixture(t), file = path.join(f.root, 'synthetic-file'); await writeFile(file, 'real-local-bytes');
  assert.equal((await hashBackupArtifact(file)).sha256, createHash('sha256').update('real-local-bytes').digest('hex'));
  await assert.rejects(hashBackupArtifact(file, { maxBytes: 2 }), /ARTIFACT_READ_FAILED/);
});

test('foreign error code and details cannot enter notifications or result', async t => {
  const f = await fixture(t), notified = [];
  f.adapters.preflight = async () => { throw Object.assign(new Error('PRIVATE'), { sequenceCode: 'PRIVATE_URL_OR_SECRET' }); };
  f.adapters.notify = async e => notified.push({ event: e.event, code: e.code });
  const r = await runBackupSequence(f.options);
  assert.equal(r.code, 'SEQUENCE_STEP_FAILED'); assert.equal(r.lockRetained, false);
  assert.ok(!JSON.stringify(notified).includes('PRIVATE'));
  assert.deepEqual(await readdir(f.root), [f.options.runId]);
});
test('success notification occurs after durable completion receipt', async t => {
  const f = await fixture(t);
  f.adapters.notify = async ctx => {
    if (ctx.event === 'synthetic-complete') assert.equal(JSON.parse(await readFile(path.join(ctx.runRoot, 'sequence-complete.json'), 'utf8')).runId, ctx.runId);
  };
  assert.equal((await runBackupSequence(f.options)).status, 'SEQUENCE_COMPLETE_REQUIRES_ACCEPTANCE');
});
test('lock cleanup failure preserves completed backup fact and raises a separate safe signal', async t => {
  const f = await fixture(t), events = [];
  f.adapters.notify = async ctx => {
    events.push(ctx.event);
    if (ctx.event === 'synthetic-complete') await writeFile(path.join(f.root, '.backup.lock', 'unexpected'), 'synthetic');
  };
  const r = await runBackupSequence(f.options);
  assert.equal(r.status, 'SEQUENCE_COMPLETE_REQUIRES_ACCEPTANCE'); assert.equal(r.lockRetained, true); assert.equal(r.cleanupCode, 'LOCK_RELEASE_FAILED');
  assert.deepEqual(events, ['synthetic-complete', 'backup-cleanup-failed']);
});

test('a changed dump cannot be certified using its earlier hash', async t => {
  const f = await fixture(t), original = f.adapters.captureRecovery;
  f.adapters.captureRecovery = async ctx => { const r = await original(ctx); await writeFile(path.join(ctx.runRoot, 'postgresql', 'postgres.dump'), 'CHANGED SYNTHETIC DUMP'); return r; };
  const r = await runBackupSequence(f.options); assert.equal(r.status, 'INCOMPLETE'); assert.equal(r.code, 'SOURCE_ARTIFACT_CHANGED'); assert.equal(f.snapshots.size, 0);
});

function oneObjectS3(data) {
  const absent = name => Object.assign(new Error('synthetic absent'), { name, $metadata: { httpStatusCode: 404 } });
  const absentNames = { GetBucketPolicyCommand:'NoSuchBucketPolicy', GetBucketTaggingCommand:'NoSuchTagSet', GetBucketLifecycleConfigurationCommand:'NoSuchLifecycleConfiguration', GetBucketEncryptionCommand:'ServerSideEncryptionConfigurationNotFoundError', GetObjectLockConfigurationCommand:'ObjectLockConfigurationNotFoundError', GetBucketReplicationCommand:'ReplicationConfigurationNotFoundError' };
  return { async send(command) {
    const name = command.constructor.name;
    if (absentNames[name]) throw absent(absentNames[name]);
    const entry = { Key: encodeURIComponent('synthetic/key.xml'), Size: data.length, ETag:'"synthetic-etag"', LastModified:new Date('2026-10-10T00:00:00Z') };
    if (name === 'ListBucketsCommand') return {Buckets:[{Name:'synthetic-primary'}]};
    if (name === 'GetBucketLocationCommand') return {LocationConstraint:'eu-test-1'};
    if (name === 'GetBucketVersioningCommand' || name === 'GetBucketNotificationConfigurationCommand') return {};
    if (name === 'ListMultipartUploadsCommand') return {IsTruncated:false,Uploads:[]};
    if (name === 'ListObjectsV2Command') return {IsTruncated:false,KeyCount:1,EncodingType:'url',Contents:[entry]};
    if (name === 'ListObjectVersionsCommand') return {IsTruncated:false,EncodingType:'url',Versions:[{...entry,IsLatest:true,VersionId:'null'}]};
    if (name === 'GetObjectCommand') { const { Readable } = await import('node:stream'); return {Body:Readable.from([data]),ContentLength:data.length,ETag:entry.ETag,Metadata:{},TagCount:0}; }
    if (name === 'GetObjectTaggingCommand') return {TagSet:[]};
    throw new Error('Unexpected synthetic operation');
  } };
}
test('nonempty referenced payload traverses real export, extraction and read comparison', async t => {
  const f = await fixture(t, {references:{'invoices.xml_storage_path':[syntheticReferenceRow()]}});
  f.adapters.s3.application = oneObjectS3(Buffer.from('SYNTHETIC XML'));
  const r = await runBackupSequence(f.options); assert.equal(r.status,'SEQUENCE_COMPLETE_REQUIRES_ACCEPTANCE',JSON.stringify(r));
  assert.equal(r.manifest.minio[0].source.currentObjectCount,1);
});
test('payload changed after reference check cannot be accepted from a later inventory', async t => {
  const f = await fixture(t, {references:{'invoices.xml_storage_path':[syntheticReferenceRow()]}});
  f.adapters.s3.application = oneObjectS3(Buffer.from('SYNTHETIC XML'));
  const original = f.adapters.observeConsistency;
  f.adapters.observeConsistency = async ctx => {
    if(ctx.phase === 'after') await writeFile(path.join(ctx.runRoot,'app-minio','payloads','0000000000000001.bin'),'TAMPERED SYNTHETIC PAYLOAD');
    return original(ctx);
  };
  const r = await runBackupSequence(f.options); assert.equal(r.status,'INCOMPLETE'); assert.equal(r.code,'SOURCE_ARTIFACT_CHANGED');
  assert.ok(!f.events.includes('synthetic-complete'));
});

for (const source of ['app-minio', 'supabase-minio']) for (const filename of ['objects.ndjson', 'bucket-config.ndjson']) test(source + ' ' + filename + ' changed after checking cannot inherit earlier proof', async t => {
  const f = await fixture(t), original = f.adapters.observeConsistency;
  f.adapters.observeConsistency = async ctx => {
    if (ctx.phase === 'after') await writeFile(path.join(ctx.runRoot, source, filename), 'CHANGED SYNTHETIC INDEX');
    return original(ctx);
  };
  const r = await runBackupSequence(f.options);
  assert.equal(r.status, 'INCOMPLETE'); assert.equal(r.code, 'SOURCE_ARTIFACT_CHANGED');
  assert.equal(f.snapshots.size, 0); assert.deepEqual(f.events, ['backup-failed']);
});
