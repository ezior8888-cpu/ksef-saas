#!/usr/bin/env node
/**
 * Explicit, read-only DB extraction preparation. Import/help never connect.
 * Supply two dedicated connected pg-compatible clients; no pool.query.
 * normalizedReferences is PRIVATE. Only report and error.code are public.
 * No DB dump, S3 export, migration, network setup, file output or G09 PASS.
 *
 * row_security=off FAILS when RLS would filter rows; it does not grant access.
 * https://www.postgresql.org/docs/current/runtime-config-client.html
 * https://www.postgresql.org/docs/current/sql-set-transaction.html
 * https://node-postgres.com/apis/client
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REVISION = "face09c57f7de756546e58d092dbe6d280f93c91";
const MAP_ID = "f0-storage-reference-map-v1";
const MAP_URL = new URL("../../ops/observability/backup/storage-reference-map.json", import.meta.url);
const LIMITS = Object.freeze({ maxRows: 10_000, maxCatalogRows: 10_000,
  maxReferenceBytes: 1024 * 1024, maxRowBytes: 16 * 1024, statementTimeoutMs: 10_000, maxDurationMs: 300_000 });
const RUN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SHA = /^[a-fA-F0-9]{64}$/;
const text = (value, max = 1024) => typeof value === "string" && value.length > 0
  && Buffer.byteLength(value, "utf8") <= max && !value.includes("\0");
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const keysOnly = (value, keys) => record(value) && Object.keys(value).every(key => keys.includes(key));
const FILE_MEMBER = "(storage|file|archive|attachment|r2|s3|glacier|xml|pdf|upo|document|object|blob|upload|image).*(path|key|url)|(path|key|url).*(storage|file|archive|attachment|r2|s3|glacier|xml|pdf|upo|document|object|blob|upload|image)";
const FILE_COLUMN = new RegExp(FILE_MEMBER, "i");

// All identifiers and expressions are fixed source code, never caller/map SQL.
const DEFINITIONS = [
  ["invoices.xml_storage_path", "public.invoices", "xml_storage_path", "application", true, false,
    "(SELECT x.sha256_hash FROM public.xml_documents x WHERE x.invoice_id = t.id AND x.tenant_id = t.tenant_id AND x.storage_path = t.xml_storage_path AND x.storage_provider = 'r2')"],
  ["invoices.pdf_storage_path", "public.invoices", "pdf_storage_path", "application", true, false],
  ["invoices.archive_storage_path", "public.invoices", "archive_storage_path", "glacier", true, false],
  ["xml_documents.storage_path", "public.xml_documents", "storage_path", "provider", false, true, "t.sha256_hash", "t.storage_provider"],
  ["ksef_submissions.xml_storage_path", "public.ksef_submissions", "xml_storage_path", "application", true, false, "t.request_payload_hash"],
  ["upo_receipts.upo_xml_path", "public.upo_receipts", "upo_xml_path", "application", true, false, "t.upo_xml_hash"],
  ["upo_receipts.upo_pdf_path", "public.upo_receipts", "upo_pdf_path", "application", true, false],
  ["upo_receipts.archive_glacier_key", "public.upo_receipts", "archive_glacier_key", "glacier", true, false],
  ["import_jobs.source_file_path", "public.import_jobs", "source_file_path", "application", true, false],
  ["expenses.source_file_path", "public.expenses", "source_file_path", "application", true, false],
  ["ocr_jobs.source_file_path", "public.ocr_jobs", "source_file_path", "application", false, false],
  ["payment_reminders.pdf_attachment_path", "public.payment_reminders", "pdf_attachment_path", "application", true, false],
  ["export_files.r2_path", "public.export_files", "r2_path", "application", false, false, "t.file_hash"],
  ["backup_log.r2_key", "public.backup_log", "r2_key", "application", true, false, "t.checksum"],
  ["audit_logs.previous_xml_storage_path", "public.audit_logs", "details_json.previous_xml_storage_path", "application", true, false],
  ["audit_logs.previous.xml_storage_path", "public.audit_logs", "details_json.previous.xml_storage_path", "application", true, false],
  ["storage.objects.name", "storage.objects", "name + bucket_id", "supabase", false, false]
].map(([id, table, column, source, nullable, hashRequired, hashSql = "NULL::text", providerSql = "NULL::text"]) => {
  let keySql = "t." + column, where = "", logicalSql = "NULL::text";
  if (id === "audit_logs.previous_xml_storage_path") {
    keySql = "t.details_json -> 'previous_xml_storage_path'";
    where = " WHERE jsonb_typeof(t.details_json) = 'object' AND t.details_json ? 'previous_xml_storage_path'";
  } else if (id === "audit_logs.previous.xml_storage_path") {
    keySql = "t.details_json -> 'previous' -> 'xml_storage_path'";
    where = " WHERE jsonb_typeof(t.details_json -> 'previous') = 'object' AND (t.details_json -> 'previous') ? 'xml_storage_path'";
  } else if (source === "supabase") {
    keySql = "t.name"; logicalSql = "t.bucket_id";
  }
  return Object.freeze({ id, table, column, source, nullable, hashRequired,
    sql: "SELECT octet_length(row_to_json(r)::text) > $2 AS oversized, CASE WHEN octet_length(row_to_json(r)::text) <= $2 THEN row_to_json(r) ELSE NULL::json END AS reference_row FROM (SELECT t.id::text AS reference_id, " + keySql + " AS original_key, " + hashSql
      + " AS sha256, " + providerSql + " AS provider, " + logicalSql
      + " AS logical_bucket_id FROM " + table + " t" + where + " ORDER BY t.id LIMIT $1) r" });
});
const CATALOG_SQL = "SELECT n.nspname AS schema_name, c.relname AS table_name, c.relkind::text AS relation_kind, "
  + "a.attname AS column_name, t.typname AS type_name FROM pg_catalog.pg_attribute a "
  + "JOIN pg_catalog.pg_class c ON c.oid = a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace "
  + "JOIN pg_catalog.pg_type t ON t.oid = a.atttypid WHERE a.attnum > 0 AND NOT a.attisdropped "
  + "AND c.relkind IN ('r','p','v','m','f') AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' "
  + "ORDER BY n.nspname, c.relname, a.attnum LIMIT $1";
const CONTEXT_SQL = "SELECT current_database() AS database_name, current_setting('transaction_isolation') AS isolation, "
  + "current_setting('transaction_read_only') AS read_only, current_setting('row_security') AS row_security";
const SETTINGS_SQL = "SELECT pg_catalog.set_config('statement_timeout', $1, true), "
  + "pg_catalog.set_config('lock_timeout', $1, true), pg_catalog.set_config('idle_in_transaction_session_timeout', $2, true), "
  + "pg_catalog.set_config('search_path', 'pg_catalog', true), pg_catalog.set_config('row_security', 'off', true)";
const AUDIT_DISCOVERY_SQL = "WITH RECURSIVE members(member_path, value, depth) AS ("
  + "SELECT ARRAY[]::text[], details_json, 0 FROM public.audit_logs WHERE details_json IS NOT NULL UNION ALL "
  + "SELECT m.member_path || e.key, e.value, m.depth + 1 FROM members m CROSS JOIN LATERAL ("
  + "SELECT key, value FROM jsonb_each(CASE WHEN jsonb_typeof(m.value) = 'object' THEN m.value ELSE '{}'::jsonb END) "
  + "UNION ALL SELECT (ordinality - 1)::text, value FROM jsonb_array_elements("
  + "CASE WHEN jsonb_typeof(m.value) = 'array' THEN m.value ELSE '[]'::jsonb END) WITH ORDINALITY"
  + ") e WHERE m.depth < 32) SELECT count(*) FILTER (WHERE member_path[array_length(member_path, 1)] ~* $1 "
  + "AND member_path <> ARRAY['previous_xml_storage_path'] AND member_path <> ARRAY['previous','xml_storage_path'])::text AS unknown_members, "
  + "count(*) FILTER (WHERE depth = 32 AND (jsonb_typeof(value) = 'object' OR jsonb_typeof(value) = 'array'))::text AS depth_limits FROM members";

export const HELP = "Preparation only: import exportBackupDbReferences({client,supabaseClient,runId,sourceRevision,bucketBindings,limits?,signal?}).\n"
  + "Both clients must be dedicated, connected pg-compatible clients in idle state (never pool.query).\n"
  + "CLI is help-only: no connections, environment reads, private rows or file writes.\n"
  + "Return normalizedReferences is PRIVATE; report is safe for public output.\n"
  + "Live snapshots are never evidence of dump/DB/S3 consistency or G09 acceptance.\n"
  + "On timeout/abort or failed rollback, discard both supplied clients; this library cannot cancel an arbitrary transport.\n";
export class BackupDbReferenceExportError extends Error {
  constructor(code, discardClientRequired = false) {
    super("DB reference extraction incomplete: " + code);
    this.name = "BackupDbReferenceExportError"; this.code = code; this.discardClientRequired = discardClientRequired;
  }
}
const fail = code => { throw new BackupDbReferenceExportError(code); };

function validateOptions(options) {
  if (!keysOnly(options, ["client", "supabaseClient", "runId", "sourceRevision", "bucketBindings", "limits", "signal"])
    || !options.client || typeof options.client.query !== "function"
    || !options.supabaseClient || typeof options.supabaseClient.query !== "function"
    || options.client === options.supabaseClient || typeof options.runId !== "string" || !RUN.test(options.runId)
    || options.sourceRevision !== REVISION) fail("INVALID_OPTIONS_OR_SOURCE_REVISION");
  if (options.signal !== undefined && !(options.signal instanceof AbortSignal)) fail("INVALID_ABORT_SIGNAL");
  const bindings = options.bucketBindings;
  if (!keysOnly(bindings, ["applicationPrimary", "applicationBackups"]) || !text(bindings.applicationPrimary)
    || !keysOnly(bindings.applicationBackups, ["mode", "bucket"]) || !text(bindings.applicationBackups.bucket)
    || !["shared", "dedicated"].includes(bindings.applicationBackups.mode)
    || (bindings.applicationBackups.mode === "shared" && bindings.applicationBackups.bucket !== bindings.applicationPrimary)) fail("INVALID_BUCKET_BINDINGS");
  if (options.limits !== undefined && !keysOnly(options.limits, Object.keys(LIMITS))) fail("INVALID_LIMITS");
  const limits = { ...LIMITS, ...options.limits };
  for (const [key, value] of Object.entries(limits)) if (!Number.isSafeInteger(value) || value < 1 || value > LIMITS[key]) fail("INVALID_LIMITS");
  return { limits, bindings: { applicationPrimary: bindings.applicationPrimary, applicationBackups: { ...bindings.applicationBackups } } };
}
function checkMap() {
  let map; try { map = JSON.parse(readFileSync(MAP_URL, "utf8")); } catch { fail("REPOSITORY_MAP_UNREADABLE"); }
  if (!record(map) || map.schemaVersion !== 1 || map.mapId !== MAP_ID || map.sourceRevision !== REVISION
    || !Array.isArray(map.mappings) || map.mappings.length !== DEFINITIONS.length) fail("REPOSITORY_MAP_MISMATCH");
  for (const def of DEFINITIONS) {
    const matches = map.mappings.filter(m => m.id === def.id);
    const m = matches[0];
    if (matches.length !== 1 || m.database !== "postgres" || m.table !== def.table || m.column !== def.column
      || m.source !== def.source || m.nullable !== def.nullable || m.hashRequired !== def.hashRequired
      || m.keyRule !== (def.source === "supabase" ? "supabase-physical" : def.id === "backup_log.r2_key" ? "backup-relative" : "literal")) fail("REPOSITORY_MAP_MISMATCH");
  }
}
function boundedRows(result, max) {
  if (!record(result) || !Array.isArray(result.rows)) fail("INVALID_QUERY_RESULT");
  if (result.rows.length > max) fail("ROW_LIMIT_EXCEEDED");
  return result.rows;
}
function catalogRows(result, limits) {
  const rows = boundedRows(result, limits.maxCatalogRows), identities = new Set();
  for (const row of rows) {
    if (!keysOnly(row, ["schema_name", "table_name", "relation_kind", "column_name", "type_name"])
      || !text(row.schema_name, 256) || !text(row.table_name, 256) || !text(row.column_name, 256) || !text(row.type_name, 256)
      || !["r","p","v","m","f"].includes(row.relation_kind)) fail("INVALID_CATALOG_RESULT");
    const identity = JSON.stringify([row.schema_name, row.table_name, row.column_name]);
    if (identities.has(identity)) fail("DUPLICATE_CATALOG_COLUMN"); identities.add(identity);
  }
  return rows;
}
function verifySchema(catalog) {
  const required = new Map();
  function add(table, column, types) { required.set(table + "." + column, types); }
  for (const def of DEFINITIONS) {
    add(def.table, "id", ["uuid"]);
    if (def.source === "supabase") { add(def.table, "name", ["text", "varchar"]); add(def.table, "bucket_id", ["text", "varchar"]); }
    else if (def.table === "public.audit_logs") add(def.table, "details_json", ["jsonb"]);
    else add(def.table, def.column, ["text", "varchar"]);
  }
  for (const column of ["tenant_id", "invoice_id"]) add("public.xml_documents", column, ["uuid"]);
  add("public.invoices", "tenant_id", ["uuid"]);
  for (const [table, columns] of [
    ["public.xml_documents", ["storage_provider", "sha256_hash"]],
    ["public.ksef_submissions", ["request_payload_hash"]], ["public.upo_receipts", ["upo_xml_hash"]],
    ["public.export_files", ["file_hash"]], ["public.backup_log", ["checksum"]]
  ]) for (const column of columns) add(table, column, ["text", "varchar"]);
  const columns = new Map(catalog.map(row => [row.schema_name + "." + row.table_name + "." + row.column_name, row]));
  for (const [name, types] of required) {
    const row = columns.get(name);
    if (!row || !["r", "p"].includes(row.relation_kind) || !types.includes(row.type_name)) fail("MISSING_OR_UNSUPPORTED_RUNTIME_COLUMN");
  }
}
function unknownColumns(catalog, database) {
  const known = new Set(DEFINITIONS.map(d => d.table + "." + d.column));
  return catalog.filter(row => FILE_COLUMN.test(row.column_name)
    && (database !== "postgres" || !known.has(row.schema_name + "." + row.table_name + "." + row.column_name))).length;
}
function count(value) {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value) || !Number.isSafeInteger(Number(value))) fail("INVALID_DISCOVERY_COUNT");
  return Number(value);
}
function normalize(def, row, bindings) {
  if (!keysOnly(row, ["reference_id", "original_key", "sha256", "provider", "logical_bucket_id"])
    || !text(row.reference_id, 256) || !Object.hasOwn(row, "original_key") || !Object.hasOwn(row, "sha256")
    || !Object.hasOwn(row, "provider") || !Object.hasOwn(row, "logical_bucket_id")
    || (row.sha256 !== null && !text(row.sha256, 1024))
    || (row.provider !== null && !text(row.provider, 1024))
    || (row.logical_bucket_id !== null && !text(row.logical_bucket_id, 1024))) fail("INVALID_REFERENCE_ROW");
  // A malformed JSON value is never coerced into a path, nor into SQL NULL.
  if (row.original_key !== null && !text(row.original_key)) fail("INVALID_REFERENCE_VALUE");
  let source = def.source;
  if (source === "provider") source = row.provider === "r2" ? "application" : row.provider === "s3_glacier" ? "glacier" : "unknown";
  const originalKey = row.original_key;
  let key = originalKey, bucket = originalKey === null || source !== "application" ? null : bindings.applicationPrimary;
  if (def.id === "backup_log.r2_key" && originalKey !== null) {
    key = bindings.applicationBackups.mode === "shared" ? "backups/" + originalKey : originalKey;
    bucket = bindings.applicationBackups.bucket;
  }
  // A dangling hash on a NULL path stays a blocker, not a silently nulled hash.
  const sha256 = row.sha256;
  const reference = { mappingId: def.id, referenceId: row.reference_id, source, bucket, key, originalKey, sha256 };
  if (def.source === "provider") reference.provider = row.provider;
  if (def.source === "supabase") reference.logicalBucketId = row.logical_bucket_id;
  const optionalNull = originalKey === null && def.nullable && sha256 === null;
  const unsupported = !optionalNull && (originalKey === null || !text(key) || source !== "application"
    || (sha256 !== null && !SHA.test(sha256)) || (def.hashRequired && sha256 === null)
    || (["expenses.source_file_path","ocr_jobs.source_file_path"].includes(def.id) && originalKey === "pending"));
  return { reference, unsupported };
}

/**
 * No externally supplied "verified" flags. Snapshot is local to each DB only.
 * Runtime column checks and file-name heuristics are NOT an exhaustive current
 * schema/code review. Empty fixture data cannot certify an empty production DB.
 * Client promises that hang are bounded locally, but transport cancellation is
 * the caller's responsibility. Never return a timed-out client to its pool.
 */
