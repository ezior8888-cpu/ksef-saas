import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, link, lstat, mkdir, mkdtemp, open, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { sealBackupSources, verifySealedBackupSources, writeDurableBackupJson } from './backup-source-seal.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const safeError = error => /^SOURCE_SEAL_[A-Z_]+$/.test(error.code ?? '') && error.message === error.code;
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'f0-source-seal-test-'));
  await chmod(root, 0o700);
  t.after(async () => {
    if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('f0-source-seal-test-')) throw Error('UNSAFE_CLEANUP');
    await rm(root, { recursive: true, force: true });
  });
  const runRoot = path.join(root, 'synthetic-run-001'); await mkdir(runRoot, { mode: 0o700 });
  const directories = Object.fromEntries(['database', 'application', 'supabase'].map(kind => [kind, path.join(runRoot, kind)]));
  const filesByKind = {};
  for (const [kind, directory] of Object.entries(directories)) {
    await mkdir(directory, { mode: 0o700 });
    if (kind !== 'database') await mkdir(path.join(directory, 'payloads'), { mode: 0o700 });
    const filename = path.join(directory, kind === 'database' ? 'postgres.dump' : 'payloads/0000000000000001.bin');
    const content = kind === 'supabase' ? Buffer.alloc(0) : Buffer.from('SYNTHETIC_' + kind + '\0PAYLOAD');
    await writeFile(filename, content, { flag: 'wx', mode: 0o600 });
    filesByKind[kind] = [{ path: filename, sha256: sha(content), bytes: content.length }];
  }
  return { root, runRoot, directories, filesByKind, outputPath: path.join(directories.database, 'source-seal.json'),
    runId: 'synthetic-run-001', windowId: 'window-1', sourceRevision: 'a'.repeat(40), mode: 'synthetic' };
}
async function fileHandlePrototype(file) {
  const handle = await open(file, 'r');
  try { return Object.getPrototypeOf(handle); } finally { await handle.close(); }
}

test('seal persists exact original inventories and hashes, excluding its own artifact', async t => {
  const f = await fixture(t), original = structuredClone(f.filesByKind);
  const result = await sealBackupSources(f);
  assert.equal(result.fileCount, 3);
  assert.equal(result.totalBytes, Object.values(original).flat().reduce((sum, file) => sum + file.bytes, 0));
  assert.equal(result.durability, process.platform === 'linux' ? 'POSIX_FSYNC' : 'SYNTHETIC_ONLY');
  const data = await readFile(f.outputPath), receipt = JSON.parse(data);
  assert.equal(result.artifact.path, f.outputPath); assert.equal(result.artifact.sha256, sha(data)); assert.equal(result.artifact.bytes, data.length);
  assert.equal(receipt.runId, f.runId); assert.equal(receipt.windowId, f.windowId); assert.equal(receipt.sourceRevision, f.sourceRevision);
  assert.equal(receipt.durability, result.durability); assert.equal(receipt.completedAtUtc, result.completedAtUtc);
  assert.deepEqual(receipt.filesByKind, original); assert.deepEqual(f.filesByKind, original);
  assert.ok(!Object.values(receipt.filesByKind).flat().some(file => file.path === f.outputPath));
  await assert.rejects(verifySealedBackupSources(f), safeError);
  f.filesByKind.database.push({ path: result.artifact.path, sha256: result.artifact.sha256, bytes: result.artifact.bytes });
  await verifySealedBackupSources(f);
  await verifySealedBackupSources({ directories: { database: f.directories.database }, filesByKind: { database: f.filesByKind.database } });
});

for (const mutation of ['same-length-change', 'extra-file', 'missing-file']) {
  test('verify rejects ' + mutation + ' against the frozen original file list', async t => {
    const f = await fixture(t), file = f.filesByKind.application[0];
    await verifySealedBackupSources(f);
    if (mutation === 'same-length-change') await writeFile(file.path, Buffer.alloc(file.bytes, 0x41));
    else if (mutation === 'extra-file') await writeFile(path.join(f.directories.application, 'late-private-file'), 'PRIVATE', { mode: 0o600 });
    else await unlink(file.path);
    await assert.rejects(verifySealedBackupSources(f), safeError);
    await assert.rejects(sealBackupSources(f), safeError);
    await assert.rejects(lstat(f.outputPath), { code: 'ENOENT' });
  });
}

