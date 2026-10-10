import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { acquireBackupLock, BackupRuntimeError, createBackupRunDirectory, runBackupCommand } from "./backup-runtime.mjs";

const spec = (overrides = {}) => ({ executable: "restic", args: ["check"], env: {}, ...overrides });
function synthetic(script, inspect = () => {}) {
  return (executable, args, options) => {
    inspect(executable, args, options);
    return spawn(process.execPath, ["-e", script], options);
  };
}
const run = (script, overrides = {}, options = {}) => runBackupCommand(spec(overrides), {
  timeoutMs: 5000, spawnImpl: synthetic(script), ...options,
});
const code = (expected) => (error) => {
  assert.ok(error instanceof BackupRuntimeError);
  assert.equal(error.code, expected);
  assert.equal(error.message, "Backup operation incomplete: " + expected);
  assert.equal(error.cause, undefined);
  return true;
};
async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "f0-runtime-test-"));
  await chmod(directory, 0o700);
  t.after(async () => {
    if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith("f0-runtime-test-")) throw new Error("Unsafe fixture cleanup");
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

test("argv are literal, binaries fixed, shell disabled and environment explicit", async () => {
  const secretKey = "F0_RUNTIME_DO_NOT_INHERIT";
  process.env[secretKey] = "PRIVATE_PARENT_SECRET";
  try {
    const argv = ["backup", "$(echo secret); & |", "--tag", "space value"];
    const result = await run("process.stdout.write(JSON.stringify(process.env)); process.stderr.write('notice')", { args: argv, env: { EXPLICIT_FIXTURE: "value" } }, {
      spawnImpl: synthetic("process.stdout.write(JSON.stringify(process.env)); process.stderr.write('notice')", (executable, args, options) => {
        assert.equal(executable, "/usr/bin/restic"); assert.deepEqual(args, argv);
        assert.equal(options.shell, false); assert.equal(options.windowsHide, true);
        assert.deepEqual({ ...options.env }, { EXPLICIT_FIXTURE: "value" });
      }),
    });
    assert.equal(JSON.parse(result.stdout.toString()).EXPLICIT_FIXTURE, "value");
    assert.equal(JSON.parse(result.stdout.toString())[secretKey], undefined);
    assert.equal(result.stderr.toString(), "notice"); assert.equal(result.exitCode, 0);
  } finally { delete process.env[secretKey]; }
});

test("only explicit backup binaries and argv/env shapes are accepted", async () => {
  for (const invalid of [
    { executable: "sh" }, { executable: "/usr/bin/restic" }, { executable: "toString" },
    { args: "check" }, { args: ["check\0"] }, { env: undefined }, { env: { TOKEN: 1 } },
  ]) await assert.rejects(run("", invalid), code("INVALID_COMMAND"));
  for (const options of [{ timeoutMs: 0 }, { timeoutMs: Infinity }, { maxStdoutBytes: 33 * 1024 ** 3 }, { maxStderrBytes: 20 * 1024 ** 2 }]) {
    await assert.rejects(run("", {}, options), code("INVALID_OPTIONS"));
  }
});

test("production process execution is explicitly Linux-only", { skip: process.platform === "linux" }, async () => {
  await assert.rejects(runBackupCommand(spec(), { timeoutMs: 100 }), code("UNSUPPORTED_PLATFORM"));
});

test("nonzero exits including restic partial-backup code 3 are failure with no private output", async () => {
  for (const exit of [1, 3, 7]) {
    await assert.rejects(run(`process.stderr.write('PRIVATE_CREDENTIAL_AND_PATH'); process.exit(${exit})`), code("COMMAND_FAILED"));
  }
});

test("spawn failure is sanitized", async () => {
  await assert.rejects(run("", {}, { spawnImpl() { throw new Error("PRIVATE_COMMAND_CREDENTIAL"); } }), code("COMMAND_SPAWN_FAILED"));
  await assert.rejects(run("", {}, { spawnImpl(_exe, _args, options) { return spawn(path.join(os.tmpdir(), "nonexistent-f0-binary"), [], options); } }), code("COMMAND_SPAWN_FAILED"));
});

test("stdout and stderr overflow terminate the real synthetic process", async () => {
  for (const stream of ["stdout", "stderr"]) {
    await assert.rejects(run(`process.${stream}.write(Buffer.alloc(8192)); setInterval(()=>{}, 1000)`, {}, {
      [stream === "stdout" ? "maxStdoutBytes" : "maxStderrBytes"]: 64,
    }), code(stream === "stdout" ? "STDOUT_LIMIT" : "STDERR_LIMIT"));
  }
});

test("timeout waits for child close before rejecting", { timeout: 4000 }, async () => {
  let child, closed = false;
  await assert.rejects(run("", {}, {
    timeoutMs: 250, killGraceMs: 30,
    spawnImpl: (_exe, _args, options) => {
      child = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], options);
      child.on("close", () => { closed = true; }); return child;
    },
  }), code("COMMAND_TIMEOUT"));
  assert.equal(closed, true);
  assert.ok(child.exitCode !== null || child.signalCode !== null);
});

