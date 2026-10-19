/** Local source sealing for the prepared F0 runner. No network/import effects.
 * A seal records verified bytes and successful Linux fsync, not immutability,
 * storage-hardware guarantees or permission to resume writers. Trusted parents
 * and same-UID processes must stay controlled: portable Node has no openat.
 * Failure leaves partial new receipts for inspection; never reuse their paths.
 */
import { constants } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { writeBackupJson } from './backup-artifacts.mjs';

const KINDS = ['database', 'application', 'supabase'];
const MAX_FILE_BYTES = 32 * 1024 ** 3;
const MAX_FILES = 20050;
const HASH = /^[a-f0-9]{64}$/;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
class SourceSealError extends Error { constructor(code) { super(code); this.code = code; } }
const fail = code => { throw new SourceSealError(code); };
async function safe(work) {
  try { return await work(); }
  catch (error) { if (error instanceof SourceSealError) throw error; fail('SOURCE_SEAL_IO_FAILED'); }
}
function checkpoint(signal) {
  if (signal !== undefined && !(signal instanceof AbortSignal)) fail('SOURCE_SEAL_INVALID_INPUT');
  if (signal?.aborted) fail('SOURCE_SEAL_ABORTED');
}
function localPath(value) {
  if (typeof value !== 'string' || value.length > 4096 || !path.isAbsolute(value) || path.resolve(value) !== value
    || /[\0\r\n]/.test(value) || /^[\\/]{2}/.test(value) || value === path.parse(value).root
    || (process.platform === 'win32' && value.slice(2).includes(':'))) fail('SOURCE_SEAL_INVALID_INPUT');
  return value;
}
function selectedDurability(mode) {
  if (!['synthetic', 'separately-authorized'].includes(mode)) fail('SOURCE_SEAL_INVALID_INPUT');
  if (process.platform !== 'linux' && mode !== 'synthetic') fail('SOURCE_SEAL_UNSUPPORTED_PLATFORM');
  return process.platform === 'linux' ? 'POSIX_FSYNC' : 'SYNTHETIC_ONLY';
}
function privateStat(stat, directory) {
  if (stat.isSymbolicLink() || !(directory ? stat.isDirectory() : stat.isFile())
    || (!directory && (stat.nlink !== 1n || stat.size > BigInt(MAX_FILE_BYTES)))
    || (process.platform !== 'win32' && ((stat.mode & 0o077n) !== 0n || stat.uid !== BigInt(process.getuid())))) fail('SOURCE_SEAL_UNSAFE_PATH');
}
const sameIdentity = (a, b) => a.dev === b.dev && a.ino === b.ino;
const sameFile = (a, b) => sameIdentity(a, b) && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
const sameNames = (a, b) => a.length === b.length && a.every((name, index) => name === b[index]);
const statOf = filename => lstat(filename, { bigint: true });
async function ancestry(directory, signal) {
  let cursor = directory;
  while (true) {
    checkpoint(signal); const stat = await statOf(cursor);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail('SOURCE_SEAL_UNSAFE_PATH');
    const parent = path.dirname(cursor); if (parent === cursor) return;
    cursor = parent;
  }
}
function catalog(directories, filesByKind, allKinds) {
  if (!record(directories) || !record(filesByKind)) fail('SOURCE_SEAL_INVALID_INPUT');
  const kinds = KINDS.filter(kind => Object.hasOwn(directories, kind));
  if (kinds.length === 0 || (allKinds && kinds.length !== KINDS.length)
    || Object.keys(directories).length !== kinds.length || Object.keys(filesByKind).length !== kinds.length
    || kinds.some(kind => !Object.hasOwn(filesByKind, kind))) fail('SOURCE_SEAL_INVALID_INPUT');
  const copiedDirectories = {}, copiedFiles = {}; const roots = new Set(), expectedPaths = new Set();
  let runRoot, fileCount = 0, totalBytes = 0;
  for (const kind of kinds) {
    const directory = localPath(directories[kind]); const parent = path.dirname(directory);
    if (roots.has(directory) || (runRoot !== undefined && parent !== runRoot)) fail('SOURCE_SEAL_INVALID_INPUT');
    roots.add(directory); runRoot = parent; copiedDirectories[kind] = directory;
    if (!Array.isArray(filesByKind[kind]) || filesByKind[kind].length > MAX_FILES) fail('SOURCE_SEAL_INVALID_INPUT');
    copiedFiles[kind] = filesByKind[kind].map(file => {
      if (!record(file) || !HASH.test(file.sha256 ?? '') || !Number.isSafeInteger(file.bytes) || file.bytes < 0
        || file.bytes > MAX_FILE_BYTES) fail('SOURCE_SEAL_INVALID_INPUT');
      const filename = localPath(file.path), relative = path.relative(directory, filename);
      if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative) || expectedPaths.has(filename)) fail('SOURCE_SEAL_INVALID_INPUT');
      expectedPaths.add(filename); fileCount++; totalBytes += file.bytes;
      if (!Number.isSafeInteger(totalBytes)) fail('SOURCE_SEAL_INVALID_INPUT');
      return { path: filename, sha256: file.sha256, bytes: file.bytes };
    }).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  }
  localPath(runRoot); const root = localPath(path.dirname(runRoot));
  return { kinds, directories: copiedDirectories, filesByKind: copiedFiles, runRoot, root, fileCount, totalBytes };
}
async function inspectTree(config, signal) {
  const directories = [], files = [], parents = [];
  await ancestry(config.root, signal);
  for (const filename of [config.root, config.runRoot]) {
    checkpoint(signal); const stat = await statOf(filename); privateStat(stat, true); parents.push({ path: filename, stat });
  }
  for (const kind of config.kinds) {
    const observed = [];
    async function visit(directory, depth) {
      checkpoint(signal); if (depth > 3) fail('SOURCE_SEAL_INVENTORY_MISMATCH');
      const stat = await statOf(directory); privateStat(stat, true);
      const names = (await readdir(directory)).sort(); directories.push({ path: directory, stat, names });
      for (const name of names) {
        checkpoint(signal); const filename = path.join(directory, name), item = await statOf(filename);
        if (item.isSymbolicLink()) fail('SOURCE_SEAL_UNSAFE_PATH');
        if (item.isDirectory()) await visit(filename, depth + 1);
        else {
          privateStat(item, false); observed.push(filename); files.push({ path: filename, stat: item });
          if (observed.length > MAX_FILES) fail('SOURCE_SEAL_INVENTORY_MISMATCH');
        }
      }
    }
    await visit(config.directories[kind], 0); observed.sort();
    if (!sameNames(observed, config.filesByKind[kind].map(file => file.path))) fail('SOURCE_SEAL_INVENTORY_MISMATCH');
  }
  return { directories, files, parents };
}
async function hashAndSync(file, initial, signal, synchronize) {
  checkpoint(signal);
  // Windows FlushFileBuffers needs a write-capable handle; this branch is synthetic only.
  const access = synchronize && process.platform === 'win32' ? constants.O_RDWR : constants.O_RDONLY;
  const handle = await open(file.path, access | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const before = await handle.stat({ bigint: true }); privateStat(before, false);
    if (!sameFile(initial, before) || before.size !== BigInt(file.bytes)) fail('SOURCE_SEAL_FILE_CHANGED');
    const digest = createHash('sha256'), buffer = Buffer.alloc(256 * 1024); let bytes = 0;
    while (bytes <= file.bytes) {
      checkpoint(signal); const result = await handle.read(buffer, 0, Math.min(buffer.length, file.bytes - bytes + 1), null);
      if (!result.bytesRead) break;
      bytes += result.bytesRead; if (bytes > file.bytes) fail('SOURCE_SEAL_FILE_CHANGED');
      digest.update(buffer.subarray(0, result.bytesRead));
    }
    if (bytes !== file.bytes || digest.digest('hex') !== file.sha256) fail('SOURCE_SEAL_FILE_CHANGED');
    if (synchronize) {
      checkpoint(signal); try { await handle.sync(); } catch { fail('SOURCE_SEAL_FSYNC_FAILED'); }
    }
    checkpoint(signal);
    const after = await handle.stat({ bigint: true }), named = await statOf(file.path);
    privateStat(after, false); privateStat(named, false);
    if (!sameFile(before, after) || !sameFile(before, named)) fail('SOURCE_SEAL_FILE_CHANGED');
  } finally { await handle.close(); }
}
async function verifyUnchanged(tree, signal) {
  for (const item of tree.files) {
    checkpoint(signal); const stat = await statOf(item.path); privateStat(stat, false);
    if (!sameFile(item.stat, stat)) fail('SOURCE_SEAL_FILE_CHANGED');
  }
  for (const item of [...tree.directories, ...tree.parents]) {
    checkpoint(signal); const stat = await statOf(item.path); privateStat(stat, true);
    if (!sameIdentity(item.stat, stat) || (item.names && !sameNames(item.names, (await readdir(item.path)).sort()))) fail('SOURCE_SEAL_INVENTORY_MISMATCH');
  }
}
async function syncDirectory(filename, original, signal) {
  checkpoint(signal);
  const handle = await open(filename, constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const stat = await handle.stat({ bigint: true });
    if (!stat.isDirectory() || !sameIdentity(original, stat)) fail('SOURCE_SEAL_UNSAFE_PATH');
    try { await handle.sync(); } catch { fail('SOURCE_SEAL_FSYNC_FAILED'); }
    checkpoint(signal); const named = await statOf(filename);
    if (named.isSymbolicLink() || !named.isDirectory() || !sameIdentity(stat, named)) fail('SOURCE_SEAL_UNSAFE_PATH');
  } finally { await handle.close(); }
}
async function verify(config, signal, synchronize) {
  const tree = await inspectTree(config, signal), initial = new Map(tree.files.map(file => [file.path, file.stat]));
  for (const kind of config.kinds) for (const file of config.filesByKind[kind]) await hashAndSync(file, initial.get(file.path), signal, synchronize);
  await verifyUnchanged(tree, signal);
  if (synchronize && process.platform === 'linux') {
    // Children precede their parents; source roots precede runRoot and scope root.
    const ordered = tree.directories.slice().sort((a, b) => b.path.split(path.sep).length - a.path.split(path.sep).length);
    for (const item of [...ordered, ...tree.parents.slice().reverse()]) await syncDirectory(item.path, item.stat, signal);
    await verifyUnchanged(tree, signal);
  }
  checkpoint(signal); return { fileCount: config.fileCount, totalBytes: config.totalBytes };
}