export async function exportBackupDbReferences(options) {
  let state, limits, bindings;
  try {
    ({ limits, bindings } = validateOptions(options)); if (options.signal?.aborted) fail("ABORTED"); checkMap();
    state = { started: performance.now(), open: [], uncertain: false };
    const signal = options.signal;
    async function query(client, sql, values = [], cleanup = false) {
      if (!cleanup && signal?.aborted) throw new BackupDbReferenceExportError("ABORTED", state.open.length > 0);
      const remaining = limits.maxDurationMs - (performance.now() - state.started);
      if (!cleanup && remaining <= 0) throw new BackupDbReferenceExportError("DURATION_LIMIT", true);
      const timeout = cleanup ? limits.statementTimeoutMs : Math.min(limits.statementTimeoutMs, remaining);
      let timer, onAbort, settled = false;
      const pending = Promise.resolve().then(() => client.query({ text: sql, values, query_timeout: Math.ceil(timeout) })).catch(error => { if (!/^[A-Z0-9]{5}$/.test(error?.code ?? "")) state.uncertain = true; throw error; });
      // Rejection handler is installed by race even if the caller later times out.
      const watchdog = new Promise((resolve, reject) => {
        timer = setTimeout(() => { if (!settled) { state.uncertain = true; reject(new BackupDbReferenceExportError("QUERY_TIMEOUT", true)); } }, timeout);
        if (!cleanup && signal) {
          onAbort = () => { if (!settled) { state.uncertain = true; reject(new BackupDbReferenceExportError("ABORTED", true)); } };
          signal.addEventListener("abort", onAbort, { once: true });
        }
      });
      try { const result = await Promise.race([pending, watchdog]); settled = true; return result; }
      finally { settled = true; clearTimeout(timer); if (onAbort) signal.removeEventListener("abort", onAbort); }
    }
    const catalogs = [];
    for (const [client, database] of [[options.client, "postgres"], [options.supabaseClient, "_supabase"]]) {
      // Add before BEGIN so a failure still attempts cleanup; a watchdog never
      // queues ROLLBACK behind an unsettled query.
      state.open.push(client);
      await query(client, "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await query(client, SETTINGS_SQL, [String(limits.statementTimeoutMs), String(limits.maxDurationMs)]);
      const context = boundedRows(await query(client, CONTEXT_SQL), 1)[0];
      if (!context || context.database_name !== database || context.isolation !== "repeatable read"
        || context.read_only !== "on" || context.row_security !== "off") fail("UNSAFE_DATABASE_CONTEXT");
      const catalog = catalogRows(await query(client, CATALOG_SQL, [limits.maxCatalogRows + 1]), limits);
      catalogs.push(catalog);
    }
    verifySchema(catalogs[0]);
    const unresolvedColumns = unknownColumns(catalogs[0], "postgres") + unknownColumns(catalogs[1], "_supabase");
    const audit = boundedRows(await query(options.client, AUDIT_DISCOVERY_SQL, [FILE_MEMBER]), 1)[0];
    if (!audit || !keysOnly(audit, ["unknown_members", "depth_limits"])) fail("INVALID_DISCOVERY_RESULT");
    const unresolvedAuditMembers = count(audit.unknown_members), unresolvedAuditDepths = count(audit.depth_limits);
    const references = [], rowCounts = {}, blockedMappings = new Set();
    let bytes = 0;
    for (const def of DEFINITIONS) {
      const rows = boundedRows(await query(options.client, def.sql, [limits.maxRows - references.length + 1, limits.maxRowBytes]), limits.maxRows - references.length);
      rowCounts[def.id] = rows.length;
      const ids = new Set();
      for (const envelope of rows) {
        if (!keysOnly(envelope, ["oversized", "reference_row"]) || envelope.oversized !== false || !record(envelope.reference_row)) fail("OVERSIZED_OR_INVALID_REFERENCE_ROW");
        const normalized = normalize(def, envelope.reference_row, bindings);
        if (ids.has(normalized.reference.referenceId)) fail("DUPLICATE_REFERENCE_ROW");
        ids.add(normalized.reference.referenceId);
        if (normalized.unsupported) blockedMappings.add(def.id);
        bytes += Buffer.byteLength(JSON.stringify(normalized.reference), "utf8");
        if (bytes > limits.maxReferenceBytes) fail("REFERENCE_BYTE_LIMIT");
        references.push(normalized.reference);
      }
    }
    const unresolvedMappings = unresolvedColumns + unresolvedAuditMembers + unresolvedAuditDepths + blockedMappings.size;
    const normalizedReferences = { schemaVersion: 1, runId: options.runId, mapId: MAP_ID, sourceRevision: REVISION,
      referenceScope: { complete: unresolvedMappings === 0, databaseNames: ["postgres", "_supabase"],
        mappingIds: DEFINITIONS.map(d => d.id), rowCounts, unresolvedMappings, bucketBindings: bindings },
      references };
    if (Buffer.byteLength(JSON.stringify(normalizedReferences), "utf8") > limits.maxReferenceBytes) fail("REFERENCE_BYTE_LIMIT");
    for (const client of [...state.open].reverse()) { await query(client, "COMMIT"); state.open.splice(state.open.indexOf(client), 1); }
    return { normalizedReferences, report: { status: unresolvedMappings === 0 ? "EXTRACTED_PINNED_REFERENCE_SCOPE" : "EXTRACTED_WITH_UNRESOLVED_SCOPE",
      staticMapCoverage: true, runtimeSchemaReviewed: false, queriedDatabaseNames: ["postgres", "_supabase"],
      mappedDatabaseNames: ["postgres"], unmappedDatabaseNames: ["_supabase"], referenceCount: references.length,
      mappingCount: DEFINITIONS.length, catalogColumnCount: catalogs.reduce((sum, rows) => sum + rows.length, 0),
      unresolvedColumns, unresolvedAuditMembers, unresolvedAuditDepths, blockedMappingCount: blockedMappings.size,
      databaseReferenceExtractionPerformed: true, sourceAuthenticityVerified: false, databaseDumpConsistencyVerified: false,
      sharedDatabaseS3ConsistencyVerified: false, overallRecoveryComplete: false, evidenceVerified: false, g09Accepted: false,
      notice: "Only pinned references from caller-supplied clients; catalog/name heuristics are not a complete runtime schema review. No dump/DB/S3 consistency, backup or G09 acceptance." } };
  } catch (error) {
    let discard = state?.uncertain === true || error?.discardClientRequired === true;
    if (state && !state.uncertain) {
      for (const client of [...state.open].reverse()) {
        // Bounded cleanup, no details from database errors exposed.
        let timer;
        try { await Promise.race([Promise.resolve().then(() => client.query({ text: "ROLLBACK", values: [], query_timeout: limits.statementTimeoutMs })),
          new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error()), limits.statementTimeoutMs); })]); }
        catch { discard = true; } finally { clearTimeout(timer); }
      }
    }
    if (error instanceof BackupDbReferenceExportError) throw new BackupDbReferenceExportError(error.code, discard);
    throw new BackupDbReferenceExportError("DATABASE_QUERY_OR_STRUCTURE_FAILED", discard);
  }
}
export function main(args = [], write = value => process.stdout.write(value)) {
  write(HELP); return args.length === 0 || (args.length === 1 && args[0] === "--help") ? 0 : 2;
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) process.exitCode = main(process.argv.slice(2));
