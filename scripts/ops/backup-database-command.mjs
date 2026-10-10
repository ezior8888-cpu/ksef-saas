/** Prepared SSH transport for the five reviewed PostgreSQL dump/list commands.
 * No import-time I/O or network. Invocation is an explicit execution boundary.
 * A local SSH failure never proves that its remote docker exec has stopped.
 */
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import path from "node:path";
import { BackupRuntimeError, runBackupCommand } from "./backup-runtime.mjs";

const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const COMMANDS = Object.freeze({
  "dump-postgres": { database: "postgres", action: "dump" },
  "inspect-postgres": { database: "postgres", action: "inspect" },
  "dump-_supabase": { database: "_supabase", action: "dump" },
  "inspect-_supabase": { database: "_supabase", action: "inspect" },
  "dump-globals": { action: "globals" },
});
const CODES = new Set(["INVALID_DATABASE_TRANSPORT", "INVALID_DATABASE_COMMAND", "UNSAFE_SSH_CREDENTIAL_FILE", "DATABASE_COMMAND_FAILED"]);
export class BackupDatabaseCommandError extends Error {
  constructor(code, remoteMayStillRun = false) {
    const safe = CODES.has(code) ? code : "DATABASE_COMMAND_FAILED";
    super("Backup database command incomplete: " + safe);
    this.name = "BackupDatabaseCommandError"; this.code = safe;
    this.remoteMayStillRun = remoteMayStillRun;
    this.discardClientRequired = remoteMayStillRun;
  }
}
const fail = (code) => { throw new BackupDatabaseCommandError(code); };
const local = (value) => typeof value === "string" && path.isAbsolute(value) && !value.includes("\0")
  && !value.startsWith("\\\\") && !value.startsWith("//");
const quote = (argument) => "'" + argument.replaceAll("'", "'\\''") + "'";

function validateConfig(config) {
  if (!record(config) || typeof config.pgContainer !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(config.pgContainer)
    || !record(config.host) || config.host.user !== "root" || config.host.port !== 22
    || typeof config.host.hostname !== "string" || config.host.hostname.length > 253
    || !config.host.hostname.split(".").every((part) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(part))
    || !record(config.env) || Object.entries(config.env).some(([key, value]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof value !== "string" || value.includes("\0"))
    || (config.command !== undefined && typeof config.command !== "function")) fail("INVALID_DATABASE_TRANSPORT");
  for (const filename of [config.host.identityFile, config.host.knownHostsFile]) {
    // -o values use SSH's own configuration parser, so forbid its whitespace,
    // quotes, token expansion and control characters in these local paths.
    if (!local(filename) || /[\s'"%]/.test(filename) || /[\x00-\x1f\x7f]/.test(filename)
      || (process.platform === "win32" && filename.slice(2).includes(":"))) fail("INVALID_DATABASE_TRANSPORT");
  }
}
async function credentialFile(filename) {
  let cursor = path.dirname(path.resolve(filename));
  const immediate = cursor;
  while (true) {
    const stat = await lstat(cursor);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail("UNSAFE_SSH_CREDENTIAL_FILE");
    if (cursor === immediate && process.platform !== "win32" && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid())) fail("UNSAFE_SSH_CREDENTIAL_FILE");
    const parent = path.dirname(cursor); if (parent === cursor) break; cursor = parent;
  }
  const entry = await lstat(filename);
  if (!entry.isFile() || entry.isSymbolicLink()) fail("UNSAFE_SSH_CREDENTIAL_FILE");
  const handle = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > 1024 ** 2
      || (process.platform !== "win32" && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid()))) fail("UNSAFE_SSH_CREDENTIAL_FILE");
  } finally { await handle.close(); }
}
function canonicalArgs(container, definition) {
  if (definition.action === "inspect") return ["exec", "-i", container, "pg_restore", "--list"];
  if (definition.action === "globals") return ["exec", container, "pg_dumpall", "--username=supabase_admin", "--no-password", "--globals-only"];
  return ["exec", container, "pg_dump", "--username=supabase_admin", "--no-password", "--dbname=" + definition.database, "--format=custom", "--compress=6"];
}
function validateCommand(spec, container) {
  if (!record(spec) || !Object.hasOwn(COMMANDS, spec.id) || spec.host !== "db-1" || spec.executable !== "docker"
    || spec.requiredExitCode !== 0 || spec.outputMustBeNew !== true || !local(spec.stdoutFile)) fail("INVALID_DATABASE_COMMAND");
  const definition = COMMANDS[spec.id], canonical = canonicalArgs(container, definition);
  const keys = ["id", "host", "executable", "args", "requiredExitCode", "stdoutFile", "outputMustBeNew", ...(definition.action === "inspect" ? ["stdinFile"] : [])];
  if (Object.keys(spec).some((key) => !keys.includes(key)) || !Array.isArray(spec.args)
    || spec.args.length !== canonical.length || spec.args.some((arg, index) => arg !== canonical[index])) fail("INVALID_DATABASE_COMMAND");
  const filename = definition.action === "globals" ? "globals.sql" : definition.database + ".dump";
  if (definition.action === "inspect") {
    if (!local(spec.stdinFile) || path.basename(spec.stdinFile) !== filename || spec.stdoutFile !== spec.stdinFile + ".toc") fail("INVALID_DATABASE_COMMAND");
  } else if (path.basename(spec.stdoutFile) !== filename || spec.stdinFile !== undefined) fail("INVALID_DATABASE_COMMAND");
  return { definition, canonical };
}

