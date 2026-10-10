import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { closeSync, existsSync, fstatSync, lstatSync, mkdtempSync, openSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildRemoteProgram, collectInventory, main, parseInfra,
  resolveInfraPath, sanitizeDockerInspect, sanitizeRemotePacket,
} from "./collect-runtime-inventory.mjs";

const SECRET = "secret_CANARY_never_export";
const CONTAINER = "private-container-uuid-9f60e001";
const REPOSITORY = "private-registry.example/private-project-uuid";
const IMAGE = "sha256:" + "a".repeat(64);
const SHA = "b".repeat(40);
const config = { K: "/private/key", APP: "root@192.0.2.1", OPS: "root@192.0.2.2", DB: "root@192.0.2.3", APP_PREFIX: "private-web", WORKER_PREFIX: "private-worker" };
function inspection() {
  return {
    Id: CONTAINER, Name: "/" + CONTAINER, Image: IMAGE, RestartCount: 2,
    Config: {
      Image: REPOSITORY + ":latest", User: "private-user",
      Env: ["NODE_ENV=production", "NEXT_PUBLIC_APP_ENV=staging", "KSEF_ENV=test", "JOBS_BACKEND=pgboss",
        "SUPABASE_SERVICE_ROLE_KEY=" + SECRET, "DATABASE_URL=postgres://private:" + SECRET + "@192.0.2.10/database",
        "DD_API_KEY=", "SECRET_UNKNOWN=" + SECRET, "GIT_COMMIT=" + SHA],
      Labels: { arbitrary: SECRET, "org.opencontainers.image.revision": SHA },
      Healthcheck: { Test: ["CMD-SHELL", "curl -H 'Bearer " + SECRET + "' https://private-endpoint"] },
    },
    State: { Status: "running", Running: true, OOMKilled: false, ExitCode: 0, StartedAt: "2026-10-04T10:00:00Z", Health: { Status: "healthy", Log: [{ Output: SECRET }] } },
    HostConfig: {
      Memory: 1024, MemoryReservation: 512, NanoCpus: 1000000000, CpuShares: 0, CpuQuota: -1, CpuPeriod: 0, PidsLimit: 256,
      Privileged: false, ReadonlyRootfs: true, NetworkMode: "private-network-uuid",
      SecurityOpt: ["no-new-privileges", "seccomp=/private/" + SECRET], CapAdd: [], CapDrop: ["ALL"],
      RestartPolicy: { Name: "unless-stopped", MaximumRetryCount: 0 },
      LogConfig: { Type: "json-file", Config: { "max-size": "10m", "max-file": "3", "tag": SECRET, "endpoint": SECRET } },
      Binds: ["/private/" + SECRET], Devices: [{ PathOnHost: SECRET }],
    },
    Mounts: [{ Source: SECRET }], NetworkSettings: { IPAddress: "192.0.2.10" },
  };
}
function packet(containers = []) {
  return { host: { os: { id: "ubuntu", version: "24.04" }, cpu: { logicalCount: 4 }, memory: { totalBytes: 8192 },
    clock: { utc: "2026-10-04T10:00:00+00:00", ntpSynchronized: true } },
    docker: { version: "28.5.1", listObserved: true, containers }, errors: [] };
}
function sinks() {
  const lines = [];
  return { lines, stdout: { write: (value) => lines.push(value) }, stderr: { write: (value) => lines.push(value) } };
}

function localFixture(action) {
  const dir = mkdtempSync(path.join(tmpdir(), "f0-collector-race-test-"));
  const key = path.join(dir, "test-key");
  const infra = path.join(dir, "infra.env");
  const out = path.join(dir, "inventory.json");
  writeFileSync(key, "synthetic key");
  writeFileSync(infra, "K='" + key + "'\nAPP=example.invalid\nOPS=example.invalid\nDB=example.invalid");
  try {
    action({ dir, key, infra, out, args: ["--infra", infra, "--output", out] });
  } finally {
    const cleanupTarget = path.resolve(dir);
    assert.equal(path.dirname(cleanupTarget), path.resolve(tmpdir()));
    assert.equal(path.basename(cleanupTarget).startsWith("f0-collector-race-test-"), true);
    rmSync(cleanupTarget, { recursive: true, force: true });
  }
}

