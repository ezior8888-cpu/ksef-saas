/**
 * F0 preparation primitive. Imports never execute commands. Real commands are
 * Linux-only and use fixed binaries, argv, an explicit environment and no shell.
 * spawnImpl is a dependency seam for OFFLINE synthetic tests, not CLI input.
 *
 * 0700/0600 and ownership are checked on POSIX; Windows tests do not establish
 * ACL or process-tree safety. The private root and its ancestors must not be
 * replaced concurrently (portable Node has no directory-fd/openat API).
 * Terminating a local docker/ssh client DOES NOT prove the remote operation has
 * stopped. The caller must keep its consistency window/lock until remote
 * cancellation is independently confirmed. Failed outputs must not be reused.
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants, createWriteStream } from "node:fs";
import { lstat, mkdir, open, rmdir, unlink } from "node:fs/promises";
import path from "node:path";
import { Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";

const BINARIES = Object.freeze({ docker: "/usr/bin/docker", restic: "/usr/bin/restic", ssh: "/usr/bin/ssh" });
const NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const NONBLOCK = constants.O_NONBLOCK ?? 0;
const MEMORY_LIMIT = 16 * 1024 ** 2;
const FILE_LIMIT = 32 * 1024 ** 3;
const CODES = new Set([
  "INVALID_COMMAND", "INVALID_OPTIONS", "UNSUPPORTED_PLATFORM", "UNSAFE_PATH", "PRIVATE_PATH_REQUIRED",
  "FILE_IO_FAILED", "OUTPUT_EXISTS", "LOCK_HELD", "LOCK_FAILED", "LOCK_NOT_OWNED", "RUN_EXISTS",
  "INVALID_RUN_ID", "COMMAND_ABORTED", "COMMAND_TIMEOUT", "COMMAND_SPAWN_FAILED", "COMMAND_FAILED",
  "COMMAND_SIGNALED", "STDOUT_LIMIT", "STDERR_LIMIT", "COMMAND_IO_FAILED", "PROCESS_CLEANUP_FAILED",
]);
const UNCERTAIN = new Set(["COMMAND_ABORTED", "COMMAND_TIMEOUT", "COMMAND_SIGNALED",
  "STDOUT_LIMIT", "STDERR_LIMIT", "COMMAND_IO_FAILED", "PROCESS_CLEANUP_FAILED"]);
const record = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const safeText = (v) => typeof v === "string" && !v.includes("\0");
const bounded = (v, max) => Number.isSafeInteger(v) && v > 0 && v <= max;

export class BackupRuntimeError extends Error {
  constructor(code) {
    const safe = CODES.has(code) ? code : "COMMAND_FAILED";
    super("Backup operation incomplete: " + safe);
    this.name = "BackupRuntimeError";
    this.code = safe;
    // Local close alone does not establish that external work is quiescent.
    this.discardClientRequired = UNCERTAIN.has(safe);
  }
}
const fail = (code) => { throw new BackupRuntimeError(code); };
const privateError = (error, fallback) => error instanceof BackupRuntimeError ? error : new BackupRuntimeError(fallback);

function localPath(value) {
  if (!safeText(value) || !path.isAbsolute(value) || value.startsWith("\\\\") || value.startsWith("//")) fail("UNSAFE_PATH");
  const resolved = path.resolve(value);
  if (resolved === path.parse(resolved).root || (process.platform === "win32" && resolved.slice(2).includes(":"))) fail("UNSAFE_PATH");
  return resolved;
}
function privateStat(stat, directory) {
  if (stat.isSymbolicLink() || !(directory ? stat.isDirectory() : stat.isFile())) fail("UNSAFE_PATH");
  if (process.platform !== "win32" && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid())) fail("PRIVATE_PATH_REQUIRED");
}
async function privateDirectory(value) {
  const resolved = localPath(value);
  let cursor = resolved;
  while (true) {
    const stat = await lstat(cursor);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail("UNSAFE_PATH");
    if (cursor === resolved) privateStat(stat, true);
    const parent = path.dirname(cursor);
    if (parent === cursor) return resolved;
    cursor = parent;
  }
}
async function privateFile(filename, fresh) {
  const resolved = localPath(filename);
  await privateDirectory(path.dirname(resolved));
  if (!fresh) {
    const stat = await lstat(resolved);
    privateStat(stat, false);
  }
  const flags = fresh ? constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW : constants.O_RDONLY | NOFOLLOW | NONBLOCK;
  const handle = await open(resolved, flags, 0o600);
  try {
    privateStat(await handle.stat(), false);
    return handle;
  } catch (error) { await handle.close(); throw error; }
}
const sameFile = (left, right) => left.dev === right.dev && left.ino === right.ino;

/** Scope-wide lease: fixed lock under staging root, never a per-run lock.
 * No stale lock expiry or automatic takeover. Release removes only our token.
 * An abandoned lock requires operator investigation, especially for remote work.
 */