test('seal requires all groups but verification accepts an exact single group', async t => {
  const f = await fixture(t);
  await verifySealedBackupSources({ directories: { supabase: f.directories.supabase }, filesByKind: { supabase: f.filesByKind.supabase } });
  await assert.rejects(sealBackupSources({ ...f, directories: { database: f.directories.database }, filesByKind: { database: f.filesByKind.database } }), safeError);
  await assert.rejects(verifySealedBackupSources({ directories: {}, filesByKind: {} }), safeError);
  await assert.rejects(verifySealedBackupSources({ directories: f.directories, filesByKind: { ...f.filesByKind, extra: [] } }), safeError);
});

test('expected paths cannot escape their source and duplicate descriptors are rejected', async t => {
  const f = await fixture(t), copied = structuredClone(f.filesByKind);
  copied.application[0] = { ...copied.database[0] };
  await assert.rejects(verifySealedBackupSources({ directories: f.directories, filesByKind: copied }), safeError);
  copied.application = [...f.filesByKind.application, ...f.filesByKind.application];
  await assert.rejects(verifySealedBackupSources({ directories: f.directories, filesByKind: copied }), safeError);
});

test('hard-linked payloads are refused even when hashes and exact file names match', async t => {
  const f = await fixture(t);
  await link(f.filesByKind.database[0].path, path.join(f.runRoot, 'outside-source-alias'));
  await assert.rejects(sealBackupSources(f), safeError);
});

