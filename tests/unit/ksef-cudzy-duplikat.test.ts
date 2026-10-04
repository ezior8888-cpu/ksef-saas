import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobContext } from '@/lib/jobs/registry';
import type { Invoice } from '@/types/invoice';
import type { FakeKsef, MemoryDb, Row } from './helpers/ksef-pelna-sciezka';

/**
 * D-A4-1 (decyzja Bartosza 04.10.2026, plan „zero zgubionych faktur”): KSeF
 * odpowiada 440 „duplikat”, a sesji oryginału nie ma w naszej historii.
 * Dotąd: `failed KSEF_DUPLICATE_RECONCILE` — ślepa uliczka dla klienta
 * i operatora. Teraz runner pobiera oryginał (`GET /invoices/ksef/{numer}`)
 * i rozstrzyga:
 *   - plik identyczny z naszym → nasza faktura, `accepted` z numerem oryginału;
 *   - oryginał z innego programu (SystemInfo) → `KSEF_NUMBER_TAKEN`: klient
 *     wraca do szkicu i wystawia z nowym numerem (wpisy duplikatu przestają
 *     być dowodem kontaktu);
 *   - oryginał z FaktFlow o innej treści, numer KSeF znany w innej fakturze,
 *     brak uprawnienia do pobrania → operator (`KSEF_DUPLICATE_RECONCILE`);
 *   - chwilowa awaria pobrania → ponowienie samej weryfikacji, bez drugiej wysyłki.
 * Ta sama weryfikacja przy 440 w ścieżce uzgadniania po referencji.
 */

const T = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ID = '11111111-1111-4111-8111-111111111111';
const ATTEMPT = '22222222-2222-4222-8222-222222222222';
const NUMBER = 'FV 2026/10/001';
const GENERATED_AT = new Date('2026-10-01T10:00:00.000Z');

const m = vi.hoisted(() => ({
  ksef: null as unknown as FakeKsef,
  mem: { db: {}, failWrite: null } as MemoryDb,
  storage: new Map<string, string>(),
  updateStatus: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock('@/lib/ksef/client', async (orig) =>
  (await import('./helpers/ksef-pelna-sciezka')).ksefClientModule(await orig(), () => m.ksef));
vi.mock('@/lib/ksef/encryption', async () => (await import('./helpers/ksef-pelna-sciezka')).encryptionModule());
vi.mock('@/lib/supabase/admin', async () => (await import('./helpers/ksef-pelna-sciezka')).adminClientModule(() => m.mem));
vi.mock('@/lib/ksef/session-cache', () => ({
  ksefSessionCache: { getSession: async () => ({ accessToken: 'token' }), invalidate: m.invalidate },
}));
vi.mock('@/lib/ksef/rate-limiter', () => ({
  ksefRateLimiter: { enqueue: (_nip: string, fn: () => unknown) => fn() },
}));
vi.mock('@/lib/storage/r2-client', () => ({ getR2Config: () => ({ bucketName: 'b' }), getR2Client: () => ({ send: vi.fn() }) }));
vi.mock('@/lib/storage/r2', async (orig) => {
  const real = await orig<typeof import('@/lib/storage/r2')>();
  return {
    ...real,
    uploadInvoiceXml: async (tenantId: string, invoiceId: string, issueDate: string, xml: string, o?: { attemptId?: string | null }) => {
      const storagePath = real.invoiceXmlKeyFor({ tenantId, invoiceId, issueDate, attemptId: o?.attemptId });
      m.storage.set(storagePath, xml);
      const { sha256Hex } = await import('./helpers/ksef-pelna-sciezka');
      return { storagePath, sha256Hash: sha256Hex(xml), sizeBytes: xml.length, etag: '"e"' };
    },
    invoiceXmlExistsForId: async () => false,
    downloadInvoiceXml: async (path: string) => {
      const xml = m.storage.get(path);
      if (xml === undefined) throw new Error(`brak pliku ${path}`);
      return xml;
    },
  };
});
vi.mock('@/lib/auth/ksef-verification-guard', () => ({
  requireKsefVerificationForBackgroundJob: vi.fn(async () => undefined),
  KsefNotVerifiedError: class KsefNotVerifiedError extends Error {},
}));
vi.mock('@/lib/ksef/xml-generated-at', () => ({ claimXmlGeneratedAt: async () => new Date('2026-10-01T10:00:00.000Z') }));
vi.mock('@/lib/xml/validator', () => ({ validateInvoiceXml: async () => ({ valid: true, errors: [] }), InvoiceXmlSchemaError: class extends Error {} }));
vi.mock('@/lib/feature-flags/global-flags', () => ({ getGlobalFlagForExecution: async () => false }));
vi.mock('@/lib/audit/log-system', () => ({ logAuditSystem: vi.fn() }));
vi.mock('@/lib/ksef/health-check', () => ({ shouldUseOfflineMode: async () => ({ offline: false }) }));
vi.mock('@/lib/ksef/health-status', () => ({ isKsefHealthy: async () => true }));
vi.mock('@/lib/ksef/offline-queue', () => ({ addToOfflineQueue: vi.fn() }));
vi.mock('@/lib/ksef/submit-reference-boundary', () => ({ assertSubmitReferences: async () => 'regular' }));
vi.mock('@/lib/jobs/runners/tenant-boundary', () => ({ requireInvoiceTenant: vi.fn(), assertJobIdentity: vi.fn() }));
vi.mock('@/lib/supabase/admin-queries', async (orig) => ({
  ...await orig<typeof import('@/lib/supabase/admin-queries')>(),
  getTenantKsefCredentials: async () => ({ type: 'token', nip: '1234567890', token: 't' }),
  updateInvoiceStatus: m.updateStatus,
}));
// Wiersz faktury, przejęcie wysyłki (00124) i dowód kontaktu — klient z `@/lib/supabase/server`.
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: async () => {
    const q = {
      select: () => q, eq: () => q, in: () => q, or: () => q, update: () => q,
      maybeSingle: async () => ({
        data: { id: ID, direction: 'outgoing', ksef_status: 'sending', ksef_number: null, ksef_environment: 'test',
          invoice_type: 'VAT', invoice_kind: 'regular', internal_number: NUMBER, fa3_data: {} },
        error: null,
      }),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve),
    };
    return {
      from: () => q,
      rpc: async (fn: string) => fn === 'ksef_has_contact_evidence'
        ? { data: (m.mem.db.ksef_submissions ?? []).some((r) => ['intent', 'sent', 'accepted', 'duplicate'].includes(String(r.status))), error: null }
        : { data: '2026-10-03T12:00:00.000000+00:00', error: null },
    };
  },
}));
vi.mock('@/lib/storage/xml-documents', () => ({ recordXmlDocument: vi.fn() }));
vi.mock('@/lib/cache/invalidation', () => ({ invalidateTenantDashboard: vi.fn() }));
vi.mock('@/lib/analytics/server', () => ({ trackServer: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn(), addBreadcrumb: vi.fn() }));

