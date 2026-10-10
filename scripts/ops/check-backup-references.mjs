#!/usr/bin/env node
/** Offline agreement of REPORTED normalized DB references and exported objects.
 * No DB/S3/SSH, subprocess, backup, restore or referenced-artifact reads.
 * Imports are inert. No key normalization. Digests/flags remain claims.
 */
import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SHA256 = /^[a-fA-F0-9]{64}$/;
const REVISION = /^[a-f0-9]{40}$/;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MAX_JSON_BYTES = 1024 * 1024;
const MAX_ITEMS = 10_000;
const SOURCES = ["application", "supabase"];
const LOCAL_FILES = { closeSync, fstatSync, openSync, readSync };
// Same FD for checks and reading. POSIX O_NOFOLLOW covers only the final
// component, not symlinked parents. Windows reparse-point refusal is not
// claimed; same opened object is retained. NONBLOCK avoids a FIFO open wait.
const INPUT_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);
const MAP_PATH = fileURLToPath(new URL("../../ops/observability/backup/storage-reference-map.json", import.meta.url));
export const NOTICE = "Spójność zgłoszonych referencji, nie dowód odczytu DB, autentyczności eksportu, wykonania kopii, restore ani PASS G09.";
export const HELP = "Użycie: node scripts/ops/check-backup-references.mjs <prywatny-normalized-references.json>\n       node scripts/ops/check-backup-references.mjs --help\nWyłącznie lokalny JSON i mapa repo (maks. 1 MiB każdy, 10000 wpisów na listę).\nNie czyta paths z manifestów, DB, S3, env ani usług. Klucze/buckety pozostają prywatne.\nExit 0: spójne deklaracje, nie autentyczność/PASS G09. Exit 1: braki/niespójność. Exit 2: CLI/JSON.\nKontrola i odczyt tego samego FD; O_NOFOLLOW tam, gdzie dostępne, bez gwarancji odmowy reparse points Windows.\n";
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value, max = 1024) => typeof value === "string" && value.length > 0 && Buffer.byteLength(value, "utf8") <= max && !value.includes("\0");
const hash = value => typeof value === "string" && SHA256.test(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
// A tuple, never a path or a delimiter-joined string. Case/Unicode kept exact.
const identity = (source, bucket, key) => JSON.stringify([source, bucket, key]);

/** Pure validation. `referenceMap` must be the trusted, revision-pinned repo map.
 * Caller-supplied complete/count/evidence flags are checked for agreement only.
 */
export function validateBackupReferences(bundle, referenceMap) {
  const counts = { references: 0, checkedReferences: 0, matchedReferences: 0,
    optionalNullReferences: 0, referencesWithoutExpectedHash: 0, missing: 0,
    unknown: 0, hashMismatches: 0, duplicateReferences: 0, exportedObjects: 0,
    duplicateExportedObjects: 0, exportedOrphans: 0, invalidObjects: 0, scopeErrors: 0 };
  const scopeError = () => { counts.scopeErrors++; };
  const result = () => { const ok = ["missing", "unknown", "hashMismatches", "duplicateReferences", "duplicateExportedObjects", "invalidObjects", "scopeErrors"].every(k => counts[k] === 0); return { ok, status: ok ? "CONSISTENT_REPORTED_REFERENCES" : "INCOMPLETE_OR_INCONSISTENT", counts, notice: NOTICE, evidenceVerified: false, g09Accepted: false }; };
  if (!record(bundle) || !record(referenceMap) || !Array.isArray(referenceMap.mappings)) { scopeError(); return result(); }
  const map = referenceMap; const scope = record(bundle.referenceScope) ? bundle.referenceScope : {};
  const mappings = new Map();
  if (map.schemaVersion !== 1 || !text(map.mapId, 128) || typeof map.sourceRevision !== "string" || !REVISION.test(map.sourceRevision) || map.mappings.length > MAX_ITEMS || map.mappings.length === 0) scopeError();
  for (const m of map.mappings.slice(0, MAX_ITEMS)) {
    if (!record(m) || !text(m.id, 128) || typeof m.nullable !== "boolean" || typeof m.hashRequired !== "boolean" || !["application", "supabase", "glacier", "provider"].includes(m.source) || !["literal", "backup-relative", "supabase-physical"].includes(m.keyRule)) { scopeError(); continue; }
    if (mappings.has(m.id)) scopeError(); else mappings.set(m.id, m);
  }
  if (bundle.schemaVersion !== 1 || typeof bundle.runId !== "string" || !RUN_ID.test(bundle.runId) || bundle.mapId !== map.mapId || bundle.sourceRevision !== map.sourceRevision) scopeError();
  if (scope.complete !== true || scope.unresolvedMappings !== 0) scopeError();
  const expectedDatabases = ["postgres", "_supabase"];
  if (!Array.isArray(scope.databaseNames) || scope.databaseNames.length !== 2 || expectedDatabases.some(db => scope.databaseNames.filter(value => value === db).length !== 1)) scopeError();
  if (!Array.isArray(scope.mappingIds) || scope.mappingIds.length !== mappings.size || [...mappings.keys()].some(id => scope.mappingIds.filter(value => value === id).length !== 1)) scopeError();
  const rows = record(scope.rowCounts) ? scope.rowCounts : {};
  if (Object.keys(rows).length !== mappings.size || [...mappings.keys()].some(id => !Object.hasOwn(rows, id) || !integer(rows[id]))) scopeError();
  const observedRows = new Map([...mappings.keys()].map(id => [id, 0]));
  const objects = new Map(); const referenced = new Set();
  const manifests = Array.isArray(bundle.objectManifests) ? bundle.objectManifests : [];
  if (!Array.isArray(bundle.objectManifests) || manifests.length !== 2) scopeError();
  for (const source of SOURCES) {
    const entries = manifests.filter(m => record(m) && m.source === source);
    if (entries.length !== 1) scopeError();
    const manifest = entries[0]; if (!manifest) continue;
    if (manifest.runId !== bundle.runId || manifest.complete !== true || manifest.versioning !== "Unversioned") scopeError();
    if (!Array.isArray(manifest.objects) || manifest.objects.length > MAX_ITEMS) scopeError();
    for (const obj of Array.isArray(manifest.objects) ? manifest.objects.slice(0, MAX_ITEMS) : []) {
      if (!record(obj) || !text(obj.bucket) || !text(obj.key) || !integer(obj.bytes) || !hash(obj.sha256) || obj.versionId != null || obj.deleteMarker === true || obj.isDeleteMarker === true) { counts.invalidObjects++; continue; }
      counts.exportedObjects++;
      const id = identity(source, obj.bucket, obj.key);
      if (objects.has(id)) counts.duplicateExportedObjects++;
      else objects.set(id, { sha256: obj.sha256.toLowerCase(), bytes: obj.bytes });
    }
  }
  const refs = Array.isArray(bundle.references) ? bundle.references : [];
  if (!Array.isArray(bundle.references) || refs.length > MAX_ITEMS) scopeError();
  counts.references = refs.length;
  const referenceIds = new Set();
  const bindings = record(scope.bucketBindings) ? scope.bucketBindings : {};
  for (const r of refs.slice(0, MAX_ITEMS)) {
    if (!record(r) || !text(r.mappingId, 128) || !text(r.referenceId, 256)) { counts.unknown++; continue; }
    const m = mappings.get(r.mappingId);
    if (!m) { counts.unknown++; continue; }
    observedRows.set(m.id, observedRows.get(m.id) + 1);
    const rid = JSON.stringify([m.id, r.referenceId]);
    if (referenceIds.has(rid)) counts.duplicateReferences++; else referenceIds.add(rid);
    let source = m.source;
    if (source === "provider") source = record(m.providerSources) && typeof r.provider === "string" && Object.hasOwn(m.providerSources, r.provider) ? m.providerSources[r.provider] : null;
    if (!source || r.source !== source) { counts.unknown++; continue; }
    if (r.key === null) {
      if (!m.nullable || r.originalKey !== null || r.bucket !== null || r.sha256 !== null) counts.unknown++;
      else counts.optionalNullReferences++;
      continue;
    }
    if (!SOURCES.includes(source) || !text(r.bucket) || !text(r.key) || !text(r.originalKey) || (r.sha256 !== null && !hash(r.sha256)) || (m.hashRequired && r.sha256 === null) || (Array.isArray(m.invalidSentinels) && m.invalidSentinels.includes(r.originalKey))) { counts.unknown++; continue; }
    let mapped = false;
    if (m.keyRule === "literal") mapped = r.key === r.originalKey && source === "application" && text(bindings.applicationPrimary) && r.bucket === bindings.applicationPrimary;
    else if (m.keyRule === "backup-relative") {
      const backup = record(bindings.applicationBackups) ? bindings.applicationBackups : {};
      const expectedKey = backup.mode === "shared" ? "backups/" + r.originalKey : backup.mode === "dedicated" ? r.originalKey : null;
      mapped = source === "application" && text(backup.bucket) && r.bucket === backup.bucket && r.key === expectedKey && (backup.mode !== "shared" || backup.bucket === bindings.applicationPrimary);
    } else if (m.keyRule === "supabase-physical") {
      // v1 has no trusted physical Supabase translation in the repo map.
      // An input complete flag/hash cannot bind logical name to physical key.
      // Every nonempty reference stays unknown until a verified rule exists.
      mapped = false;
    }
    if (!mapped) { counts.unknown++; continue; }
    counts.checkedReferences++;
    if (r.sha256 === null) counts.referencesWithoutExpectedHash++;
    const id = identity(source, r.bucket, r.key); const target = objects.get(id);
    if (!target) { counts.missing++; continue; }
    // Identity match is separate from agreement of a supplied expected hash.
    counts.matchedReferences++; referenced.add(id);
    if (r.sha256 !== null && r.sha256.toLowerCase() !== target.sha256) counts.hashMismatches++;
  }
  for (const [id, count] of observedRows) if (rows[id] !== count) scopeError();
  counts.exportedOrphans = [...objects.keys()].filter(id => !referenced.has(id)).length;
  return result();
}

function readJson(file, files) {
  let fd; let value; let failed = false;
  try {
    fd = files.openSync(file, INPUT_FLAGS); const stat = files.fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_JSON_BYTES) throw new Error("invalid_local_file");
    const bytes = Buffer.alloc(MAX_JSON_BYTES + 1); let length = 0;
    while (length < bytes.length) { const n = files.readSync(fd, bytes, length, bytes.length - length, null); if (!Number.isSafeInteger(n) || n < 0 || n > bytes.length - length) throw new Error("invalid_read"); if (n === 0) break; length += n; }
    if (length > MAX_JSON_BYTES) throw new Error("input_limit");
    value = JSON.parse(bytes.subarray(0, length).toString("utf8").replace(/^\uFEFF/, ""));
  } catch { failed = true; }
  finally { if (fd !== undefined) { try { files.closeSync(fd); } catch { failed = true; } } }
  if (failed) throw new Error("local_json_failed");
  return value;
}