// Use real files/descriptors and deterministic hooks to exercise pathname races.
function trackedFiles(hooks = {}) {
  const active = new Map();
  const closed = [];
  return {
    active, closed,
    files: {
      openSync(file, flags, mode) {
        hooks.beforeOpen?.(file, flags, mode);
        const descriptor = openSync(file, flags, mode);
        active.set(descriptor, file);
        return descriptor;
      },
      fstatSync(descriptor) {
        const stats = fstatSync(descriptor);
        hooks.afterStat?.(active.get(descriptor), descriptor);
        return stats;
      },
      lstatSync,
      readFileSync(descriptor, encoding) {
        hooks.beforeRead?.(active.get(descriptor), descriptor);
        return readFileSync(descriptor, encoding);
      },
      writeFileSync(descriptor, data, options) {
        assert.equal(typeof descriptor, "number");
        hooks.beforeWrite?.(active.get(descriptor), descriptor);
        return writeFileSync(descriptor, data, options);
      },
      closeSync(descriptor) {
        closeSync(descriptor);
        closed.push(active.get(descriptor));
        active.delete(descriptor);
      },
    },
  };
}

test("infra is data, supports quotes, tilde and ignores unrelated secret assignments", () => {
  const parsed = parseInfra("export K='~/.ssh/test-key'\nAPP=192.0.2.1 # example\nOPS=\"operator@example.invalid\"\nDB=192.0.2.3\nUNRELATED_SECRET=" + SECRET, { baseDir: "/repo", homeDir: "/home/test" });
  assert.equal(parsed.K, path.resolve("/home/test", ".ssh/test-key"));
  assert.equal(parsed.APP, "root@192.0.2.1");
  assert.equal(parsed.OPS, "operator@example.invalid");
  assert.equal(Object.hasOwn(parsed, "UNRELATED_SECRET"), false);
});

test("infra rejects substitutions, commands, option injection and duplicate keys", () => {
  const rest = "\nAPP=example.invalid\nOPS=example.invalid\nDB=example.invalid";
  for (const value of ["$(cat secret)", "\u0060cat secret\u0060", "$HOME/key", "key;cat-secret", "key|cat-secret", "key&cat-secret", "key\\ncat"]) {
    assert.throws(() => parseInfra("K='" + value + "'" + rest));
  }
  assert.throws(() => parseInfra("K=key\nAPP=-oProxyCommand=evil\nOPS=example.invalid\nDB=example.invalid"));
  assert.throws(() => parseInfra("K=key\nK=another" + rest));
  assert.throws(() => parseInfra("K=key\nsource other" + rest));
  assert.throws(() => parseInfra("K=key\nAPP=example.invalid"));
});

test("Docker sanitizer drops secrets, addresses, names, repositories and commands", () => {
  const result = sanitizeDockerInspect(inspection(), { role: "web", repoDigests: [REPOSITORY + "@" + IMAGE] });
  const json = JSON.stringify(result);
  for (const forbidden of [SECRET, CONTAINER, REPOSITORY, "192.0.2.", "private-user", "curl", "private-network", "/private/"]) {
    assert.equal(json.includes(forbidden), false, forbidden);
  }
  assert.equal(result.credentialsConfigured.SUPABASE_SERVICE_ROLE_KEY, true);
  assert.equal(result.credentialsConfigured.DD_API_KEY, false);
  assert.equal(result.integrationDelivery, "unverified");
  assert.equal(result.release.sha, SHA);
  assert.deepEqual(result.image.repoDigests, [IMAGE]);
  assert.equal(result.state.healthcheckConfigured, true);
  assert.equal(result.logging.maxFiles, 3);
  assert.equal(result.security.networkMode, "custom");
});