import { NonRetriableError, RetryAfterError } from '@/lib/jobs/errors';
import { runSubmitInvoice } from '@/lib/jobs/runners/submit-invoice';
import { classifySendError } from '@/lib/ksef/send-error-codes';
import { invoiceXmlKeyFor } from '@/lib/storage/r2';
import { generateFA3Xml } from '@/lib/xml/fa3-generator';
import { finalizeInvoice } from '@/lib/xml/invoice-calculator';
import { freshKsef, seedKsefInvoice, sha256Hex } from './helpers/ksef-pelna-sciezka';

const faktura = (unitPriceNet = 100) => finalizeInvoice({
  internalNumber: NUMBER,
  type: 'VAT',
  issueDate: '2026-10-01',
  saleDate: '2026-10-01',
  seller: { nip: '5260001246', name: 'ACME', address: { countryCode: 'PL', addressLine1: 'ul. A 1', addressLine2: '00-001 Warszawa' } },
  buyer: { nip: '5252241585', name: 'Klient', address: { countryCode: 'PL', addressLine1: 'ul. B 2', addressLine2: '02-001 Warszawa' } },
  lines: [{ ordinal: 1, name: 'Usługa', unit: 'usł.', quantity: 1, unitPriceNet, vatRate: '23' }],
  payment: { currency: 'PLN', dueDate: '2026-10-15', method: 'transfer', bankAccount: 'PL61109010140000071219812874' },
});

/** Dokładnie ten plik, który runner wygeneruje dla faktury (ta sama data wytworzenia). */
const ourXml = (unitPriceNet = 100) => generateFA3Xml(faktura(unitPriceNet) as Invoice, { generatedAt: GENERATED_AT });
const fromOtherProgram = (xml: string) => xml
  .replace(/<SystemInfo>[^<]*<\/SystemInfo>/, '<SystemInfo>Inny Program 2.0</SystemInfo>')
  .replace(/<P_15>[^<]*<\/P_15>/, '<P_15>999.99</P_15>');