export function createBackupDatabaseCommand(config) {
  validateConfig(config);
  // Capture a private copy: callers cannot mutate validated transport settings.
  const pgContainer = config.pgContainer, host = { ...config.host }, env = { ...config.env };
  const command = config.command ?? runBackupCommand;
  return async (spec, context) => {
    const { definition, canonical } = validateCommand(spec, pgContainer);
    try { await credentialFile(host.identityFile); await credentialFile(host.knownHostsFile); }
    catch { throw new BackupDatabaseCommandError("UNSAFE_SSH_CREDENTIAL_FILE"); }
    const sshArgs = [
      "-F", "/dev/null", "-T", "-p", "22", "-i", host.identityFile,
      "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
      "-o", "UserKnownHostsFile=" + host.knownHostsFile, "-o", "GlobalKnownHostsFile=/dev/null",
      "-o", "IdentitiesOnly=yes", "-o", "IdentityAgent=none",
      "-o", "PreferredAuthentications=publickey", "-o", "PasswordAuthentication=no",
      "-o", "KbdInteractiveAuthentication=no", "-o", "GSSAPIAuthentication=no", "-o", "HostbasedAuthentication=no",
      "-o", "ForwardAgent=no", "-o", "ClearAllForwardings=yes", "-o", "PermitLocalCommand=no",
      "-o", "ProxyCommand=none", "-o", "ProxyJump=none", "-o", "ControlMaster=no", "-o", "ControlPath=none",
      "-o", "UpdateHostKeys=no", "-o", "ConnectTimeout=15", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=2",
      host.user + "@" + host.hostname,
      ["/usr/bin/docker", ...canonical].map(quote).join(" "),
    ];
    try {
      const result = await command({ executable: "ssh", args: sshArgs, env: { ...env },
        stdoutFile: spec.stdoutFile, ...(spec.stdinFile === undefined ? {} : { stdinFile: spec.stdinFile }) }, {
        ...context, maxStdoutBytes: context?.maxStdoutBytes ?? (definition.action === "dump" ? 32 * 1024 ** 3 : 64 * 1024 ** 2),
      });
      if (!result || result.exitCode !== 0) throw new BackupDatabaseCommandError("DATABASE_COMMAND_FAILED");
      return result;
    } catch (error) {
      const failure = error instanceof BackupRuntimeError ? error : new BackupDatabaseCommandError("DATABASE_COMMAND_FAILED", true);
      failure.remoteMayStillRun = true; failure.discardClientRequired = true;
      throw failure;
    }
  };
}