test("invalid enum values and conflicting release markers are never accepted", () => {
  const raw = inspection();
  raw.Config.Env.push("KSEF_ENV=" + SECRET);
  raw.Config.Labels["org.opencontainers.image.revision"] = "c".repeat(40);
  const result = sanitizeDockerInspect(raw, { role: SECRET });
  assert.deepEqual(result.environment.KSEF_ENV, { status: "invalid", value: null });
  assert.deepEqual(result.release, { status: "conflicting", sha: null });
  assert.equal(JSON.stringify(result).includes(SECRET), false);
});

test("missing inspect data or credentials do not infer validity or successful delivery", () => {
  const empty = sanitizeDockerInspect({});
  assert.equal(empty.credentialsConfigured.DATABASE_URL, null);
  assert.equal(empty.integrationDelivery, "unverified");
  assert.equal(empty.environment.NODE_ENV.status, "unverified");
  const missing = sanitizeDockerInspect({ Config: { Env: [] } });
  assert.equal(missing.credentialsConfigured.DATABASE_URL, false);
  assert.equal(missing.environment.NODE_ENV.status, "missing");
  assert.equal(sanitizeRemotePacket({}, "app-1").status, "partially_observed");
});

test("second sanitizer strips untrusted host fields and remote errors", () => {
  const raw = packet([{ ...inspection(), _role: "web", _runtimeVersion: SECRET, _repoDigests: [REPOSITORY + "@" + IMAGE] }]);
  raw.host.hostname = SECRET;
  raw.host.os.id = SECRET;
  raw.errors.push({ section: SECRET, code: SECRET, detail: SECRET });
  const result = sanitizeRemotePacket(raw, "192.0.2.1");
  assert.equal(JSON.stringify(result).includes(SECRET), false);
  assert.equal(result.alias, "unclassified");
  assert.equal(result.status, "partially_observed");
  assert.equal(result.docker.containers[0].runtime.status, "unverified");
});

test("SSH probes use only configured targets, no local shell, and never expose failure stderr", () => {
  const calls = [];
  const result = collectInventory(config, { observedAt: "2026-10-04T10:00:00Z", run: (binary, args, options) => {
    calls.push({ binary, args, options });
    if (calls.length === 2) throw Object.assign(new Error(SECRET + config.OPS), { stderr: SECRET });
    return JSON.stringify(packet());
  } });
  assert.equal(calls.length, 3);
  for (let i = 0; i < calls.length; i++) {
    assert.equal(calls[i].binary, "ssh");
    assert.equal(calls[i].options.shell, false);
    assert.equal(calls[i].args.includes("BatchMode=yes"), true);
    assert.equal(calls[i].args.includes("StrictHostKeyChecking=yes"), true);
    assert.equal(calls[i].args.at(-1), "python3 -");
    assert.equal(calls[i].args.at(-2), config[["APP", "OPS", "DB"][i]]);
  }
  assert.equal(result.hosts[1].status, "unverified");
  const json = JSON.stringify(result);
  for (const forbidden of [SECRET, "/private/key", "192.0.2."]) assert.equal(json.includes(forbidden), false);
});

test("explicit and environment inventory paths do not fall back to historical hosts", () => {
  const never = () => { throw new Error("must not invoke git"); };
  assert.equal(resolveInfraPath({ explicit: "./missing-private.env", environment: {}, run: never }), path.resolve("./missing-private.env"));
  assert.equal(resolveInfraPath({ environment: { FAKTFLOW_INFRA_ENV: "./selected-private.env" }, run: never }), path.resolve("./selected-private.env"));
});