/** Exact expected file set, including zero-byte files. Empty directories are
 * traversed/validated but are not described by the caller's file-only catalog.
 * This is a point-in-time check, never a filesystem immutability claim.
 */
export async function verifySealedBackupSources({ directories, filesByKind, signal } = {}) {
  return safe(async () => { checkpoint(signal); return verify(catalog(directories, filesByKind, false), signal, false); });
}

/** Fresh private JSON plus file fsync and, on Linux, directory-entry fsync.
 * A failure can leave an incomplete receipt; callers must require returned
 * success and must never infer completion from path existence after a crash.
 */
export async function writeDurableBackupJson(filename, value, { signal, mode } = {}) {
  return safe(async () => {
    checkpoint(signal); selectedDurability(mode); localPath(filename);
    const parent = path.dirname(filename), grandparent = path.dirname(parent);
    await ancestry(parent, signal);
    const before = await statOf(parent); privateStat(before, true);
    const grandparentBefore = await statOf(grandparent);
    let artifact;
    try { artifact = await writeBackupJson(filename, value, { signal }); }
    catch { checkpoint(signal); fail('SOURCE_SEAL_WRITE_FAILED'); }
    checkpoint(signal);
    const named = await statOf(filename); privateStat(named, false);
    const parentAfter = await statOf(parent); privateStat(parentAfter, true);
    if (named.size !== BigInt(artifact.bytes) || !sameIdentity(before, parentAfter)) fail('SOURCE_SEAL_FILE_CHANGED');
    // Re-open the named result: the existing JSON writer hashes its input, so
    // verify and sync the actual final inode before publishing its descriptor.
    await hashAndSync(artifact, named, signal, true);
    if (process.platform === 'linux') {
      await syncDirectory(parent, before, signal);
      await syncDirectory(grandparent, grandparentBefore, signal);
    }
    checkpoint(signal);
    // This descriptor marks completed durable publication, not initial creation.
    return { ...artifact, createdAtUtc: new Date().toISOString() };
  });
}

