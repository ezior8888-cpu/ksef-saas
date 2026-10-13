import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createBackupResticAdapter } from './backup-restic.mjs';
import { runBackupSequence } from './run-backup-sequence.mjs';
import { inventoryBackupFiles } from './backup-artifacts.mjs';
import { fixture } from './fixtures/backup-sequence-fixture.mjs';
import { validateBackupSet } from './check-backup-set.mjs';

const sha = (text) => createHash('sha256').update(text).digest('hex');
const reply = (value, exitCode = 0) => ({ exitCode, stdout: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)), stderr: Buffer.alloc(0) });
async function integrated(t, change = () => undefined) {
  const f = await fixture(t); const commands = [], stored = new Map(); let sequence = 0;
  const readerRoot = path.join(f.root, 'independent-reader'); await mkdir(readerRoot, { mode: 0o700 });
  const repositories = Object.fromEntries(['database', 'application', 'supabase'].map((kind) => {
    f.preflight.targets[kind].repositoryId = sha('synthetic-repo-' + kind);
    return [kind, { repositoryFile: '/synthetic/' + kind + '.repository', passwordFile: '/synthetic/' + kind + '.password' }];
  }));
  const transport = (side) => async (spec, context) => {
    const verb = spec.args[5], kind = path.posix.basename(spec.args[1]).split('.')[0];
    commands.push({ side, verb, kind, spec });
    const alternative = await change({ side, verb, kind, spec, context, stored });
    if (alternative !== undefined) return alternative;
    if (verb === 'cat') return reply({ version: 2, id: f.preflight.targets[kind].repositoryId });
    if (verb === 'backup') {
      const directory = spec.args.at(-1), snapshotId = sha('synthetic snapshot ' + (++sequence));
      const files = await inventoryBackupFiles(directory); const payload = new Map();
      for (const file of files) payload.set(file.path, Buffer.from(await readFile(file.path)));
      const tags = spec.args.flatMap((arg, index) => arg === '--tag' ? [spec.args[index + 1]] : []);
      stored.set(snapshotId, { row: { id: snapshotId, hostname: spec.args[spec.args.indexOf('--host') + 1], paths: [directory], tags, time: new Date().toISOString() }, payload });
      return reply({ message_type: 'summary', snapshot_id: snapshotId });
    }
    if (verb === 'snapshots') return reply([stored.get(spec.args.at(-1)).row]);
    if (verb === 'check') return reply('');
    if (verb === 'dump') {
      const snapshot = stored.get(spec.args[6]); assert.ok(snapshot);
      const bytes = snapshot.payload.get(spec.args[7]); assert.ok(bytes);
      await writeFile(spec.stdoutFile, bytes, { flag: 'wx', mode: 0o600 }); return reply('');
    }
    throw new Error('unexpected synthetic operation');
  };
  const adapter = createBackupResticAdapter({ repositories, writerCommand: transport('writer'), readerCommand: transport('reader'),
    readerRoot, writerClientId: 'synthetic-source', readerClientId: 'synthetic-independent-reader' });
  f.adapters.repositories = adapter;
  return { ...f, commands, stored, adapter };
}

test('real local sequence plus restic adapter validates 4 synthetic snapshots and every payload byte', async (t) => {
  const f = await integrated(t); const result = await runBackupSequence(f.options);
  assert.equal(result.status, 'SEQUENCE_COMPLETE_REQUIRES_ACCEPTANCE', JSON.stringify(result));
  assert.equal(validateBackupSet(result.manifest).ok, true); assert.equal(result.g09Accepted, false);
  assert.equal(f.stored.size, 4); assert.deepEqual(f.events, ['synthetic-complete']);
  const storedCount = [...f.stored.values()].reduce((total, snapshot) => total + snapshot.payload.size, 0);
  assert.equal(f.commands.filter((c) => c.verb === 'dump').length, storedCount);
  assert.equal(f.commands.filter((c) => c.verb === 'check').length, 4);
  assert.ok(f.commands.filter((c) => c.verb === 'dump').every((c) => c.side === 'reader'));
  assert.equal(f.stored.get(result.manifest.manifestOffHost.snapshotId).payload.size, 1);
  assert.equal(result.retention.keepRuns[0].snapshots.length, 4);
});

test('corrupt synthetic snapshot byte fails the composed sequence before full success signal', async (t) => {
  const f = await integrated(t, async ({ verb, spec, stored }) => {
    if (verb !== 'dump') return undefined;
    const original = stored.get(spec.args[6]).payload.get(spec.args[7]); const changed = Buffer.from(original);
    changed[0] ^= 1; await writeFile(spec.stdoutFile, changed, { flag: 'wx', mode: 0o600 }); return reply('');
  });
  const result = await runBackupSequence(f.options);
  assert.equal(result.status, 'INCOMPLETE'); assert.equal(result.stage, 'read-database');
  assert.deepEqual(f.events, ['backup-failed']); assert.equal(f.stored.size, 1);
});

test('manifest delivery partial exit keeps the entire composed run incomplete', async (t) => {
  const f = await integrated(t, ({ verb, spec }) => verb === 'backup' && path.basename(spec.args.at(-1)) === 'manifest'
    ? reply({ message_type: 'summary', snapshot_id: sha('partial-manifest') }, 3) : undefined);
  const result = await runBackupSequence(f.options);
  assert.equal(result.status, 'INCOMPLETE'); assert.equal(result.stage, 'upload-manifest');
  assert.deepEqual(f.events, ['backup-failed']); assert.equal(f.stored.size, 3);
});

test('inner adapter deadline propagates lock retention through the composed sequence', async (t) => {
  const f = await integrated(t, ({ verb }) => verb === 'check' ? new Promise(() => {}) : undefined);
  const adapter = f.adapter;
  f.adapters.repositories = { backup: adapter.backup, read: (options) => adapter.read({ ...options, timeoutMs: 100 }) };
  const result = await runBackupSequence(f.options);
  assert.equal(result.status, 'INCOMPLETE'); assert.equal(result.stage, 'read-database');
  assert.equal(result.lockRetained, true); assert.ok((await readdir(f.root)).includes('.backup.lock'));
  assert.deepEqual(f.events, ['backup-failed']);
});