test("missing infra fails before SSH; help remains offline", () => {
  let connections = 0;
  const output = sinks();
  const run = () => { connections++; throw new Error(SECRET); };
  assert.equal(main(["--infra", path.join(tmpdir(), "missing-f0-" + Date.now() + ".env"), "--output", path.join(tmpdir(), "output-f0.json")], { ...output, run }), 1);
  assert.equal(connections, 0);
  assert.equal(output.lines.join("").includes(SECRET), false);
  assert.equal(main(["--help"], { ...output, run }), 0);
  assert.equal(connections, 0);
});

test("missing key and existing output are rejected before connections; new output is sanitized", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "f0-collector-test-"));
  try {
    const key = path.join(dir, "test-key");
    const infra = path.join(dir, "infra.env");
    const out = path.join(dir, "inventory.json");
    writeFileSync(infra, "K='" + key + "'\nAPP=example.invalid\nOPS=example.invalid\nDB=example.invalid");
    let calls = 0;
    const run = () => { calls++; return JSON.stringify(packet([{ ...inspection(), _role: "web" }])); };
    const output = sinks();
    assert.equal(main(["--infra", infra, "--output", out], { ...output, run }), 1);
    assert.equal(calls, 0);
    writeFileSync(key, "synthetic key");
    writeFileSync(out, "existing");
    assert.equal(main(["--infra", infra, "--output", out], { ...output, run }), 1);
    assert.equal(calls, 0);
    rmSync(out);
    assert.equal(main(["--infra", infra, "--output", out], { ...output, run }), 0);
    assert.equal(calls, 3);
    const saved = readFileSync(out, "utf8");
    assert.equal(saved.includes(SECRET), false);
    assert.equal(saved.includes("example.invalid"), false);
  } finally {
    const cleanupTarget = path.resolve(dir);
    assert.equal(path.dirname(cleanupTarget), path.resolve(tmpdir()));
    assert.equal(path.basename(cleanupTarget).startsWith("f0-collector-test-"), true);
    rmSync(cleanupTarget, { recursive: true, force: true });
  }
});

test("infra pathname replacement after fstat cannot change the opened input", () => {
  localFixture(({ infra, out, args }) => {
    let replaced = false;
    const tracked = trackedFiles({ afterStat: (file) => {
      if (file !== infra || replaced) return;
      replaced = true;
      renameSync(infra, infra + ".opened");
      writeFileSync(infra, "invalid input " + SECRET);
    } });
    let calls = 0;
    const run = () => { calls++; return JSON.stringify(packet()); };
    assert.equal(main(args, { ...sinks(), run, files: tracked.files }), 0);
    assert.equal(replaced, true);
    assert.equal(calls, 3);
    assert.equal(tracked.active.size, 0);
    assert.equal(readFileSync(infra, "utf8"), "invalid input " + SECRET);
    assert.equal(JSON.parse(readFileSync(out, "utf8")).hosts.length, 3);
  });
});

test("a competing output creation is rejected atomically before any SSH", () => {
  localFixture(({ out, args }) => {
    const tracked = trackedFiles({ beforeOpen: (file, flags) => {
      if (file === out) {
        assert.equal(flags, "wx");
        writeFileSync(out, "other writer " + SECRET);
      }
    } });
    let calls = 0;
    const output = sinks();
    assert.equal(main(args, { ...output, files: tracked.files, run: () => { calls++; return JSON.stringify(packet()); } }), 1);
    assert.equal(calls, 0);
    assert.equal(readFileSync(out, "utf8"), "other writer " + SECRET);
    assert.equal(tracked.active.size, 0);
    assert.equal(tracked.closed.length, 2);
    assert.equal(output.lines.join("").includes(SECRET), false);
  });
});

test("output reservation is observable before every mocked SSH without filesystem injection", () => {
  localFixture(({ out, args }) => {
    const samples = [];
    const run = () => {
      samples.push(existsSync(out) ? lstatSync(out).size : null);
      return JSON.stringify(packet());
    };
    assert.equal(main(args, { ...sinks(), run }), 0);
    assert.deepEqual(samples, [0, 0, 0]);
    assert.equal(JSON.parse(readFileSync(out, "utf8")).hosts.length, 3);
  });
});

