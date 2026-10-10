/**
 * Fakty do decyzji klienta przy nierozstrzygniętym 440 i do banera szkicu
 * wycofanego (D-A4-1b-3 PR B, sekcja 2.3 specyfikacji): wiersz faktury,
 * WSZYSTKIE wpisy `ksef_submissions` faktury (z surowym `original_check`)
 * i — przy powodzie `known-number` — odczyt faktury Y, która ma numer KSeF
 * oryginału. Polityka (`duplicateDecisionOptions`, `retiredDraftView`) liczy
 * na tych faktach to samo co blokada SQL `ksef_duplicate_decision_blocker`.
 *
 * Klient dowolny: strona i akcja klienta podają klienta sesji (RLS pozwala
 * czytać `ksef_submissions` i faktury własnej firmy), operator — klienta
 * serwisowego (filtr `tenant_id` jest w każdym zapytaniu). Tylko filtry `.eq`
 * — sortowanie i wybór znacznika w TypeScript (te same porządki co SQL).
 *
 * Sesja klienta nie widzi tabeli `payments` (00074) — polityka zna tylko
 * `paid_amount`; wiersze wpłat sprawdza RPC (odmowa z nazwą dokumentu).
 *
 * Każdy błąd odczytu rzuca (fail-closed): „nie wiem” to nie „można decydować”.
 */

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  duplicateMarker,
  type DuplicateDecisionFacts,
  type DuplicateDecisionInvoiceRow,
  type DuplicateDecisionKnownInvoice,
  type DuplicateDecisionSubmissionRow,
} from './duplicate-decision';

/** Kolumny faktury, które czyta polityka decyzji (strona dokłada brakujące do swojego odczytu). */
export const DUPLICATE_DECISION_INVOICE_COLUMNS =
  'id, tenant_id, internal_number, direction, ksef_status, last_error_code, ksef_number, invoice_kind, stripe_invoice_id, offline_idempotency_key, offline_qr_offline, offline_qr_certyfikat, paid_amount, issue_date, buyer_nip, buyer_data, gross_total, currency';

/** Kolumny wpisów `ksef_submissions` faktury — te same wiersze zasilają baner szkicu wycofanego. */
export const DUPLICATE_DECISION_SUBMISSION_COLUMNS =
  'id, status, session_reference_number, request_payload_hash, response_ksef_number, original_ksef_number, original_session_reference_number, original_check, attempted_at, completed_at';

/** Kolumny faktury Y (`known-number`). */
const KNOWN_INVOICE_COLUMNS = 'id, internal_number, ksef_number, direction, ksef_status';

const INVOICE_KEYS = DUPLICATE_DECISION_INVOICE_COLUMNS.split(',').map((c) => c.trim()) as Array<keyof DuplicateDecisionInvoiceRow>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

interface ReadError {
  message?: string;
}

function readFailure(what: string, error: ReadError): Error {
  return new Error(`loadDuplicateDecisionFacts: odczyt ${what} nieudany${error.message ? ` (${error.message})` : ''}`);
}

/**
 * Wiersz faktury podany przez stronę: musi mieć każdą kolumnę polityki —
 * brakująca kolumna (niewybrana w `select`) to błąd wywołującego, nie „brak
 * wpłat” ani „brak numeru KSeF”.
 */
function checkedInvoiceRow(row: DuplicateDecisionInvoiceRow): DuplicateDecisionInvoiceRow {
  const record = row as unknown as Record<string, unknown>;
  const missing = INVOICE_KEYS.filter((key) => record[key] === undefined);
  if (missing.length > 0) {
    throw new Error(`loadDuplicateDecisionFacts: wiersz faktury bez kolumn ${missing.join(', ')}`);
  }
  return row;
}

/**
 * Fakty polityki decyzji dla faktury `invoiceId` firmy `tenantId`. `invoiceRow`
 * — wiersz, który wywołujący już przeczytał (z kolumnami
 * `DUPLICATE_DECISION_INVOICE_COLUMNS`); bez niego ładowarka czyta go sama.
 * Brak faktury w tej firmie: `invoice: null` (polityka: `not-found`).
 */
export async function loadDuplicateDecisionFacts(
  client: SupabaseClient,
  tenantId: string,
  invoiceId: string,
  invoiceRow?: DuplicateDecisionInvoiceRow | null,
): Promise<DuplicateDecisionFacts> {
  let invoice: DuplicateDecisionInvoiceRow | null;
  if (invoiceRow) {
    invoice = checkedInvoiceRow(invoiceRow);
  } else {
    const { data, error } = await client
      .from('invoices')
      .select(DUPLICATE_DECISION_INVOICE_COLUMNS)
      .eq('id', invoiceId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) throw readFailure('faktury', error);
    invoice = (data as DuplicateDecisionInvoiceRow | null) ?? null;
  }

  const { data: rows, error: rowsError } = await client
    .from('ksef_submissions')
    .select(DUPLICATE_DECISION_SUBMISSION_COLUMNS)
    .eq('invoice_id', invoiceId)
    .eq('tenant_id', tenantId);
  if (rowsError) throw readFailure('historii wysyłki', rowsError);
  const submissions = (rows ?? []) as DuplicateDecisionSubmissionRow[];

  return { invoice, submissions, knownInvoice: await loadKnownInvoice(client, tenantId, invoiceId, submissions) };
}

/**
 * Faktura Y przy znaczniku `known-number`: czy nadal trzyma numer KSeF
 * oryginału i jest przyjęta (2.1.2 #11, uwaga 1 sprawdzenia). Identyfikator,
 * który nie jest UUID, albo brak Y — `holdsOriginal: false` (known-stale).
 */
async function loadKnownInvoice(
  client: SupabaseClient,
  tenantId: string,
  invoiceId: string,
  submissions: DuplicateDecisionSubmissionRow[],
): Promise<DuplicateDecisionKnownInvoice | null> {
  const marker = duplicateMarker(submissions);
  const check = marker && isRecord(marker.original_check) ? marker.original_check : null;
  if (!marker || !check || check.reason !== 'known-number' || !isRecord(check.knownInvoice)) return null;
  const id = check.knownInvoice.id;
  if (typeof id !== 'string' || id === '') return null;
  const recordedNumber = typeof check.knownInvoice.internalNumber === 'string' ? check.knownInvoice.internalNumber : null;
  if (!UUID.test(id)) return { id, internalNumber: recordedNumber, holdsOriginal: false };

  const { data, error } = await client
    .from('invoices')
    .select(KNOWN_INVOICE_COLUMNS)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw readFailure('faktury ze znanym numerem KSeF', error);
  const y = data as { id: string; internal_number: string | null; ksef_number: string | null; direction: string | null; ksef_status: string | null } | null;
  if (!y) return { id, internalNumber: recordedNumber, holdsOriginal: false };
  return {
    id,
    internalNumber: y.internal_number ?? recordedNumber,
    holdsOriginal: y.direction === 'outgoing'
      && y.ksef_status === 'accepted'
      && y.ksef_number != null
      && y.ksef_number === marker.original_ksef_number
      && y.id !== invoiceId,
  };
}
