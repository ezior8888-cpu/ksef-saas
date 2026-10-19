import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { main, prepareBackupPlan, validateConfig } from "./prepare-backup-plan.mjs";

const example = fileURLToPath(new URL("../../ops/observability/backup/preparation.example.json", import.meta.url));
const config = JSON.parse(readFileSync(example, "utf8"));
const runId = "planned-20261010-001";

test("example creates descriptions covering both complete databases and globals", () => {
  const plan = prepareBackupPlan(config, runId);
  const dumps = plan.sourceCommands.filter((step) => step.args.includes("pg_dump"));
  assert.equal(dumps.length, 2);
  assert.deepEqual(dumps.map((step) => step.args.find((arg) => arg.startsWith("--dbname="))),
    ["--dbname=postgres", "--dbname=_supabase"]);
  for (const step of dumps) {
    assert.ok(step.args.includes("--username=supabase_admin"));
    assert.ok(step.args.includes("--format=custom"));
    assert.ok(!step.args.some((arg) => /schema|table|exclude|no-owner|no-acl/.test(arg)));
    assert.equal(step.outputMustBeNew, true);
  }
  assert.ok(plan.sourceCommands.some((step) => step.args.includes("--globals-only")));
  for (const step of plan.sourceCommands.filter((step) => step.args.includes("pg_restore"))) {
    assert.ok(step.args.includes("--list"));
    assert.ok(!step.args.some((arg) => arg.startsWith("--dbname")));
    assert.ok(step.stdinFile.endsWith(".dump"));
  }
});

test("three separate repos have exact source hosts, deep checks and common run tags", () => {
  const plan = prepareBackupPlan(config, runId);
  assert.deepEqual(plan.repositories.map((repo) => [repo.source, repo.host]),
    [["postgresql", "db-1"], ["app-minio", "ops-1"], ["supabase-minio", "db-1"]]);
  const repositoryFiles = new Set();
  for (const repo of plan.repositories) {
    const [upload, check, identify] = repo.commands;
    repositoryFiles.add(upload.args[1]);
    assert.ok(upload.args.includes("run:" + runId));
    assert.ok(upload.args.includes("--password-file"));
    assert.ok(upload.args.includes("--no-cache"));
    assert.ok(check.args.includes("--read-data"));
    assert.ok(identify.args.includes("f0,source:" + repo.source + ",run:" + runId));
    assert.ok(repo.commands.every((step) => step.requiredExitCode === 0));
  }
  assert.equal(repositoryFiles.size, 3);
});

test("plan cannot authorize execution, signal success, prune or claim acceptance", () => {
  const plan = prepareBackupPlan(config, runId);
  assert.equal(plan.executable, false);
  assert.ok(Object.values(plan.authorization).every((value) => value === false));
  assert.equal(plan.sourceExportsImplemented, false);
  assert.equal(plan.completion.automaticSuccessSignal, false);
  assert.equal(plan.retentionProposal.deletionImplemented, false);
  assert.equal(plan.f0Gate, "NOT_ASSESSED");
  const commands = [...plan.sourceCommands, ...plan.repositories.flatMap((repo) => repo.commands)];
  for (const cmd of commands) {
    assert.ok(!cmd.args.some((arg) => ["restore", "init", "forget", "prune", "stop", "rm"].includes(arg)));
  }
  assert.equal(plan.scheduleProposal.maximumAgeHours, 26);
  assert.equal(plan.retentionProposal.unit, "complete-common-run");
});

test("configuration rejects secrets, execution flags, injection and overlapping private paths", () => {
  for (const edit of [
    { scope: "execute" }, { password: "PRIVATE_CANARY" }, { execute: true },
    { pgContainer: "-it" }, { pgContainer: "$(touch BAD)" },
    { stagingRoot: "/tmp/../etc" }, { stagingRoot: "/" },
    { credentialRoot: config.stagingRoot + "/keys" },
    { stagingRoot: config.credentialRoot + "/dumps" },
  ]) assert.throws(() => validateConfig({ ...config, ...edit }), /INVALID_PREPARATION_CONFIG/);
  for (const value of ["short", "../private", "run; echo secret", "run\nsecret", "x".repeat(81)]) {
    assert.throws(() => prepareBackupPlan(config, value), /INVALID_RUN_ID/);
  }
});

test("CLI is local only and rejects execute without reflecting input", () => {
  const out = [];
  const err = [];
  const io = { stdout: { write: (s) => out.push(s) }, stderr: { write: (s) => err.push(s) } };
  assert.equal(main(["--config", example, "--run-id", runId], io), 0);
  assert.equal(JSON.parse(out.join("")).status, "PREPARATION_ONLY");
  out.length = 0;
  assert.equal(main(["--config", "PRIVATE_CANARY", "--run-id", runId, "--execute"], io), 2);
  assert.equal(out.length, 0);
  assert.ok(!err.join("").includes("PRIVATE_CANARY"));
  for (const file of ["\\\\host\\share\\config.json", "//host/share/config.json", "https://example.invalid/config.json"]) {
    assert.equal(main(["--config", file, "--run-id", runId], io), 2);
  }
});

test("import has no output and planner has no process, network or write APIs", () => {
  const url = new URL("./prepare-backup-plan.mjs", import.meta.url);
  const output = execFileSync(process.execPath, ["--input-type=module", "-e", "await import(" + JSON.stringify(url.href) + ");"], { encoding: "utf8" });
  assert.equal(output, "");
  const code = readFileSync(url, "utf8");
  assert.ok(!/node:(?:child_process|net|http|https)|\bfetch\s*\(|\b(?:writeFile|mkdir|rm|unlink|rename|chmod)(?:Sync)?\s*\(/.test(code));
});
