/**
 * Closed Docker resume transport; imports and factory never contact a host.
 * Only exact, factory-allowlisted container IDs can be inspected/started or have
 * their restart policy restored. This is not a freeze provider, readiness
 * decision, compare-and-swap, or proof that all writers have resumed.
 *
 * The caller owns the durable action journal, original/held-state comparison,
 * dependency order, exclusive-control proof and post-mutation readback. Docker
 * has no atomic compare-before-start API. On any dispatched failure the caller
 * must retain uncertainty and must not retry or roll back blindly.
 *
 * Inspect needs existing remote /usr/bin/python3 and local Docker socket access.
 * It hashes Config + HostConfig minus RestartPolicy on the remote host; secrets
 * and raw Docker inspect/health logs are never sent back. This hash does not
 * cover volume contents or live network state. Those require exclusive control.
 * Local SSH files and ancestors must remain stable while OpenSSH reopens them.
 * Windows fixtures do not prove production ACL/process/SSH behavior.
 */
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { runBackupCommand } from './backup-runtime.mjs';

const HASH = /^[a-f0-9]{64}$/;
const MAX_TIMEOUT_MS = 300000;
const MAX_STDOUT = 16 * 1024;
const MAX_STDERR = 4096;
const STATES = new Set(['created', 'running', 'paused', 'restarting', 'removing', 'exited', 'dead']);
const POLICIES = new Set(['no', 'always', 'unless-stopped', 'on-failure']);
const CODES = new Set(['INVALID_RESUME_DOCKER_TRANSPORT', 'INVALID_RESUME_DOCKER_COMMAND',
  'UNSAFE_RESUME_DOCKER_SSH_FILE', 'RESUME_DOCKER_AUTHORIZATION_REQUIRED',
  'RESUME_DOCKER_SYNTHETIC_COMMAND_REQUIRED', 'RESUME_DOCKER_UNSUPPORTED_PLATFORM',
  'RESUME_DOCKER_ABORTED', 'RESUME_DOCKER_TIMEOUT', 'RESUME_DOCKER_COMMAND_FAILED',
  'RESUME_DOCKER_INVALID_RESPONSE']);
const FIELDS = ['containerId', 'imageId', 'createdAtUtc', 'configDigest', 'running', 'paused',
  'restarting', 'dead', 'autoRemove', 'status', 'health', 'healthcheckConfigured',
  'restartPolicy', 'restartCount', 'startedAtUtc', 'finishedAtUtc'];
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
class ResumeDockerError extends Error {
  constructor(code, dispatched = false) {
    const safe = CODES.has(code) ? code : 'RESUME_DOCKER_COMMAND_FAILED';
    super('Backup service resume incomplete: ' + safe);
    this.name = 'ResumeDockerError';
    this.code = safe;
    this.remoteMayStillRun = dispatched;
    this.discardClientRequired = dispatched;
  }
}
const fail = code => { throw new ResumeDockerError(code); };