export async function sealBackupSources({ runId, windowId, sourceRevision, directories, filesByKind, outputPath, mode, signal } = {}) {
  return safe(async () => {
    checkpoint(signal); const durability = selectedDurability(mode);
    if (typeof runId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/.test(runId)
      || typeof windowId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(windowId)
      || typeof sourceRevision !== 'string' || !/^[a-f0-9]{40}$/.test(sourceRevision)) fail('SOURCE_SEAL_INVALID_INPUT');
    const config = catalog(directories, filesByKind, true); localPath(outputPath);
    if (![config.runRoot, config.directories.database].includes(path.dirname(outputPath))
      || Object.values(config.filesByKind).flat().some(file => file.path === outputPath)) fail('SOURCE_SEAL_INVALID_INPUT');
    const counts = await verify(config, signal, true);
    // Inside the receipt this time describes verification/sync of the original
    // source catalog. artifact.createdAtUtc below is later: durable publication
    // of the receipt itself, which callers use for the source/resume boundary.
    const completedAtUtc = new Date().toISOString();
    const artifact = await writeDurableBackupJson(outputPath, {
      schemaVersion: 1, status: 'SOURCES_SEALED', runId, windowId, sourceRevision, completedAtUtc, durability,
      ...counts, directories: config.directories, filesByKind: config.filesByKind,
      immutableFilesystem: false, trustedParentsAndWritersRequired: true,
    }, { mode, signal });
    checkpoint(signal); return { artifact, durability, ...counts, completedAtUtc };
  });
}



