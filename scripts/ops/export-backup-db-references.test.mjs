import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { exportBackupDbReferences, BackupDbReferenceExportError, main } from "./export-backup-db-references.mjs";
import { validateBackupReferences } from "./check-backup-references.mjs";
import { makeSyntheticBackupDbClients, syntheticCatalog, syntheticReferenceRow, SYNTHETIC_MAPPING_IDS } from "./fixtures/backup-db-client.mjs";

const MAP = JSON.parse(readFileSync(new URL("../../ops/observability/backup/storage-reference-map.json", import.meta.url), "utf8"));
const HASH = "a".repeat(64);
const exportFixture = async settings => { const f = makeSyntheticBackupDbClients(settings); return { ...await exportBackupDbReferences(f.options), fixture: f }; };
const addManifests = normalized => ({ ...normalized, objectManifests: ["application", "supabase"].map(source => ({
  source, runId: normalized.runId, complete: true, versioning: "Unversioned",
  objects: normalized.references.filter(r => r.source === source && r.key !== null && r.bucket !== null)
    .map(r => ({ bucket: r.bucket, key: r.key, bytes: 12, sha256: r.sha256 ?? HASH }))
})) });
async function rejects(options, code) {
  await assert.rejects(exportBackupDbReferences(options), error => error instanceof BackupDbReferenceExportError && error.code === code);
}
test("reads all 17 pinned scopes and inventories both DBs in separate read-only snapshots", async () => {
  const { normalizedReferences: n, report, fixture } = await exportFixture();
  assert.equal(n.referenceScope.complete, true);
  assert.deepEqual(n.referenceScope.mappingIds, SYNTHETIC_MAPPING_IDS);
  assert.deepEqual(Object.values(n.referenceScope.rowCounts), Array(17).fill(0));
  assert.deepEqual(report.queriedDatabaseNames, ["postgres", "_supabase"]);
  assert.deepEqual(report.mappedDatabaseNames, ["postgres"]);
  assert.deepEqual(report.unmappedDatabaseNames, ["_supabase"]);
  assert.equal(report.staticMapCoverage, true); assert.equal(report.runtimeSchemaReviewed, false);
  for (const field of ["databaseDumpConsistencyVerified","sharedDatabaseS3ConsistencyVerified","evidenceVerified","g09Accepted"]) assert.equal(report[field], false);
  assert.equal(validateBackupReferences(addManifests(n), MAP).ok, true);
  assert.equal(fixture.queries.filter(q => q.text.startsWith("SELECT octet_length")).length, 17);
  for (const db of ["postgres","_supabase"]) {
    const calls = fixture.queries.filter(q => q.database === db);
    assert.equal(calls[0].text, "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    assert.match(calls[1].text, /'row_security', 'off'/); assert.deepEqual(calls[1].values, ["10000","300000"]);
    assert.equal(calls.at(-1).text, "COMMIT");
  }
});
test("literal keys preserve whitespace, percent escapes, slashes, case and Unicode", async () => {
  const keys = [" A//a/../b%2Fc.xml ", "é", "e\u0301"];
  const { normalizedReferences: n } = await exportFixture({ references: {
    "invoices.xml_storage_path": keys.map((key, i) => syntheticReferenceRow({ reference_id: "synthetic-" + i, original_key: key, sha256: HASH }))
  } });
  assert.deepEqual(n.references.map(r => r.key), keys);
  assert.deepEqual(n.references.map(r => r.originalKey), keys);
  assert.equal(validateBackupReferences(addManifests(n), MAP).ok, true);
});
test("backup-relative keys use explicit shared or dedicated binding only", async () => {
  const f = makeSyntheticBackupDbClients({ references: { "backup_log.r2_key": [syntheticReferenceRow({ original_key: "db/file.gz", sha256: HASH })] } });
  let result = await exportBackupDbReferences(f.options);
  assert.equal(result.normalizedReferences.references[0].key, "backups/db/file.gz");
  const dedicated = makeSyntheticBackupDbClients({ references: { "backup_log.r2_key": [syntheticReferenceRow({ original_key: "backups/db/file.gz" })] } });
  dedicated.options.bucketBindings.applicationBackups = { mode: "dedicated", bucket: "synthetic-backup" };
  result = await exportBackupDbReferences(dedicated.options);
  assert.equal(result.normalizedReferences.references[0].key, "backups/db/file.gz");
  assert.equal(result.normalizedReferences.references[0].bucket, "synthetic-backup");
});
test("optional NULL paths remain explicit; missing and dangling hashes are not manufactured", async () => {
  const { normalizedReferences: n } = await exportFixture({ references: {
    "invoices.xml_storage_path": [syntheticReferenceRow({ original_key: null })],
    "invoices.archive_storage_path": [syntheticReferenceRow({ original_key: null })]
  } });
  for (const r of n.references) for (const field of ["key","originalKey","bucket","sha256"]) assert.equal(r[field], null);
  assert.equal(n.referenceScope.complete, true);
  const dangling = await exportFixture({ references: { "invoices.xml_storage_path": [syntheticReferenceRow({ original_key: null, sha256: HASH })] } });
  assert.equal(dangling.normalizedReferences.referenceScope.complete, false);
  assert.equal(dangling.normalizedReferences.references[0].sha256, HASH);
});
test("all mapped sources/hashes normalize without choosing an unverified provider", async () => {
  const references = Object.fromEntries(SYNTHETIC_MAPPING_IDS.filter(id => !["invoices.archive_storage_path","upo_receipts.archive_glacier_key","storage.objects.name"].includes(id))
    .map((id, i) => [id, [syntheticReferenceRow({ original_key: "synthetic/" + i, sha256: HASH, provider: id === "xml_documents.storage_path" ? "r2" : null })]]));
  const { normalizedReferences: n } = await exportFixture({ references });
  assert.equal(n.references.length, 14); assert.equal(n.referenceScope.complete, true);
  assert.equal(validateBackupReferences(addManifests(n), MAP).ok, true);
});
test("every nonempty Glacier and Supabase reference remains unresolved", async () => {
  for (const id of ["invoices.archive_storage_path","upo_receipts.archive_glacier_key","xml_documents.storage_path","storage.objects.name"]) {
    const { normalizedReferences: n, report } = await exportFixture({ references: {
      [id]: [syntheticReferenceRow({ provider: id === "xml_documents.storage_path" ? "s3_glacier" : null, sha256: id === "xml_documents.storage_path" ? HASH : null,
        logical_bucket_id: id === "storage.objects.name" ? "logical-private-bucket" : null })]
    } });
    assert.equal(n.referenceScope.complete, false); assert.equal(report.blockedMappingCount, 1);
    assert.equal(n.references[0].bucket, null); assert.equal(validateBackupReferences(addManifests(n), MAP).ok, false);
  }
});
test("NULL or unknown XML provider and absent required hash block coverage", async () => {
  for (const overrides of [{ provider: null, sha256: HASH }, { provider: "PRIVATE_PROVIDER", sha256: HASH }, { provider: "r2", sha256: null }]) {
    const { normalizedReferences: n } = await exportFixture({ references: { "xml_documents.storage_path": [syntheticReferenceRow(overrides)] } });
    assert.equal(n.referenceScope.complete, false); assert.equal(n.referenceScope.unresolvedMappings, 1);
  }
});
test("pending markers and required NULL values are visible blockers", async () => {
  for (const id of ["expenses.source_file_path","ocr_jobs.source_file_path"]) {
    const { normalizedReferences: n } = await exportFixture({ references: { [id]: [syntheticReferenceRow({ original_key: "pending" })] } });
    assert.equal(n.referenceScope.complete, false); assert.equal(n.references[0].key, "pending");
  }
  const { normalizedReferences: n } = await exportFixture({ references: { "ocr_jobs.source_file_path": [syntheticReferenceRow({ original_key: null })] } });
  assert.equal(n.referenceScope.complete, false);
});
test("new file-like columns in either database and nested audit members block complete", async () => {
  for (const db of ["postgres","_supabase"]) {
    const base = db === "postgres" ? syntheticCatalog() : [];
    const { normalizedReferences: n, report } = await exportFixture({ catalogs: { [db]: [...base,
      { schema_name: "public", table_name: "new_private_table", relation_kind: "r", column_name: "document_storage_path", type_name: "text" }] } });
    assert.equal(n.referenceScope.complete, false); assert.equal(report.unresolvedColumns, 1);
    assert(!JSON.stringify(report).includes("new_private_table"));
  }
  for (const auditDiscovery of [{ unknown_members: "2" }, { depth_limits: "1" }]) {
    const { normalizedReferences: n } = await exportFixture({ auditDiscovery }); assert.equal(n.referenceScope.complete, false);
  }
});
test("known audit queries distinguish missing JSON member from explicit JSON null without coercion", async () => {
  const { fixture } = await exportFixture();
  const audit = fixture.queries.filter(q => q.text.startsWith("SELECT octet_length") && q.text.includes("public.audit_logs"));
  assert.equal(audit.length, 2); assert(audit.every(q => q.text.includes("jsonb_typeof") && q.text.includes(" ? ")));
  assert(audit.every(q => !q.text.includes("->>")));
  const discovery = fixture.queries.find(q => q.text.startsWith("WITH RECURSIVE"));
  assert.match(discovery.text, /jsonb_array_elements/); assert.match(discovery.text, /m.depth < 32/);
});
test("SQL pins tenant/path/provider for invoice hash and never interpolates bucket or run values", async () => {
  const f = makeSyntheticBackupDbClients(); f.options.bucketBindings.applicationPrimary = "PRIVATE_'_SQL"; f.options.bucketBindings.applicationBackups.bucket = "PRIVATE_'_SQL";
  await exportBackupDbReferences(f.options);
  const first = f.queries.find(q => q.text.startsWith("SELECT octet_length"));
  assert.match(first.text, /x\.invoice_id = t\.id AND x\.tenant_id = t\.tenant_id AND x\.storage_path = t\.xml_storage_path AND x\.storage_provider = 'r2'/);
  for (const q of f.queries) { assert(!q.text.includes("PRIVATE")); assert(!q.text.includes(f.options.runId)); }
  assert.deepEqual(first.values, [10001,16384]);
});
test("input contract rejects wrong revision, extra trust flags, same client and invalid bindings before queries", async () => {
  for (const change of [
    o => { o.sourceRevision = "f".repeat(40); }, o => { o.dumpConsistencyVerified = true; },
    o => { o.supabaseClient = o.client; }, o => { o.runId = "INVALID ID"; }
  ]) { const f = makeSyntheticBackupDbClients(); change(f.options); await rejects(f.options,"INVALID_OPTIONS_OR_SOURCE_REVISION"); assert.equal(f.queries.length,0); }
  const f = makeSyntheticBackupDbClients(); f.options.bucketBindings.applicationBackups.bucket = "other";
  await rejects(f.options,"INVALID_BUCKET_BINDINGS"); assert.equal(f.queries.length,0);
});
test("missing required columns or unsupported deployed types fail closed with rollback", async () => {
  for (const catalog of [syntheticCatalog().filter(r => !(r.schema_name === "storage" && r.column_name === "name")),
    syntheticCatalog().map(r => r.schema_name === "storage" && r.column_name === "name" ? { ...r, type_name: "bytea" } : r)]) {
    const f = makeSyntheticBackupDbClients({ catalogs: { postgres: catalog } });
    await rejects(f.options, "MISSING_OR_UNSUPPORTED_RUNTIME_COLUMN");
    assert.equal(f.queries.filter(q => q.text === "ROLLBACK").length, 2);
  }
});
test("RLS filtering or wrong DB identity cannot be accepted as complete", async () => {
  for (const context of [
    { database_name: "wrong", isolation: "repeatable read", read_only: "on", row_security: "off" },
    { database_name: "postgres", isolation: "repeatable read", read_only: "on", row_security: "on" }
  ]) {
    const f = makeSyntheticBackupDbClients({ onQuery: q => q.text.startsWith("SELECT current_database()") ? { rows: [context] } : undefined });
    await rejects(f.options, "UNSAFE_DATABASE_CONTEXT");
    assert.equal(f.queries.at(-1).text, "ROLLBACK");
  }
  const f = makeSyntheticBackupDbClients({ onQuery: q => { if (q.text.startsWith("SELECT octet_length")) throw Object.assign(new Error("PRIVATE RLS detail"),{ code:"42501" }); } });
  await rejects(f.options, "DATABASE_QUERY_OR_STRUCTURE_FAILED"); assert.equal(f.queries.filter(q => q.text === "ROLLBACK").length, 2);
});
test("total row budget includes NULL references and does not silently truncate LIMIT + 1", async () => {
  const f = makeSyntheticBackupDbClients({ references: { "invoices.xml_storage_path": [syntheticReferenceRow({ original_key: null }),syntheticReferenceRow({ reference_id:"other",original_key:null })] } });
  f.options.limits = { maxRows: 1 }; await rejects(f.options, "ROW_LIMIT_EXCEEDED");
  assert.equal(f.queries.at(-1).text, "ROLLBACK");
});
test("catalog, normalized byte and per-row server limits reject oversized results", async () => {
  const catalog = makeSyntheticBackupDbClients(); catalog.options.limits = { maxCatalogRows: 1 }; await rejects(catalog.options,"ROW_LIMIT_EXCEEDED");
  const bytes = makeSyntheticBackupDbClients(); bytes.options.limits = { maxReferenceBytes: 10 }; await rejects(bytes.options,"REFERENCE_BYTE_LIMIT");
  const row = makeSyntheticBackupDbClients({ onQuery: q => q.text.startsWith("SELECT octet_length") ? { rows: [{ oversized: true, reference_row: null }] } : undefined });
  await rejects(row.options, "OVERSIZED_OR_INVALID_REFERENCE_ROW");
});
test("duplicate identities and malformed JSON/hash field types cannot pass", async () => {
  for (const invalid of [42, {}, [], undefined]) {
    const f = makeSyntheticBackupDbClients({ references: { "audit_logs.previous_xml_storage_path": [syntheticReferenceRow({ original_key: invalid })] } });
    await rejects(f.options, "INVALID_REFERENCE_VALUE");
  }
  const f = makeSyntheticBackupDbClients({ references: { "invoices.xml_storage_path": [syntheticReferenceRow(),syntheticReferenceRow()] } });
  await rejects(f.options, "DUPLICATE_REFERENCE_ROW");
});
test("driver failure is redacted and requires discarding uncertain client state", async () => {
  const f = makeSyntheticBackupDbClients({ onQuery: () => { throw new Error("PRIVATE_PASSWORD PRIVATE_ROW PRIVATE_HOST"); } });
  await assert.rejects(exportBackupDbReferences(f.options), e => e.code === "DATABASE_QUERY_OR_STRUCTURE_FAILED" && e.discardClientRequired === true && !e.message.includes("PRIVATE"));
  assert.equal(f.queries.length,1);
});
test("query watchdog bounds hung transport and never queues rollback behind it", async () => {
  const f = makeSyntheticBackupDbClients({ onQuery: () => new Promise(() => {}) });
  f.options.limits = { statementTimeoutMs: 10 };
  await assert.rejects(exportBackupDbReferences(f.options), e => e.code === "QUERY_TIMEOUT" && e.discardClientRequired);
  assert.equal(f.queries.length,1);
});
test("pre-abort is inert, and abort in flight returns no partial references", async () => {
  const pre = makeSyntheticBackupDbClients(); pre.options.signal = AbortSignal.abort(); await rejects(pre.options, "ABORTED"); assert.equal(pre.queries.length,0);
  const controller = new AbortController();
  const f = makeSyntheticBackupDbClients({ onQuery: () => { controller.abort(); return new Promise(() => {}); } });
  f.options.signal = controller.signal;
  await assert.rejects(exportBackupDbReferences(f.options), e => e.code === "ABORTED" && e.discardClientRequired);
  assert.equal(f.queries.length,1);
});
test("failed bounded rollback requires client discard and never leaks driver errors", async () => {
  const f = makeSyntheticBackupDbClients({ onQuery: q => {
    if (q.text.startsWith("SELECT current_database()")) return { rows: [] };
    if (q.text === "ROLLBACK") throw new Error("PRIVATE_CLEANUP_DETAIL");
  } });
  await assert.rejects(exportBackupDbReferences(f.options), e => e.code === "UNSAFE_DATABASE_CONTEXT" && e.discardClientRequired && !e.message.includes("PRIVATE"));
});
test("public report and inert CLI never include private IDs, keys, buckets, hashes or run ID", async () => {
  const f = makeSyntheticBackupDbClients({ references: { "invoices.xml_storage_path": [syntheticReferenceRow({ reference_id:"PRIVATE_ROW",original_key:"PRIVATE_KEY",sha256:HASH })] } });
  f.options.runId = "PRIVATE_RUN"; f.options.bucketBindings.applicationPrimary = "PRIVATE_BUCKET"; f.options.bucketBindings.applicationBackups.bucket = "PRIVATE_BUCKET";
  const result = await exportBackupDbReferences(f.options), output = JSON.stringify(result.report);
  for (const privateValue of ["PRIVATE_ROW","PRIVATE_KEY","PRIVATE_RUN","PRIVATE_BUCKET",HASH]) assert(!output.includes(privateValue));
  let help = ""; assert.equal(main(["--help"], x => { help += x; }),0); assert.equal(main(["--run","PRIVATE_PATH"], x => { help += x; }),2);
  assert(!help.includes("PRIVATE_PATH")); assert(help.includes("PRIVATE"));
});

test("obvious XML/PDF/UPO/document/object/blob/upload/image drift names are classified in schema and audit discovery", async () => {
  const names = ["xml_path","pdf_path","upo_path","document_path","object_key","blob_key","upload_url","image_url"];
  const catalog = syntheticCatalog().concat(names.map(column_name => ({ schema_name:"public",table_name:"new_references",
    relation_kind:"r", column_name, type_name:"text" })));
  const { normalizedReferences, report, fixture } = await exportFixture({ catalogs: { postgres: catalog } });
  assert.equal(report.unresolvedColumns, names.length); assert.equal(normalizedReferences.referenceScope.complete,false);
  const audit = fixture.queries.find(q => q.text.startsWith("WITH RECURSIVE"));
  const marker = new RegExp(audit.values[0], "i");
  for (const name of names) assert(marker.test(name));
});