test("another writer cannot claim output during collection without filesystem injection", () => {
  localFixture(({ out, args }) => {
    let calls = 0;
    let competingResult;
    const run = () => {
      if (++calls === 1) {
        try {
          writeFileSync(out, "competing writer " + SECRET, { flag: "wx" });
          competingResult = "created";
        } catch (error) {
          competingResult = error.code;
        }
      }
      return JSON.stringify(packet());
    };
    const exitCode = main(args, { ...sinks(), run });
    assert.equal(calls, 3);
    assert.equal(competingResult, "EEXIST");
    assert.equal(exitCode, 0);
    const saved = readFileSync(out, "utf8");
    assert.equal(JSON.parse(saved).hosts.length, 3);
    assert.equal(saved.includes(SECRET), false);
  });
});

test("the private output is reserved before SSH and every descriptor closes on success", () => {
  localFixture(({ out, args }) => {
    const tracked = trackedFiles();
    let calls = 0;
    const run = () => {
      calls++;
      assert.deepEqual([...tracked.active.values()], [out]);
      assert.equal(readFileSync(out, "utf8"), "");
      if (process.platform !== "win32") assert.equal(lstatSync(out).mode & 0o777, 0o600);
      return JSON.stringify(packet());
    };
    assert.equal(main(args, { ...sinks(), run, files: tracked.files }), 0);
    assert.equal(calls, 3);
    assert.equal(tracked.active.size, 0);
    assert.equal(tracked.closed.length, 3);
  });
});

test("replacement output is neither overwritten nor deleted and does not report success", () => {
  localFixture(({ key, out, args }) => {
    const moved = out + ".reserved";
    const tracked = trackedFiles();
    const output = sinks();
    let calls = 0;
    const run = () => {
      if (++calls === 1) {
        renameSync(out, moved);
        writeFileSync(out, "replacement " + SECRET);
      }
      return JSON.stringify(packet());
    };
    assert.equal(main(args, { ...output, run, files: tracked.files }), 1);
    assert.equal(calls, 3);
    assert.equal(readFileSync(out, "utf8"), "replacement " + SECRET);
    assert.equal(readFileSync(key, "utf8"), "synthetic key");
    assert.equal(JSON.parse(readFileSync(moved, "utf8")).hosts.length, 3);
    assert.equal(tracked.active.size, 0);
    assert.equal(tracked.closed.length, 3);
    assert.equal(output.lines.join("").includes(SECRET), false);
    assert.equal(output.lines.join("").includes("saved"), false);
  });
});

test("input and key output aliases and invalid output directories fail before SSH", () => {
  localFixture(({ key, infra, dir, args }) => {
    let calls = 0;
    const run = () => { calls++; return JSON.stringify(packet()); };
    for (const target of [key, infra, dir, path.join(dir, "missing", "inventory.json")]) {
      const tracked = trackedFiles();
      assert.equal(main([...args.slice(0, 3), target], { ...sinks(), run, files: tracked.files }), 1);
      assert.equal(tracked.active.size, 0);
    }
    assert.equal(calls, 0);
    assert.equal(readFileSync(key, "utf8"), "synthetic key");
    assert.equal(readFileSync(infra, "utf8").startsWith("K='"), true);
  });
});

test("existing output symlinks, including dangling links, fail before SSH", (context) => {
  localFixture(({ key, infra, out, dir, args }) => {
    let calls = 0;
    const run = () => { calls++; return JSON.stringify(packet()); };
    for (const target of [key, infra, path.join(dir, "missing-target")]) {
      try {
        symlinkSync(target, out, "file");
      } catch (error) {
        if (process.platform === "win32" && ["EPERM", "EACCES"].includes(error.code)) {
          context.skip("Windows does not permit creating local symlinks");
          return;
        }
        throw error;
      }
      const tracked = trackedFiles();
      assert.equal(main(args, { ...sinks(), run, files: tracked.files }), 1);
      assert.equal(lstatSync(out).isSymbolicLink(), true);
      assert.equal(tracked.active.size, 0);
      rmSync(out);
    }
    assert.equal(calls, 0);
    assert.equal(readFileSync(key, "utf8"), "synthetic key");
    assert.equal(readFileSync(infra, "utf8").startsWith("K='"), true);
    assert.equal(existsSync(path.join(dir, "missing-target")), false);
  });
});

