#!/usr/bin/env node
/** Pure planning of REPORTED complete backup sets. Never an executor.
 * Input: {schemaVersion:1, asOfUtc:<UTC>, manifests:[check-backup-set v1]}.
 * Returned identities are private planning data; CLI prints only counts/codes.
 */
import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { validateBackupSet } from "./check-backup-set.mjs";

const POLICY = { daily: 7, weekly: 4, monthly: 12 };
const MAX_INPUT_BYTES = 16 * 1024 * 1024;
const MAX_MANIFESTS = 4096;
const SHA256 = /^[a-f0-9]{64}$/;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const UTC = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d{1,9})?(?:Z|\+00:00)$/;
const DAY_MS = 86400000;
const LOCAL_FILES = { closeSync, fstatSync, openSync, readSync };
const INPUT_FLAGS = constants.O_RDONLY
  | (typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0)
  | (typeof constants.O_NONBLOCK === "number" ? constants.O_NONBLOCK : 0);
export const HELP = "Użycie: node scripts/ops/plan-backup-retention.mjs <prywatna-historia.json>\nInput: schemaVersion=1, asOfUtc, manifests (zgłoszenia check-backup-set v1).\nLokalny JSON: maks. 16 MiB i 4096 manifestów. CLI pokazuje tylko liczby/kody.\nCzyste planBackupRetention() zwraca prywatne identyfikatory wybranych zestawów.\n7 dni / 4 tygodnie ISO od poniedziałku / 12 miesięcy: ostatnie niepuste okresy UTC.\nBrak wykonawcy, sieci, zapisu, usuwania, kopii lub restore; nie jest PASS G09.\nWindows: nie gwarantujemy odmowy symlinków/reparse points; POSIX O_NOFOLLOW nie chroni katalogów nadrzędnych.\nExit 0: podgląd spójnych zgłoszeń, bez autoryzacji usuwania. Exit 1: plan zablokowany. Exit 2: błąd wejścia.\n";

