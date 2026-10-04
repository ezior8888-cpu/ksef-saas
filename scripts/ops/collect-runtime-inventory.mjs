#!/usr/bin/env node
/**
 * F0 read-only runtime collector. Imports are inert; only an explicit CLI run
 * connects. Uses existing SSH, trusted known-hosts and remote python3.
 */
import { execFileSync } from "node:child_process";
import { closeSync, existsSync, fstatSync, lstatSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const INFRA_KEYS = new Set(["K", "APP", "OPS", "DB", "PGC", "RESTC", "APP_PREFIX", "WORKER_PREFIX"]);
const ENV_ENUMS = {
  NODE_ENV: ["development", "test", "production"],
  NEXT_PUBLIC_APP_ENV: ["development", "staging", "production"],
  APP_ENV: ["development", "staging", "production"],
  R2_FORCE_PATH_STYLE: ["true", "false"],
  KSEF_ENV: ["test", "demo", "production"],
  JOBS_BACKEND: ["inngest", "pgboss"],
};
const CREDENTIAL_KEYS = [
  "DATABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY", "UPSTASH_REDIS_REST_TOKEN", "SENTRY_DSN",
  "NEXT_PUBLIC_SENTRY_DSN", "HEALTHCHECKS_PING_URL", "HEALTHCHECK_PING_URL", "OPS_HEARTBEAT_URL",
  "PUSHOVER_TOKEN", "PUSHOVER_USER", "DD_API_KEY", "DATADOG_API_KEY",
  "TELEGRAM_BOT_TOKEN", "RESEND_API_KEY", "KSEF_CREDENTIALS_ENCRYPTION_KEY",
  "STRIPE_SECRET_KEY", "ANTHROPIC_API_KEY",
];
const ROLES = new Set([
  "web", "worker", "postgres", "postgrest", "gotrue", "minio", "valkey",
  "redis", "redis-rest", "coolify", "gateway", "supabase-storage",
  "supabase-realtime", "supabase-studio", "supabase-meta", "log-collector", "unclassified",
]);
const SAFE_HOST = /^(?:[A-Za-z_][A-Za-z0-9_.-]*@)?(?:[A-Za-z0-9][A-Za-z0-9.-]*|\[[A-Fa-f0-9:]+\])$/;
const SAFE_HINT = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const SHA = /^[a-fA-F0-9]{40}$/;
const DIGEST = /^sha256:[a-fA-F0-9]{64}$/;
const VERSION = /^\d+(?:\.\d+){1,3}(?:-[A-Za-z0-9.]+)?$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)$/;
const OS_NAMES = new Set(["ubuntu", "debian", "alpine", "fedora", "rocky", "almalinux", "centos", "rhel", "arch", "opensuse-leap", "opensuse-tumbleweed", "linuxmint", "nixos"]);
const LOG_DRIVERS = new Set(["json-file", "local", "journald", "syslog", "fluentd", "gelf", "awslogs", "splunk", "none"]);
const ERROR_SECTIONS = new Set(["os", "cpu", "memory", "clock", "ntp", "docker", "containers", "container_inspect", "image_digest", "runtime_version"]);
const ERROR_CODES = new Set(["unavailable", "probe_failed", "invalid_response", "timeout", "unsupported"]);
const integer = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;
const flag = (value) => typeof value === "boolean" ? value : null;
const timestamp = (value) => typeof value === "string" && TIMESTAMP.test(value) ? value : null;
const version = (value) => typeof value === "string" && VERSION.test(value) ? value : null;
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function dataValue(raw) {
  let value = raw.trim();
  if (value.startsWith("'") || value.startsWith('"')) {
    const quote = value[0];
    const end = value.indexOf(quote, 1);
    if (end < 1 || !/^\s*(?:#.*)?$/.test(value.slice(end + 1))) throw new Error("invalid_infra_assignment");
    value = value.slice(1, end);
  } else {
    value = value.replace(/\s+#.*$/, "").trim();
    if (/\s/.test(value)) throw new Error("invalid_infra_assignment");
  }
  // Never evaluate substitutions, variables, shell escapes or commands.
  if (!value || /[$\x60;|&<>\r\n\0]/.test(value)) throw new Error("unsafe_infra_value");
  if (value.includes("\\") && !/^[A-Za-z]:\\[^$\x60;|&<>\r\n\0]*$/.test(value)) throw new Error("unsafe_infra_value");
  return value;
}

export function parseInfra(text, { baseDir = ".", homeDir = homedir() } = {}) {
  const result = {};
  for (const line of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    if (/^\s*(?:#.*)?$/.test(line)) continue;
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
    if (!match) throw new Error("invalid_infra_assignment");
    if (!INFRA_KEYS.has(match[1])) continue; // Unknown secret assignments are never emitted.
    if (Object.hasOwn(result, match[1])) throw new Error("duplicate_infra_key");
    const value = dataValue(match[2]);
    if (match[1] === "K") {
      result.K = path.resolve(baseDir, value.startsWith("~/") ? path.join(homeDir, value.slice(2)) : value);
    } else if (["APP", "OPS", "DB"].includes(match[1])) {
      if (!SAFE_HOST.test(value) || value.startsWith("-")) throw new Error("invalid_infra_host");
      result[match[1]] = value.includes("@") ? value : "root@" + value;
    } else {
      if (!SAFE_HINT.test(value)) throw new Error("invalid_infra_hint");
      result[match[1]] = value;
    }
  }
  if (!["K", "APP", "OPS", "DB"].every((key) => result[key])) throw new Error("missing_required_infra_keys");
  return result;
}

export function resolveInfraPath({ explicit, environment = process.env, repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."), run = execFileSync } = {}) {
  if (explicit) return path.resolve(explicit);
  if (environment.FAKTFLOW_INFRA_ENV) return path.resolve(environment.FAKTFLOW_INFRA_ENV);
  const local = path.join(repository, ".agents", "infra.env");
  if (existsSync(local)) return local;
  try {
    const listing = run("git", ["worktree", "list", "--porcelain"], { cwd: repository, encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "pipe"], shell: false, windowsHide: true });
    const first = /^worktree (.+)$/m.exec(listing)?.[1];
    if (first) {
      const main = path.join(first, ".agents", "infra.env");
      if (existsSync(main)) return main;
    }
  } catch { /* Absent git or worktree: report missing inventory without details. */ }
  return local;
}

function safeEnvironment(raw) {
  const values = {};
  const observed = Array.isArray(raw);
  for (const item of observed ? raw : []) {
    if (typeof item !== "string") continue;
    const separator = item.indexOf("=");
    if (separator > 0) values[item.slice(0, separator)] = item.slice(separator + 1);
  }
  const enums = {};
  for (const [key, allowed] of Object.entries(ENV_ENUMS)) {
    enums[key] = !observed ? { status: "unverified", value: null }
      : !Object.hasOwn(values, key) ? { status: "missing", value: null }
      : allowed.includes(values[key]) ? { status: "observed", value: values[key] }
      : { status: "invalid", value: null };
  }
  const configured = {};
  for (const key of CREDENTIAL_KEYS) configured[key] = observed ? typeof values[key] === "string" && values[key].trim().length > 0 : null;
  return { enums, configured, values };
}

function releaseSha(config, values) {
  const labels = object(config.Labels) ? config.Labels : {};
  const candidates = [
    ...["org.opencontainers.image.revision", "org.label-schema.vcs-ref", "coolify.git.commit", "coolify.gitCommit"].map((key) => labels[key]),
    ...["GIT_COMMIT", "SOURCE_COMMIT", "COMMIT_SHA", "NEXT_PUBLIC_GIT_SHA", "DD_VERSION"].map((key) => values[key]),
    typeof config.Image === "string" ? config.Image.split(":").at(-1) : null,
  ].filter((value) => typeof value === "string" && SHA.test(value)).map((value) => value.toLowerCase());
  const unique = [...new Set(candidates)];
  return unique.length === 1 ? { status: "observed", sha: unique[0] }
    : { status: unique.length > 1 ? "conflicting" : "unverified", sha: null };
}

/** Untrusted Docker-shaped input: only accepted values survive. */
export function sanitizeDockerInspect(raw, { role = "unclassified", instanceIndex = 1, repoDigests = [] } = {}) {
  raw = object(raw) ? raw : {};
  const config = object(raw.Config) ? raw.Config : {};
  const state = object(raw.State) ? raw.State : {};
  const host = object(raw.HostConfig) ? raw.HostConfig : {};
  const log = object(host.LogConfig) ? host.LogConfig : {};
  const opts = object(log.Config) ? log.Config : {};
  const restart = object(host.RestartPolicy) ? host.RestartPolicy : {};
  const environment = safeEnvironment(config.Env);
  if (object(raw._credentialConfigured)) {
    for (const key of CREDENTIAL_KEYS) environment.configured[key] = flag(raw._credentialConfigured[key]);
  }
  const safeRole = ROLES.has(role) ? role : "unclassified";
  const safeIndex = Number.isSafeInteger(instanceIndex) && instanceIndex > 0 ? instanceIndex : 1;
  const digests = [...new Set((Array.isArray(repoDigests) ? repoDigests : []).flatMap((value) => {
    if (typeof value !== "string") return [];
    const candidate = value.split("@").at(-1);
    return DIGEST.test(candidate) ? [candidate.toLowerCase()] : [];
  }))];
  const security = Array.isArray(host.SecurityOpt) ? host.SecurityOpt : [];
  const health = object(state.Health) ? state.Health : {};
  return {
    service: safeRole + "-" + safeIndex,
    role: safeRole,
    image: { id: typeof raw.Image === "string" && DIGEST.test(raw.Image) ? raw.Image.toLowerCase() : null, repoDigests: digests },
    release: releaseSha(config, environment.values),
    state: {
      status: ["created", "running", "paused", "restarting", "removing", "exited", "dead"].includes(state.Status) ? state.Status : null,
      running: flag(state.Running), oomKilled: flag(state.OOMKilled), exitCode: integer(state.ExitCode),
      restartCount: integer(raw.RestartCount), startedAt: timestamp(state.StartedAt),
      health: ["starting", "healthy", "unhealthy"].includes(health.Status) ? health.Status : null,
      healthcheckConfigured: object(config.Healthcheck) ? Array.isArray(config.Healthcheck.Test) && config.Healthcheck.Test[0] !== "NONE" : null,
    },
    healthcheckPolicy: {
      intervalNanoseconds: integer(config.Healthcheck?.Interval),
      timeoutNanoseconds: integer(config.Healthcheck?.Timeout),
      startPeriodNanoseconds: integer(config.Healthcheck?.StartPeriod),
      startIntervalNanoseconds: integer(config.Healthcheck?.StartInterval),
      retries: integer(config.Healthcheck?.Retries),
    },
    resources: {
      memoryLimitBytes: integer(host.Memory), memoryReservationBytes: integer(host.MemoryReservation),
      nanoCpus: integer(host.NanoCpus), cpuShares: integer(host.CpuShares),
      cpuQuota: Number.isSafeInteger(host.CpuQuota) ? host.CpuQuota : null, cpuPeriod: integer(host.CpuPeriod),
      pidsLimit: Number.isSafeInteger(host.PidsLimit) ? host.PidsLimit : null,
    },
    restartPolicy: {
      name: ["no", "always", "unless-stopped", "on-failure"].includes(restart.Name) ? restart.Name : null,
      maximumRetryCount: integer(restart.MaximumRetryCount),
    },
    logging: {
      driver: LOG_DRIVERS.has(log.Type) ? log.Type : null,
      maxSize: typeof opts["max-size"] === "string" && /^\d+(?:\.\d+)?[kmg]?$/i.test(opts["max-size"]) ? opts["max-size"].toLowerCase() : null,
      maxFiles: typeof opts["max-file"] === "string" && /^\d{1,5}$/.test(opts["max-file"]) ? Number(opts["max-file"]) : null,
    },
    security: {
      privileged: flag(host.Privileged), readOnlyRootFilesystem: flag(host.ReadonlyRootfs),
      noNewPrivileges: security.includes("no-new-privileges") || security.includes("no-new-privileges:true"),
      seccompOptionPresent: security.some((value) => typeof value === "string" && value.startsWith("seccomp=")),
      capabilityAddCount: Array.isArray(host.CapAdd) ? host.CapAdd.length : null,
      capabilityDropCount: Array.isArray(host.CapDrop) ? host.CapDrop.length : null,
      networkMode: ["host", "bridge", "none", "default"].includes(host.NetworkMode) ? host.NetworkMode : typeof host.NetworkMode === "string" ? "custom" : null,
      rootUserConfigured: typeof config.User === "string" ? ["", "root", "0"].includes(config.User.split(":")[0]) : null,
    },
    environment: environment.enums,
    credentialsConfigured: environment.configured,
    integrationDelivery: "unverified",
  };
}

const REMOTE_PROGRAM = String.raw`
import datetime, json, os, re, subprocess
hints = json.loads(__HINTS__)
enum_values = json.loads(__ENUMS__)
credential_keys = json.loads(__CREDENTIALS__)
errors = []
def failed(section, code="probe_failed"):
    errors.append({"section": section, "code": code})
def command(args):
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=8)
        return r.stdout if r.returncode == 0 else None
    except (OSError, ValueError, subprocess.TimeoutExpired): return None
def safe_version(value):
    if not isinstance(value, str): return None
    m = re.search(r"(?:version[= ]|PostgreSQL\)\s*|^v|v=)(\d+(?:\.\d+){1,3}(?:-[A-Za-z0-9.]+)?)", value, re.I)
    if m: return m.group(1)
    m = re.search(r"\b(RELEASE\.\d{4}-\d\d-\d\dT\d\d-\d\d-\d\dZ)\b", value)
    return m.group(1) if m else None
def role_for(raw):
    name = str(raw.get("Name", "")).lstrip("/")
    image = str(raw.get("Config", {}).get("Image", "")).lower()
    if hints.get("WORKER_PREFIX") and name.startswith(hints["WORKER_PREFIX"]): return "worker"
    if hints.get("APP_PREFIX") and name.startswith(hints["APP_PREFIX"]): return "web"
    if hints.get("PGC") and name == hints["PGC"]: return "postgres"
    if hints.get("RESTC") and name == hints["RESTC"]: return "postgrest"
    matches = [
      ("postgres", r"(?:^|/)postgres(?:[:/-]|$)|supabase/postgres"),
      ("postgrest", r"postgrest"), ("gotrue", r"gotrue"),
      ("minio", r"minio"), ("valkey", r"valkey"), ("redis-rest", r"serverless-redis-http"),
      ("redis", r"(?:^|/)redis(?:[:/-]|$)"), ("coolify", r"coollabsio/coolify"),
      ("gateway", r"(?:^|/)kong(?:[:/-]|$)"),
      ("supabase-storage", r"supabase/storage-api"), ("supabase-realtime", r"supabase/realtime"),
      ("supabase-studio", r"supabase/studio"), ("supabase-meta", r"supabase/postgres-meta"),
      ("log-collector", r"timberio/vector|supabase/logflare")]
    for role, pattern in matches:
        if re.search(pattern, image): return role
    return "unclassified"
def filtered_container(raw):
    config = raw.get("Config") or {}
    env = {}
    for item in config.get("Env", []) or []:
        if isinstance(item, str) and "=" in item:
            k, v = item.split("=", 1)
            env[k] = v
    safe_env = []
    for k, allowed in enum_values.items():
        if k in env: safe_env.append(k + "=" + (env[k] if env[k] in allowed else "INVALID"))
    labels = {}
    for k in ["org.opencontainers.image.revision", "org.label-schema.vcs-ref", "coolify.git.commit", "coolify.gitCommit"]:
        v = (config.get("Labels") or {}).get(k)
        if isinstance(v, str) and re.fullmatch(r"[a-fA-F0-9]{40}", v): labels[k] = v
    for k in ["GIT_COMMIT", "SOURCE_COMMIT", "COMMIT_SHA", "NEXT_PUBLIC_GIT_SHA", "DD_VERSION"]:
        if isinstance(env.get(k), str) and re.fullmatch(r"[a-fA-F0-9]{40}", env[k]): safe_env.append(k + "=" + env[k])
    tag = str(config.get("Image", "")).split(":")[-1]
    safe_tag = tag if re.fullmatch(r"[a-fA-F0-9]{40}", tag) else None
    hc = raw.get("HostConfig") or {}
    state = raw.get("State") or {}
    test = (config.get("Healthcheck") or {}).get("Test") or []
    result = {
      "Image": raw.get("Image"), "RestartCount": raw.get("RestartCount"),
      "Config": {"Env": safe_env, "Labels": labels, "Image": safe_tag, "User": None,
        "Healthcheck": {**{k: (config.get("Healthcheck") or {}).get(k) for k in ["Interval", "Timeout", "StartPeriod", "StartInterval", "Retries"]}, "Test": ["CONFIGURED"] if test and test[0] != "NONE" else ["NONE"]}},
      "State": {k: state.get(k) for k in ["Status", "Running", "OOMKilled", "ExitCode", "StartedAt"]},
      "HostConfig": {k: hc.get(k) for k in ["Memory", "MemoryReservation", "NanoCpus", "CpuShares", "CpuQuota", "CpuPeriod", "PidsLimit", "Privileged", "ReadonlyRootfs"]},
      "_credentialConfigured": {k: bool(env.get(k, "").strip()) for k in credential_keys},
      "_role": role_for(raw)}
    if isinstance(state.get("Health"), dict): result["State"]["Health"] = {"Status": state["Health"].get("Status")}
    rp = hc.get("RestartPolicy") or {}
    result["HostConfig"]["RestartPolicy"] = {k: rp.get(k) for k in ["Name", "MaximumRetryCount"]}
    lc = hc.get("LogConfig") or {}
    result["HostConfig"]["LogConfig"] = {"Type": lc.get("Type"), "Config": {k: (lc.get("Config") or {}).get(k) for k in ["max-size", "max-file"]}}
    opts = hc.get("SecurityOpt") or []
    result["HostConfig"]["SecurityOpt"] = [v for v in opts if v in ["no-new-privileges", "no-new-privileges:true"]]
    if any(isinstance(v, str) and v.startswith("seccomp=") for v in opts): result["HostConfig"]["SecurityOpt"].append("seccomp=configured")
    for k in ["CapAdd", "CapDrop"]:
        result["HostConfig"][k] = ["CONFIGURED"] * len(hc[k]) if isinstance(hc.get(k), list) else None
    network = hc.get("NetworkMode")
    result["HostConfig"]["NetworkMode"] = network if network in ["host", "bridge", "none", "default"] else "custom" if isinstance(network, str) else None
    user = config.get("User")
    result["Config"]["User"] = "0" if isinstance(user, str) and user.split(":")[0] in ["", "root", "0"] else "NONROOT" if isinstance(user, str) else None
    return result
packet = {"host": {}, "docker": {"containers": []}, "errors": errors}
try:
    release = {}
    with open("/etc/os-release", encoding="utf-8") as f:
        for line in f:
            if "=" in line:
                k, v = line.strip().split("=", 1)
                release[k] = v.strip("\"'")
    packet["host"]["os"] = {"id": release.get("ID"), "version": release.get("VERSION_ID")}
except (OSError, ValueError): failed("os")
packet["host"]["cpu"] = {"logicalCount": os.cpu_count()}
try:
    with open("/proc/meminfo", encoding="utf-8") as f:
        m = re.search(r"^MemTotal:\s+(\d+)\s+kB$", f.read(), re.M)
    packet["host"]["memory"] = {"totalBytes": int(m.group(1)) * 1024 if m else None}
    if not m: failed("memory", "invalid_response")
except (OSError, ValueError): failed("memory")
packet["host"]["clock"] = {"utc": datetime.datetime.now(datetime.timezone.utc).isoformat(), "ntpSynchronized": None}
ntp = command(["timedatectl", "show", "--property=NTPSynchronized", "--value"])
if ntp is not None and ntp.strip() in ["yes", "no"]: packet["host"]["clock"]["ntpSynchronized"] = ntp.strip() == "yes"
else: failed("ntp", "unavailable")
engine = command(["docker", "version", "--format", "{{.Server.Version}}"])
packet["docker"]["version"] = engine.strip() if engine else None
if engine is None: failed("docker", "unavailable")
ids_text = command(["docker", "ps", "-aq", "--no-trunc"])
if ids_text is None: failed("containers", "unavailable")
else:
    packet["docker"]["listObserved"] = True
    for cid in ids_text.splitlines():
        if not re.fullmatch(r"[a-f0-9]{12,64}", cid):
            failed("container_inspect", "invalid_response")
            continue
        inspected = command(["docker", "inspect", "--type", "container", cid])
        try:
            raw = json.loads(inspected)[0]
            if not isinstance(raw, dict): raise ValueError()
            filtered = filtered_container(raw)
        except (TypeError, ValueError, KeyError, IndexError):
            failed("container_inspect")
            continue
        image_id = raw.get("Image")
        digests = []
        if isinstance(image_id, str) and re.fullmatch(r"sha256:[a-fA-F0-9]{64}", image_id):
            image_text = command(["docker", "image", "inspect", "--format", "{{json .RepoDigests}}", image_id])
            try:
                for value in json.loads(image_text) or []:
                    candidate = value.split("@")[-1] if isinstance(value, str) else ""
                    if re.fullmatch(r"sha256:[a-fA-F0-9]{64}", candidate): digests.append(candidate)
            except (TypeError, ValueError): failed("image_digest")
        filtered["_repoDigests"] = digests
        role = filtered["_role"]
        commands = {"web": ["node", "--version"], "worker": ["node", "--version"],
          "postgres": ["postgres", "--version"], "valkey": ["valkey-server", "--version"],
          "redis": ["redis-server", "--version"], "minio": ["minio", "--version"]}
        if role in commands and raw.get("State", {}).get("Running") is True:
            filtered["_runtimeVersion"] = safe_version(command(["docker", "exec", cid] + commands[role]))
            if not filtered["_runtimeVersion"]: failed("runtime_version")
        packet["docker"]["containers"].append(filtered)
print(json.dumps(packet, separators=(",", ":")))
`;


export function buildRemoteProgram(config) {
  const hints = Object.fromEntries(["PGC", "RESTC", "APP_PREFIX", "WORKER_PREFIX"]
    .filter((key) => typeof config[key] === "string" && SAFE_HINT.test(config[key]))
    .map((key) => [key, config[key]]));
  return REMOTE_PROGRAM
    .replace("__HINTS__", JSON.stringify(JSON.stringify(hints)))
    .replace("__ENUMS__", JSON.stringify(JSON.stringify(ENV_ENUMS)))
    .replace("__CREDENTIALS__", JSON.stringify(JSON.stringify(CREDENTIAL_KEYS)));
}

export function sanitizeRemotePacket(packet, alias) {
  packet = object(packet) ? packet : {};
  const host = object(packet.host) ? packet.host : {};
  const docker = object(packet.docker) ? packet.docker : {};
  const errors = (Array.isArray(packet.errors) ? packet.errors : []).map((entry) => ({
    section: ERROR_SECTIONS.has(entry?.section) ? entry.section : "containers",
    code: ERROR_CODES.has(entry?.code) ? entry.code : "probe_failed",
  }));
  const counters = {};
  const containers = (Array.isArray(docker.containers) ? docker.containers : []).map((raw) => {
    const role = ROLES.has(raw?._role) ? raw._role : "unclassified";
    counters[role] = (counters[role] || 0) + 1;
    const item = sanitizeDockerInspect(raw, { role, instanceIndex: counters[role], repoDigests: raw?._repoDigests });
    const runtimeVersion = version(raw?._runtimeVersion)
      || (typeof raw?._runtimeVersion === "string" && /^RELEASE\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z$/.test(raw._runtimeVersion) ? raw._runtimeVersion : null);
    item.runtime = { status: runtimeVersion ? "observed" : "unverified", version: runtimeVersion };
    return item;
  });
  const os = object(host.os) ? host.os : {};
  const clock = object(host.clock) ? host.clock : {};
  const safeHost = {
    alias: ["app-1", "ops-1", "db-1"].includes(alias) ? alias : "unclassified",
    os: { id: OS_NAMES.has(os.id) ? os.id : null, version: typeof os.version === "string" && /^\d+(?:\.\d+)*$/.test(os.version) ? os.version : null },
    cpu: { logicalCount: integer(host.cpu?.logicalCount) },
    memory: { totalBytes: integer(host.memory?.totalBytes) },
    clock: { utc: timestamp(clock.utc), ntpSynchronized: flag(clock.ntpSynchronized) },
    docker: { version: version(docker.version), listObserved: docker.listObserved === true, containers },
  };
  for (const [section, verified] of [
    ["os", safeHost.os.id !== null && safeHost.os.version !== null],
    ["cpu", safeHost.cpu.logicalCount !== null],
    ["memory", safeHost.memory.totalBytes !== null],
    ["clock", safeHost.clock.utc !== null],
    ["ntp", safeHost.clock.ntpSynchronized !== null],
    ["docker", safeHost.docker.version !== null],
    ["containers", safeHost.docker.listObserved],
  ]) {
    if (!verified && !errors.some((entry) => entry.section === section)) errors.push({ section, code: "invalid_response" });
  }
  return { ...safeHost, status: errors.length > 0 ? "partially_observed" : "observed", unverifiedSections: errors };
}

export function collectInventory(config, { run = execFileSync, observedAt = new Date().toISOString() } = {}) {
  const program = buildRemoteProgram(config);
  const hosts = [];
  for (const [key, alias] of [["APP", "app-1"], ["OPS", "ops-1"], ["DB", "db-1"]]) {
    try {
      const result = run("ssh", [
        "-T", "-i", config.K, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
        "-o", "ConnectTimeout=8", "-o", "ConnectionAttempts=1",
        "-o", "ServerAliveInterval=5", "-o", "ServerAliveCountMax=2",
        "--", config[key], "python3 -",
      ], { input: program, encoding: "utf8", timeout: 60000, maxBuffer: 8 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"], shell: false, windowsHide: true });
      const packet = JSON.parse(result);
      if (!object(packet) || !object(packet.host) || !object(packet.docker)) throw new Error("invalid_response");
      hosts.push(sanitizeRemotePacket(packet, alias));
    } catch {
      // SSH errors include host/user/key paths. Never copy message or stderr.
      hosts.push({ alias, status: "unverified", reason: "ssh_or_remote_probe_failed" });
    }
  }
  return {
    schemaVersion: 1, observedAt: timestamp(observedAt), scope: "read_only_runtime_metadata",
    limitations: [
      "Configuration presence does not verify credential validity, delivery or provider entitlement.",
      "No staging, synthetic transactions, migrations, database queries, deploys or alerts were executed.",
      "Addresses, container names, image repository names, key paths and secret values are omitted.",
      "Remote python3 and Docker permissions must already exist; missing prerequisites are unverified.",
      "Container health does not prove completion of a business operation.",
      "Missing or conflicting release markers remain unverified.",
      "No custom healthcheck command, application logs, backup contents or database contents are collected.",
      "OS/clock/container metadata is an instantaneous sample, not a historical baseline or SLO.",
    ],
    hosts,
  };
}

function parseCli(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--help" || args[i] === "-h") return { help: true };
    if (!["--infra", "--output"].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error("invalid_arguments");
    const name = args[i].slice(2);
    if (options[name]) throw new Error("duplicate_argument");
    options[name] = args[++i];
  }
  if (!options.output) throw new Error("missing_output");
  return options;
}

const LOCAL_FILES = { closeSync, fstatSync, lstatSync, openSync, readFileSync, writeFileSync };

function withRegularFile(file, files, action) {
  const descriptor = files.openSync(file, "r");
  try {
    if (!files.fstatSync(descriptor).isFile()) throw new Error("local_file_unavailable");
    return action(descriptor);
  } finally {
    files.closeSync(descriptor);
  }
}

export function main(args = process.argv.slice(2), { run = execFileSync, stderr = process.stderr, stdout = process.stdout, environment = process.env, files = LOCAL_FILES } = {}) {
  try {
    const options = parseCli(args);
    if (options.help) {
      stdout.write("F0 read-only runtime inventory\n\nnode scripts/ops/collect-runtime-inventory.mjs --output <private-output.json> [--infra <private-infra.env>]\n\nInventory path order: --infra, FAKTFLOW_INFRA_ENV, repository .agents/infra.env, main worktree .agents/infra.env.\nRequired data assignments: K, APP, OPS, DB. Optional: PGC, RESTC, APP_PREFIX, WORKER_PREFIX.\nNo shell evaluation. Requires an existing SSH key, trusted known-host entries and remote python3.\nOutput parent directory must already exist; use a new private file outside version control.\nOnly metadata and safe configuration presence are collected. No migrations, deploys, restarts or alerts.\nExit codes: 0 metadata observed, 2 partial/unverified, 1 local input/output error.\n");
      return 0;
    }
    const infraPath = resolveInfraPath({ explicit: options.infra, environment, run });
    // All local prerequisites are validated before the first SSH connection.
    const config = withRegularFile(infraPath, files, (descriptor) =>
      parseInfra(files.readFileSync(descriptor, "utf8"), { baseDir: path.dirname(infraPath) }));
    withRegularFile(config.K, files, () => {});
    const output = path.resolve(options.output);
    if (output === infraPath || output === config.K) throw new Error("output_conflict");
    // O_EXCL rejects existing files and symlinks atomically, before any SSH.
    // Keep the descriptor: a later pathname replacement must never be written.
    const descriptor = files.openSync(output, "wx", 0o600);
    let report;
    try {
      report = collectInventory(config, { run });
      files.writeFileSync(descriptor, JSON.stringify(report, null, 2) + "\n", { encoding: "utf8" });
      const reserved = files.fstatSync(descriptor);
      const current = files.lstatSync(output);
      if (!current.isFile() || current.dev !== reserved.dev || current.ino !== reserved.ino) throw new Error("output_replaced");
    } finally {
      files.closeSync(descriptor);
      // Do not unlink by pathname on failure: it may belong to another writer.
    }
    stdout.write("Read-only inventory saved. Review unverified sections; no environment state was changed.\n");
    return report.hosts.some((host) => host.status !== "observed") ? 2 : 0;
  } catch {
    stderr.write("Inventory failed: check private input paths, required assignments and a new output file in an existing directory. A reserved output file may remain. No sensitive diagnostics are printed.\n");
    return 1;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = main();
}