function localPath(value) {
  return typeof value === 'string' && path.isAbsolute(value) && path.resolve(value) === value
    && value !== path.parse(value).root && !value.startsWith('\\\\') && !value.startsWith('//')
    && !/[\s'"%\x00-\x1f\x7f]/.test(value)
    && (process.platform !== 'win32' || !value.slice(2).includes(':'));
}
function configuration(config) {
  if (!record(config) || Object.keys(config).some(key => !['host', 'containerIds', 'command'].includes(key))
    || !exactKeys(config.host, ['hostname', 'user', 'port', 'identityFile', 'knownHostsFile'])
    || !Array.isArray(config.containerIds) || config.containerIds.length < 1 || config.containerIds.length > 128
    || config.containerIds.some(id => typeof id !== 'string' || !HASH.test(id))
    || new Set(config.containerIds).size !== config.containerIds.length
    || (config.command !== undefined && typeof config.command !== 'function')) fail('INVALID_RESUME_DOCKER_TRANSPORT');
  const host = config.host;
  if (typeof host.hostname !== 'string' || host.hostname.length > 253
    || !host.hostname.split('.').every(part => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(part))
    || typeof host.user !== 'string' || !/^[a-z_][a-z0-9_-]{0,31}$/.test(host.user)
    || !Number.isSafeInteger(host.port) || host.port < 1 || host.port > 65535
    || !localPath(host.identityFile) || !localPath(host.knownHostsFile)) fail('INVALID_RESUME_DOCKER_TRANSPORT');
}
const sameFile = (left, right) => left.dev === right.dev && left.ino === right.ino
  && left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
function privateFileStat(stat) {
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size < 1 || stat.size > 1024 ** 2
    || (process.platform !== 'win32' && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid()))) fail('UNSAFE_RESUME_DOCKER_SSH_FILE');
}
async function privateSshFile(filename) {
  let cursor = path.dirname(filename); const immediate = cursor;
  while (true) {
    const stat = await lstat(cursor);
    if (!stat.isDirectory() || stat.isSymbolicLink()
      || (cursor === immediate && process.platform !== 'win32' && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid()))) fail('UNSAFE_RESUME_DOCKER_SSH_FILE');
    const parent = path.dirname(cursor); if (parent === cursor) break; cursor = parent;
  }
  const before = await lstat(filename);
  privateFileStat(before);
  const handle = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const opened = await handle.stat(); privateFileStat(opened);
    if (!sameFile(before, opened)) fail('UNSAFE_RESUME_DOCKER_SSH_FILE');
  } finally { await handle.close(); }
  const after = await lstat(filename); privateFileStat(after);
  if (!sameFile(before, after)) fail('UNSAFE_RESUME_DOCKER_SSH_FILE');
}
function policy(value) {
  return exactKeys(value, ['name', 'maximumRetryCount']) && POLICIES.has(value.name)
    && Number.isSafeInteger(value.maximumRetryCount) && value.maximumRetryCount >= 0 && value.maximumRetryCount <= 1000000
    && (value.name === 'on-failure' || value.maximumRetryCount === 0);
}
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 19) === value.slice(0, 19);
}
function parseSnapshot(stdout, containerId) {
  let value;
  try { value = JSON.parse(stdout.toString('utf8')); } catch { fail('RESUME_DOCKER_INVALID_RESPONSE'); }
  if (!exactKeys(value, FIELDS) || value.containerId !== containerId || typeof value.configDigest !== 'string' || !HASH.test(value.configDigest)
    || typeof value.imageId !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value.imageId)
    || ['running', 'paused', 'restarting', 'dead', 'autoRemove', 'healthcheckConfigured'].some(key => typeof value[key] !== 'boolean')
    || !STATES.has(value.status) || ![null, 'healthy', 'starting', 'unhealthy'].includes(value.health)
    || !policy(value.restartPolicy) || !Number.isSafeInteger(value.restartCount) || value.restartCount < 0
    || !['createdAtUtc', 'startedAtUtc', 'finishedAtUtc'].every(key => timestamp(value[key]))) fail('RESUME_DOCKER_INVALID_RESPONSE');
  return Object.freeze({ ...value, restartPolicy: Object.freeze({ ...value.restartPolicy }) });
}