const withOtherHeaderDate = (xml: string) => xml
  .replace(/<DataWytworzeniaFa>[^<]*<\/DataWytworzeniaFa>/, '<DataWytworzeniaFa>2026-09-01T08:00:00Z</DataWytworzeniaFa>');

const event = () => ({
  invoiceId: ID, tenantId: T, nip: '1234567890', environment: 'test' as const,
  invoice: faktura() as Invoice, sendAttemptId: ATTEMPT,
});
const ctx = (attempt: number): JobContext => ({
  attempt,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  step: { run: async (_n, fn) => fn(), sleep: vi.fn(), sendEvent: vi.fn(), scheduleAfter: vi.fn() },
});
const failing = (run: Promise<unknown>) => run.then(() => { throw new Error('oczekiwano błędu'); }, (e: unknown) => e as Error);

const submissions = () => (m.mem.db.ksef_submissions ?? []) as Row[];
const accepted = () => m.updateStatus.mock.calls.find(([, p]) => (p as Row).ksef_status === 'accepted')?.[1] as Row | undefined;
const evidence = () => submissions().some((r) => ['intent', 'sent', 'accepted', 'duplicate'].includes(String(r.status)));
const ATTEMPT_KEY = () => invoiceXmlKeyFor({ tenantId: T, invoiceId: ID, issueDate: '2026-10-01', attemptId: ATTEMPT });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('KSEF_ENV', 'test');
  m.ksef = freshKsef();
  m.mem = { db: { ksef_submissions: [], invoices: [] }, failWrite: null };
  m.storage = new Map();
});
afterEach(() => vi.unstubAllEnvs());

