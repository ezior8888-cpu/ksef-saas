import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobContext } from '@/lib/jobs/registry';
import type { Invoice } from '@/types/invoice';

/**
 * Etap 8 cyklu życia — krok `reconcile-previous-submission` runnera:
 *   - tryb „tylko uzgodnij” (operator, `reconcileOnly`) NIGDY nie wysyła
 *     faktury od nowa: bez wpisu `sent` kończy jako RESULT_UNCERTAIN, a gdy
 *     nie ma już żadnego dowodu kontaktu z KSeF — NOT_IN_KSEF (A2b);
 *   - okno 48 h (I5): wpis `sent`, o którym KSeF po dwóch dobach odpowiada
 *     błędem klienta, jest zamykany jako `rejected STALE`, a wysyłka idzie od
 *     nowa (440 z numerem sesji z historii = własny duplikat); świeży wpis
 *     i błędy 5xx nadal tylko ponawiają uzgadnianie.
 * Do tej zmiany taki wpis krążył w nieskończoność („Uzgadnianie nieudane”).
 */

const ID = '11111111-1111-4111-8111-111111111111';
const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ATTEMPT = '22222222-2222-4222-8222-222222222222';

const m = vi.hoisted(() => ({
  fullFlow: vi.fn(),
  findOpen: vi.fn(),
  status: vi.fn(),
  markSubmission: vi.fn(),
  updateStatus: vi.fn(),
  captureMessage: vi.fn(),
  invoice: {} as Record<string, unknown>,
  /** Wynik `ksef_has_contact_evidence` (00131/00136) po uzgodnieniu. */
  evidence: true,
}));

vi.mock('@/lib/feature-flags/global-flags', () => ({ getGlobalFlagForExecution: async () => false }));
vi.mock('@/lib/audit/log-system', () => ({ logAuditSystem: vi.fn() }));
vi.mock('@/lib/auth/ksef-verification-guard', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/auth/ksef-verification-guard')>(),
  requireKsefVerificationForBackgroundJob: async () => undefined,
}));
vi.mock('@/lib/ksef/health-check', () => ({ shouldUseOfflineMode: async () => ({ offline: false }) }));
vi.mock('@/lib/ksef/offline-queue', () => ({ addToOfflineQueue: vi.fn() }));
vi.mock('@/lib/ksef/submit-invoice-full', () => ({ submitInvoiceFullFlow: m.fullFlow }));
vi.mock('@/lib/ksef/submit-reference-boundary', () => ({ assertSubmitReferences: async () => 'regular' }));
vi.mock('@/lib/ksef/submit', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/ksef/submit')>(),
  checkInvoiceStatusByReference: m.status,
}));
vi.mock('@/lib/ksef/submission-log', () => ({
  // A2: bez zamiarów wysyłki do rozstrzygnięcia — runner idzie jak dotąd.
  findOpenKsefSubmissionIntents: vi.fn(async () => []),
  promoteKsefSubmissionIntent: vi.fn(async () => false),
  abandonKsefSubmissionIntent: vi.fn(),
  recordKsefSubmissionIntent: vi.fn(),
  // D-A4-1: weryfikacja cudzego 440 — domyślnie bez sesji w historii i bez znanego numeru.
  findKsefSessionRow: vi.fn(async () => null),
  findSubmissionPayloads: vi.fn(async () => []),
  findTenantInvoiceByKsefNumber: vi.fn(async () => null),
  closeKsefAttempt: vi.fn(),
  markKsefSubmissionsNumberTaken: vi.fn(),
  recordKsefAcceptedSession: vi.fn(),
  markKsefAttemptDuplicatePending: vi.fn(),
  recordKsefSubmissionSent: vi.fn(),
  markKsefSubmission: m.markSubmission,
  findOpenKsefSubmission: m.findOpen,
  findOwnKsefSessionXmlPath: vi.fn(async () => null),
  isOwnKsefSession: vi.fn(async () => false),
  findSessionReferenceForKsefNumber: vi.fn(async () => null),
}));
vi.mock('@/lib/jobs/runners/tenant-boundary', () => ({ requireInvoiceTenant: vi.fn(), assertJobIdentity: vi.fn() }));
vi.mock('@/lib/supabase/admin-queries', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/supabase/admin-queries')>(),
  getTenantKsefCredentials: async () => ({ type: 'token', nip: '1234567890', token: 't' }),
  updateInvoiceStatus: m.updateStatus,
}));
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: async () => {
    const q = {
      select: () => q, eq: () => q, in: () => q, or: () => q, update: () => q,
      maybeSingle: async () => ({ data: { ...m.invoice }, error: null }),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve),
    };
    return {
      from: () => q,
      rpc: async (fn: string) => fn === 'ksef_has_contact_evidence'
        ? { data: m.evidence, error: null }
        : { data: '2026-10-03T12:00:00.000000+00:00', error: null },
    };
  },
}));
vi.mock('@/lib/storage/xml-documents', () => ({ recordXmlDocument: vi.fn() }));
vi.mock('@/lib/cache/invalidation', () => ({ invalidateTenantDashboard: vi.fn() }));
vi.mock('@/lib/analytics/server', () => ({ trackServer: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: m.captureMessage, addBreadcrumb: vi.fn() }));