// This literal is the only remote inspection program; no caller-supplied code,
// field selector, executable, Docker context or environment is accepted.
const INSPECT_PROGRAM = String.raw`
import datetime, hashlib, json, math, os, re, selectors, signal, subprocess, sys, time

def check(condition):
    if not condition:
        raise RuntimeError("invalid inspect")

def number(value, maximum=9007199254740991):
    check(type(value) is int and 0 <= value <= maximum)
    return value

def boolean(value):
    check(type(value) is bool)
    return value

def timestamp(value):
    check(isinstance(value, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z", value))
    datetime.datetime.strptime(value[:19], "%Y-%m-%dT%H:%M:%S")
    return value

def snapshot(raw, container_id):
    check(isinstance(raw, dict) and raw.get("Id") == container_id)
    config, host, state = raw.get("Config"), raw.get("HostConfig"), raw.get("State")
    check(isinstance(config, dict) and isinstance(host, dict) and isinstance(state, dict))
    image = raw.get("Image")
    check(isinstance(image, str) and re.fullmatch(r"sha256:[a-f0-9]{64}", image))
    restart = host.get("RestartPolicy")
    check(isinstance(restart, dict) and restart.get("Name") in ("no", "always", "unless-stopped", "on-failure"))
    retry = number(restart.get("MaximumRetryCount"), 1000000)
    check(restart["Name"] == "on-failure" or retry == 0)
    status = state.get("Status")
    check(status in ("created", "running", "paused", "restarting", "removing", "exited", "dead"))
    health = state.get("Health") or {}
    check(isinstance(health, dict) and health.get("Status") in (None, "healthy", "starting", "unhealthy"))
    healthcheck = config.get("Healthcheck") or {}
    check(isinstance(healthcheck, dict))
    probe = healthcheck.get("Test") or []
    check(isinstance(probe, list) and all(isinstance(item, str) for item in probe))
    canonical = {"Config": config, "HostConfig": {key: value for key, value in host.items() if key != "RestartPolicy"}}
    digest = hashlib.sha256(json.dumps(canonical, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False).encode("utf-8")).hexdigest()
    return {
        "containerId": container_id, "imageId": image, "configDigest": digest,
        "createdAtUtc": timestamp(raw.get("Created")),
        "running": boolean(state.get("Running")), "paused": boolean(state.get("Paused")),
        "restarting": boolean(state.get("Restarting")), "dead": boolean(state.get("Dead")),
        "autoRemove": boolean(host.get("AutoRemove")), "status": status,
        "health": health.get("Status"), "healthcheckConfigured": bool(probe and probe[0] != "NONE"),
        "restartPolicy": {"name": restart["Name"], "maximumRetryCount": retry},
        "restartCount": number(raw.get("RestartCount")),
        "startedAtUtc": timestamp(state.get("StartedAt")), "finishedAtUtc": timestamp(state.get("FinishedAt")),
    }

def read_inspect(container_id, timeout):
    check(isinstance(container_id, str) and re.fullmatch(r"[a-f0-9]{64}", container_id))
    check(isinstance(timeout, (int, float)) and math.isfinite(timeout) and 0 < timeout <= 300)
    deadline = time.monotonic() + timeout
    process = subprocess.Popen(
        ["/usr/bin/docker", "--host=unix:///var/run/docker.sock", "inspect", "--type=container", "--", container_id],
        stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        env={"PATH": "/usr/bin:/bin", "LANG": "C", "LC_ALL": "C"},
        start_new_session=True, close_fds=True)
    selector = selectors.DefaultSelector()
    try:
        os.set_blocking(process.stdout.fileno(), False)
        selector.register(process.stdout, selectors.EVENT_READ)
        output = bytearray()
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise RuntimeError("inspect timeout")
            events = selector.select(remaining)
            if not events:
                raise RuntimeError("inspect timeout")
            chunk = os.read(process.stdout.fileno(), 65536)
            if not chunk:
                break
            if len(output) + len(chunk) > 1024 * 1024:
                raise RuntimeError("inspect output limit")
            output.extend(chunk)
        remaining = deadline - time.monotonic()
        if remaining <= 0 or process.wait(timeout=remaining) != 0:
            raise RuntimeError("inspect failed")
        raw = json.loads(output)
        check(isinstance(raw, list) and len(raw) == 1)
        return snapshot(raw[0], container_id)
    except BaseException:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        try:
            process.wait(timeout=1)
        except subprocess.TimeoutExpired:
            pass
        raise RuntimeError("inspect failed") from None
    finally:
        selector.close()
        process.stdout.close()

def main():
    check(len(sys.argv) == 3)
    value = read_inspect(sys.argv[1], float(sys.argv[2]))
    output = json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)
    check(len(output.encode("utf-8")) <= 16384)
    sys.stdout.write(output + "\n")

if __name__ == "__main__":
    try:
        main()
    except BaseException:
        sys.stderr.write("RESUME_DOCKER_INSPECT_FAILED\n")
        sys.exit(1)
`;

function sshArguments(host, remote) {
  return [
    '-F', '/dev/null', '-T', '-p', String(host.port), '-i', host.identityFile,
    '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
    '-o', 'UserKnownHostsFile=' + host.knownHostsFile, '-o', 'GlobalKnownHostsFile=/dev/null',
    '-o', 'IdentitiesOnly=yes', '-o', 'IdentityAgent=none',
    '-o', 'PreferredAuthentications=publickey', '-o', 'PasswordAuthentication=no',
    '-o', 'KbdInteractiveAuthentication=no', '-o', 'GSSAPIAuthentication=no', '-o', 'HostbasedAuthentication=no',
    '-o', 'ForwardAgent=no', '-o', 'ClearAllForwardings=yes', '-o', 'PermitLocalCommand=no',
    '-o', 'ProxyCommand=none', '-o', 'ProxyJump=none', '-o', 'ControlMaster=no', '-o', 'ControlPath=none',
    '-o', 'UpdateHostKeys=no', '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=2',
    host.user + '@' + host.hostname, remote.map(quote).join(' '),
  ];
}

/** inspect({containerId},ctx) -> validated snapshot.
 * start({containerId},ctx) / updateRestartPolicy({containerId,restartPolicy},ctx)
 * -> {containerId,operation}; successful command output is NOT ready/restored.
 * ctx: {mode,timeoutMs,signal?,authorization:{resumeWrites:true}}; authorization
 * is required only for mutation. Synthetic mode requires an injected command.
 * The default command can run only in separately-authorized mode on Linux.
 */
