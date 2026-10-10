#!/usr/bin/env node
/**
 * Explicit-transport restic adapter. Import and CLI never access repositories.
 * Callers authorize execution and supply separately scoped writer/reader clients,
 * credentials, private output storage and cancellation-safe command transports.
 * Distinct client IDs are a checked declaration, not proof of physical separation.
 * Private parent directories must remain stable: portable Node has no openat.
 * Windows synthetic tests do not establish production ACL/reparse-point safety.
 * No init, restore, forget, prune, repair or automatic unlock is implemented.
 */
import { constants } from 'node:fs';
import { lstat, mkdtemp, open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const HASH = /^[a-f0-9]{64}$/;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const JSON_LIMIT = 1024 * 1024;
const FILE_LIMIT = 32 * 1024 ** 3;
const TOTAL_LIMIT = 128 * 1024 ** 3;
const SOURCES = Object.freeze({
  database: { host: 'db-1', tag: 'postgresql' },
  application: { host: 'ops-1', tag: 'app-minio' },
  supabase: { host: 'db-1', tag: 'supabase-minio' },
});
const SAFE_CODES = new Set(['RESTIC_INVALID_INPUT', 'RESTIC_COMMAND_FAILED', 'RESTIC_INVALID_OUTPUT',
  'RESTIC_SCOPE_MISMATCH', 'RESTIC_REPOSITORY_MISMATCH', 'RESTIC_FILE_MISMATCH',
  'RESTIC_UNSAFE_OUTPUT', 'RESTIC_TIMEOUT', 'RESTIC_ABORTED']);
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function clean(error) {
  const code = SAFE_CODES.has(error?.code) ? error.code : 'RESTIC_COMMAND_FAILED';
  const result = new Error(code); result.code = code;
  // A local deadline cannot prove a transport (especially SSH) stopped. Keep
  // the orchestration lease until the caller independently resolves that state.
  const settledFailure = SAFE_CODES.has(error?.code) || error?.code === 'COMMAND_FAILED';
  result.discardClientRequired = error?.discardClientRequired === true || !settledFailure ||
    code === 'RESTIC_TIMEOUT' || code === 'RESTIC_ABORTED';
  return result;
}
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const token = (value) => typeof value === 'string' && TOKEN.test(value);
const hash = (value) => typeof value === 'string' && HASH.test(value);
function absolute(value) {
  if (typeof value !== 'string' || !value || value.length > 4096 || /[\0\r\n]/.test(value) || /^[\\/]{2}/.test(value)) fail('RESTIC_INVALID_INPUT');
  const parser = path.posix.isAbsolute(value) ? path.posix : path.win32;
  if (!parser.isAbsolute(value) || parser.normalize(value) !== value || value === parser.parse(value).root) fail('RESTIC_INVALID_INPUT');
  return value;
}
function descendant(file, directory) {
  const parser = path.posix.isAbsolute(directory) ? path.posix : path.win32;
  const relative = parser.relative(directory, file);
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + parser.sep) && !parser.isAbsolute(relative);
}
function environment(value) {
  if (!record(value) || Object.entries(value).some(([key, item]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof item !== 'string' || /\0/.test(item))) fail('RESTIC_INVALID_INPUT');
  return { ...value };
}
function stdout(result) {
  if (!record(result) || result.exitCode !== 0) fail('RESTIC_COMMAND_FAILED');
  if (!Buffer.isBuffer(result.stdout) && typeof result.stdout !== 'string') fail('RESTIC_INVALID_OUTPUT');
  const buffer = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout);
  if (buffer.length > JSON_LIMIT) fail('RESTIC_INVALID_OUTPUT');
  return buffer.toString('utf8');
}
function json(result) { try { return JSON.parse(stdout(result)); } catch (error) { if (SAFE_CODES.has(error?.code)) throw error; fail('RESTIC_INVALID_OUTPUT'); } }

async function privateRoot(root) {
  if (!path.isAbsolute(root) || path.resolve(root) !== root) fail('RESTIC_UNSAFE_OUTPUT');
  const parsed = path.parse(root); let cursor = parsed.root;
  for (const part of root.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part); const item = await lstat(cursor);
    if (item.isSymbolicLink() || !item.isDirectory()) fail('RESTIC_UNSAFE_OUTPUT');
  }
  const item = await lstat(root);
  if (!item.isDirectory() || item.isSymbolicLink() || (process.platform !== 'win32' && ((item.mode & 0o077) !== 0 || item.uid !== process.getuid()))) fail('RESTIC_UNSAFE_OUTPUT');
  return { dev: item.dev, ino: item.ino };
}
async function hashFile(file, expected, guard) {
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.nlink !== 1 || before.size !== expected.bytes || before.size > FILE_LIMIT ||
        (process.platform !== 'win32' && ((before.mode & 0o077) !== 0 || before.uid !== process.getuid()))) fail('RESTIC_FILE_MISMATCH');
    const digest = createHash('sha256'); const buffer = Buffer.alloc(64 * 1024); let bytes = 0;
    while (true) {
      guard(); const next = await handle.read(buffer, 0, Math.min(buffer.length, expected.bytes - bytes + 1), null);
      if (!next.bytesRead) break;
      bytes += next.bytesRead; if (bytes > expected.bytes) fail('RESTIC_FILE_MISMATCH');
      digest.update(buffer.subarray(0, next.bytesRead));
    }
    const after = await handle.stat(); const named = await lstat(file); const sha256 = digest.digest('hex');
    if (named.isSymbolicLink() || named.dev !== before.dev || named.ino !== before.ino || after.size !== before.size ||
        after.mtimeMs !== before.mtimeMs || bytes !== expected.bytes || sha256 !== expected.sha256) fail('RESTIC_FILE_MISMATCH');
    return { path: expected.path, sha256, bytes };
  } finally { await handle.close(); }
}