test("pre-aborted input never starts process; live abort waits for close", async () => {
  const controller = new AbortController(); controller.abort(new Error("PRIVATE_REASON"));
  let called = false;
  await assert.rejects(run("", {}, { signal: controller.signal, spawnImpl() { called = true; } }), code("COMMAND_ABORTED"));
  assert.equal(called, false);
  const live = new AbortController(); let closed = false;
  await assert.rejects(run("", {}, {
    signal: live.signal,
    spawnImpl: (_exe, _args, options) => {
      const child = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], options);
      child.once("spawn", () => live.abort()); child.once("close", () => { closed = true; }); return child;
    },
  }), code("COMMAND_ABORTED"));
  assert.equal(closed, true);
});

test("TERM-resistant child is killed after grace on Linux", { skip: process.platform !== "linux", timeout: 3000 }, async () => {
  let signal;
  await assert.rejects(run("", {}, {
    timeoutMs: 300, killGraceMs: 30,
    spawnImpl: (_exe, _args, options) => {
      const child = spawn(process.execPath, ["-e", "process.on('SIGTERM',()=>{}); setInterval(()=>{},1000)"], options);
      child.on("close", (_code, value) => { signal = value; }); return child;
    },
  }), code("COMMAND_TIMEOUT"));
  assert.equal(signal, "SIGKILL");
});

test("process group timeout also kills a synthetic descendant on Linux", { skip: process.platform !== "linux", timeout: 4000 }, async (t) => {
  const root = await fixture(t); const marker = path.join(root, "descendant-survived");
  const script = `const {spawn}=require('node:child_process');spawn(process.execPath,['-e',${JSON.stringify("setTimeout(()=>require('node:fs').writeFileSync(" + JSON.stringify(marker) + ",'bad'), 700)")}],{stdio:'inherit'});setInterval(()=>{},1000)`;
  await assert.rejects(run(script, {}, { timeoutMs: 250, killGraceMs: 30 }), code("COMMAND_TIMEOUT"));
  await new Promise((resolve) => setTimeout(resolve, 800));
  assert.deepEqual(await readdir(root), []);
});

test("stdout streams to a NEW private file; existing file never overwritten", async (t) => {
  const root = await fixture(t), output = path.join(root, "archive.dump");
  const bytes = 17 * 1024 ** 2;
  const result = await run(`process.stdout.write(Buffer.alloc(${bytes}, 65))`, { stdoutFile: output }, { maxStdoutBytes: bytes });
  assert.equal(result.stdout.length, 0); assert.equal(result.stdoutBytes, bytes);
  const metadata = await lstat(output); assert.equal(metadata.size, bytes);
  if (process.platform !== "win32") assert.equal(metadata.mode & 0o777, 0o600);
  let called = false;
  await assert.rejects(run("", { stdoutFile: output }, { spawnImpl() { called = true; } }), code("OUTPUT_EXISTS"));
  assert.equal(called, false); assert.equal((await lstat(output)).size, bytes);
});

test("failed partial stdout is retained and cannot be reused", async (t) => {
  const root = await fixture(t), output = path.join(root, "partial.dump");
  await assert.rejects(run("process.stdout.write('partial'); process.exitCode=3", { stdoutFile: output }), code("COMMAND_FAILED"));
  assert.equal(await readFile(output, "utf8"), "partial");
  await assert.rejects(run("", { stdoutFile: output }), code("OUTPUT_EXISTS"));
});

test("stdin file and explicit stdin buffer are passed without a shell", async (t) => {
  const root = await fixture(t), input = path.join(root, "stdin.dump");
  await writeFile(input, "fixture", { mode: 0o600 });
  const script = "process.stdin.pipe(process.stdout)";
  assert.equal((await run(script, { stdinFile: input })).stdout.toString(), "fixture");
  assert.equal((await run(script, { stdinData: Buffer.from("buffer") })).stdout.toString(), "buffer");
  await assert.rejects(run(script, { stdinFile: input, stdinData: Buffer.from("x") }), code("INVALID_OPTIONS"));
});