/** Only local supplied JSON + trusted map. Never follows objectManifest.path. */
export function runCli(argv, { stdout = process.stdout, stderr = process.stderr, files = LOCAL_FILES, referenceMap } = {}) {
  if (argv.length === 1 && argv[0] === "--help") { stdout.write(HELP); return 0; }
  if (argv.length !== 1 || typeof argv[0] !== "string" || !argv[0] || argv[0].startsWith("-") || /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(argv[0]) || /^[\\/]{2}/.test(argv[0])) { stderr.write("Błąd argumentów. Użyj --help.\n"); return 2; }
  let input; let map;
  try { input = readJson(argv[0], files); map = referenceMap === undefined ? readJson(MAP_PATH, files) : referenceMap; }
  catch { stderr.write("Nie można odczytać poprawnego lokalnego JSON. Szczegóły wejścia są prywatne.\n"); return 2; }
  let result;
  try { result = validateBackupReferences(input, map); }
  catch { stderr.write("Niewłaściwa struktura zgłoszeń. Szczegóły wejścia są prywatne.\n"); return 1; }
  stdout.write(JSON.stringify(result) + "\n");
  if (!result.ok) stderr.write("Zgłoszenia niepełne lub niespójne. Wynik nie potwierdza kopii.\n");
  return result.ok ? 0 : 1;
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) process.exitCode = runCli(process.argv.slice(2));