export async function acquireBackupLock(root) {
  let lock;
  try {
    const parent = await privateDirectory(root);
    const parentStat = await lstat(parent);
    lock = path.join(parent, ".backup.lock");
    try { await mkdir(lock, { mode: 0o700 }); }
    catch (error) { if (error.code === "EEXIST") fail("LOCK_HELD"); throw error; }
    const lockStat = await lstat(lock);
    const token = randomUUID();
    const ownerPath = path.join(lock, "owner");
    const owner = await privateFile(ownerPath, true);
    try { await owner.writeFile(token); await owner.sync(); } finally { await owner.close(); }
    const ownerStat = await lstat(ownerPath);
    let released = false;
    return Object.freeze({
      path: lock,
      async release() {
        if (released) return;
        try {
          await privateDirectory(parent);
          if (!sameFile(parentStat, await lstat(parent)) || !sameFile(lockStat, await lstat(lock))) fail("LOCK_NOT_OWNED");
          const handle = await privateFile(ownerPath, false);
          try {
            const stat = await handle.stat();
            if (!sameFile(ownerStat, stat) || stat.size !== Buffer.byteLength(token) || await handle.readFile("utf8") !== token) fail("LOCK_NOT_OWNED");
          } finally { await handle.close(); }
          await unlink(ownerPath);
          await rmdir(lock); // Non-recursive: unexpected files preserve the lock.
          released = true;
        } catch (error) { throw privateError(error, "LOCK_NOT_OWNED"); }
      },
    });
  } catch (error) {
    // A partly created lock is deliberately retained for operator inspection.
    throw privateError(error, "LOCK_FAILED");
  }
}

export async function createBackupRunDirectory(root, runId) {
  if (typeof runId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/.test(runId)) fail("INVALID_RUN_ID");
  try {
    const parent = await privateDirectory(root);
    const destination = path.join(parent, runId);
    try { await mkdir(destination, { mode: 0o700 }); }
    catch (error) { if (error.code === "EEXIST") fail("RUN_EXISTS"); throw error; }
    privateStat(await lstat(destination), true);
    return destination;
  } catch (error) { throw privateError(error, "FILE_IO_FAILED"); }
}

/** argv/env are trusted caller configuration; this is not a command parser.
 * File stdout is streamed (up to 32 GiB); memory stdout/stderr each max 16 MiB.
 * Any nonzero exit, including restic 3 (incomplete source), is failure.
 * Error messages never include argv, paths, environment, stderr or causes.
 */
