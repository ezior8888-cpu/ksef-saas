import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, chmod, writeFile, rm, readdir, symlink, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createBackupResticAdapter, runCli } from './backup-restic.mjs';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const response = (value, exitCode = 0) => ({ exitCode, stdout: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)), stderr: Buffer.alloc(0) });
const runId = 'synthetic-run-20261010';
const directory = '/private/run/database';
const kinds = { database: ['db-1', 'postgresql'], application: ['ops-1', 'app-minio'], supabase: ['db-1', 'supabase-minio'] };
async function fixture(t, hook = () => undefined) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'f0-restic-test-'));
  await chmod(root, 0o700);
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  const repositories = Object.fromEntries(Object.keys(kinds).map((kind) => [kind, { repositoryFile: '/private/' + kind + '.repository', passwordFile: '/private/' + kind + '.password' }]));
  const contents = new Map([[directory + '/a.dump', Buffer.from('synthetic database bytes\0')], [directory + '/b.config', Buffer.from('synthetic encrypted configuration')]]);
  const files = [...contents].map(([file, content]) => ({ path: file, sha256: digest(content), bytes: content.length }));
  const calls = [];
  const makeCommand = (side) => async (spec, context) => {
    const kind = path.posix.basename(spec.args[1]).split('.')[0];
    const verb = spec.args[5]; calls.push({ side, verb, spec, context });
    const overridden = await hook({ side, verb, spec, context, kind, root, contents });
    if (overridden !== undefined) return overridden;
    if (verb === 'cat') return response({ version: 2, id: digest('repository-' + kind) });
    if (verb === 'backup') return response(JSON.stringify({ message_type: 'status', percent_done: 1 }) + '\n' + JSON.stringify({ message_type: 'summary', snapshot_id: digest('snapshot-' + kind) }) + '\n');
    if (verb === 'snapshots') return response([{ id: digest('snapshot-' + kind), hostname: kinds[kind][0], tags: ['f0', 'source:' + kinds[kind][1], 'run:' + runId], paths: [directory], time: '2026-10-10T00:31:00Z' }]);
    if (verb === 'check') return response('');
    if (verb === 'dump') {
      const content = contents.get(spec.args[7]); assert.ok(content);
      await writeFile(spec.stdoutFile, content, { flag: 'wx', mode: 0o600 });
      return response('');
    }
    throw new Error('unexpected synthetic command');
  };
  const options = { repositories, writerCommand: makeCommand('writer'), readerCommand: makeCommand('reader'), readerRoot: root,
    writerClientId: 'source-client', readerClientId: 'separate-reader', writerEnv: { PATH: '/usr/bin' }, readerEnv: { PATH: '/usr/bin' } };
  return { root, options, contents, files, calls, adapter: createBackupResticAdapter(options),
    backup: { kind: 'database', runId, directory, timeoutMs: 3000 },
    read: { kind: 'database', runId, snapshotId: digest('snapshot-database'), files, timeoutMs: 3000 } };
}

test('upload resolves repository identity and exactly scoped full snapshot', async (t) => {
  const f = await fixture(t); const result = await f.adapter.backup(f.backup);
  assert.deepEqual(result, { repositoryId: digest('repository-database'), snapshotId: digest('snapshot-database'), createdAtUtc: '2026-10-10T00:31:00.000Z', resticExitCode: 0 });
  assert.deepEqual(f.calls.map((c) => c.verb), ['cat', 'backup', 'snapshots']);
  assert.ok(f.calls.every((c) => c.spec.executable === 'restic' && c.spec.env.PATH === '/usr/bin' && c.context.signal instanceof AbortSignal));
  assert.deepEqual(f.calls[1].spec.args.slice(-4), ['--group-by', 'host', '--', directory]);
  assert.equal(f.calls[2].spec.args.at(-1), result.snapshotId);
});

test('independent read dumps every file and verifies actual bytes from new private files', async (t) => {
  const f = await fixture(t); const result = await f.adapter.read(f.read);
  assert.deepEqual(result.files, f.files); assert.equal(result.independentClient, true);
  assert.equal(result.repositoryId, digest('repository-database'));
  assert.equal(result.evidence.g09Accepted, false); assert.equal(result.evidence.physicalClientIndependenceVerified, false);
  assert.deepEqual(f.calls.map((c) => [c.side, c.verb]), [['writer', 'cat'], ['reader', 'cat'], ['reader', 'snapshots'], ['reader', 'check'], ['reader', 'dump'], ['reader', 'dump']]);
  assert.deepEqual(f.calls[3].spec.args.slice(-2), ['check', '--read-data']);
  assert.equal(new Set(f.calls.filter((c) => c.verb === 'dump').map((c) => c.spec.stdoutFile)).size, 2);
  assert.ok(f.calls.filter((c) => c.verb === 'dump').every((c) => c.spec.stdoutFile.startsWith(f.root + path.sep)));
  assert.equal((await readdir(f.root)).length, 1);
});

test('later independent reads use a fresh output directory and do not reuse data', async (t) => {
  const f = await fixture(t); await f.adapter.read(f.read); await f.adapter.read(f.read);
  assert.equal((await readdir(f.root)).length, 2);
});