import { KSEF_SUBMISSION_STALE_CODE, runSubmitInvoice } from '@/lib/jobs/runners/submit-invoice';
import { classifySendError } from '@/lib/ksef/send-error-codes';
import { KsefApiError } from '@/lib/ksef/client';

const ctx: JobContext = {
  attempt: 0,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  step: { run: async (_n, fn) => fn(), sleep: vi.fn(), sendEvent: vi.fn(), scheduleAfter: vi.fn() },
};
const event = (extra: Record<string, unknown> = {}) => ({
  invoiceId: ID, tenantId: TENANT, nip: '1234567890', environment: 'test' as const, sendAttemptId: ATTEMPT,
  invoice: { type: 'VAT', internalNumber: 'FV/1', issueDate: '2026-10-01' } as Invoice,
  ...extra,
});
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const sentRow = (attemptedAt: string) => ({ sessionReferenceNumber: 'SES-1', invoiceReferenceNumber: 'REF-1', attemptedAt });
const ACCEPTED = { ksefNumber: 'K-1', xmlStoragePath: 'x.xml', xmlSha256Hash: 'h', xmlSizeBytes: 1, sessionReferenceNumber: 'S-2', invoiceReferenceNumber: 'R-2' };

async function failing(run: Promise<unknown>): Promise<Error> {
  return run.then(() => { throw new Error('oczekiwano błędu'); }, (e: unknown) => e as Error);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('KSEF_ENV', 'test');
  m.fullFlow.mockResolvedValue(ACCEPTED);
  m.findOpen.mockResolvedValue(null);
  m.evidence = true;
  m.invoice = { id: ID, direction: 'outgoing', ksef_status: 'queued', ksef_number: null, ksef_environment: 'test', invoice_type: 'VAT', invoice_kind: 'regular', fa3_data: {} };
});
afterEach(() => vi.unstubAllEnvs());

describe('tryb „tylko uzgodnij” (reconcileOnly)', () => {
  it('A2b: bez wpisu sent i bez dowodu kontaktu: NOT_IN_KSEF (z wyjściem), faktura NIE jest wysyłana', async () => {
    m.evidence = false;
    const error = await failing(runSubmitInvoice(event({ reconcileOnly: true }), ctx));
    expect(error.name).toBe('NonRetriableError');
    expect(classifySendError(error).code).toBe('NOT_IN_KSEF');
    expect(m.fullFlow).not.toHaveBeenCalled();
  });

  it('bez wpisu sent, ale z innym dowodem kontaktu: RESULT_UNCERTAIN bez ponowień, faktura NIE jest wysyłana', async () => {
    const error = await failing(runSubmitInvoice(event({ reconcileOnly: true }), ctx));
    expect(error.name).toBe('NonRetriableError');
    expect(error.message).toContain('[RESULT_UNCERTAIN]');
    expect(classifySendError(error).code).toBe('RESULT_UNCERTAIN');
    expect(m.fullFlow).not.toHaveBeenCalled();
  });

  it('z wpisem sent i akceptacją w KSeF: faktura przyjęta po uzgodnieniu, bez nowej wysyłki', async () => {
    m.findOpen.mockResolvedValue(sentRow(hoursAgo(5)));
    m.status.mockResolvedValue({ state: 'accepted', ksefNumber: 'K-UZG', acquisitionTimestamp: '2026-10-01T10:00:00Z' });
    await expect(runSubmitInvoice(event({ reconcileOnly: true }), ctx)).resolves.toMatchObject({ success: true, ksefNumber: 'K-UZG' });
    expect(m.updateStatus).toHaveBeenCalledWith(ID, expect.objectContaining({ ksef_status: 'accepted', ksef_number: 'K-UZG' }), TENANT);
    expect(m.fullFlow).not.toHaveBeenCalled();
  });
});

