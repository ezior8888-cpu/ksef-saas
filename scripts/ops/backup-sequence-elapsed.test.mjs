import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, lstat, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { runBackupSequence } from './run-backup-sequence.mjs';

test('elapsed deadline detected after synchronous work retains scope lock before delayed timer fires', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'f0-elapsed-sequence-test-'));
  await chmod(root, 0o700);
  t.after(async () => {
    if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('f0-elapsed-sequence-test-')) throw new Error('UNSAFE_TEST_CLEANUP');
    await rm(root, { recursive: true, force: true });
  });
  const events = [];
  const unreachable = async () => { assert.fail('No source or repository operation may start'); };
  const options = {
    root, runId: 'synthetic-elapsed-001', mode: 'synthetic', pgContainer: 'synthetic-postgres',
    maxDurationMs: 10_000, stepTimeoutMs: 30,
    adapters: {
      preflight() {
        // This intentionally blocks timers. Only step's post-result elapsed
        // check can reject before the ready promise wins Promise.race.
        const until = performance.now() + 120;
        while (performance.now() < until) { /* synthetic blocking callback */ }
        return {};
      },
      observeConsistency: unreachable, captureRecovery: unreachable, databaseCommand: unreachable,
      database: {}, s3: { application: {}, supabase: {} },
      repositories: { backup: unreachable, read: unreachable },
      async notify(context) { events.push(context.event); },
    },
  };
  const result = await runBackupSequence(options);
  assert.equal(result.status, 'INCOMPLETE');
  assert.equal(result.stage, 'preflight');
  assert.equal(result.code, 'RUN_ABORTED_OR_TIMED_OUT');
  assert.equal(result.lockRetained, true);
  assert.equal((await lstat(path.join(root, '.backup.lock'))).isDirectory(), true);
  assert.deepEqual(events, ['backup-failed']);
  const next = await runBackupSequence({ ...options, runId: 'synthetic-elapsed-002' });
  assert.equal(next.status, 'INCOMPLETE');
  assert.equal(next.stage, 'lock');
  assert.deepEqual(events, ['backup-failed']);
});