test('empty object files remain verified files', async (t) => {
  const f = await fixture(t); f.contents.set(directory + '/a.dump', Buffer.alloc(0));
  const files = [{ path: directory + '/a.dump', sha256: digest(''), bytes: 0 }];
  assert.deepEqual((await f.adapter.read({ ...f.read, files })).files, files);
});

for (const exitCode of [1, 3]) test('nonzero producer exit ' + exitCode + ' cannot become backup success', async (t) => {
  const f = await fixture(t, ({ verb }) => verb === 'backup' ? response({ message_type: 'summary', snapshot_id: digest('snapshot-database') }, exitCode) : undefined);
  await assert.rejects(f.adapter.backup(f.backup), /RESTIC_COMMAND_FAILED/);
  assert.equal(f.calls.some((c) => c.verb === 'snapshots'), false);
});

for (const kind of ['missing-summary', 'duplicate-summary', 'short-id', 'error-event', 'invalid-json', 'oversize']) test('reject backup output ' + kind, async (t) => {
  const summary = { message_type: 'summary', snapshot_id: digest('snapshot-database') };
  const outputs = {
    'missing-summary': '{}', 'duplicate-summary': JSON.stringify(summary) + '\n' + JSON.stringify(summary),
    'short-id': JSON.stringify({ ...summary, snapshot_id: '12345678' }),
    'error-event': JSON.stringify({ message_type: 'error', error: 'secret-never-export' }) + '\n' + JSON.stringify(summary),
    'invalid-json': 'secret-never-export', 'oversize': 's'.repeat(1024 * 1024 + 1),
  };
  const f = await fixture(t, ({ verb }) => verb === 'backup' ? response(outputs[kind]) : undefined);
  await assert.rejects(f.adapter.backup(f.backup), (error) => error.message === 'RESTIC_INVALID_OUTPUT' && !error.stack.includes('secret-never-export'));
});

for (const field of ['id', 'hostname', 'tags', 'paths', 'time']) test('reject mismatching snapshot ' + field, async (t) => {
  const f = await fixture(t, ({ verb }) => {
    if (verb !== 'snapshots') return undefined;
    const row = { id: digest('snapshot-database'), hostname: 'db-1', tags: ['f0', 'source:postgresql', 'run:' + runId], paths: [directory], time: '2026-10-10T00:31:00Z' };
    row[field] = { id: digest('another'), hostname: 'other-host', tags: ['f0', 'source:postgresql', 'run:other-run'], paths: ['/outside'], time: 'not-a-time' }[field];
    return response([row]);
  });
  await assert.rejects(f.adapter.backup(f.backup), /RESTIC_(SCOPE_MISMATCH|INVALID_OUTPUT)/);
});

test('reader cannot silently use another repository', async (t) => {
  const f = await fixture(t, ({ side, verb }) => side === 'reader' && verb === 'cat' ? response({ version: 2, id: digest('wrong-repository') }) : undefined);
  await assert.rejects(f.adapter.read(f.read), /RESTIC_REPOSITORY_MISMATCH/);
  assert.equal(f.calls.some((c) => c.verb === 'dump'), false);
});

test('source repositories cannot collapse to a single repository', async (t) => {
  const f = await fixture(t, ({ verb }) => verb === 'cat' ? response({ version: 2, id: digest('one-repository') }) : undefined);
  await f.adapter.backup(f.backup);
  await assert.rejects(f.adapter.backup({ ...f.backup, kind: 'application' }), /RESTIC_REPOSITORY_MISMATCH/);
});

test('failed repository read-data check never produces member proof', async (t) => {
  const f = await fixture(t, ({ verb }) => verb === 'check' ? response('', 1) : undefined);
  await assert.rejects(f.adapter.read(f.read), /RESTIC_COMMAND_FAILED/);
  assert.equal(f.calls.some((c) => c.verb === 'dump'), false);
});

for (const mismatch of ['hash', 'short', 'long']) test('dump ' + mismatch + ' mismatch fails despite command exit zero', async (t) => {
  const f = await fixture(t, async ({ verb, spec, contents }) => {
    if (verb !== 'dump') return undefined;
    const original = contents.get(spec.args[7]);
    const data = mismatch === 'hash' ? Buffer.alloc(original.length, 1) : mismatch === 'short' ? original.subarray(0, -1) : Buffer.concat([original, Buffer.from('x')]);
    await writeFile(spec.stdoutFile, data, { flag: 'wx', mode: 0o600 }); return response('');
  });
  await assert.rejects(f.adapter.read(f.read), /RESTIC_FILE_MISMATCH/);
  assert.equal((await readdir(f.root)).length, 1, 'failed material retained; no automatic deletion');
});

test('files outside snapshot scope are rejected before any dump', async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.adapter.read({ ...f.read, files: [{ ...f.files[0], path: '/private/run/database-other/secret' }] }), /RESTIC_SCOPE_MISMATCH/);
  assert.equal(f.calls.some((c) => c.verb === 'dump'), false);
});