test("local read, stat, parse and write failures close every opened descriptor", () => {
  for (const failure of ["infra-stat", "infra-read", "infra-parse", "key-stat", "output-write", "output-stat"]) {
    localFixture(({ infra, key, out, args }) => {
      if (failure === "infra-parse") writeFileSync(infra, "invalid " + SECRET);
      const tracked = trackedFiles({
        afterStat: (file) => {
          if ((failure === "infra-stat" && file === infra) || (failure === "key-stat" && file === key) || (failure === "output-stat" && file === out)) throw new Error(SECRET);
        },
        beforeRead: () => { if (failure === "infra-read") throw new Error(SECRET); },
        beforeWrite: () => { if (failure === "output-write") throw new Error(SECRET); },
      });
      let calls = 0;
      const output = sinks();
      assert.equal(main(args, { ...output, files: tracked.files, run: () => { calls++; return JSON.stringify(packet()); } }), 1, failure);
      assert.equal(calls, failure.startsWith("output-") ? 3 : 0, failure);
      assert.equal(tracked.active.size, 0, failure);
      assert.equal(tracked.closed.length, failure.startsWith("infra-") ? 1 : failure === "key-stat" ? 2 : 3, failure);
      assert.equal(output.lines.join("").includes(SECRET), false, failure);
      if (failure === "output-write") assert.equal(readFileSync(out, "utf8"), "");
    });
  }
});

test("remote Python program compiles when Python is available, without executing probes", (context) => {
  let binary;
  for (const candidate of [process.env.FAKTFLOW_TEST_PYTHON, "python3", "python"].filter(Boolean)) {
    try { execFileSync(candidate, ["--version"], { stdio: "ignore", timeout: 5000, shell: false, windowsHide: true }); binary = candidate; break; } catch { /* Optional syntax check only. */ }
  }
  if (!binary) { context.skip("Python unavailable locally; SSH needs existing remote python3"); return; }
  execFileSync(binary, ["-c", "import sys; compile(sys.stdin.read(), '<collector>', 'exec')"], { input: buildRemoteProgram(config), stdio: ["pipe", "ignore", "pipe"], timeout: 5000, shell: false, windowsHide: true });
});


test("UID zero is identified independently of group, heartbeat is presence only, health policy is numeric", () => {
  for (const user of ["0:1000", "root:node", "0", "root", ""]) {
    const raw = inspection();
    raw.Config.User = user;
    raw.Config.Env.push("OPS_HEARTBEAT_URL=https://private/" + SECRET, "APP_ENV=staging", "R2_FORCE_PATH_STYLE=true");
    raw.Config.Healthcheck.Interval = 30000000000;
    raw.Config.Healthcheck.Timeout = 10000000000;
    raw.Config.Healthcheck.Retries = 3;
    raw.Config.Healthcheck.StartPeriod = SECRET;
    const result = sanitizeDockerInspect(raw);
    assert.equal(result.security.rootUserConfigured, true);
    assert.equal(result.credentialsConfigured.OPS_HEARTBEAT_URL, true);
    assert.equal(result.integrationDelivery, "unverified");
    assert.equal(result.environment.APP_ENV.value, "staging");
    assert.equal(result.environment.R2_FORCE_PATH_STYLE.value, "true");
    assert.equal(result.healthcheckPolicy.intervalNanoseconds, 30000000000);
    assert.equal(result.healthcheckPolicy.startPeriodNanoseconds, null);
    assert.equal(JSON.stringify(result).includes(SECRET), false);
  }
  const nonRoot = inspection();
  nonRoot.Config.User = "1000:0";
  assert.equal(sanitizeDockerInspect(nonRoot).security.rootUserConfigured, false);
});