describe('okno 48 h dla zalegającego wpisu sent (I5)', () => {
  it('wpis sprzed 3 dni + 404 z KSeF: zamknięty jako rejected STALE, wysyłka od nowa, alarm', async () => {
    m.findOpen.mockResolvedValue(sentRow(hoursAgo(72)));
    m.status.mockRejectedValue(new KsefApiError(404, 'x', 'Not found'));

    await expect(runSubmitInvoice(event(), ctx)).resolves.toMatchObject({ success: true, ksefNumber: 'K-1' });

    expect(m.markSubmission).toHaveBeenCalledWith(expect.objectContaining({
      invoiceReferenceNumber: 'REF-1', status: 'rejected', errorCode: KSEF_SUBMISSION_STALE_CODE,
    }));
    expect(m.fullFlow).toHaveBeenCalledTimes(1);
    expect(m.captureMessage).toHaveBeenCalledWith(expect.stringContaining('STALE'), expect.anything());
  });

  it('świeży wpis (1 h) + 404: tylko ponowienie uzgadniania — bez zamykania i bez wysyłki', async () => {
    m.findOpen.mockResolvedValue(sentRow(hoursAgo(1)));
    m.status.mockRejectedValue(new KsefApiError(404, 'x', 'Not found'));
    const error = await failing(runSubmitInvoice(event(), ctx));
    expect(error.name).toBe('RetryAfterError');
    expect(m.markSubmission).not.toHaveBeenCalled();
    expect(m.fullFlow).not.toHaveBeenCalled();
  });

  it('stary wpis + 503 albo 401: KSeF może jeszcze odpowiedzieć — tylko ponowienie', async () => {
    for (const status of [503, 401]) {
      vi.clearAllMocks();
      m.findOpen.mockResolvedValue(sentRow(hoursAgo(72)));
      m.status.mockRejectedValue(new KsefApiError(status, 'x', 'x'));
      const error = await failing(runSubmitInvoice(event(), ctx));
      expect(error.name).toBe('RetryAfterError');
      expect(m.markSubmission).not.toHaveBeenCalled();
      expect(m.fullFlow).not.toHaveBeenCalled();
    }
  });

  it('wpis bez daty (sprzed 00099) nigdy nie jest uznany za zalegający', async () => {
    m.findOpen.mockResolvedValue({ sessionReferenceNumber: 'SES-1', invoiceReferenceNumber: 'REF-1' });
    m.status.mockRejectedValue(new KsefApiError(404, 'x', 'Not found'));
    const error = await failing(runSubmitInvoice(event(), ctx));
    expect(error.name).toBe('RetryAfterError');
    expect(m.markSubmission).not.toHaveBeenCalled();
  });

  it('„tylko uzgodnij” + zalegający wpis: zamknięcie STALE i — bez innego dowodu kontaktu — NOT_IN_KSEF (A2b), bez wysyłki', async () => {
    m.findOpen.mockResolvedValue(sentRow(hoursAgo(72)));
    m.status.mockRejectedValue(new KsefApiError(400, 'x', 'Bad request'));
    // Po zamknięciu wpisu jako STALE faktura nie ma już dowodu kontaktu.
    m.evidence = false;
    const error = await failing(runSubmitInvoice(event({ reconcileOnly: true }), ctx));
    expect(error.name).toBe('NonRetriableError');
    expect(classifySendError(error).code).toBe('NOT_IN_KSEF');
    expect(m.markSubmission).toHaveBeenCalledWith(expect.objectContaining({ errorCode: KSEF_SUBMISSION_STALE_CODE }));
    expect(m.fullFlow).not.toHaveBeenCalled();
  });
});
