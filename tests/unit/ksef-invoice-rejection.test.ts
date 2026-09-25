import { NonRetriableError, RetryAfterError } from 'inngest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobContext } from '@/lib/jobs/registry';
import type { Invoice } from '@/types/invoice';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  fullFlow: vi.fn(),
  offline: vi.fn(),
}));

// ── Część 1: submitInvoice na atrapie API KSeF ──
vi.mock('@/lib/ksef/client', async (orig) => ({
  ...(await orig<typeof import('@/lib/ksef/client')>()),
  ksefFetch: mocks.fetch,
}));
vi.mock('@/lib/ksef/session-cache', () => ({
  ksefSessionCache: { getSession: async () => ({ accessToken: 'token' }) },
}));
vi.mock('@/lib/ksef/rate-limiter', () => ({
  ksefRateLimiter: { enqueue: (_nip: string, fn: () => unknown) => fn() },
}));
vi.mock('@/lib/ksef/encryption', () => ({
  generateSessionEncryption: async () => ({ encryptedSymmetricKey: 'k', initializationVector: 'iv' }),
  encryptInvoiceXml: () => ({
    invoiceHash: 'h',
    invoiceSize: 1,
    encryptedInvoiceHash: 'eh',
    encryptedInvoiceSize: 1,
    encryptedInvoiceContent: 'c',
  }),
}));

// ── Część 2: job wysyłki — wszystko poza klasyfikacją błędu wyciszone ──
vi.mock('@/lib/inngest/jobs/tenant-boundary', () => ({ requireInvoiceTenant: vi.fn() }));
vi.mock('@/lib/ksef/submit-invoice-full', () => ({ submitInvoiceFullFlow: mocks.fullFlow }));
vi.mock('@/lib/ksef/health-check', () => ({ shouldUseOfflineMode: async () => ({ offline: false }) }));
vi.mock('@/lib/ksef/offline-queue', () => ({ addToOfflineQueue: mocks.offline }));
vi.mock('@/lib/auth/ksef-verification-guard', () => ({
  requireKsefVerificationForBackgroundJob: vi.fn(),
  KsefNotVerifiedError: class KsefNotVerifiedError extends Error {},
}));
vi.mock('@/lib/supabase/admin-queries', () => ({
  getTenantKsefCredentials: vi.fn(async () => ({ type: 'token' })),
  updateInvoiceStatus: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: async () => {
    const q = {
      select: () => q,
      eq: () => q,
      maybeSingle: async () => ({ data: { ksef_status: 'queued', ksef_number: null }, error: null }),
    };
    return { from: () => q };
  },
}));
vi.mock('@/lib/audit/log-system', () => ({ logAuditSystem: vi.fn() }));
vi.mock('@/lib/analytics/server', () => ({ trackServer: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), addBreadcrumb: vi.fn() }));

import { KsefInvoiceRejectedError, submitInvoice } from '@/lib/ksef/submit';
import { runSubmitInvoice } from '@/lib/inngest/jobs/submit-invoice';
import type { KsefAuth } from '@/lib/ksef/auth';

/**
 * Odrzucenie w STATUSIE faktury (kod ≥ 400 z pollingu) to decyzja KSeF
 * o treści. Wcześniej leciało jako zwykły Error: 5 ponownych wysyłek tej
 * samej faktury, a po wyczerpaniu prób — Offline24 jak przy awarii.
 *
 * 440 „Duplikat faktury” (CIRFMF/ksef-docs, API 2.0.0 RC6.0) znaczy, że
 * faktura o tym numerze JUŻ jest w KSeF — `extensions` podają jej numer.
 */

const ORYGINAL = '5265877635-20250626-010080DD2B5E-26';
const SESJA = '20250626-SO-2F14610000-242991F8C9-B4';

function ksefZwraca(status: Record<string, unknown>) {
  mocks.fetch.mockImplementation(async (url: string) => {
    if (url === '/sessions/online') return { referenceNumber: 'S1' };
    if (url.endsWith('/invoices') && url.startsWith('/sessions/online/')) return { referenceNumber: 'I1' };
    if (url === '/sessions/S1/invoices/I1') return { referenceNumber: 'I1', invoiceHash: 'h', status };
    return {};
  });
}

