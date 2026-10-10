/** Private bounded artifacts for the prepared F0 sequence. No network or import effects. */
import { constants } from 'node:fs';
import { open, lstat, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

export async function hashBackupArtifact(filename, { maxBytes = 32 * 1024 ** 3, signal } = {}) {
  let handle;
  try {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > 32 * 1024 ** 3) throw new Error();
    signal?.throwIfAborted();
    handle = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    const before = await handle.stat();
    if (!before.isFile() || before.size > maxBytes) throw new Error();
    const hash = createHash('sha256'), buffer = Buffer.alloc(256 * 1024); let bytes = 0;
    while (true) {
      signal?.throwIfAborted();
      const part = await handle.read(buffer, 0, Math.min(buffer.length, maxBytes - bytes + 1), null);
      if (!part.bytesRead) break;
      bytes += part.bytesRead;
      if (bytes > maxBytes) throw new Error();
      hash.update(buffer.subarray(0, part.bytesRead));
    }
    const after = await handle.stat();
    if (bytes !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw new Error();
    return { path: filename, sha256: hash.digest('hex'), bytes, createdAtUtc: new Date().toISOString() };
  } catch { throw new Error('ARTIFACT_READ_FAILED'); }
  finally { await handle?.close(); }
}

export async function writeBackupJson(filename, value, { maxBytes = 1024 * 1024, signal } = {}) {
  let handle;
  try {
    signal?.throwIfAborted();
    const data = Buffer.from(JSON.stringify(value) + '\n');
    if (data.length > maxBytes) throw new Error();
    handle = await open(filename, 'wx', 0o600);
    await handle.writeFile(data); await handle.sync();
    signal?.throwIfAborted();
    return { path: filename, sha256: createHash('sha256').update(data).digest('hex'), bytes: data.length, createdAtUtc: new Date().toISOString() };
  } catch { throw new Error('ARTIFACT_WRITE_FAILED'); }
  finally { await handle?.close(); }
}

// Trusted parents must remain stable; portable Node cannot provide openat-based
// directory isolation. The runtime enforces a private root before calling this.
export async function inventoryBackupFiles(directory, { signal, maxFiles = 20050 } = {}) {
  const files = []; let total = 0;
  async function visit(current, depth) {
    signal?.throwIfAborted();
    const info = await lstat(current);
    if (info.isSymbolicLink() || !info.isDirectory() || depth > 3) throw new Error('UNSAFE_ARTIFACT_TREE');
    for (const name of (await readdir(current)).sort()) {
      signal?.throwIfAborted();
      const filename = path.join(current, name), stat = await lstat(filename);
      if (stat.isSymbolicLink()) throw new Error('UNSAFE_ARTIFACT_TREE');
      if (stat.isDirectory()) await visit(filename, depth + 1);
      else {
        if (++total > maxFiles) throw new Error('ARTIFACT_COUNT_LIMIT');
        const artifact = await hashBackupArtifact(filename, { signal });
        files.push({ path: filename, sha256: artifact.sha256, bytes: artifact.bytes });
      }
    }
  }
  await visit(directory, 0); return files;
}
