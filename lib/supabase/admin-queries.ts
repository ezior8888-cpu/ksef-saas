import { createAdminClient } from './server';
import { decryptCredentials } from '@/lib/ksef/credentials-crypto';
import type { KsefAuth } from '@/lib/ksef/auth';
import type { Invoice } from '@/types/invoice';

/**
 * Zapytania używające service_role - BYPASUJĄ RLS.
 * Używane TYLKO z Inngest jobs (background, zaufany kontekst).
 *
 * UWAGA: NIGDY nie importuj tego pliku w client components / Server Actions
 * związanych z UI użytkownika. Tylko Inngest jobs.
 */

/**
 * Parsuje BYTEA z Supabase REST API. PostgREST domyślnie zwraca BYTEA
 * jako hex string `\xAABB...` (nie base64). Jeśli w przyszłości zmienimy
 * encoding preference w Supabase, wystarczy dostosować tę funkcję.
 */
function parseBytea(raw: unknown): Buffer {
  if (typeof raw !== 'string') {
    throw new Error('ksef_credentials_encrypted has unexpected type');
  }
  if (raw.startsWith('\\x')) {
    return Buffer.from(raw.slice(2), 'hex');
  }
  // Fallback jeśli kiedyś ktoś zapisze jako base64 text.
  return Buffer.from(raw, 'base64');
}

/**
 * Ładuje credentials KSeF tenanta i zwraca jako `KsefAuth`.
 *
 * Dispatch po `type` z `TenantKsefCredentials` (discriminated union
 * w `credentials-crypto.ts`). Zwrócony `KsefAuth` ma ten sam discriminator -
 * przekazujesz go do `submitInvoiceFullFlow` bez dodatkowego mapowania.
 */
export async function getTenantKsefCredentials(
  tenantId: string,
): Promise<KsefAuth> {
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('tenants')
    .select('nip, ksef_credentials_encrypted')
    .eq('id', tenantId)
    .single();

  if (error) throw new Error(`Tenant ${tenantId} not found: ${error.message}`);
  if (!data.ksef_credentials_encrypted) {
    throw new Error(
      `Tenant ${tenantId} nie ma skonfigurowanych credentials KSeF`,
    );
  }

  const encryptedBlob = parseBytea(data.ksef_credentials_encrypted);
  const decrypted = decryptCredentials(encryptedBlob);

  // NIP z DB może się różnić od NIP w zaszyfrowanych credentials (np. po zmianie
  // firmy) - używamy tego z DB jako source-of-truth. Token/cert nie zawiera NIP
  // w sposób kryptograficznie związany, więc to bezpieczne.
  switch (decrypted.type) {
    case 'xades':
      return {
        type: 'xades',
        nip: data.nip,
        certificatePem: decrypted.certificatePem,
        privateKeyPem: decrypted.privateKeyPem,
      };
    case 'token':
      return {
        type: 'token',
        nip: data.nip,
        token: decrypted.token,
      };
    default: {
      const _exhaustive: never = decrypted;
      throw new Error(
        `Unknown credentials type: ${JSON.stringify(_exhaustive)}`,
      );
    }
  }
}

/**
 * Zwraca email właściciela organizacji (do alertów cert-expiry / submit-failed).
 *
 * Multi-org: właściciel(ami) jest user(zy) w `memberships` z rolą `owner`
 * dla danego organization_id. Bierzemy najstarszego (po `joined_at`) dla
 * stabilności (kolizja: kilkoro ownerów → najstarszy "primary").
 */
export async function getTenantAdminEmail(
  tenantId: string,
): Promise<string | null> {
  const ownerUserId = await getTenantOwnerUserId(tenantId);
  if (!ownerUserId) return null;

  const supabase = await createAdminClient();
  const { data: authUser } = await supabase.auth.admin.getUserById(ownerUserId);
  return authUser?.user?.email ?? null;
}

/** `users.id` właściciela (owner) dla organizacji — m.in. Web Push bez auth.admin. */
export async function getTenantOwnerUserId(
  tenantId: string,
): Promise<string | null> {
  const supabase = await createAdminClient();

  const { data: owner } = await supabase
    .from('memberships')
    .select('user_id, joined_at')
    .eq('organization_id', tenantId)
    .eq('role', 'owner')
    .eq('status', 'active')
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  return owner?.user_id ?? null;
}

/**
 * Pobiera Invoice (model domenowy) z fa3_data JSONB.
 *
 * Schemat 00001 trzyma cały model FA(3) w jednej kolumnie JSONB
 * (`invoices.fa3_data`). Tabela `invoice_line_items` jest denormalizacją
 * dla raportowania SQL - submit-flow jej nie potrzebuje, bo `lines` są
 * już w fa3_data.
 */
export async function getInvoiceForSubmit(invoiceId: string): Promise<Invoice> {
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('invoices')
    .select('fa3_data')
    .eq('id', invoiceId)
    .single();

  if (error) throw new Error(`Invoice ${invoiceId} not found: ${error.message}`);
  if (!data?.fa3_data) {
    throw new Error(`Invoice ${invoiceId} has no fa3_data (corrupted row?)`);
  }

  // fa3_data jest zapisywane przy tworzeniu faktury jako cały obiekt Invoice,
  // więc zaufanie do kształtu jest OK (zapis idzie przez Zod-validated form).
  return data.fa3_data as Invoice;
}

/**
 * Pola które można ustawiać w `invoices` z poziomu Inngest joba.
 * Ograniczamy celowo - żaden job nie powinien ruszać np. `tenant_id`.
 *
 * UWAGA: we wklejce było `ksef_timestamp`, ale takiej kolumny nie ma
 * w schemacie. Właściwe pola z 00001 to `submitted_to_ksef_at` (moment
 * wysłania żądania) i `ksef_accepted_at` (moment zaakceptowania przez KSeF).
 */
export interface InvoiceStatusUpdates {
  ksef_status?:
    | 'draft'
    | 'queued'
    | 'sending'
    | 'accepted'
    | 'rejected'
    | 'offline_queued'
    | 'received'
    | 'failed';
  ksef_number?: string;
  submitted_to_ksef_at?: string;
  ksef_accepted_at?: string;
  xml_storage_path?: string;
  submission_attempts?: number;
  last_error?: string | null;
  last_error_code?: string | null;
  last_error_field?: string | null;
  last_error_suggestion?: string | null;
  last_attempt_at?: string;
}

/**
 * Pola kolumn TIMESTAMPTZ w `invoices` - puste stringi w tych polach wywalają
 * Postgres (`invalid input syntax for type timestamp with time zone: ""`),
 * dlatego przed UPDATE'em konwertujemy `""` → `null`.
 *
 * Scenariusz: KSeF czasem zwraca status "zakończony" bez `acquisitionTimestamp`
 * (race-condition na side serwera), a stary kod mapował to na pusty string.
 */
const TIMESTAMPTZ_FIELDS: ReadonlyArray<keyof InvoiceStatusUpdates> = [
  'submitted_to_ksef_at',
  'ksef_accepted_at',
  'last_attempt_at',
];

export async function updateInvoiceStatus(
  invoiceId: string,
  updates: InvoiceStatusUpdates,
): Promise<void> {
  const supabase = await createAdminClient();

  const sanitized: Record<string, unknown> = { ...updates };
  for (const field of TIMESTAMPTZ_FIELDS) {
    if (sanitized[field] === '') {
      sanitized[field] = null;
    }
  }

  const { error } = await supabase
    .from('invoices')
    .update(sanitized)
    .eq('id', invoiceId);
  if (error) {
    throw new Error(`Failed to update invoice ${invoiceId}: ${error.message}`);
  }
}