const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function utcTime(value) {
  const match = typeof value === "string" ? UTC.exec(value) : null;
  const time = match ? Date.parse(value) : NaN;
  return match && Number.isFinite(time) && new Date(time).toISOString().slice(0, 19) === match[1] ? time : null;
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function snapshotRefs(manifest) {
  if (!record(manifest)) return [];
  const candidates = (Array.isArray(manifest.snapshots) ? manifest.snapshots : []).map((item) => record(item) ? { kind: item.kind, repositoryId: item.repositoryId, snapshotId: item.snapshotId } : {});
  if (record(manifest.manifestOffHost)) candidates.push({ kind: "manifest", repositoryId: manifest.manifestOffHost.repositoryId, snapshotId: manifest.manifestOffHost.snapshotId });
  return candidates.filter((item) => ["database", "application", "supabase", "manifest"].includes(item.kind)
    && typeof item.repositoryId === "string" && item.repositoryId.trim().length > 0 && item.repositoryId.length <= 2048
    && typeof item.snapshotId === "string" && SHA256.test(item.snapshotId));
}
function calendarPeriod(time, granularity) {
  const start = new Date(time); start.setUTCHours(0, 0, 0, 0);
  let period;
  if (granularity === "daily") period = start.toISOString().slice(0, 10);
  else if (granularity === "monthly") { start.setUTCDate(1); period = start.toISOString().slice(0, 7); }
  else {
    start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
    const thursday = new Date(start); thursday.setUTCDate(thursday.getUTCDate() + 3);
    const year = thursday.getUTCFullYear();
    const first = new Date(thursday); first.setUTCMonth(0, 4); first.setUTCHours(0, 0, 0, 0);
    first.setUTCDate(first.getUTCDate() - (first.getUTCDay() + 6) % 7 + 3);
    const week = 1 + Math.round((thursday.getTime() - first.getTime()) / (7 * DAY_MS));
    period = `${String(year).padStart(4, "0")}-W${String(week).padStart(2, "0")}`;
  }
  const end = new Date(start);
  if (granularity === "monthly") end.setUTCMonth(end.getUTCMonth() + 1);
  else end.setUTCDate(end.getUTCDate() + (granularity === "daily" ? 1 : 7));
  return { period, start: start.getTime(), startUtc: start.toISOString(), endExclusiveUtc: end.toISOString() };
}
const orderRuns = (a, b) => b.completed - a.completed || (a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : a.inputIndex - b.inputIndex);

/** Historical validation is anchored at EACH run's completion. It is not a freshness waiver for monitoring. */
export function planBackupRetention(input) {
  const issues = [];
  const issue = (field, code) => issues.push({ field, code });
  const inputRecord = record(input) ? input : {};
  const asOf = utcTime(inputRecord.asOfUtc);
  if (!record(input)) issue("input", "required_object");
  if (inputRecord.schemaVersion !== 1) issue("schemaVersion", "unsupported_schema");
  if (asOf === null) issue("asOfUtc", "invalid_utc_timestamp");
  const manifests = Array.isArray(inputRecord.manifests) ? inputRecord.manifests : [];
  if (!Array.isArray(inputRecord.manifests)) issue("manifests", "required_array");
  const overLimit = manifests.length > MAX_MANIFESTS;
  if (overLimit) issue("manifests", "manifest_count_limit");
  const entries = [];
  const runIds = new Map(); const snapshotOwners = new Map(); const repositoryKinds = new Map();
  if (!overLimit) for (const [inputIndex, manifest] of manifests.entries()) {
    const field = `manifests.${inputIndex}`;
    const runId = record(manifest) && typeof manifest.runId === "string" && RUN_ID.test(manifest.runId) ? manifest.runId : null;
    const completed = record(manifest) ? utcTime(manifest.completedAtUtc) : null;
    const entry = { inputIndex, runId, completed, snapshots: snapshotRefs(manifest), valid: false };
    entries.push(entry);
    let fingerprint;
    try { fingerprint = canonical(manifest); }
    catch { issue(field, "non_json_input"); }
    if (runId !== null) {
      if (runIds.has(runId)) issue(field, runIds.get(runId) === fingerprint ? "duplicate_run_id" : "conflicting_run_identity");
      else runIds.set(runId, fingerprint);
    }
    let checked;
    try { checked = validateBackupSet(manifest, { now: new Date(completed ?? asOf ?? 0) }); }
    catch { issue(field, "validation_failed"); }
    if (checked) for (const item of checked.issues) issue(`${field}.${item.field}`, item.code);
    if (completed !== null && asOf !== null && completed > asOf) issue(field, "future_run");
    entry.valid = checked?.ok === true && completed !== null && asOf !== null && completed <= asOf;
    for (const ref of entry.snapshots) {
      const identity = JSON.stringify([ref.repositoryId, ref.snapshotId]);
      if (snapshotOwners.has(identity) && snapshotOwners.get(identity) !== runId) issue(field, "snapshot_claimed_by_multiple_runs");
      else snapshotOwners.set(identity, runId);
      if (ref.kind !== "manifest") {
        if (repositoryKinds.has(ref.repositoryId) && repositoryKinds.get(ref.repositoryId) !== ref.kind) issue(field, "conflicting_repository_kind");
        else repositoryKinds.set(ref.repositoryId, ref.kind);
      }
    }
  }
  const complete = entries.filter((entry) => entry.valid).sort(orderRuns);
  if (complete.length === 0) issue("manifests", "no_complete_run");
  const reasons = new Map(); const periods = {}; const availableNonemptyPeriods = {}; const selectedPeriodCounts = {};
  for (const [granularity, retain] of Object.entries(POLICY)) {
    const buckets = new Map();
    for (const entry of complete) {
      const bucket = calendarPeriod(entry.completed, granularity);
      const existing = buckets.get(bucket.period);
      if (!existing) buckets.set(bucket.period, { ...bucket, completed: entry.completed, latest: [entry] });
      else if (entry.completed === existing.completed) existing.latest.push(entry);
    }
    availableNonemptyPeriods[granularity] = buckets.size;
    const chosen = [...buckets.values()].sort((a, b) => b.start - a.start).slice(0, retain);
    selectedPeriodCounts[granularity] = chosen.length;
    periods[granularity] = chosen.map((bucket) => {
      for (const entry of bucket.latest) {
        if (!reasons.has(entry.inputIndex)) reasons.set(entry.inputIndex, []);
        reasons.get(entry.inputIndex).push({ granularity, period: bucket.period });
      }
      return { period: bucket.period, startUtc: bucket.startUtc, endExclusiveUtc: bucket.endExclusiveUtc, runIds: bucket.latest.map((entry) => entry.runId) };
    });
  }
  // Every latest complete run (including tied times) is an explicit safety floor.
  if (complete.length) for (const entry of complete.filter((item) => item.completed === complete[0].completed)) {
    if (!reasons.has(entry.inputIndex)) reasons.set(entry.inputIndex, []);
    reasons.get(entry.inputIndex).push({ granularity: "last_complete", period: null });
  }
  const describe = (entry) => ({ inputIndex: entry.inputIndex, runId: entry.runId, completedAtUtc: entry.completed === null ? null : new Date(entry.completed).toISOString(), snapshots: entry.snapshots.map((ref) => ({ ...ref })), reasons: reasons.get(entry.inputIndex) ?? [] });
  const keepRuns = complete.filter((entry) => reasons.has(entry.inputIndex)).map(describe);
  const blocked = issues.length > 0;
  const lastComplete = complete[0]?.completed ?? null;
  return {
    schemaVersion: 1, status: "PREPARATION_ONLY", asOfUtc: asOf === null ? null : new Date(asOf).toISOString(),
    policy: { ...POLICY }, periodBasis: "LATEST_COMPLETE_IN_LAST_NONEMPTY_UTC_CALENDAR_PERIODS", weeksStart: "MONDAY_ISO",
    executable: false, deletionAuthorized: false, evidenceVerified: false, g09Accepted: false,
    deletionPlanBlocked: blocked, protectAllInput: blocked, issues,
    protectionScope: blocked ? "ALL_INPUT_AND_UNRESOLVED_REFERENCES" : "SELECTED_COMPLETE_RUNS_AND_ALL_UNLISTED_SNAPSHOTS",
    inputCount: manifests.length, completeRunCount: complete.length,
    protectedInputIndices: blocked ? overLimit ? null : entries.map((entry) => entry.inputIndex) : keepRuns.map((entry) => entry.inputIndex),
    keepRuns, protectedRuns: blocked ? entries.map(describe) : keepRuns,
    reviewCandidates: blocked ? [] : complete.filter((entry) => !reasons.has(entry.inputIndex)).map(describe),
    periods, selectedPeriodCounts,
    history: { availableNonemptyPeriods, oldestCompleteAtUtc: complete.length ? new Date(complete.at(-1).completed).toISOString() : null, newestCompleteAtUtc: lastComplete === null ? null : new Date(lastComplete).toISOString(), spanDays: complete.length ? (lastComplete - complete.at(-1).completed) / DAY_MS : 0, retentionVerified: false, notice: "Counts describe submitted nonempty calendar periods; they do not prove elapsed retention or real backups." },
    freshness: { lastCompleteAtUtc: lastComplete === null ? null : new Date(lastComplete).toISOString(), lastCompleteOlderThan26h: lastComplete === null || asOf === null ? null : asOf - lastComplete > 26 * 3600000, verified: false },
    notice: "No repository inventory or evidence was read. Candidates are complete-set review data, never authorization or commands to remove snapshots.",
  };
}

/** Same descriptor for metadata/read; bounded even when the opened file grows. */
export function runCli(argv, { stdout = process.stdout, stderr = process.stderr, files = LOCAL_FILES } = {}) {
  if (argv.length === 1 && argv[0] === "--help") { stdout.write(HELP); return 0; }
  if (argv.length !== 1 || typeof argv[0] !== "string" || !argv[0] || argv[0].startsWith("-") || /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(argv[0]) || /^[\\/]{2}/.test(argv[0])) { stderr.write("Błąd argumentów. Użyj --help.\n"); return 2; }
  let fd; let parsed; let failed = false;
  try {
    fd = files.openSync(argv[0], INPUT_FLAGS);
    const stat = files.fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_INPUT_BYTES) throw new Error("invalid_input");
    const bytes = Buffer.alloc(MAX_INPUT_BYTES + 1); let length = 0;
    while (length < bytes.length) {
      const read = files.readSync(fd, bytes, length, bytes.length - length, null);
      if (!Number.isSafeInteger(read) || read < 0 || read > bytes.length - length) throw new Error("invalid_read");
      if (read === 0) break;
      length += read;
    }
    if (length > MAX_INPUT_BYTES) throw new Error("input_limit");
    parsed = JSON.parse(bytes.subarray(0, length).toString("utf8").replace(/^\uFEFF/, ""));
  } catch { failed = true; }
  finally { if (fd !== undefined) { try { files.closeSync(fd); } catch { failed = true; } } }
  if (failed) { stderr.write("Nie można odczytać lokalnego JSON. Szczegóły wejścia są prywatne.\n"); return 2; }
  let plan;
  try { plan = planBackupRetention(parsed); }
  catch { stderr.write("Nieprawidłowa struktura historii. Szczegóły wejścia są prywatne.\n"); return 1; }
  stdout.write(`${JSON.stringify({ status: plan.status, deletionPlanBlocked: plan.deletionPlanBlocked, protectAllInput: plan.protectAllInput, inputCount: plan.inputCount, completeRunCount: plan.completeRunCount, retainedRunCount: plan.keepRuns.length, reviewCandidateCount: plan.reviewCandidates.length, selectedPeriodCounts: plan.selectedPeriodCounts, availableNonemptyPeriods: plan.history.availableNonemptyPeriods, evidenceVerified: false, g09Accepted: false, executable: false, deletionAuthorized: false, issueCodes: [...new Set(plan.issues.map((item) => item.code))] })}\n`);
  return plan.deletionPlanBlocked ? 1 : 0;
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) process.exitCode = runCli(process.argv.slice(2));