export function createBackupResticAdapter({ repositories, writerCommand, readerCommand, readerRoot,
  writerClientId, readerClientId, writerEnv = {}, readerEnv = {} } = {}) {
  if (!record(repositories) || Object.keys(repositories).length !== 3 ||
      typeof writerCommand !== 'function' || typeof readerCommand !== 'function' || writerCommand === readerCommand ||
      !token(writerClientId) || !token(readerClientId) || writerClientId === readerClientId) fail('RESTIC_INVALID_INPUT');
  absolute(readerRoot);
  const bindings = Object.fromEntries(Object.keys(SOURCES).map((kind) => {
    const item = repositories[kind];
    if (!record(item)) fail('RESTIC_INVALID_INPUT');
    return [kind, { repositoryFile: absolute(item.repositoryFile), passwordFile: absolute(item.passwordFile) }];
  }));
  const envs = { writer: environment(writerEnv), reader: environment(readerEnv) };
  const knownRepositories = new Map();

  async function scope({ kind, runId, signal, timeoutMs }, operation) {
    if (!Object.hasOwn(SOURCES, kind) || !token(runId) || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 12 * 60 * 60 * 1000 ||
        (signal !== undefined && (typeof signal?.addEventListener !== 'function' || typeof signal?.aborted !== 'boolean'))) fail('RESTIC_INVALID_INPUT');
    const controller = new AbortController(); const deadline = performance.now() + timeoutMs;
    let timeout = false; let rejectBoundary;
    const boundary = new Promise((_, reject) => { rejectBoundary = reject; });
    const stop = () => { controller.abort(); rejectBoundary(clean({ code: timeout ? 'RESTIC_TIMEOUT' : 'RESTIC_ABORTED' })); };
    const timer = setTimeout(() => { timeout = true; stop(); }, timeoutMs);
    const abort = () => stop(); signal?.addEventListener('abort', abort, { once: true });
    const guard = () => { if (timeout || performance.now() >= deadline) fail('RESTIC_TIMEOUT'); if (signal?.aborted || controller.signal.aborted) fail('RESTIC_ABORTED'); };
    const invoke = async (side, args, options = {}, outputLimit = JSON_LIMIT) => {
      guard(); const config = bindings[kind];
      const transport = side === 'writer' ? writerCommand : readerCommand;
      const result = await transport({ executable: 'restic', args: ['--repository-file', config.repositoryFile,
        '--password-file', config.passwordFile, '--no-cache', ...args], env: { ...envs[side] }, ...options },
      { signal: controller.signal, timeoutMs: Math.max(1, Math.ceil(deadline - performance.now())), maxStdoutBytes: outputLimit });
      guard(); if (!record(result) || result.exitCode !== 0) fail('RESTIC_COMMAND_FAILED'); return result;
    };
    const repository = async (side) => {
      const config = json(await invoke(side, ['cat', 'config']));
      if (!record(config) || !hash(config.id) || ![1, 2].includes(config.version)) fail('RESTIC_INVALID_OUTPUT');
      const prior = knownRepositories.get(kind);
      if (prior && prior !== config.id) fail('RESTIC_REPOSITORY_MISMATCH');
      if ([...knownRepositories.entries()].some(([other, id]) => other !== kind && id === config.id)) fail('RESTIC_REPOSITORY_MISMATCH');
      knownRepositories.set(kind, config.id); return config.id;
    };
    const snapshot = async (side, id, directory) => {
      const rows = json(await invoke(side, ['snapshots', '--json', id]));
      if (!Array.isArray(rows) || rows.length !== 1 || !record(rows[0])) fail('RESTIC_INVALID_OUTPUT');
      const row = rows[0]; const source = SOURCES[kind];
      const tags = ['f0', 'source:' + source.tag, 'run:' + runId];
      if (row.id !== id || row.hostname !== source.host || !Array.isArray(row.paths) || row.paths.length !== 1 ||
          !Array.isArray(row.tags) || row.tags.length !== tags.length || tags.some((tag) => row.tags.filter((item) => item === tag).length !== 1) ||
          (directory !== undefined && row.paths[0] !== directory)) fail('RESTIC_SCOPE_MISMATCH');
      absolute(row.paths[0]);
      if (typeof row.time !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(row.time) || !Number.isFinite(Date.parse(row.time))) fail('RESTIC_INVALID_OUTPUT');
      return { directory: row.paths[0], createdAtUtc: new Date(row.time).toISOString() };
    };
    try {
      if (signal?.aborted) stop();
      return await Promise.race([operation({ invoke, repository, snapshot, guard }), boundary]);
    } catch (error) { throw clean(error); }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }

  return Object.freeze({
    async backup(options) {
      const { kind, runId, directory } = options ?? {}; absolute(directory);
      return scope(options, async ({ invoke, repository, snapshot }) => {
        const repositoryId = await repository('writer'); const source = SOURCES[kind];
        const result = await invoke('writer', ['backup', '--json', '--host', source.host, '--tag', 'f0',
          '--tag', 'source:' + source.tag, '--tag', 'run:' + runId, '--group-by', 'host', '--', directory]);
        let messages;
        try { messages = stdout(result).split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line)); }
        catch (error) { if (SAFE_CODES.has(error?.code)) throw error; fail('RESTIC_INVALID_OUTPUT'); }
        if (messages.some((item) => !record(item) || item.message_type === 'error')) fail('RESTIC_INVALID_OUTPUT');
        const summaries = messages.filter((item) => item.message_type === 'summary');
        if (summaries.length !== 1 || !hash(summaries[0].snapshot_id)) fail('RESTIC_INVALID_OUTPUT');
        const snapshotId = summaries[0].snapshot_id;
        const verified = await snapshot('writer', snapshotId, directory);
        return { repositoryId, snapshotId, createdAtUtc: verified.createdAtUtc, resticExitCode: 0 };
      });
    },
    async read(options) {
      const { kind, runId, snapshotId, files } = options ?? {};
      if (!hash(snapshotId) || !Array.isArray(files) || files.length < 1 || files.length > 100000) fail('RESTIC_INVALID_INPUT');
      let total = 0; const paths = new Set();
      const expected = files.map((item) => {
        if (!record(item) || !hash(item.sha256) || !Number.isSafeInteger(item.bytes) || item.bytes < 0 || item.bytes > FILE_LIMIT) fail('RESTIC_INVALID_INPUT');
        absolute(item.path); if (paths.has(item.path)) fail('RESTIC_INVALID_INPUT'); paths.add(item.path);
        total += item.bytes; if (!Number.isSafeInteger(total) || total > TOTAL_LIMIT) fail('RESTIC_INVALID_INPUT');
        return { path: item.path, sha256: item.sha256, bytes: item.bytes };
      });
      return scope(options, async ({ invoke, repository, snapshot, guard }) => {
        await repository('writer'); const repositoryId = await repository('reader');
        const selected = await snapshot('reader', snapshotId);
        if (expected.some((item) => !descendant(item.path, selected.directory))) fail('RESTIC_SCOPE_MISMATCH');
        await invoke('reader', ['check', '--read-data']);
        guard(); const originalRoot = await privateRoot(readerRoot);
        const outputDirectory = await mkdtemp(path.join(readerRoot, 'read-'));
        const verifiedFiles = [];
        for (let index = 0; index < expected.length; index += 1) {
          guard(); const currentRoot = await privateRoot(readerRoot);
          if (currentRoot.dev !== originalRoot.dev || currentRoot.ino !== originalRoot.ino) fail('RESTIC_UNSAFE_OUTPUT');
          await privateRoot(outputDirectory);
          const output = path.join(outputDirectory, String(index) + '.payload');
          await invoke('reader', ['dump', snapshotId, expected[index].path], { stdoutFile: output }, Math.max(1, Math.min(FILE_LIMIT, expected[index].bytes + 1)));
          verifiedFiles.push(await hashFile(output, expected[index], guard));
        }
        guard(); const checkedAtUtc = new Date().toISOString();
        return { repositoryId, snapshotId, exitCode: 0, independentClient: true, files: verifiedFiles, checkedAtUtc,
          evidence: { schemaVersion: 1, method: 'restic-check-read-data-and-file-dump', runId, kind,
            fileCount: verifiedFiles.length, totalBytes: total, checkExitCode: 0,
            independentClientIdentityDeclared: true, physicalClientIndependenceVerified: false,
            evidenceVerified: false, g09Accepted: false } };
      });
    },
  });
}

export function runCli(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
  if (argv.length === 0 || (argv.length === 1 && argv[0] === '--help')) {
    stdout.write('Biblioteka restic z jawnymi transportami. CLI wyłącznie pomoc; nie odczytuje konfiguracji ani repozytoriów i nie wykonuje kopii.\n'); return 0;
  }
  stderr.write('Brak CLI wykonującego kopie. Użyj --help.\n'); return 2;
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) process.exitCode = runCli(process.argv.slice(2));
