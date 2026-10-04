/**
 * Historia prób wysyłki do KSeF (`ksef_submissions`, kolumny z 00099).
 *
 * Po co: KSeF po przyjęciu pliku nadaje numer sesji i numer referencyjny
 * faktury, zanim przydzieli numer KSeF. Zapisane od razu pozwalają:
 *   - po niepewnym wyniku (timeout pollingu, 5xx, padnięty worker) zapytać
 *     KSeF o status tej samej wysyłki zamiast wysyłać fakturę drugi raz,
 *   - rozpoznać, że odpowiedź 440 „duplikat” dotyczy naszej wcześniejszej
 *     wysyłki (ten sam numer sesji), a nie cudzej faktury o tym numerze,
 *   - pobrać UPO, które w KSeF 2.0 leży wyłącznie w zasobach sesji.
 *
 * Zamiar (A2, 00136): wpis `intent` z numerem sesji powstaje po otwarciu
 * sesji, PRZED wysłaniem pliku. Gdy odpowiedź na wysyłkę zginie (timeout,
 * padnięty worker, błąd zapisu), ponowienie wie, o którą sesję zapytać KSeF,
 * zamiast wysyłać fakturę drugi raz. Statusy wpisu:
 *   intent → sent (KSeF przyjął plik, znamy numer referencyjny faktury)
 *          → abandoned (pliku w tej sesji nie ma — wysyłka może iść od nowa)
 *   sent   → accepted | rejected | duplicate | number_taken
 * `intent` i `sent` są dowodem kontaktu z KSeF (00131/00136), `abandoned` nie.
 * `number_taken` (D-A4-1, 00142): KSeF odrzucił plik jako duplikat, a oryginał
 * pochodzi z innego programu (treść sprawdzona) — nie jest dowodem kontaktu.
 *
 * Tylko service_role (00027) — wywołania wyłącznie z jobów.
 */

import { createAdminClient } from '@/lib/supabase/admin';

export interface KsefSubmissionReferences {
  sessionReferenceNumber: string;
  invoiceReferenceNumber: string;
  /** Klucz XML tej próby w magazynie (D5, kolumna z 00134); `null` dla wpisów sprzed zmiany. */
  xmlStoragePath?: string | null;
  /** Kiedy plik dotarł do KSeF — po 48 h bez odpowiedzi KSeF wpis uznajemy za zalegający (I5). */
  attemptedAt?: string | null;
  /** SHA-256 hex pliku tej próby. */
  payloadHash?: string | null;
  /**
   * D-A4-1 (00142): KSeF odpowiedział na tę próbę 440, a werdykt czeka —
   * numer KSeF i sesja oryginału. Uzgodnienie idzie wtedy prosto do
   * weryfikacji treści (nie pyta o status starej sesji, nie zamyka jako STALE).
   */
  originalKsefNumber?: string | null;
  originalSessionReferenceNumber?: string | null;
}

type SubmissionStatus = 'intent' | 'sent' | 'accepted' | 'rejected' | 'duplicate' | 'abandoned' | 'number_taken';

/** Zamiar wysyłki bez numeru referencyjnego faktury — do rozstrzygnięcia w KSeF. */
export interface KsefSubmissionIntent {
  sessionReferenceNumber: string;
  /** SHA-256 hex pliku tej próby (jak `xml_documents.sha256_hash`). */
  payloadHash: string | null;
  xmlStoragePath: string | null;
  attemptedAt: string | null;
}

/**
 * Zamiar wysyłki: sesja otwarta, plik jeszcze nie wysłany (A2). Rzuca przy
 * błędzie bazy — wtedy plik NIE może wyjść do KSeF.
 */
export async function recordKsefSubmissionIntent(params: {
  tenantId: string;
  invoiceId: string;
  sessionReferenceNumber: string;
  payloadHash?: string | null;
  xmlStoragePath?: string | null;
}): Promise<void> {
  const { error } = await createAdminClient()
    .from('ksef_submissions')
    .insert({
      tenant_id: params.tenantId,
      invoice_id: params.invoiceId,
      submission_type: 'online',
      status: 'intent' satisfies SubmissionStatus,
      session_reference_number: params.sessionReferenceNumber,
      invoice_reference_number: null,
      request_payload_hash: params.payloadHash ?? null,
      xml_storage_path: params.xmlStoragePath ?? null,
    });
  if (error) throw new Error('Nie można zapisać zamiaru wysyłki KSeF — faktura nie została wysłana');
}

/**
 * Zamiar tej sesji → `sent` z numerem referencyjnym faktury. Zwraca, czy był
 * zamiar do awansu (wpisy sprzed 00136 go nie mają). Rzuca przy błędzie bazy.
 */
