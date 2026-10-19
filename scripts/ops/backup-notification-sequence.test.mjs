import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createBackupHealthchecksNotification } from './backup-notification-healthchecks.mjs';
import { runBackupSequence } from './run-backup-sequence.mjs';
import { fixture } from './fixtures/backup-sequence-fixture.mjs';

const checkUuid = '123e4567-e89b-42d3-a456-426614174000';
const create = fetch => createBackupHealthchecksNotification({ checkUuid, mode: 'synthetic', fetch });

test('heartbeat follows independent manifest read and the private completion record', async t => {
  const f = await fixture(t), sent = [];
  f.adapters.notify = create(async (url, options) => {
    assert.equal(f.snapshots.size, 4);
    assert.equal(f.calls.at(-1), 'read-manifest');
    assert.ok(f.calls.indexOf('resume') < f.calls.indexOf('upload-database'));
    const complete = JSON.parse(await readFile(path.join(f.root, f.options.runId, 'sequence-complete.json'), 'utf8'));
    assert.equal(complete.writesState, 'RESUMED');
    assert.equal(complete.signalDelivery, 'NOT_CONFIRMED_BY_LOCAL_RECEIPT');
    sent.push({ url, options });
    return new Response('OK');
  });
  const result = await runBackupSequence(f.options);
  assert.equal(result.status, 'SEQUENCE_COMPLETE_REQUIRES_ACCEPTANCE');
  assert.equal(result.notification.status, 'PROVIDER_ACCEPTED');
  assert.equal(result.notification.deliveryVerified, false);
  assert.equal(result.g09Accepted, false);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, 'https://hc-ping.com/' + checkUuid);
  assert.equal(sent[0].options.body, undefined);
  assert.equal(JSON.stringify(sent).includes(f.options.runId), false);
  // Reusing a completed run is rejected before any further heartbeat.
  assert.equal((await runBackupSequence(f.options)).status, 'INCOMPLETE');
  assert.equal(sent.length, 1);
});

test('failed source acquisition reports failure without resume or success heartbeat', async t => {
  const f = await fixture(t), sent = [];
  f.adapters.databaseCommand = async () => ({ exitCode: 1 });
  f.adapters.notify = create(async url => { sent.push(url); return new Response('OK'); });
  const result = await runBackupSequence(f.options);
  assert.equal(result.status, 'INCOMPLETE');
  assert.equal(result.writesState, 'HELD');
  assert.equal(result.lockRetained, true);
  assert.equal(f.snapshots.size, 0);
  assert.equal(f.calls.includes('resume'), false);
  assert.deepEqual(sent, ['https://hc-ping.com/' + checkUuid + '/fail']);
});

test('failed independent manifest read keeps writes resumed and sends failure only', async t => {
  const f = await fixture(t), sent = [], originalRead = f.adapters.repositories.read;
  f.adapters.repositories.read = async ctx => {
    const result = await originalRead(ctx);
    return path.basename(ctx.files[0].path) === 'manifest.json' ? { ...result, exitCode: 1 } : result;
  };
  f.adapters.notify = create(async url => { sent.push(url); return new Response('OK'); });
  const result = await runBackupSequence(f.options);
  assert.equal(result.status, 'INCOMPLETE');
  assert.equal(result.writesState, 'RESUMED');
  assert.equal(f.calls.filter(c => c === 'resume').length, 1);
  assert.deepEqual(sent, ['https://hc-ping.com/' + checkUuid + '/fail']);
});

test('HTTP 200 for an unknown check cannot complete notification or trigger a success retry', async t => {
  const f = await fixture(t), sent = [];
  f.adapters.notify = create(async url => { sent.push(url); return new Response('OK (not found)'); });
  const result = await runBackupSequence(f.options);
  assert.equal(result.status, 'INCOMPLETE');
  assert.equal(result.stage, 'signal-success');
  assert.equal(result.writesState, 'RESUMED');
  assert.equal(result.g09Accepted, false);
  assert.deepEqual(sent, ['https://hc-ping.com/' + checkUuid, 'https://hc-ping.com/' + checkUuid + '/fail']);
  assert.equal(f.calls.filter(c => c === 'resume').length, 1);
});

test('failure result preserves provider acceptance without claiming human delivery', async t => {
  const f = await fixture(t);
  f.adapters.databaseCommand = async () => ({ exitCode: 1 });
  f.adapters.notify = create(async () => new Response('OK'));
  const result = await runBackupSequence(f.options);
  assert.equal(result.notification?.status, 'PROVIDER_ACCEPTED');
  assert.equal(result.notification.value.event, 'backup-failed');
  assert.equal(result.notification.deliveryVerified, false);
});

test('undelivered failure signal is visible alongside the original backup failure', async t => {
  const f = await fixture(t);
  f.adapters.databaseCommand = async () => ({ exitCode: 1 });
  f.adapters.notify = create(async () => { throw new Error('PRIVATE TRANSPORT DETAIL'); });
  const result = await runBackupSequence(f.options);
  assert.equal(result.status, 'INCOMPLETE');
  assert.equal(result.code, 'DATABASE_COMMAND_FAILED');
  assert.equal(result.notification?.status, 'UNCONFIRMED');
  assert.equal(result.notification.code, 'NOTIFICATION_STEP_FAILED');
  assert.equal(result.notification.event, 'backup-failed');
  assert.equal(result.notification.deliveryVerified, false);
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
});

for (const accepted of [true, false]) test('cleanup signal result remains separate from backup success: accepted=' + accepted, async t => {
  const f = await fixture(t);
  f.adapters.notify = create(async url => {
    if (!url.endsWith('/fail')) {
      await writeFile(path.join(f.root, '.backup.lock', 'unexpected-synthetic'), 'synthetic', { flag: 'wx' });
      return new Response('OK');
    }
    return new Response(accepted ? 'OK' : 'OK (rate limited)');
  });
  const result = await runBackupSequence(f.options);
  assert.equal(result.status, 'SEQUENCE_COMPLETE_REQUIRES_ACCEPTANCE');
  assert.equal(result.lockRetained, true);
  assert.equal(result.cleanupCode, 'LOCK_RELEASE_FAILED');
  assert.equal(result.notification.status, 'PROVIDER_ACCEPTED');
  assert.equal(result.cleanupNotification?.status, accepted ? 'PROVIDER_ACCEPTED' : 'UNCONFIRMED');
  assert.equal(result.cleanupNotification.deliveryVerified, false);
  if (!accepted) assert.equal(result.cleanupNotification.code, 'NOTIFICATION_STEP_FAILED');
});
