import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createBackupHealthchecksNotification } from './backup-notification-healthchecks.mjs';
import { validateBackupNotificationReceipt } from './backup-operation-contracts.mjs';
import { writeDurableBackupJson } from './backup-source-seal.mjs';
import { runBackupSequence, SOURCE_REVISION } from './run-backup-sequence.mjs';
import { fixture } from './fixtures/backup-sequence-fixture.mjs';

const uuid = '123e4567-e89b-42d3-a456-426614174000';
async function context(t, extra = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'f0-notification-synthetic-'));
  t.after(async () => {
    assert.equal(path.dirname(root), tmpdir());
    assert.ok(path.basename(root).startsWith('f0-notification-synthetic-'));
    await rm(root, { recursive: true, force: true });
  });
  return { runId: 'synthetic-notification-run', runRoot: root, sourceRevision: SOURCE_REVISION,
    mode: 'synthetic', event: 'synthetic-complete', writesState: 'RESUMED',
    startedAtUtc: new Date().toISOString(), timeoutMs: 3000, signal: new AbortController().signal, ...extra };
}
const config = extra => ({ checkUuid: uuid, mode: 'synthetic', fetch: async () => new Response('OK'), ...extra });
const hasCode = code => error => error.code === code && !error.message.includes(uuid);

test('factory is inert, captures config, and returns a contract-compatible private receipt', async t => {
  let calls = 0, sent;
  const options = config({ fetch: async (...args) => { calls++; sent = args; return new Response('OK'); } });
  const notify = createBackupHealthchecksNotification(options);
  options.checkUuid = '00000000-0000-4000-8000-000000000000';
  assert.equal(calls, 0);
  const ctx = await context(t), result = await notify(ctx);
  assert.equal(calls, 1);
  assert.equal(sent[0], `https://hc-ping.com/${uuid}`);
  assert.equal(sent[1].method, 'GET');
  assert.equal(sent[1].redirect, 'error');
  assert.equal(sent[1].credentials, 'omit');
  assert.equal(sent[1].body, undefined);
  assert.equal(sent[1].headers, undefined);
  assert.equal(new URL(sent[0]).search, '');
  assert.equal(validateBackupNotificationReceipt(result, { ...ctx, nowUtc: new Date().toISOString() }).deliveryVerified, false);
  const receipt = await readFile(path.join(ctx.runRoot, result.evidence.evidenceRef + '.json'), 'utf8');
  assert.equal(receipt.includes(uuid), false);
  assert.equal(receipt.includes('hc-ping.com'), false);
  assert.equal(JSON.parse(receipt).synthetic, true);
});

test('invalid config and synthetic native transport fail before any network', () => {
  for (const checkUuid of ['', uuid + '?create=1', '../' + uuid, 'https://hc-ping.com/' + uuid]) {
    assert.throws(() => createBackupHealthchecksNotification(config({ checkUuid })), hasCode('NOTIFICATION_INVALID_CONFIG'));
  }
  assert.throws(() => createBackupHealthchecksNotification({ checkUuid: uuid, mode: 'synthetic' }), hasCode('NOTIFICATION_SYNTHETIC_TRANSPORT_REQUIRED'));
  assert.throws(() => createBackupHealthchecksNotification({ checkUuid: uuid, mode: 'separately-authorized' }), hasCode('NOTIFICATION_AUTHORIZATION_REQUIRED'));
});

test('mode mismatch, unknown event, bad state and aborted signal never dispatch', async t => {
  let calls = 0;
  const notify = createBackupHealthchecksNotification(config({ fetch: async () => { calls++; return new Response('OK'); } }));
  const aborted = new AbortController(); aborted.abort();
  for (const extra of [{ mode: 'separately-authorized' }, { event: 'backup-complete' }, { event: 'unreviewed' }, { writesState: 'HELD' }, { signal: {} }, { signal: aborted.signal }, { sourceRevision: '0'.repeat(40) }]) {
    await assert.rejects(notify(await context(t, extra)));
  }
  assert.equal(calls, 0);
});

test('failure signals disclose only the UUID and fixed fail path', async t => {
  for (const event of ['backup-failed', 'backup-cleanup-failed']) {
    let sent;
    const notify = createBackupHealthchecksNotification(config({ fetch: async (...args) => { sent = args; return new Response('OK'); } }));
    const ctx = await context(t, { event, writesState: 'FREEZE_UNKNOWN', code: 'secret-error', stage: 'secret-path' });
    const result = await notify(ctx);
    assert.equal(sent[0], `https://hc-ping.com/${uuid}/fail`);
    assert.equal(JSON.stringify(sent).includes('secret'), false);
    assert.equal(result.event, event);
  }
});

for (const [status, body] of [[200, 'OK (not found)'], [200, 'OK (rate limited)'], [200, '{}'], [200, 'OK\n'], [204, null], [302, 'OK'], [400, 'private'], [429, 'private'], [500, 'private']]) {
  test(`rejects HTTP ${status} ${JSON.stringify(body)} without retry or raw response`, async t => {
    let calls = 0;
    const notify = createBackupHealthchecksNotification(config({ fetch: async () => { calls++; return new Response(body, { status }); } }));
    await assert.rejects(notify(await context(t)), error => error.code === 'NOTIFICATION_PROVIDER_UNCONFIRMED' && !error.message.includes('private'));
    assert.equal(calls, 1);
  });
}

test('oversized streaming response is cancelled and rejected', async t => {
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(4096)); }, cancel() { cancelled = true; } });
  const notify = createBackupHealthchecksNotification(config({ fetch: async () => new Response(stream) }));
  await assert.rejects(notify(await context(t)), hasCode('NOTIFICATION_PROVIDER_UNCONFIRMED'));
  assert.equal(cancelled, true);
});

