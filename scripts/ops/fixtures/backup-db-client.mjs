/** Synthetic offline fixtures only. No environment, DB or network access. */
export const SYNTHETIC_REFERENCE_REVISION = "face09c57f7de756546e58d092dbe6d280f93c91";
export const SYNTHETIC_MAPPING_IDS = [
  "invoices.xml_storage_path", "invoices.pdf_storage_path", "invoices.archive_storage_path", "xml_documents.storage_path",
  "ksef_submissions.xml_storage_path", "upo_receipts.upo_xml_path", "upo_receipts.upo_pdf_path", "upo_receipts.archive_glacier_key",
  "import_jobs.source_file_path", "expenses.source_file_path", "ocr_jobs.source_file_path", "payment_reminders.pdf_attachment_path",
  "export_files.r2_path", "backup_log.r2_key", "audit_logs.previous_xml_storage_path", "audit_logs.previous.xml_storage_path", "storage.objects.name"
];
const TABLE_COLUMNS = {
  "public.invoices": { id: "uuid", tenant_id: "uuid", xml_storage_path: "text", pdf_storage_path: "text", archive_storage_path: "text" },
  "public.xml_documents": { id: "uuid", tenant_id: "uuid", invoice_id: "uuid", storage_path: "text", storage_provider: "varchar", sha256_hash: "varchar" },
  "public.ksef_submissions": { id: "uuid", xml_storage_path: "text", request_payload_hash: "varchar" },
  "public.upo_receipts": { id: "uuid", upo_xml_path: "text", upo_pdf_path: "text", archive_glacier_key: "text", upo_xml_hash: "text" },
  "public.import_jobs": { id: "uuid", source_file_path: "text" },
  "public.expenses": { id: "uuid", source_file_path: "text" },
  "public.ocr_jobs": { id: "uuid", source_file_path: "text" },
  "public.payment_reminders": { id: "uuid", pdf_attachment_path: "text" },
  "public.export_files": { id: "uuid", r2_path: "text", file_hash: "text" },
  "public.backup_log": { id: "uuid", r2_key: "text", checksum: "text" },
  "public.audit_logs": { id: "uuid", details_json: "jsonb" },
  "storage.objects": { id: "uuid", name: "text", bucket_id: "text" }
};
export function syntheticCatalog() {
  return Object.entries(TABLE_COLUMNS).flatMap(([table, columns]) => {
    const [schema_name, table_name] = table.split(".");
    return Object.entries(columns).map(([column_name, type_name]) => ({ schema_name, table_name, column_name, type_name, relation_kind: "r" }));
  });
}
export function syntheticReferenceRow(overrides = {}) {
  return { reference_id: "00000000-0000-4000-8000-000000000001", original_key: "synthetic/key.xml",
    sha256: null, provider: null, logical_bucket_id: null, ...overrides };
}
/** onQuery may return a query result, throw, or leave undefined for defaults. */
export function makeSyntheticBackupDbClients({ references = {}, catalogs = {}, auditDiscovery = {}, onQuery } = {}) {
  const queries = [], indexes = { postgres: 0, _supabase: 0 };
  function client(database) {
    return { async query(query) {
      queries.push({ database, ...structuredClone(query) });
      const override = await onQuery?.({ database, ...query });
      if (override !== undefined) return override;
      const sql = query.text;
      if (sql === "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" || sql === "COMMIT" || sql === "ROLLBACK"
        || sql.startsWith("SELECT pg_catalog.set_config")) return { rows: [] };
      if (sql.startsWith("SELECT current_database()")) return { rows: [{ database_name: database, isolation: "repeatable read", read_only: "on", row_security: "off" }] };
      if (sql.startsWith("SELECT n.nspname")) return { rows: structuredClone(catalogs[database] ?? (database === "postgres" ? syntheticCatalog() : [])) };
      if (sql.startsWith("WITH RECURSIVE members")) return { rows: [{ unknown_members: "0", depth_limits: "0", ...auditDiscovery }] };
      if (sql.startsWith("SELECT octet_length(row_to_json")) {
        if (database !== "postgres") throw new Error("Unexpected synthetic reference database");
        const id = SYNTHETIC_MAPPING_IDS[indexes[database]++];
        if (!id) throw new Error("Unexpected synthetic reference query count");
        return { rows: structuredClone(references[id] ?? []).map(row => ({ oversized: false, reference_row: row })) };
      }
      throw new Error("Unexpected synthetic query");
    } };
  }
  const primary = client("postgres"), supabase = client("_supabase");
  return { client: primary, supabaseClient: supabase, queries, options: {
    client: primary, supabaseClient: supabase, runId: "synthetic-db-run", sourceRevision: SYNTHETIC_REFERENCE_REVISION,
    bucketBindings: { applicationPrimary: "synthetic-primary", applicationBackups: { mode: "shared", bucket: "synthetic-primary" } }
  } };
}
