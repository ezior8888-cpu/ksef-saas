import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createBackupDatabaseCommand, BackupDatabaseCommandError } from "./backup-database-command.mjs";
import { BackupRuntimeError } from "./backup-runtime.mjs";
import { prepareBackupPlan } from "./prepare-backup-plan.mjs";

const prepared = prepareBackupPlan({ schemaVersion: 1, scope: "preparation-only", pgContainer: "fixture_pg_1", stagingRoot: "/private-staging", credentialRoot: "/private-credentials" }, "run-fixture-001").sourceCommands;
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "f0-db-command-test-")); await chmod(root, 0o700);
  t.after(async () => {
    if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith("f0-db-command-test-")) throw new Error("Unsafe fixture cleanup");
    await rm(root, { recursive: true, force: true });
  });
  const identityFile = path.join(root, "identity"), knownHostsFile = path.join(root, "known_hosts");
  await writeFile(identityFile, "SYNTHETIC_NOT_A_KEY", { mode: 0o600 });
  await writeFile(knownHostsFile, "SYNTHETIC_NOT_A_HOST_KEY", { mode: 0o600 });
  return { root, config: { pgContainer: "fixture_pg_1", host: { hostname: "db.fixture.invalid", user: "root", port: 22, identityFile, knownHostsFile }, env: {} } };
}
const rejects = (expected) => (error) => {
  assert.ok(error instanceof BackupDatabaseCommandError); assert.equal(error.code, expected);
  assert.equal(error.cause, undefined); return true;
};

test("all five prepared commands become pinned SSH argv and one canonical remote command", async (t) => {
  const { config } = await fixture(t), calls = [];
  const result = { exitCode: 0, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), stdoutBytes: 10, stderrBytes: 0 };
  const adapter = createBackupDatabaseCommand({ ...config, command: async (command, context) => { calls.push({ command, context }); return result; } });
  const signal = new AbortController().signal;
  for (const plan of prepared) assert.equal(await adapter(plan, { signal, timeoutMs: 1000 }), result);
  assert.equal(calls.length, 5);
  for (let i = 0; i < calls.length; i++) {
    const { command, context } = calls[i], plan = prepared[i];
    assert.equal(command.executable, "ssh"); assert.deepEqual(command.env, {});
    assert.deepEqual(command.args.slice(0, 7), ["-F", "/dev/null", "-T", "-p", "22", "-i", config.host.identityFile]);
    for (const flag of ["BatchMode=yes", "StrictHostKeyChecking=yes", "UserKnownHostsFile=" + config.host.knownHostsFile,
      "GlobalKnownHostsFile=/dev/null", "IdentitiesOnly=yes", "IdentityAgent=none", "ForwardAgent=no", "ClearAllForwardings=yes",
      "PasswordAuthentication=no", "KbdInteractiveAuthentication=no", "PermitLocalCommand=no", "ProxyCommand=none", "ProxyJump=none",
      "ControlMaster=no", "ControlPath=none", "UpdateHostKeys=no"]) assert.ok(command.args.includes(flag), flag);
    assert.equal(command.args.at(-2), "root@db.fixture.invalid");
    assert.equal(command.args.at(-1), ["/usr/bin/docker", ...plan.args].map((arg) => "'" + arg + "'").join(" "));
    assert.equal(command.stdoutFile, plan.stdoutFile); assert.equal(command.stdinFile, plan.stdinFile);
    assert.equal(context.signal, signal); assert.equal(context.timeoutMs, 1000);
    assert.equal(context.maxStdoutBytes, plan.id.startsWith("dump-") && plan.id !== "dump-globals" ? 32 * 1024 ** 3 : 64 * 1024 ** 2);
  }
});

test("factory and imports have no command/network side effects; settings are captured", async (t) => {
  const { config } = await fixture(t); let calls = 0;
  const adapter = createBackupDatabaseCommand({ ...config, command: async (command) => { calls++; assert.equal(command.args.at(-2), "root@db.fixture.invalid"); assert.deepEqual(command.env, {}); return { exitCode: 0 }; } });
  assert.equal(calls, 0);
  config.host.hostname = "replacement.invalid"; config.env.ADDED_LATER = "ignored";
  await adapter(prepared[0], { timeoutMs: 1000 }); assert.equal(calls, 1);
});