describe('D-A4-1: cudzy 440 — weryfikacja treści oryginału z KSeF', () => {
  it('oryginał z innego programu → KSEF_NUMBER_TAKEN z danymi oryginału; wpisy duplikatu nie są już dowodem kontaktu', async () => {
    seedKsefInvoice(m.ksef, { session: 'S-OBCA', ksefNumber: 'K-OBCA', xml: fromOtherProgram(ourXml()) });

    const error = await failing(runSubmitInvoice(event(), ctx(0)));

    expect(error).toBeInstanceOf(NonRetriableError);
    expect(classifySendError(error).code).toBe('KSEF_NUMBER_TAKEN');
    expect(error.message).toContain('K-OBCA');
    expect(error.message).toContain('999.99');
    expect(m.ksef.invoicePosts).toBe(1);
    expect(submissions().map((r) => r.status)).toEqual(['number_taken']);
    expect(evidence()).toBe(false);
  });

  it('ten sam plik w sesji spoza historii (np. sprzed 00099) → nasza faktura: accepted z numerem oryginału, wpis z sesją dla UPO', async () => {
    seedKsefInvoice(m.ksef, { session: 'S-STARA', ksefNumber: 'K-STARA', xml: ourXml() });

    await runSubmitInvoice(event(), ctx(0));

    expect(accepted()).toMatchObject({ ksef_status: 'accepted', ksef_number: 'K-STARA', xml_storage_path: ATTEMPT_KEY() });
    expect(submissions()).toEqual(expect.arrayContaining([
      expect.objectContaining({ session_reference_number: 'S-STARA', status: 'accepted', response_ksef_number: 'K-STARA' }),
      expect.objectContaining({ session_reference_number: 'S-1', status: 'duplicate' }),
    ]));
  });

  it('440 przy uzgadnianiu otwartego wpisu sent (np. po timeoucie pollingu) → ta sama weryfikacja, bez wysyłki', async () => {
    seedKsefInvoice(m.ksef, { session: 'S-OBCA', ksefNumber: 'K-OBCA', xml: fromOtherProgram(ourXml()) });
    // Nasza wcześniejsza wysyłka: KSeF rozstrzygnął ją jako 440 po tym, jak polling się skończył.
    const our = ourXml();
    m.ksef.sessions.set('S-9', { open: false, invoices: [{
      referenceNumber: 'I-9', invoiceNumber: NUMBER, invoiceHash: Buffer.from(sha256Hex(our), 'hex').toString('base64'),
      code: 440, ksefNumber: null, xml: our, originalSession: 'S-OBCA', originalKsef: 'K-OBCA',
    }] });
    m.mem.db.ksef_submissions = [{
      id: 'row-9', tenant_id: T, invoice_id: ID, submission_type: 'online', status: 'sent',
      session_reference_number: 'S-9', invoice_reference_number: 'I-9', request_payload_hash: sha256Hex(our),
      attempted_at: new Date().toISOString(),
    }];

    const error = await failing(runSubmitInvoice(event(), ctx(1)));

    expect(classifySendError(error).code).toBe('KSEF_NUMBER_TAKEN');
    expect(m.ksef.invoicePosts).toBe(0);
    expect(submissions().map((r) => r.status)).toEqual(['number_taken']);
  });

  it('chwilowa awaria pobrania → ponowienie samej weryfikacji: wpis zostaje otwarty, druga próba nie wysyła pliku', async () => {
    seedKsefInvoice(m.ksef, { session: 'S-OBCA', ksefNumber: 'K-OBCA', xml: fromOtherProgram(ourXml()) });
    m.ksef.downloadFailure = { status: 503 };

    const first = await failing(runSubmitInvoice(event(), ctx(0)));
    expect(first).toBeInstanceOf(RetryAfterError);
    // Po wyczerpaniu ponowień: do uzgodnienia przez operatora, nie „KSeF niedostępny” z automatem.
    expect(classifySendError(first).code).toBe('KSEF_DUPLICATE_RECONCILE');
    expect(submissions().map((r) => r.status)).toEqual(['sent']);

    m.ksef.downloadFailure = null;
    const second = await failing(runSubmitInvoice(event(), ctx(1)));
    expect(classifySendError(second).code).toBe('KSEF_NUMBER_TAKEN');
    expect(m.ksef.invoicePosts).toBe(1);
  });

  it('brak uprawnienia do pobrania (403) → operator; wpis zostaje otwarty, więc „Tylko uzgodnij” powtórzy weryfikację', async () => {
    seedKsefInvoice(m.ksef, { session: 'S-OBCA', ksefNumber: 'K-OBCA', xml: fromOtherProgram(ourXml()) });
    m.ksef.downloadFailure = { status: 403 };

    const error = await failing(runSubmitInvoice(event(), ctx(0)));

    expect(error).toBeInstanceOf(NonRetriableError);
    expect(classifySendError(error).code).toBe('KSEF_DUPLICATE_RECONCILE');
    expect(submissions().map((r) => r.status)).toEqual(['sent']);
  });

  it('numer KSeF oryginału należy do innej faktury tej firmy w FaktFlow → operator, bez pobierania', async () => {
    seedKsefInvoice(m.ksef, { session: 'S-OBCA', ksefNumber: 'K-OBCA', xml: fromOtherProgram(ourXml()) });
    m.mem.db.invoices = [{ id: 'inna', tenant_id: T, ksef_number: 'K-OBCA', internal_number: 'FV/INNA/1' }];

    const error = await failing(runSubmitInvoice(event(), ctx(0)));

    expect(classifySendError(error).code).toBe('KSEF_DUPLICATE_RECONCILE');
    expect(error.message).toContain('FV/INNA/1');
    expect(m.ksef.downloads).toBe(0);
  });

  it('nasza sesja w historii, ale treść faktury się zmieniła (np. po powrocie do szkicu) → nie przyjmujemy numeru starej treści', async () => {
    const old = ourXml(150);
    seedKsefInvoice(m.ksef, { session: 'S-STARA', ksefNumber: 'K-STARA', xml: old });
    m.mem.db.ksef_submissions = [{
      id: 'row-old', tenant_id: T, invoice_id: ID, submission_type: 'online', status: 'abandoned',
      session_reference_number: 'S-STARA', invoice_reference_number: null, request_payload_hash: sha256Hex(old),
      attempted_at: new Date(Date.now() - 86_400_000).toISOString(),
    }];

    const error = await failing(runSubmitInvoice(event(), ctx(0)));

    expect(accepted()).toBeUndefined();
    expect(classifySendError(error).code).toBe('KSEF_DUPLICATE_RECONCILE');
  });

  it('oryginał z FaktFlow z inną datą wytworzenia (ta sama treść) → operator, nigdy „numer zajęty”', async () => {
    seedKsefInvoice(m.ksef, { session: 'S-STARA', ksefNumber: 'K-STARA', xml: withOtherHeaderDate(ourXml()) });

    const error = await failing(runSubmitInvoice(event(), ctx(0)));

    expect(accepted()).toBeUndefined();
    expect(classifySendError(error).code).toBe('KSEF_DUPLICATE_RECONCILE');
    expect(error.message).toContain('K-STARA');
  });
});