test("scope lock excludes all run IDs, does not expire, releases only its own owner", async (t) => {
  const root = await fixture(t);
  const lock = await acquireBackupLock(root);
  await createBackupRunDirectory(root, "run-one-001");
  await createBackupRunDirectory(root, "run-two-001");
  await assert.rejects(acquireBackupLock(root), code("LOCK_HELD"));
  const owner = path.join(lock.path, "owner");
  const token = await readFile(owner, "utf8");
  await writeFile(owner, "replacement-owner-token");
  await assert.rejects(lock.release(), code("LOCK_NOT_OWNED"));
  await assert.rejects(acquireBackupLock(root), code("LOCK_HELD"));
  await writeFile(owner, token);
  await lock.release(); await lock.release();
  const next = await acquireBackupLock(root); await next.release();
});

test("a stale or foreign lock is never automatically removed", async (t) => {
  const root = await fixture(t), lock = path.join(root, ".backup.lock");
  await mkdir(lock, { mode: 0o700 });
  await assert.rejects(acquireBackupLock(root), code("LOCK_HELD"));
  assert.ok((await lstat(lock)).isDirectory());
});

test("concurrent lock attempts have exactly one winner", async (t) => {
  const root = await fixture(t);
  const results = await Promise.allSettled([acquireBackupLock(root), acquireBackupLock(root), acquireBackupLock(root)]);
  const winners = results.filter((result) => result.status === "fulfilled");
  assert.equal(winners.length, 1);
  for (const loser of results.filter((result) => result.status === "rejected")) assert.equal(loser.reason.code, "LOCK_HELD");
  await winners[0].value.release();
});

test("new run directory refuses overwrite and traversal", async (t) => {
  const root = await fixture(t);
  const result = await createBackupRunDirectory(root, "run-test-001");
  if (process.platform !== "win32") assert.equal((await lstat(result)).mode & 0o777, 0o700);
  await assert.rejects(createBackupRunDirectory(root, "run-test-001"), code("RUN_EXISTS"));
  for (const id of ["../escape", "x", "a/bbbbbbbb", "12345678..", "12345678:ads"]) await assert.rejects(createBackupRunDirectory(root, id), code("INVALID_RUN_ID"));
});

test("symlink/junction ancestors are rejected for locks and output", async (t) => {
  const root = await fixture(t), actual = path.join(root, "actual"), alias = path.join(root, "alias");
  await mkdir(actual, { mode: 0o700 });
  await symlink(actual, alias, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(acquireBackupLock(alias), code("UNSAFE_PATH"));
  await assert.rejects(run("", { stdoutFile: path.join(alias, "file") }), code("UNSAFE_PATH"));
  await assert.rejects(createBackupRunDirectory(alias, "run-test-001"), code("UNSAFE_PATH"));
});

test("final stdin symlink and non-private parents are rejected on POSIX", { skip: process.platform === "win32" }, async (t) => {
  const root = await fixture(t), target = path.join(root, "target"), alias = path.join(root, "alias");
  await writeFile(target, "private", { mode: 0o600 }); await symlink(target, alias);
  await assert.rejects(run("", { stdinFile: alias }), code("UNSAFE_PATH"));
  await chmod(root, 0o755);
  await assert.rejects(acquireBackupLock(root), code("PRIVATE_PATH_REQUIRED"));
  await assert.rejects(run("", { stdoutFile: path.join(root, "output") }), code("PRIVATE_PATH_REQUIRED"));
  await chmod(root, 0o700);
});

test("lock release refuses a replaced owner inode and leaves foreign file", async (t) => {
  const root = await fixture(t); const lock = await acquireBackupLock(root), owner = path.join(lock.path, "owner");
  const token = await readFile(owner);
  await unlink(owner); await writeFile(owner, token, { mode: 0o600 });
  // POSIX can immediately recycle an inode, so make the token different too.
  await writeFile(owner, "foreign-token");
  await assert.rejects(lock.release(), code("LOCK_NOT_OWNED"));
  assert.equal(await readFile(owner, "utf8"), "foreign-token");
});

test("uncertain interrupted process work requests caller retention while completed nonzero does not", async () => {
  for (const [script, options, expected, uncertain] of [
    ["setInterval(()=>{},1000)", { timeoutMs: 200, killGraceMs: 20 }, "COMMAND_TIMEOUT", true],
    ["process.stdout.write(Buffer.alloc(8192));setInterval(()=>{},1000)", { maxStdoutBytes: 64 }, "STDOUT_LIMIT", true],
    ["process.exitCode=3", {}, "COMMAND_FAILED", false],
  ]) {
    await assert.rejects(run(script, {}, options), error => {
      code(expected)(error);
      assert.equal(error.discardClientRequired, uncertain);
      return true;
    });
  }
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(run("", {}, { signal: aborted.signal }), error => {
    code("COMMAND_ABORTED")(error); assert.equal(error.discardClientRequired, true); return true;
  });
});