export async function promoteKsefSubmissionIntent(params: {
  tenantId: string;
  invoiceId: string;
  sessionReferenceNumber: string;
  invoiceReferenceNumber: string;
}): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from('ksef_submissions')
    .update({
      status: 'sent' satisfies SubmissionStatus,
      invoice_reference_number: params.invoiceReferenceNumber,
    })
    .eq('tenant_id', params.tenantId)
    .eq('invoice_id', params.invoiceId)
    .eq('session_reference_number', params.sessionReferenceNumber)
    .eq('status', 'intent')
    .select('id');
  if (error) throw new Error('Nie można zapisać numerów referencyjnych wysyłki KSeF');
  return Array.isArray(data) && data.length > 0;
}

/**
 * Zamiar tej sesji → `abandoned`: KSeF nie ma pliku z tej próby (pusta sesja
 * albo odmowa przyjęcia pliku). Przestaje być dowodem kontaktu. Rzuca przy
 * błędzie bazy.
 */
export async function abandonKsefSubmissionIntent(params: {
  tenantId: string;
  invoiceId: string;
  sessionReferenceNumber: string;
  errorCode: string;
  errorMessage: string;
}): Promise<void> {
  const { error } = await createAdminClient()
    .from('ksef_submissions')
    .update({
      status: 'abandoned' satisfies SubmissionStatus,
      error_code: params.errorCode.slice(0, 20),
      error_message: params.errorMessage.slice(0, 500),
      completed_at: new Date().toISOString(),
    })
    .eq('tenant_id', params.tenantId)
    .eq('invoice_id', params.invoiceId)
    .eq('session_reference_number', params.sessionReferenceNumber)
    .eq('status', 'intent');
  if (error) throw new Error('Nie można zamknąć zamiaru wysyłki KSeF');
}

/**
 * Zamiary tej faktury bez rozstrzygnięcia, od najstarszego. Rzuca przy błędzie
 * bazy — bez tej wiedzy nie wolno wysyłać ponownie.
 */
export async function findOpenKsefSubmissionIntents(
  tenantId: string,
  invoiceId: string,
): Promise<KsefSubmissionIntent[]> {
  const { data, error } = await createAdminClient()
    .from('ksef_submissions')
    .select('session_reference_number, request_payload_hash, xml_storage_path, attempted_at')
    .eq('tenant_id', tenantId)
    .eq('invoice_id', invoiceId)
    .eq('status', 'intent')
    .not('session_reference_number', 'is', null)
    .order('attempted_at', { ascending: true });
  if (error) throw new Error('Nie można odczytać historii wysyłki KSeF');
  return (data ?? []).map((r) => ({
    sessionReferenceNumber: r.session_reference_number as string,
    payloadHash: r.request_payload_hash ?? null,
    xmlStoragePath: r.xml_storage_path ?? null,
    attemptedAt: r.attempted_at ?? null,
  }));
}

/**
 * Zapis zaraz po przyjęciu pliku przez KSeF: zamiar tej sesji staje się
 * wpisem `sent`; bez zamiaru (wywołanie sprzed 00136) — nowy wpis. Rzuca przy
 * błędzie bazy — wywołujący decyduje, czy kontynuować (wysyłka już się odbyła).
 */
export async function recordKsefSubmissionSent(params: {
  tenantId: string;
  invoiceId: string;
  references: KsefSubmissionReferences;
  payloadHash?: string | null;
  /** Klucz XML, który poszedł do KSeF w tej próbie (D5). */
  xmlStoragePath?: string | null;
}): Promise<void> {
  const promoted = await promoteKsefSubmissionIntent({
    tenantId: params.tenantId,
    invoiceId: params.invoiceId,
    sessionReferenceNumber: params.references.sessionReferenceNumber,
    invoiceReferenceNumber: params.references.invoiceReferenceNumber,
  });
  if (promoted) return;
  const { error } = await createAdminClient()
    .from('ksef_submissions')
    .insert({
      tenant_id: params.tenantId,
      invoice_id: params.invoiceId,
      submission_type: 'online',
      status: 'sent' satisfies SubmissionStatus,
      session_reference_number: params.references.sessionReferenceNumber,
      invoice_reference_number: params.references.invoiceReferenceNumber,
      request_payload_hash: params.payloadHash ?? null,
      xml_storage_path: params.xmlStoragePath ?? null,
    });
  if (error) throw new Error('Nie można zapisać numerów referencyjnych wysyłki KSeF');
}