test('invalid paths, sizes, duplicates and empty member lists fail before transport', async (t) => {
  const f = await fixture(t);
  for (const files of [[], [f.files[0], f.files[0]], [{ ...f.files[0], bytes: -1 }], [{ ...f.files[0], bytes: 32 * 1024 ** 3 + 1 }], [{ ...f.files[0], path: '/private/../outside' }]]) {
    await assert.rejects(f.adapter.read({ ...f.read, files }), /RESTIC_INVALID_INPUT/);
  }
  assert.equal(f.calls.length, 0);
});

test('client identities and transport objects must be distinct', async (t) => {
  const f = await fixture(t);
  for (const patch of [{ readerClientId: f.options.writerClientId }, { readerClientId: undefined }, { readerClientId: 23 }, { readerCommand: f.options.writerCommand }]) {
    assert.throws(() => createBackupResticAdapter({ ...f.options, ...patch }), /RESTIC_INVALID_INPUT/);
  }
});

test('unexpected transport diagnostics are replaced by safe static error', async (t) => {
  const f = await fixture(t, () => { throw new Error('credential=secret-never-export'); });
  await assert.rejects(f.adapter.backup(f.backup), (error) => error.message === 'RESTIC_COMMAND_FAILED' && !error.stack.includes('secret-never-export') && !Object.hasOwn(error, 'cause'));
});

test('already aborted call does not invoke transport', async (t) => {
  const f = await fixture(t); const controller = new AbortController(); controller.abort();
  await assert.rejects(f.adapter.backup({ ...f.backup, signal: controller.signal }), /RESTIC_ABORTED/);
  assert.equal(f.calls.length, 0);
});

test('one deadline bounds the whole helper and aborts a hung transport', async (t) => {
  let aborted = false;
  const f = await fixture(t, ({ context }) => new Promise((resolve) => context.signal.addEventListener('abort', () => { aborted = true; resolve(response({})); }, { once: true })));
  await assert.rejects(f.adapter.backup({ ...f.backup, timeoutMs: 20 }), (error) => error.code === 'RESTIC_TIMEOUT' && error.discardClientRequired === true);
  assert.equal(aborted, true); assert.equal(f.calls.length, 1);
});

test('timeouts decrease across commands rather than restarting a full budget', async (t) => {
  const f = await fixture(t, async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
  await f.adapter.backup(f.backup);
  const remaining = f.calls.map((c) => c.context.timeoutMs);
  assert.ok(remaining[0] > remaining[1] && remaining[1] > remaining[2]);
});

test('unsafe reader root permissions rejected on Linux', { skip: process.platform === 'win32' }, async (t) => {
  const f = await fixture(t); await chmod(f.root, 0o755);
  await assert.rejects(f.adapter.read(f.read), /RESTIC_UNSAFE_OUTPUT/);
});

test('symlink reader roots are rejected', { skip: process.platform === 'win32' }, async (t) => {
  const f = await fixture(t); const target = path.join(f.root, 'actual'); const linked = path.join(f.root, 'linked');
  await mkdir(target, { mode: 0o700 }); await symlink(target, linked);
  const adapter = createBackupResticAdapter({ ...f.options, readerRoot: linked });
  await assert.rejects(adapter.read(f.read), /RESTIC_UNSAFE_OUTPUT/);
});

test('dump symlink is rejected without treating target contents as proof', { skip: process.platform === 'win32' }, async (t) => {
  const f = await fixture(t, async ({ verb, spec, root, contents }) => {
    if (verb !== 'dump') return undefined;
    const target = path.join(root, 'target'); await writeFile(target, contents.get(spec.args[7]), { flag: 'wx', mode: 0o600 });
    await symlink(target, spec.stdoutFile); return response('');
  });
  await assert.rejects(f.adapter.read(f.read), /RESTIC_(COMMAND_FAILED|FILE_MISMATCH)/);
});

test('CLI cannot execute backups or select configuration', () => {
  let out = ''; let err = ''; const streams = { stdout: { write: (value) => { out += value; } }, stderr: { write: (value) => { err += value; } } };
  assert.equal(runCli(['--help'], streams), 0); assert.match(out, /wyłącznie pomoc/);
  assert.equal(runCli(['--execute', 'secret-never-export'], streams), 2); assert.ok(!err.includes('secret-never-export'));
});

test('uncertain transport cancellation preserves the orchestration lock requirement', async (t) => {
  const f = await fixture(t, () => { throw Object.assign(new Error('private details'), { code: 'COMMAND_TIMEOUT' }); });
  await assert.rejects(f.adapter.backup(f.backup), (error) => error.code === 'RESTIC_COMMAND_FAILED' && error.discardClientRequired === true);
});

test('transport discard requirement survives sanitized errors', async (t) => {
  const f = await fixture(t, () => { throw Object.assign(new Error('private details'), { code: 'COMMAND_FAILED', discardClientRequired: true }); });
  await assert.rejects(f.adapter.backup(f.backup), (error) => error.code === 'RESTIC_COMMAND_FAILED' && error.discardClientRequired === true);
});