test("unreviewed arguments, host, container, command and output variations fail before command", async (t) => {
  const { config } = await fixture(t); let calls = 0;
  const adapter = createBackupDatabaseCommand({ ...config, command: async () => { calls++; } });
  const dump = prepared[0], inspect = prepared[1];
  const cases = [
    { ...dump, args: [...dump.args, "--file=/tmp/unsafe"] }, { ...dump, args: ["exec", "other_container", ...dump.args.slice(2)] },
    { ...dump, args: ["exec", config.pgContainer, "sh", "-c", "id"] }, { ...dump, executable: "ssh" },
    { ...dump, host: "ops-1" }, { ...dump, requiredExitCode: 3 }, { ...dump, outputMustBeNew: false },
    { ...dump, stdoutFile: "/private-staging/other.sql" }, { ...dump, stdinFile: "/private-staging/input" },
    { ...dump, id: "toString" }, { ...dump, env: { INJECTED: "yes" } },
    { ...inspect, stdinFile: "/private-staging/_supabase.dump" }, { ...inspect, stdoutFile: inspect.stdoutFile + ".other" },
  ];
  for (const candidate of cases) await assert.rejects(adapter(candidate, { timeoutMs: 1000 }), rejects("INVALID_DATABASE_COMMAND"));
  assert.equal(calls, 0);
});

test("SSH config refuses injection, weak user/port settings and absent explicit env", async (t) => {
  const { config } = await fixture(t);
  const invalid = [
    { ...config, env: undefined }, { ...config, pgContainer: "pg;id" },
    ...[{ hostname: "db;id" }, { hostname: "-oProxyCommand=id" }, { hostname: "db\ninvalid" }, { user: "operator" }, { port: 2222 },
      { identityFile: "relative" }, { knownHostsFile: "/tmp/host%h" }, { knownHostsFile: "/tmp/host file" }].map((host) => ({ ...config, host: { ...config.host, ...host } })),
  ];
  for (const candidate of invalid) assert.throws(() => createBackupDatabaseCommand(candidate), rejects("INVALID_DATABASE_TRANSPORT"));
});

test("timeouts and untrusted command failures require retaining remote uncertainty", async (t) => {
  const { config } = await fixture(t);
  for (const failure of [new BackupRuntimeError("COMMAND_TIMEOUT"), new BackupRuntimeError("COMMAND_ABORTED"), new Error("PRIVATE_SSH_KEY_PATH_AND_OUTPUT")]) {
    const adapter = createBackupDatabaseCommand({ ...config, command: async () => { throw failure; } });
    await assert.rejects(adapter(prepared[0], { timeoutMs: 1000 }), (error) => {
      assert.equal(error.remoteMayStillRun, true); assert.equal(error.discardClientRequired, true);
      assert.equal(error.message.includes("PRIVATE"), false); assert.equal(error.cause, undefined); return true;
    });
  }
  const adapter = createBackupDatabaseCommand({ ...config, command: async () => ({ exitCode: 1, stderr: "PRIVATE" }) });
  await assert.rejects(adapter(prepared[0], { timeoutMs: 1000 }), (error) => error.code === "DATABASE_COMMAND_FAILED" && error.remoteMayStillRun === true);
});

test("credential files must exist and remain private ordinary files", async (t) => {
  const { root, config } = await fixture(t); let calls = 0;
  const command = async () => { calls++; };
  await writeFile(config.host.identityFile, "");
  await assert.rejects(createBackupDatabaseCommand({ ...config, command })(prepared[0], { timeoutMs: 1000 }), rejects("UNSAFE_SSH_CREDENTIAL_FILE"));
  const absent = createBackupDatabaseCommand({ ...config, host: { ...config.host, identityFile: path.join(root, "absent") }, command });
  await assert.rejects(absent(prepared[0], { timeoutMs: 1000 }), rejects("UNSAFE_SSH_CREDENTIAL_FILE"));
  assert.equal(calls, 0);
});

