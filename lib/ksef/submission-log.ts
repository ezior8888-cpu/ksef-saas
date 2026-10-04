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
}

type SubmissionStatus = 'sent' | 'accepted' | 'rejected' | 'duplicate';

/**
 * Zapis zaraz po przyjęciu pliku przez KSeF. Rzuca przy błędzie bazy —
 * wywołujący decyduje, czy kontynuować (wysyłka już się odbyła).
 */
export async function recordKsefSubmissionSent(params: {
  tenantId: string;
  invoiceId: string;
  references: KsefSubmissionReferences;
  payloadHash?: string | null;
  /** Klucz XML, który poszedł do KSeF w tej próbie (D5). */
  xmlStoragePath?: string | null;
}): Promise<void> {
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
    .select('session_reference_number, invoice_reference_number, xml_storage_path, attempted_at')
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