test('directory links cannot add or redirect source content', async t => {
  const f = await fixture(t), destination = path.join(f.directories.application, 'redirect');
  await symlink(f.directories.database, destination, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(verifySealedBackupSources(f), safeError);
});

test('file symlinks cannot stand in for expected payloads', { skip: process.platform === 'win32' }, async t => {
  const f = await fixture(t), file = f.filesByKind.database[0], original = path.join(f.runRoot, 'original');
  await writeFile(original, await readFile(file.path), { mode: 0o600 }); await unlink(file.path); await symlink(original, file.path);
  await assert.rejects(sealBackupSources(f), safeError);
});

test('POSIX public file or source directory permissions refuse seal', { skip: process.platform === 'win32' }, async t => {
  const f = await fixture(t), file = f.filesByKind.database[0].path;
  await chmod(file, 0o644); await assert.rejects(sealBackupSources(f), safeError);
  await chmod(file, 0o600); await chmod(f.directories.application, 0o755);
  await assert.rejects(sealBackupSources(f), safeError);
});

test('already-aborted work cannot publish a seal or durable receipt', async t => {
  const f = await fixture(t), signal = AbortSignal.abort();
  await assert.rejects(sealBackupSources({ ...f, signal }), error => error.code === 'SOURCE_SEAL_ABORTED');
  await assert.rejects(writeDurableBackupJson(f.outputPath, {}, { mode: 'synthetic', signal }), error => error.code === 'SOURCE_SEAL_ABORTED');
  await assert.rejects(lstat(f.outputPath), { code: 'ENOENT' });
});

test('separately authorized sealing is supported only on Linux and synthetic labels stay honest', async t => {
  const f = await fixture(t);
  if (process.platform === 'linux') assert.equal((await sealBackupSources({ ...f, mode: 'separately-authorized' })).durability, 'POSIX_FSYNC');
  else {
    await assert.rejects(sealBackupSources({ ...f, mode: 'separately-authorized' }), error => error.code === 'SOURCE_SEAL_UNSUPPORTED_PLATFORM');
    await assert.rejects(writeDurableBackupJson(f.outputPath, {}, { mode: 'separately-authorized' }), error => error.code === 'SOURCE_SEAL_UNSUPPORTED_PLATFORM');
    assert.equal((await sealBackupSources(f)).durability, 'SYNTHETIC_ONLY');
  }
});

test('file fsync failure prevents a seal result and keeps private diagnostics hidden', async t => {
  const f = await fixture(t), prototype = await fileHandlePrototype(f.filesByKind.database[0].path);
  t.mock.method(prototype, 'sync', async function () { throw Error('PRIVATE_FILENAME_AND_DEVICE_DETAIL'); });
  await assert.rejects(sealBackupSources(f), error => safeError(error) && error.code === 'SOURCE_SEAL_FSYNC_FAILED');
  await assert.rejects(lstat(f.outputPath), { code: 'ENOENT' });
});

test('durable JSON is fresh and its returned hash covers exactly the stored bytes', async t => {
  const f = await fixture(t), filename = path.join(f.runRoot, 'resume-intent.json');
  const artifact = await writeDurableBackupJson(filename, { state: 'RESUME_INTENT', runId: f.runId }, { mode: 'synthetic' });
  const data = await readFile(filename);
  assert.equal(artifact.path, filename); assert.equal(artifact.sha256, sha(data)); assert.equal(artifact.bytes, data.length);
  await assert.rejects(writeDurableBackupJson(filename, { changed: true }, { mode: 'synthetic' }), safeError);
  assert.deepEqual(await readFile(filename), data);
});

test('directory fsync failures cannot return a successful durable JSON artifact', { skip: process.platform !== 'linux' }, async t => {
  const f = await fixture(t), prototype = await fileHandlePrototype(f.filesByKind.database[0].path), original = prototype.sync;
  t.mock.method(prototype, 'sync', async function () {
    if ((await this.stat()).isDirectory()) throw Error('PRIVATE_DIRECTORY_FSYNC_DETAIL');
    return original.call(this);
  });
  await assert.rejects(writeDurableBackupJson(path.join(f.runRoot, 'resume-intent.json'), {}, { mode: 'synthetic' }), error => error.code === 'SOURCE_SEAL_FSYNC_FAILED');
});

test('a file changed after hashing but before sync cannot be sealed', async t => {
  const f = await fixture(t), target = f.filesByKind.database[0], prototype = await fileHandlePrototype(target.path), original = prototype.sync;
  let mutated = false;
  t.mock.method(prototype, 'sync', async function () {
    if (!mutated && (await this.stat()).isFile()) { mutated = true; await writeFile(target.path, Buffer.alloc(target.bytes, 0x41)); }
    return original.call(this);
  });
  await assert.rejects(sealBackupSources(f), safeError);
  await assert.rejects(lstat(f.outputPath), { code: 'ENOENT' });
});

test('Linux seal fsyncs payloads then directories bottom-up including run root and scope root', { skip: process.platform !== 'linux' }, async t => {
  const f = await fixture(t), prototype = await fileHandlePrototype(f.filesByKind.database[0].path), original = prototype.sync, events = [];
  const identity = stat => stat.dev + ':' + stat.ino;
  const names = new Map();
  for (const filename of [f.root, f.runRoot, ...Object.values(f.directories), path.join(f.directories.application, 'payloads'), path.join(f.directories.supabase, 'payloads')]) names.set(identity(await lstat(filename)), filename);
  t.mock.method(prototype, 'sync', async function () {
    const stat = await this.stat(); events.push({ directory: stat.isDirectory(), path: names.get(identity(stat)) }); return original.call(this);
  });
  await sealBackupSources(f);
  const firstDirectory = events.findIndex(event => event.directory);
  assert.equal(firstDirectory, 3);
  const position = filename => events.findIndex(event => event.path === filename);
  assert.ok(position(path.join(f.directories.application, 'payloads')) < position(f.directories.application));
  assert.ok(position(f.directories.application) < position(f.runRoot));
  assert.ok(position(f.runRoot) < position(f.root));
});

test('durable JSON rejects same-size substitution after the initial write sync', async t => {
  const f = await fixture(t), filename = path.join(f.runRoot, 'resume-intent.json'), value = { state: 'RESUME_INTENT' };
  const prototype = await fileHandlePrototype(f.filesByKind.database[0].path), original = prototype.sync;
  let changed = false;
  t.mock.method(prototype, 'sync', async function () {
    const result = await original.call(this);
    if (!changed && (await this.stat()).isFile()) {
      changed = true;
      await writeFile(filename, Buffer.alloc(Buffer.byteLength(JSON.stringify(value) + '\n'), 0x41));
    }
    return result;
  });
  await assert.rejects(writeDurableBackupJson(filename, value, { mode: 'synthetic' }), safeError);
});

test('durable JSON artifact time is sampled after all file and directory fsync finishes', async t => {
  const f = await fixture(t), prototype = await fileHandlePrototype(f.filesByKind.database[0].path), original = prototype.sync;
  let lastSyncFinishedAt = 0;
  t.mock.method(prototype, 'sync', async function () {
    await original.call(this);
    // Cross a real clock tick so the original writer timestamp cannot pass.
    await new Promise(resolve => setTimeout(resolve, 10));
    lastSyncFinishedAt = Date.now();
  });
  const artifact = await writeDurableBackupJson(path.join(f.runRoot, 'resume-intent.json'), { runId: f.runId }, { mode: 'synthetic' });
  assert.ok(lastSyncFinishedAt > 0);
  assert.ok(Date.parse(artifact.createdAtUtc) >= lastSyncFinishedAt, 'artifact time must follow durable publication');
});