/** Zamknięcie wpisu po rozstrzygnięciu (akceptacja, odrzucenie). */
export async function markKsefSubmission(params: {
  tenantId: string;
  invoiceId: string;
  invoiceReferenceNumber: string;
  status: SubmissionStatus;
  ksefNumber?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}): Promise<void> {
  const { error } = await createAdminClient()
    .from('ksef_submissions')
    .update({
      status: params.status,
      response_ksef_number: params.ksefNumber ?? null,
      error_code: params.errorCode ?? null,
      error_message: params.errorMessage ? params.errorMessage.slice(0, 500) : null,
      completed_at: new Date().toISOString(),
    })
    .eq('tenant_id', params.tenantId)
    .eq('invoice_id', params.invoiceId)
    .eq('invoice_reference_number', params.invoiceReferenceNumber);
  if (error) throw new Error('Nie można zamknąć wpisu historii wysyłki KSeF');
}

/**
 * Ostatnia wysyłka tej faktury, która dotarła do KSeF i nie ma jeszcze
 * rozstrzygnięcia. Rzuca przy błędzie bazy — bez tej wiedzy nie wolno
 * wysyłać ponownie.
 */
export async function findOpenKsefSubmission(
  tenantId: string,
  invoiceId: string,
): Promise<KsefSubmissionReferences | null> {
  const { data, error } = await createAdminClient()
    .from('ksef_submissions')
    .select('session_reference_number, invoice_reference_number, xml_storage_path, attempted_at, request_payload_hash, original_ksef_number, original_session_reference_number')
    .eq('tenant_id', tenantId)
    .eq('invoice_id', invoiceId)
    .eq('status', 'sent')
    .not('invoice_reference_number', 'is', null)
    .order('attempted_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error('Nie można odczytać historii wysyłki KSeF');
  if (!data?.session_reference_number || !data.invoice_reference_number) return null;
  return {
    sessionReferenceNumber: data.session_reference_number,
    invoiceReferenceNumber: data.invoice_reference_number,
    xmlStoragePath: data.xml_storage_path ?? null,
    attemptedAt: data.attempted_at ?? null,
    payloadHash: data.request_payload_hash ?? null,
    originalKsefNumber: data.original_ksef_number ?? null,
    originalSessionReferenceNumber: data.original_session_reference_number ?? null,
  };
}

/**
 * Klucz XML próby, która poszła w danej sesji KSeF (własny duplikat 440, D5).
 * `null`, gdy wpis jest sprzed 00134 albo sesja nie należy do tej faktury.
 */
export async function findOwnKsefSessionXmlPath(
  tenantId: string,
  invoiceId: string,
  sessionReferenceNumber: string,
): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .from('ksef_submissions')
    .select('xml_storage_path')
    .eq('tenant_id', tenantId)
    .eq('invoice_id', invoiceId)
    .eq('session_reference_number', sessionReferenceNumber)
    .not('xml_storage_path', 'is', null)
    .order('attempted_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error('Nie można odczytać historii wysyłki KSeF');
  return data?.xml_storage_path ?? null;
}

/** Czy ta sesja KSeF należy do wysyłek tej faktury (rozpoznanie własnego duplikatu 440). */
export async function isOwnKsefSession(
  tenantId: string,
  invoiceId: string,
  sessionReferenceNumber: string,
): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from('ksef_submissions')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('invoice_id', invoiceId)
    .eq('session_reference_number', sessionReferenceNumber)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error('Nie można odczytać historii wysyłki KSeF');
  return Boolean(data);
}

/** Numer sesji, w której faktura dostała dany numer KSeF — do pobrania UPO. */
export async function findSessionReferenceForKsefNumber(
  tenantId: string,
  invoiceId: string,
  ksefNumber: string,
): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .from('ksef_submissions')
    .select('session_reference_number')
    .eq('tenant_id', tenantId)
    .eq('invoice_id', invoiceId)
    .eq('response_ksef_number', ksefNumber)
    .not('session_reference_number', 'is', null)
    .order('attempted_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error('Nie można odczytać historii wysyłki KSeF');
  return data?.session_reference_number ?? null;
}

// ─────────────────────────────────────────────────────────────────
// D-A4-1: cudzy 440 — weryfikacja treści oryginału
// ─────────────────────────────────────────────────────────────────