export function createBackupResumeDockerTransport(config) {
  configuration(config);
  const host = { ...config.host }, ids = new Set(config.containerIds), command = config.command ?? runBackupCommand;
  async function invoke(operation, spec, context = {}) {
    const started = performance.now();
    const mutation = operation !== 'inspect';
    if (!exactKeys(spec, operation === 'updateRestartPolicy' ? ['containerId', 'restartPolicy'] : ['containerId'])
      || !ids.has(spec.containerId) || (operation === 'updateRestartPolicy' && !policy(spec.restartPolicy))
      || !record(context) || !['synthetic', 'separately-authorized'].includes(context.mode)
      || !Number.isSafeInteger(context.timeoutMs) || context.timeoutMs < 1 || context.timeoutMs > MAX_TIMEOUT_MS
      || (context.signal !== undefined && !(context.signal instanceof AbortSignal))) fail('INVALID_RESUME_DOCKER_COMMAND');
    if (mutation && context.authorization?.resumeWrites !== true) fail('RESUME_DOCKER_AUTHORIZATION_REQUIRED');
    if (command === runBackupCommand && context.mode !== 'separately-authorized') fail('RESUME_DOCKER_SYNTHETIC_COMMAND_REQUIRED');
    if (command === runBackupCommand && process.platform !== 'linux') fail('RESUME_DOCKER_UNSUPPORTED_PLATFORM');
    const containerId = spec.containerId, timeoutMs = context.timeoutMs, externalSignal = context.signal;
    const restart = operation === 'updateRestartPolicy' ? spec.restartPolicy.name
      + (spec.restartPolicy.name === 'on-failure' && spec.restartPolicy.maximumRetryCount > 0 ? ':' + spec.restartPolicy.maximumRetryCount : '') : null;
    if (externalSignal?.aborted) fail('RESUME_DOCKER_ABORTED');
    const controller = new AbortController();
    let dispatched = false, reason, timer, rejectInterruption;
    const interrupted = new Promise((_, reject) => { rejectInterruption = reject; });
    const interrupt = code => {
      reason ??= code;
      controller.abort();
      rejectInterruption(new ResumeDockerError(reason, dispatched));
    };
    const abort = () => interrupt('RESUME_DOCKER_ABORTED');
    const checkpoint = () => {
      if (reason) throw new ResumeDockerError(reason, dispatched);
      if (externalSignal?.aborted) throw new ResumeDockerError('RESUME_DOCKER_ABORTED', dispatched);
      if (performance.now() - started >= timeoutMs) throw new ResumeDockerError('RESUME_DOCKER_TIMEOUT', dispatched);
    };
    externalSignal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => interrupt('RESUME_DOCKER_TIMEOUT'), Math.max(1, timeoutMs - (performance.now() - started)));
    const work = async () => {
      checkpoint();
      try { await privateSshFile(host.identityFile); await privateSshFile(host.knownHostsFile); }
      catch { checkpoint(); fail('UNSAFE_RESUME_DOCKER_SSH_FILE'); }
      checkpoint();
      const remaining = Math.floor(timeoutMs - (performance.now() - started));
      if (remaining < 1) fail('RESUME_DOCKER_TIMEOUT');
      const remote = ['/usr/bin/env', '-i', 'PATH=/usr/bin:/bin', 'LANG=C', 'LC_ALL=C'];
      if (operation === 'inspect') remote.push('/usr/bin/python3', '-I', '-c', INSPECT_PROGRAM, containerId, String(remaining / 1000));
      else remote.push('/usr/bin/docker', '--host=unix:///var/run/docker.sock', operation === 'start' ? 'start' : 'update',
        ...(operation === 'start' ? [] : ['--restart=' + restart]), '--', containerId);
      dispatched = true;
      const result = await command({ executable: 'ssh', args: sshArguments(host, remote), env: {} },
        { signal: controller.signal, timeoutMs: remaining, maxStdoutBytes: MAX_STDOUT, maxStderrBytes: MAX_STDERR });
      checkpoint();
      if (!record(result) || result.exitCode !== 0) fail('RESUME_DOCKER_COMMAND_FAILED');
      if (!Buffer.isBuffer(result.stdout) || result.stdout.length > MAX_STDOUT) fail('RESUME_DOCKER_INVALID_RESPONSE');
      if (operation === 'inspect') return parseSnapshot(result.stdout, containerId);
      if (![containerId, containerId + '\n', containerId + '\r\n'].includes(result.stdout.toString('utf8'))) fail('RESUME_DOCKER_INVALID_RESPONSE');
      return Object.freeze({ containerId, operation });
    };
    try { return await Promise.race([work(), interrupted]); }
    catch (error) {
      controller.abort();
      throw new ResumeDockerError(error instanceof ResumeDockerError ? error.code : 'RESUME_DOCKER_COMMAND_FAILED', dispatched);
    } finally {
      clearTimeout(timer); externalSignal?.removeEventListener('abort', abort);
    }
  }
  return Object.freeze({
    inspect: (spec, context) => invoke('inspect', spec, context),
    start: (spec, context) => invoke('start', spec, context),
    updateRestartPolicy: (spec, context) => invoke('updateRestartPolicy', spec, context),
  });
}