export async function runBackupCommand(spec, options = {}) {
  const started = performance.now();
  if (!record(spec) || !Object.hasOwn(BINARIES, spec.executable) || !Array.isArray(spec.args)
    || spec.args.length > 256 || spec.args.some((arg) => !safeText(arg) || arg.length > 65536)
    || !record(spec.env) || Object.entries(spec.env).some(([key, value]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || !safeText(value))) fail("INVALID_COMMAND");
  if (!record(options)) fail("INVALID_OPTIONS");
  const { signal, timeoutMs, killGraceMs = 1000, maxStdoutBytes = 1024 ** 2,
    maxStderrBytes = 64 * 1024, spawnImpl = spawn } = options;
  if (!bounded(timeoutMs, 24 * 60 * 60 * 1000) || !bounded(killGraceMs, 30000)
    || !bounded(maxStdoutBytes, spec.stdoutFile === undefined ? MEMORY_LIMIT : FILE_LIMIT)
    || !bounded(maxStderrBytes, MEMORY_LIMIT) || typeof spawnImpl !== "function"
    || (signal !== undefined && !(signal instanceof AbortSignal))
    || (spec.stdinData !== undefined && (!Buffer.isBuffer(spec.stdinData) || spec.stdinData.length > MEMORY_LIMIT || spec.stdinFile !== undefined))) fail("INVALID_OPTIONS");
  if (process.platform !== "linux" && spawnImpl === spawn) fail("UNSUPPORTED_PLATFORM");
  const checkpoint = () => {
    if (signal?.aborted) fail("COMMAND_ABORTED");
    if (performance.now() - started >= timeoutMs) fail("COMMAND_TIMEOUT");
  };
  checkpoint();
  let input, output;
  try {
    if (spec.cwd !== undefined) { await privateDirectory(spec.cwd); checkpoint(); }
    if (spec.stdinFile !== undefined) { input = await privateFile(spec.stdinFile, false); checkpoint(); }
    if (spec.stdoutFile !== undefined) {
      try { output = await privateFile(spec.stdoutFile, true); }
      catch (error) { if (error.code === "EEXIST") fail("OUTPUT_EXISTS"); throw error; }
      checkpoint();
    }
    // Explicit copy only: no process.env spread, PATH lookup or shell.
    const env = Object.assign(Object.create(null), spec.env);
    const grouped = process.platform === "linux";
    const ioController = new AbortController();
    let child, failure, killTimer, deadlineTimer, closed = false;
    const stdout = [], stderr = [];
    let stdoutBytes = 0, stderrBytes = 0;
    const kill = (type) => {
      if (!child?.pid) return;
      try {
        if (grouped) process.kill(-child.pid, type);
        else if (!closed) child.kill(type);
      } catch (error) {
        if (error.code !== "ESRCH") failure ??= new BackupRuntimeError("PROCESS_CLEANUP_FAILED");
      }
    };
    const stop = (code) => {
      failure ??= new BackupRuntimeError(code);
      ioController.abort();
      if (closed) return;
      kill("SIGTERM");
      killTimer ??= setTimeout(() => kill("SIGKILL"), killGraceMs);
    };
    const abort = () => stop("COMMAND_ABORTED");
    try {
      try {
        child = spawnImpl(BINARIES[spec.executable], spec.args.slice(), {
          cwd: spec.cwd, env, shell: false, windowsHide: true, detached: grouped,
          stdio: [input ? input.fd : spec.stdinData ? "pipe" : "ignore", "pipe", "pipe"],
        });
      } catch { fail("COMMAND_SPAWN_FAILED"); }
      const close = new Promise((resolve) => {
        child.once("error", () => stop("COMMAND_SPAWN_FAILED"));
        child.once("close", (code, terminatingSignal) => {
          closed = true;
          // A surviving descendant with closed pipes must not outlive the step.
          if (grouped && child.pid) {
            try { process.kill(-child.pid, 0); failure ??= new BackupRuntimeError("PROCESS_CLEANUP_FAILED"); kill("SIGKILL"); }
            catch (error) { if (error.code !== "ESRCH") failure ??= new BackupRuntimeError("PROCESS_CLEANUP_FAILED"); }
          }
          resolve({ code, terminatingSignal });
        });
      });
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
      deadlineTimer = setTimeout(() => stop("COMMAND_TIMEOUT"), Math.max(1, timeoutMs - (performance.now() - started)));
      const meter = (stream, maximum, parts) => new Transform({
        transform(chunk, _encoding, callback) {
          const bytes = Buffer.byteLength(chunk);
          const next = (stream === "stdout" ? stdoutBytes : stderrBytes) + bytes;
          if (next > maximum) { stop(stream === "stdout" ? "STDOUT_LIMIT" : "STDERR_LIMIT"); callback(new BackupRuntimeError(stream === "stdout" ? "STDOUT_LIMIT" : "STDERR_LIMIT")); return; }
          if (stream === "stdout") stdoutBytes = next; else stderrBytes = next;
          if (parts) parts.push(Buffer.from(chunk));
          callback(null, chunk);
        },
      });
      const discard = () => new Writable({ write(_chunk, _encoding, callback) { callback(); } });
      const destination = output ? createWriteStream(spec.stdoutFile, { fd: output.fd, autoClose: false }) : discard();
      const writes = [
        pipeline(child.stdout, meter("stdout", maxStdoutBytes, output ? null : stdout), destination, { signal: ioController.signal }),
        pipeline(child.stderr, meter("stderr", maxStderrBytes, stderr), discard(), { signal: ioController.signal }),
      ].map((task) => task.catch(() => { stop("COMMAND_IO_FAILED"); }));
      if (spec.stdinData !== undefined) {
        child.stdin.on("error", () => stop("COMMAND_IO_FAILED"));
        child.stdin.end(spec.stdinData);
      }
      const result = await close;
      await Promise.all(writes);
      if (failure) throw failure;
      if (result.terminatingSignal) fail("COMMAND_SIGNALED");
      if (result.code !== 0) fail("COMMAND_FAILED");
      if (output) await output.sync();
      checkpoint();
      return { exitCode: 0, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr), stdoutBytes, stderrBytes };
    } finally {
      clearTimeout(deadlineTimer); clearTimeout(killTimer);
      signal?.removeEventListener("abort", abort);
    }
  } catch (error) { throw privateError(error, "FILE_IO_FAILED"); }
  finally {
    const closes = await Promise.allSettled([input?.close(), output?.close()]);
    if (closes.some((result) => result.status === "rejected")) fail("FILE_IO_FAILED");
  }
}