const DUPLIKAT = {
  code: 440,
  description: 'Duplikat faktury',
  details: [`Duplikat faktury. Faktura o numerze KSeF: ${ORYGINAL} została już prawidłowo przesłana do systemu w sesji: ${SESJA}`],
  extensions: { originalSessionReferenceNumber: SESJA, originalKsefNumber: ORYGINAL },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('submitInvoice: odrzucenie w statusie faktury', () => {
  it('440: typowany błąd z numerem KSeF faktury, która już jest w systemie', async () => {
    ksefZwraca(DUPLIKAT);
    const blad = await submitInvoice('<xml/>', {} as KsefAuth, 'test').catch((e: unknown) => e);

    expect(blad).toBeInstanceOf(KsefInvoiceRejectedError);
    const b = blad as KsefInvoiceRejectedError;
    expect(b.isDuplicate).toBe(true);
    expect(b.originalKsefNumber).toBe(ORYGINAL);
    expect(b.originalSessionReferenceNumber).toBe(SESJA);
    expect(b.message).toContain(`numer KSeF ${ORYGINAL}`);
    expect(b.message).toMatch(/sprawdź ją w KSeF/);
  });

  it('440 bez extensions (starsze API): nadal duplikat, komunikat bez numeru', async () => {
    ksefZwraca({ code: 440, description: 'Duplikat faktury' });
    const b = (await submitInvoice('<xml/>', {} as KsefAuth, 'test').catch((e: unknown) => e)) as KsefInvoiceRejectedError;
    expect(b.isDuplicate).toBe(true);
    expect(b.originalKsefNumber).toBeNull();
    expect(b.message).toMatch(/^KSeF ma już fakturę o tym numerze\./);
  });

  it('450 (semantyka): typowany błąd, nie duplikat', async () => {
    ksefZwraca({ code: 450, description: 'Błąd weryfikacji semantyki dokumentu faktury', details: ['P_2'] });
    const b = (await submitInvoice('<xml/>', {} as KsefAuth, 'test').catch((e: unknown) => e)) as KsefInvoiceRejectedError;
    expect(b).toBeInstanceOf(KsefInvoiceRejectedError);
    expect(b.isDuplicate).toBe(false);
    expect(b.message).toBe('KSeF odrzucił fakturę: Błąd weryfikacji semantyki dokumentu faktury. Szczegóły: P_2');
  });
});

describe('job wysyłki: odrzucenie w statusie kończy się bez ponowień', () => {
  const ctx: JobContext = {
    attempt: 0,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    step: { run: async (_n, fn) => fn(), sleep: vi.fn(), sendEvent: vi.fn(), scheduleAfter: vi.fn() },
  };
  const zdarzenie = {
    invoiceId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    nip: '1234567890',
    invoice: { internalNumber: 'FV 1/2026', type: 'VAT' } as Invoice,
  };

  it.each([
    ['440 duplikat', DUPLIKAT],
    ['450 semantyka', { code: 450, description: 'Błąd semantyki' }],
  ])('%s → NonRetriableError (nie RetryAfterError, więc bez Offline24)', async (_opis, status) => {
    mocks.fullFlow.mockRejectedValue(new KsefInvoiceRejectedError(status.code, status));
    const blad = await runSubmitInvoice(zdarzenie, ctx).catch((e: unknown) => e);

    expect(blad).toBeInstanceOf(NonRetriableError);
    expect(blad).not.toBeInstanceOf(RetryAfterError);
    expect(mocks.offline).not.toHaveBeenCalled();
  });

  it('komunikat duplikatu z numerem KSeF trafia do błędu joba (a stamtąd na fakturę)', async () => {
    mocks.fullFlow.mockRejectedValue(new KsefInvoiceRejectedError(440, DUPLIKAT));
    const blad = (await runSubmitInvoice(zdarzenie, ctx).catch((e: unknown) => e)) as Error;
    expect(blad.message).toContain(ORYGINAL);
  });

  it('awaria sieci nadal jest ponawiana', async () => {
    mocks.fullFlow.mockRejectedValue(new Error('ECONNRESET'));
    await expect(runSubmitInvoice(zdarzenie, ctx)).rejects.toBeInstanceOf(RetryAfterError);
  });
});