test('raw transport exceptions cannot escape', async t => {
  const notify = createBackupHealthchecksNotification(config({ fetch: async () => { throw new Error('private ' + uuid); } }));
  await assert.rejects(notify(await context(t)), error => error.code === 'NOTIFICATION_PROVIDER_UNCONFIRMED' && !JSON.stringify(error).includes(uuid) && !error.message.includes('private'));
});

test('timeout bounds an unresolved transport and a late success does not persist acceptance', async t => {
  let resolve, calls = 0;
  const notify = createBackupHealthchecksNotification(config({ fetch: () => { calls++; return new Promise(done => { resolve = done; }); } }));
  const ctx = await context(t, { timeoutMs: 1000 });
  await assert.rejects(notify(ctx), hasCode('NOTIFICATION_ABORTED_OR_TIMED_OUT'));
  assert.equal(calls, 1);
  let cancelled = false;
  resolve(new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('OK')); }, cancel() { cancelled = true; } })));
  await new Promise(done => setTimeout(done, 10));
  assert.equal(cancelled, true);
  await assert.rejects(readFile(path.join(ctx.runRoot, 'notification-healthchecks-synthetic-complete.json')), { code: 'ENOENT' });
});

test('abort during response does not report provider acceptance', async t => {
  const controller = new AbortController(); let cancelled = false;
  const notify = createBackupHealthchecksNotification(config({ fetch: async () => {
    const stream = new ReadableStream({ start() { setTimeout(() => controller.abort(), 10); }, cancel() { cancelled = true; } });
    return new Response(stream);
  } }));
  await assert.rejects(notify(await context(t, { signal: controller.signal })), hasCode('NOTIFICATION_ABORTED_OR_TIMED_OUT'));
  assert.equal(cancelled, true);
});

test('failed intent publication blocks send; failed acceptance publication remains unconfirmed', async t => {
  for (const failAfterSend of [false, true]) {
    let calls = 0, writes = 0;
    const notify = createBackupHealthchecksNotification(config({ fetch: async () => { calls++; return new Response('OK'); },
      persist: async (...args) => { writes++; if (!failAfterSend || writes === 2) throw new Error('private-storage-error'); return writeDurableBackupJson(...args); } }));
    await assert.rejects(notify(await context(t)), hasCode('NOTIFICATION_EVIDENCE_WRITE_FAILED'));
    assert.equal(calls, Number(failAfterSend));
  }
});

test('a repeated event cannot refresh the provider heartbeat for the same run', async t => {
  let calls = 0;
  const notify = createBackupHealthchecksNotification(config({ fetch: async () => { calls++; return new Response('OK'); } }));
  const ctx = await context(t);
  await notify(ctx);
  await assert.rejects(notify(ctx), hasCode('NOTIFICATION_EVIDENCE_WRITE_FAILED'));
  assert.equal(calls, 1);
});

test('full synthetic backup uses provider receipt without claiming delivery', async t => {
  const f = await fixture(t); let requests = 0;
  f.adapters.notify = createBackupHealthchecksNotification(config({ fetch: async () => { requests++; return new Response('OK'); } }));
  const result = await runBackupSequence(f.options);
  assert.equal(result.status, 'SEQUENCE_COMPLETE_REQUIRES_ACCEPTANCE');
  assert.equal(result.notification.status, 'PROVIDER_ACCEPTED');
  assert.equal(result.notification.deliveryVerified, false);
  assert.equal(result.g09Accepted, false);
  assert.equal(requests, 1);
});


test('an authorized real provider still rejects synthetic completion without dispatch', async t => {
  let calls = 0;
  const notify = createBackupHealthchecksNotification({ checkUuid: uuid, mode: 'separately-authorized',
    authorization: { sendNotifications: true }, fetch: async () => { calls++; return new Response('OK'); } });
  await assert.rejects(notify(await context(t, { mode: 'separately-authorized' })), hasCode('NOTIFICATION_INVALID_CONTEXT'));
  assert.equal(calls, 0);
});


test('timeout retains the scope lock for a pending intent write before any network dispatch', async t => {
  let settle, writes = 0, sends = 0;
  const notify = createBackupHealthchecksNotification(config({
    persist: () => { writes++; return new Promise(resolve => { settle = resolve; }); },
    fetch: async () => { sends++; return new Response('OK'); },
  }));
  await assert.rejects(notify(await context(t, { timeoutMs: 1000 })), error => {
    assert.equal(error.code, 'NOTIFICATION_ABORTED_OR_TIMED_OUT');
    assert.equal(error.discardClientRequired, true);
    return true;
  });
  assert.equal(writes, 1);
  settle({ sha256: 'a'.repeat(64) });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(sends, 0);
  assert.equal(writes, 1);
});


test('non-string run identifiers are rejected without coercion, persistence or sending', async t => {
  let writes = 0, sends = 0, coerced = false;
  const notify = createBackupHealthchecksNotification(config({
    persist: async () => { writes++; return { sha256: 'a'.repeat(64) }; },
    fetch: async () => { sends++; return new Response('OK'); },
  }));
  const throwing = { toString() { coerced = true; throw new Error('private-coercion-error'); } };
  for (const runId of [123456789, ['synthetic-valid-run'], throwing]) {
    await assert.rejects(notify(await context(t, { runId })), error => {
      assert.equal(error.code, 'NOTIFICATION_INVALID_CONTEXT');
      assert.equal(error.message, 'NOTIFICATION_INVALID_CONTEXT');
      return true;
    });
  }
  assert.equal(coerced, false);
  assert.equal(writes, 0);
  assert.equal(sends, 0);
});