test("remote filtering preserves release conflicts and actual Redis/Valkey versions", (context) => {
  let binary;
  for (const candidate of [process.env.FAKTFLOW_TEST_PYTHON, "python3", "python"].filter(Boolean)) {
    try { execFileSync(candidate, ["--version"], { stdio: "ignore", timeout: 5000, shell: false, windowsHide: true }); binary = candidate; break; } catch { /* Optional local interpreter. */ }
  }
  if (!binary) { context.skip("Python unavailable locally; SSH needs existing remote python3"); return; }
  const raw = inspection();
  raw.Config.Labels = {};
  raw.Config.Env = ["SOURCE_COMMIT=" + SHA, "SUPABASE_SERVICE_ROLE_KEY=" + SECRET];
  raw.Config.Image = REPOSITORY + ":" + "c".repeat(40);
  const definitions = buildRemoteProgram(config).split('packet = {"host":')[0];
  const wrapper = "import json,sys\nn={}\nexec(json.loads(sys.stdin.readline()),n)\nraw=json.loads(sys.stdin.readline())\nfiltered=n['filtered_container'](raw)\nversions=[n['safe_version'](s) for s in ['Redis server v=7.2.5 sha=00000000:0', 'Valkey server v=8.0.1 sha=00000000:0', 'v22.17.0', 'postgres (PostgreSQL) 15.8', 'minio version RELEASE.2025-01-01T00-00-00Z']]\nprint(json.dumps({'filtered':filtered,'versions':versions}))\n";
  const result = JSON.parse(execFileSync(binary, ["-c", wrapper], { input: JSON.stringify(definitions) + "\n" + JSON.stringify(raw) + "\n", encoding: "utf8", timeout: 5000, shell: false, windowsHide: true }));
  const filteredText = JSON.stringify(result.filtered);
  assert.equal(filteredText.includes(SECRET), false);
  assert.equal(filteredText.includes(REPOSITORY), false);
  assert.equal(filteredText.includes(CONTAINER), false);
  assert.deepEqual(sanitizeDockerInspect(result.filtered).release, { status: "conflicting", sha: null });
  assert.deepEqual(result.versions, ["7.2.5", "8.0.1", "22.17.0", "15.8", "RELEASE.2025-01-01T00-00-00Z"]);
});

test("remote role detection distinguishes PostgreSQL from postgres-meta", (context) => {
  let binary;
  for (const candidate of [process.env.FAKTFLOW_TEST_PYTHON, "python3", "python"].filter(Boolean)) {
    try { execFileSync(candidate, ["--version"], { stdio: "ignore", timeout: 5000, shell: false, windowsHide: true }); binary = candidate; break; } catch { /* Optional local interpreter. */ }
  }
  if (!binary) { context.skip("Python unavailable locally; no remote probes in this test"); return; }
  const definitions = buildRemoteProgram(config).split('packet = {"host":')[0];
  const inputs = ["supabase/postgres-meta:v0.95.0", "supabase/postgres:15.8.1", "postgres:15", "postgres@sha256:" + "a".repeat(64), "postgres-unrelated:v1"];
  const wrapper = "import json,sys\nn={}\nexec(json.loads(sys.stdin.readline()),n)\nimages=json.loads(sys.stdin.readline())\nprint(json.dumps([n['role_for']({'Name':'/synthetic-source','Config':{'Image':image}}) for image in images]))\n";
  const roles = JSON.parse(execFileSync(binary, ["-c", wrapper], { input: JSON.stringify(definitions) + "\n" + JSON.stringify(inputs) + "\n", encoding: "utf8", timeout: 5000, shell: false, windowsHide: true }));
  assert.deepEqual(roles, ["supabase-meta", "postgres", "postgres", "postgres", "unclassified"]);
});