test("credential symlink/junction parents are refused", async (t) => {
  const { root, config } = await fixture(t), actual = path.join(root, "actual"), alias = path.join(root, "alias");
  await mkdir(actual, { mode: 0o700 }); await writeFile(path.join(actual, "identity"), "fake", { mode: 0o600 });
  await symlink(actual, alias, process.platform === "win32" ? "junction" : "dir");
  const adapter = createBackupDatabaseCommand({ ...config, host: { ...config.host, identityFile: path.join(alias, "identity") }, command: async () => { assert.fail("must not run"); } });
  await assert.rejects(adapter(prepared[0], { timeoutMs: 1000 }), rejects("UNSAFE_SSH_CREDENTIAL_FILE"));
});

test("POSIX world-readable credentials are refused", { skip: process.platform === "win32" }, async (t) => {
  const { config } = await fixture(t); await chmod(config.host.identityFile, 0o644);
  const adapter = createBackupDatabaseCommand({ ...config, command: async () => { assert.fail("must not run"); } });
  await assert.rejects(adapter(prepared[0], { timeoutMs: 1000 }), rejects("UNSAFE_SSH_CREDENTIAL_FILE"));
});

test("directories cannot be used as either SSH credential file", async (t) => {
  const { root, config } = await fixture(t), directory = path.join(root, "credential-directory");
  await mkdir(directory, { mode: 0o700 });
  for (const field of ["identityFile", "knownHostsFile"]) {
    const adapter = createBackupDatabaseCommand({ ...config, host: { ...config.host, [field]: directory }, command: async () => { assert.fail("must not run"); } });
    await assert.rejects(adapter(prepared[0], { timeoutMs: 1000 }), rejects("UNSAFE_SSH_CREDENTIAL_FILE"));
  }
});

test("oversized files cannot be used as either SSH credential file", async (t) => {
  const { root, config } = await fixture(t), oversized = path.join(root, "oversized-credential");
  await writeFile(oversized, Buffer.alloc(1024 ** 2 + 1), { mode: 0o600 });
  for (const field of ["identityFile", "knownHostsFile"]) {
    const adapter = createBackupDatabaseCommand({ ...config, host: { ...config.host, [field]: oversized }, command: async () => { assert.fail("must not run"); } });
    await assert.rejects(adapter(prepared[0], { timeoutMs: 1000 }), rejects("UNSAFE_SSH_CREDENTIAL_FILE"));
  }
});

test("POSIX final credential symlinks are refused even when the target is private", { skip: process.platform === "win32" }, async (t) => {
  const { root, config } = await fixture(t);
  for (const field of ["identityFile", "knownHostsFile"]) {
    const alias = path.join(root, field + "-alias");
    await symlink(config.host[field], alias, "file");
    const adapter = createBackupDatabaseCommand({ ...config, host: { ...config.host, [field]: alias }, command: async () => { assert.fail("must not run"); } });
    await assert.rejects(adapter(prepared[0], { timeoutMs: 1000 }), rejects("UNSAFE_SSH_CREDENTIAL_FILE"));
  }
});

test("POSIX immediate credential parents must remain private", { skip: process.platform === "win32" }, async (t) => {
  const { root, config } = await fixture(t), directory = path.join(root, "public-parent");
  await mkdir(directory, { mode: 0o700 });
  const credential = path.join(directory, "credential");
  await writeFile(credential, "SYNTHETIC_PRIVATE_FILE", { mode: 0o600 });
  await chmod(directory, 0o755);
  for (const field of ["identityFile", "knownHostsFile"]) {
    const adapter = createBackupDatabaseCommand({ ...config, host: { ...config.host, [field]: credential }, command: async () => { assert.fail("must not run"); } });
    await assert.rejects(adapter(prepared[0], { timeoutMs: 1000 }), rejects("UNSAFE_SSH_CREDENTIAL_FILE"));
  }
});