/** Pliki wszystkich prób tej faktury (skrót hex i klucz) — do rozpoznania naszego pliku w KSeF. */
export async function findSubmissionPayloads(
  tenantId: string,
  invoiceId: string,
): Promise<Array<{ hash: string; xmlStoragePath: string | null }>> {
  const { data, error } = await createAdminClient()
    .from('ksef_submissions')
    .select('request_payload_hash, xml_storage_path')
    .eq('tenant_id', tenantId)
    .eq('invoice_id', invoiceId)
    .not('request_payload_hash', 'is', null);
  if (error) throw new Error('Nie można odczytać historii wysyłki KSeF');
  return (data ?? [])
    .filter((r) => typeof r.request_payload_hash === 'string' && r.request_payload_hash)
    .map((r) => ({ hash: r.request_payload_hash as string, xmlStoragePath: (r.xml_storage_path as string | null) ?? null }));
}

export interface KsefSessionRow {
  status: string | null;
  requestPayloadHash: string | null;
  xmlStoragePath: string | null;
  invoiceReferenceNumber: string | null;
}

/** Wpis tej faktury z danej sesji (najnowszy) — skrót i plik próby. */
export async function findKsefSessionRow(
  tenantId: string,
  invoiceId: string,
  sessionReferenceNumber: string,
): Promise<KsefSessionRow | null> {
  const { data, error } = await createAdminClient()
    .from('ksef_submissions')
    .select('status, request_payload_hash, xml_storage_path, invoice_reference_number')
    .eq('tenant_id', tenantId)
    .eq('invoice_id', invoiceId)
    .eq('session_reference_number', sessionReferenceNumber)
    .order('attempted_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error('Nie można odczytać historii wysyłki KSeF');
  if (!data) return null;
  return {
    status: data.status ?? null,
    requestPayloadHash: data.request_payload_hash ?? null,
    xmlStoragePath: data.xml_storage_path ?? null,
    invoiceReferenceNumber: data.invoice_reference_number ?? null,
  };
}

/**
 * D-A4-1: KSeF odpowiedział na tę próbę 440 — zapisujemy numer i sesję
 * oryginału na OTWARTYM wpisie (status `sent`, także z zamiaru), zanim
 * zaczniemy weryfikację. Wpis zostaje dowodem kontaktu do werdyktu, a każde
 * kolejne uzgodnienie (cron I5, „Tylko uzgodnij”) weryfikuje treść od nowa
 * zamiast pytać o starą sesję — inaczej po 48 h zostałby zamknięty jako
 * STALE i faktura dostałaby fałszywe „KSeF nie ma tej faktury”.
 * Rzuca przy błędzie bazy (fail-closed).
 */
export async function markKsefAttemptDuplicatePending(params: {
  tenantId: string;
  invoiceId: string;
  sessionReferenceNumber: string;
  invoiceReferenceNumber?: string | null;
  originalKsefNumber: string;
  originalSessionReferenceNumber?: string | null;
}): Promise<void> {
  const patch: Record<string, unknown> = {
    status: 'sent' satisfies SubmissionStatus,
    error_code: '440',
    original_ksef_number: params.originalKsefNumber,
    original_session_reference_number: params.originalSessionReferenceNumber ?? null,
  };
  if (params.invoiceReferenceNumber) patch.invoice_reference_number = params.invoiceReferenceNumber;
  const { error } = await createAdminClient()
    .from('ksef_submissions')
    .update(patch)
    .eq('tenant_id', params.tenantId)
    .eq('invoice_id', params.invoiceId)
    .eq('session_reference_number', params.sessionReferenceNumber)
    .in('status', ['intent', 'sent']);
  if (error) throw new Error('Nie można zapisać odpowiedzi 440 w historii wysyłki KSeF');
}

/**
 * Zamknięcie naszej próby z danej sesji (otwarty zamiar albo wpis `sent`) —
 * np. jako `duplicate` po werdykcie. Rzuca przy błędzie bazy.
 */
export async function closeKsefAttempt(params: {
  tenantId: string;
  invoiceId: string;
  sessionReferenceNumber: string;
  invoiceReferenceNumber?: string | null;
  status: 'duplicate';
  errorCode: string;
  errorMessage: string;
}): Promise<void> {
  const patch: Record<string, unknown> = {
    status: params.status satisfies SubmissionStatus,
    error_code: params.errorCode.slice(0, 20),
    error_message: params.errorMessage.slice(0, 500),
    completed_at: new Date().toISOString(),
  };
  if (params.invoiceReferenceNumber) patch.invoice_reference_number = params.invoiceReferenceNumber;
  const { error } = await createAdminClient()
    .from('ksef_submissions')
    .update(patch)
    .eq('tenant_id', params.tenantId)
    .eq('invoice_id', params.invoiceId)
    .eq('session_reference_number', params.sessionReferenceNumber)
    .in('status', ['intent', 'sent']);
  if (error) throw new Error('Nie można zamknąć wpisu historii wysyłki KSeF');
}

/**
 * Werdykt „numer zajęty” (D-A4-1): WSZYSTKIE próby tej faktury, które mogą
 * dotyczyć tego oryginału (zamiar, otwarty `sent`, `duplicate`), dostają
 * `number_taken` — inaczej starszy wpis `duplicate` zostałby dowodem kontaktu
 * i powrót do szkicu byłby zablokowany. Bezpieczne: oryginał o tym numerze
 * jest jeden, a treść faktury z dowodem kontaktu jest zamrożona (00132).
 * Rzuca przy błędzie bazy (fail-closed — runner ponowi weryfikację).
 */
export async function markKsefSubmissionsNumberTaken(params: {
  tenantId: string;
  invoiceId: string;
  originalKsefNumber: string;
}): Promise<void> {
  const { error } = await createAdminClient()
    .from('ksef_submissions')
    .update({
      status: 'number_taken' satisfies SubmissionStatus,
      error_code: 'NUMBER_TAKEN',
      error_message: `Numer faktury zajęty w KSeF przez fakturę ${params.originalKsefNumber} spoza FaktFlow`.slice(0, 500),
      completed_at: new Date().toISOString(),
    })
    .eq('tenant_id', params.tenantId)
    .eq('invoice_id', params.invoiceId)
    .in('status', ['intent', 'sent', 'duplicate']);
  if (error) throw new Error('Nie można zapisać werdyktu „numer zajęty” w historii wysyłki KSeF');
}

/**
 * Sesja, w której faktura dostała numer KSeF — wpis `accepted` z
 * `response_ksef_number`, żeby ponowienia UPO (`upo-retry-stale` →
 * `findSessionReferenceForKsefNumber`) znalazły sesję także wtedy, gdy numer
 * przyjęliśmy z duplikatu (własnego albo zweryfikowanego treścią).
 * Rzuca przy błędzie bazy — wywołujący decyduje (akceptacji to nie cofa).
 */
export async function recordKsefAcceptedSession(params: {
  tenantId: string;
  invoiceId: string;
  sessionReferenceNumber: string;
  ksefNumber: string;
  xmlStoragePath?: string | null;
  payloadHash?: string | null;
}): Promise<void> {
  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from('ksef_submissions')
    .update({
      status: 'accepted' satisfies SubmissionStatus,
      response_ksef_number: params.ksefNumber,
      completed_at: new Date().toISOString(),
    })
    .eq('tenant_id', params.tenantId)
    .eq('invoice_id', params.invoiceId)
    .eq('session_reference_number', params.sessionReferenceNumber)
    .select('id');
  if (error) throw new Error('Nie można zapisać sesji przyjętej faktury');
  if (Array.isArray(updated) && updated.length > 0) return;
  const { error: insertError } = await admin.from('ksef_submissions').insert({
    tenant_id: params.tenantId,
    invoice_id: params.invoiceId,
    submission_type: 'online',
    status: 'accepted' satisfies SubmissionStatus,
    session_reference_number: params.sessionReferenceNumber,
    invoice_reference_number: null,
    response_ksef_number: params.ksefNumber,
    request_payload_hash: params.payloadHash ?? null,
    xml_storage_path: params.xmlStoragePath ?? null,
    completed_at: new Date().toISOString(),
  });
  if (insertError) throw new Error('Nie można zapisać sesji przyjętej faktury');
}

/**
 * Inna faktura SPRZEDAŻY tej firmy z danym numerem KSeF (np. import historii)
 * — wtedy cudzy 440 dotyczy dokumentu znanego w FaktFlow i rozstrzyga
 * operator. Tylko wychodzące (D-A4-1b-3, A0): faktura zakupowa z tym numerem
 * (np. sprzedaż firmy samej sobie odebrana skrzynką) nie jest zapisem naszej
 * sprzedaży i nie może zatrzymać porównania treści oryginału.
 */
export async function findTenantInvoiceByKsefNumber(
  tenantId: string,
  ksefNumber: string,
  excludeInvoiceId: string,
): Promise<{ internalNumber: string | null } | null> {
  const { data, error } = await createAdminClient()
    .from('invoices')
    .select('id, internal_number')
    .eq('tenant_id', tenantId)
    .eq('direction', 'outgoing')
    .eq('ksef_number', ksefNumber)
    .neq('id', excludeInvoiceId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error('Nie można sprawdzić numeru KSeF w fakturach firmy');
  return data ? { internalNumber: (data.internal_number as string | null) ?? null } : null;
}
