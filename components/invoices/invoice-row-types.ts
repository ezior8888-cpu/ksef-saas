export interface InvoiceRow {
  id: string;
  internal_number: string | null;
  issue_date: string | null;
  buyer_data: {
    nip?: string;
    name?: string;
  } | null;
  gross_total: string | number | null;
  ksef_status: string;
  ksef_number: string | null;
  created_at: string;
  /** Obecność ścieżki = można pobrać XML (jak w `InvoiceActions`). */
  xml_storage_path?: string | null;
}
