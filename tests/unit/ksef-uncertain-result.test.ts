import { NonRetriableError, RetryAfterError } from '@/lib/jobs/errors';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobContext } from '@/lib/jobs/registry';
import type { Invoice } from '@/types/invoice';

/**
 * Krok 4 planu automatyzacji (AUD-01, AUD-10, AUD-11, AUD-17).
 *
 * Niepewny wynik wysyłki (timeout pollingu, 5xx, wygasła sesja, padnięty
 * worker) kończył się ponowną wysyłką tej samej faktury, odpowiedzią 440
 * „duplikat” i statusem „odrzucona” — choć faktura była w KSeF. Teraz numery
 * referencyjne trafiają do `ksef_submissions` zaraz po przyjęciu pliku,
 * a ponowienie uzgadnia status zamiast wysyłać drugi raz.
 */

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  fullFlow: vi.fn(),
  findOpen: vi.fn(),
  isOwn: vi.fn(),
  ownSubmission: vi.fn(),
  mark: vi.fn(),
  record: vi.fn(),
  status: vi.fn(),
  invalidate: vi.fn(),
  sendEvent: vi.fn(),
  credentials: vi.fn(),
}));

vi.mock('@/lib/ksef/client', async (orig) => ({
  ...(await orig<typeof import('@/lib/ksef/client')>()),
  ksefFetch: mocks.fetch,
}));
vi.mock('@/lib/ksef/session-cache', () => ({
  ksefSessionCache: { getSession: async () => ({ accessToken: 'token' }), invalidate: mocks.invalidate },
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
vi.mock('@/lib/ksef/submission-log', () => ({
  recordKsefSubmissionSent: mocks.record,
  markKsefSubmission: mocks.mark,
  findOpenKsefSubmission: mocks.findOpen,
  isOwnKsefSession: mocks.isOwn,
  findOwnKsefSubmission: mocks.ownSubmission,
  findSessionReferenceForKsefNumber: vi.fn(async () => null),
}));
vi.mock('@/lib/jobs/runners/tenant-boundary', () => ({ requireInvoiceTenant: vi.fn() }));
// Krok 5: job czyta wyłącznik wysyłek autorytatywnie — tu zdjęty.
vi.mock('@/lib/feature-flags/global-flags', () => ({ getGlobalFlagForExecution: async () => false }));
vi.mock('@/lib/ksef/submit-invoice-full', () => ({ submitInvoiceFullFlow: mocks.fullFlow }));
vi.mock('@/lib/ksef/health-check', () => ({ shouldUseOfflineMode: async () => ({ offline: false }) }));
vi.mock('@/lib/ksef/offline-queue', () => ({ addToOfflineQueue: vi.fn() }));
vi.mock('@/lib/auth/ksef-verification-guard', () => ({
  requireKsefVerificationForBackgroundJob: vi.fn(),
  KsefNotVerifiedError: class KsefNotVerifiedError extends Error {},
}));
vi.mock('@/lib/supabase/admin-queries', () => ({
  getTenantKsefCredentials: mocks.credentials,
  updateInvoiceStatus: mocks.status,
}));
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: async () => {
    let isUpdate = false;
    const q = {
      select: () => q,
      eq: () => q,
      or: () => q,
      update: () => { isUpdate = true; return q; },
      maybeSingle: async () => ({
        data: isUpdate
          ? { id: '11111111-1111-4111-8111-111111111111' }
          // Faktura w bazie = treść zdarzenia (kontrola z #63), środowisko „test”.
          : {
              id: '11111111-1111-4111-8111-111111111111', ksef_status: 'sending', ksef_number: null,
              ksef_environment: 'test', invoice_kind: 'regular', invoice_type: 'VAT', internal_number: 'FV 1/2026',
              fa3_data: { internalNumber: 'FV 1/2026', type: 'VAT', issueDate: '2026-10-01' },
            },
        error: null,
      }),
    };
    // Przejęcie wysyłki (AUD-10, 00124) — w tych testach zawsze wolne.
    return { from: () => q, rpc: async (fn: string) => ({ data: fn === 'claim_ksef_send' ? '2026-10-02T12:00:00.000000+00:00' : null, error: null }), };
  },
}));
vi.mock('@/lib/cache/invalidation', () => ({ invalidateTenantDashboard: vi.fn() }));
vi.mock('@/lib/audit/log-system', () => ({ logAuditSystem: vi.fn() }));
vi.mock('@/lib/analytics/server', () => ({ trackServer: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), addBreadcrumb: vi.fn() }));

import { KsefApiError } from '@/lib/ksef/client';
import {
  checkInvoiceStatusByReference,
  KsefInvoiceRejectedError,
  submitInvoice,
} from '@/lib/ksef/submit';
import { downloadUpoFromKsef } from '@/lib/ksef/upo-client';
import { KSEF_DUPLICATE_RECONCILE, runSubmitInvoice } from '@/lib/jobs/runners/submit-invoice';
import type { KsefAuth } from '@/lib/ksef/auth';

const AUTH = { type: 'token', nip: '1234567890' } as unknown as KsefAuth;
const ORYGINAL = '1234567890-20261001-0100A0B0C0D0-1A';
const SESJA = '20261001-SO-0000000000-0000000000-01';
const REF = { sessionReferenceNumber: SESJA, invoiceReferenceNumber: 'I-REF-1' };

const ACCEPTED = { code: 200, description: 'Sukces' };
const DUPLIKAT = {
  code: 440,
  description: 'Duplikat faktury',
  details: ['Duplikat faktury'],
  extensions: { originalSessionReferenceNumber: SESJA, originalKsefNumber: ORYGINAL },
};

function statusReply(status: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return { referenceNumber: 'I-REF-1', invoiceHash: 'h', status, ...extra };
}

beforeEach(() => {
  vi.stubEnv('KSEF_ENV', 'test');
  vi.clearAllMocks();
  mocks.credentials.mockResolvedValue(AUTH);
  mocks.findOpen.mockResolvedValue(null);
  mocks.isOwn.mockResolvedValue(false);
  mocks.ownSubmission.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('submitInvoice — numery referencyjne zaraz po przyjęciu pliku', () => {
  it('hook dostaje numer sesji i faktury przed odpytywaniem statusu', async () => {
    const order: string[] = [];
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url === '/sessions/online') return { referenceNumber: 'S1' };
      if (url === '/sessions/online/S1/invoices') return { referenceNumber: 'I1' };
      if (url === '/sessions/S1/invoices/I1') {
        order.push('poll');
        return statusReply(ACCEPTED, { ksefNumber: ORYGINAL });
      }
      return {};
    });
    const onInvoiceSent = vi.fn(async () => { order.push('hook'); });

    const wynik = await submitInvoice('<xml/>', AUTH, 'test', undefined, { onInvoiceSent });

    expect(onInvoiceSent).toHaveBeenCalledWith({ sessionReferenceNumber: 'S1', invoiceReferenceNumber: 'I1' });
    expect(order).toEqual(['hook', 'poll']);
    expect(wynik.ksefNumber).toBe(ORYGINAL);
  });

  it('błąd zapisu numerów nie przerywa wysyłki — faktura już jest w KSeF', async () => {
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url === '/sessions/online') return { referenceNumber: 'S1' };
      if (url === '/sessions/online/S1/invoices') return { referenceNumber: 'I1' };
      if (url === '/sessions/S1/invoices/I1') return statusReply(ACCEPTED, { ksefNumber: ORYGINAL });
      return {};
    });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const wynik = await submitInvoice('<xml/>', AUTH, 'test', undefined, {
      onInvoiceSent: async () => { throw new Error('db down'); },
    });

    expect(wynik.ksefNumber).toBe(ORYGINAL);
    consoleSpy.mockRestore();
  });
});

describe('checkInvoiceStatusByReference', () => {
  it('akceptacja → numer KSeF', async () => {
    mocks.fetch.mockResolvedValue(statusReply(ACCEPTED, { ksefNumber: ORYGINAL, acquisitionTimestamp: '2026-10-01T10:00:00Z' }));

    await expect(checkInvoiceStatusByReference(REF, AUTH, 'test')).resolves.toEqual({
      state: 'accepted',
      ksefNumber: ORYGINAL,
      acquisitionTimestamp: '2026-10-01T10:00:00Z',
    });
    expect(mocks.fetch.mock.calls[0]?.[0]).toBe(`/sessions/${SESJA}/invoices/I-REF-1`);
  });

  it('w toku → processing', async () => {
    mocks.fetch.mockResolvedValue(statusReply({ code: 150, description: 'W kolejce' }));
    await expect(checkInvoiceStatusByReference(REF, AUTH, 'test')).resolves.toEqual({ state: 'processing' });
  });

  it('odrzucenie w statusie → KsefInvoiceRejectedError, awaria 5xx → zwykły błąd', async () => {
    mocks.fetch.mockResolvedValueOnce(statusReply({ code: 450, description: 'Błąd semantyki' }));
    await expect(checkInvoiceStatusByReference(REF, AUTH, 'test')).rejects.toBeInstanceOf(KsefInvoiceRejectedError);

    mocks.fetch.mockResolvedValueOnce(statusReply({ code: 550, description: 'Przerwano' }));
    const blad = await checkInvoiceStatusByReference(REF, AUTH, 'test').catch((e: unknown) => e);
    expect(blad).toBeInstanceOf(Error);
    expect(blad).not.toBeInstanceOf(KsefInvoiceRejectedError);
  });
});

describe('KsefApiError — timeout to nie odrzucenie', () => {
  it('408 jest do ponowienia', () => {
    expect(new KsefApiError(408, 'timeout', 'timeout').isRetryable).toBe(true);
    expect(new KsefApiError(400, 'bad', 'bad').isRetryable).toBe(false);
  });
});

describe('job wysyłki — uzgadnianie zamiast ponownej wysyłki', () => {
  const ctx: JobContext = {
    attempt: 1,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    step: { run: async (_n, fn) => fn(), sleep: vi.fn(), sendEvent: mocks.sendEvent, scheduleAfter: vi.fn() },
  };
  const zdarzenie = {
    invoiceId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    nip: '1234567890',
    environment: 'test' as const,
    invoice: { internalNumber: 'FV 1/2026', type: 'VAT', issueDate: '2026-10-01' } as Invoice,
  };
  const upoEvent = () =>
    mocks.sendEvent.mock.calls.find((c) => c[0] === 'trigger-upo-download')?.[1] as
      | { data: Record<string, unknown> }
      | undefined;

  it('wcześniejsza wysyłka przyjęta → zapis akceptacji BEZ ponownej wysyłki', async () => {
    mocks.findOpen.mockResolvedValue(REF);
    mocks.fetch.mockResolvedValue(statusReply(ACCEPTED, { ksefNumber: ORYGINAL }));

    await expect(runSubmitInvoice(zdarzenie, ctx)).resolves.toMatchObject({ success: true, ksefNumber: ORYGINAL });

    expect(mocks.fullFlow).not.toHaveBeenCalled();
    expect(mocks.status).toHaveBeenCalledWith(
      zdarzenie.invoiceId,
      expect.objectContaining({ ksef_status: 'accepted', ksef_number: ORYGINAL }),
      zdarzenie.tenantId,
    );
    expect(mocks.mark).toHaveBeenCalledWith(expect.objectContaining({ status: 'accepted', ksefNumber: ORYGINAL }));
    expect(upoEvent()?.data.sessionReferenceNumber).toBe(SESJA);
  });

  it('KSeF nadal przetwarza → czekamy (RetryAfterError), nie wysyłamy', async () => {
    mocks.findOpen.mockResolvedValue(REF);
    mocks.fetch.mockResolvedValue(statusReply({ code: 150, description: 'W kolejce' }));

    await expect(runSubmitInvoice(zdarzenie, ctx)).rejects.toBeInstanceOf(RetryAfterError);
    expect(mocks.fullFlow).not.toHaveBeenCalled();
  });

  it('awaria łącza przy uzgadnianiu → ponawiamy uzgadnianie, nigdy wysyłkę', async () => {
    mocks.findOpen.mockResolvedValue(REF);
    mocks.fetch.mockRejectedValue(new KsefApiError(408, 'timeout', 'timeout'));

    await expect(runSubmitInvoice(zdarzenie, ctx)).rejects.toBeInstanceOf(RetryAfterError);
    expect(mocks.fullFlow).not.toHaveBeenCalled();
  });

  it('wcześniejsza wysyłka odrzucona w statusie → odrzucenie bez ponowień', async () => {
    mocks.findOpen.mockResolvedValue(REF);
    mocks.fetch.mockResolvedValue(statusReply({ code: 450, description: 'Błąd semantyki' }));

    await expect(runSubmitInvoice(zdarzenie, ctx)).rejects.toBeInstanceOf(NonRetriableError);
    expect(mocks.mark).toHaveBeenCalledWith(expect.objectContaining({ status: 'rejected', errorCode: '450' }));
    expect(mocks.fullFlow).not.toHaveBeenCalled();
  });

  it('bez wcześniejszej wysyłki → zwykła wysyłka, numer sesji idzie do zdarzenia UPO', async () => {
    mocks.fullFlow.mockResolvedValue({
      ksefNumber: ORYGINAL,
      xmlStoragePath: 'x.xml',
      xmlSha256Hash: 'h',
      sessionReferenceNumber: 'S9',
      invoiceReferenceNumber: 'I9',
    });

    await runSubmitInvoice(zdarzenie, ctx);

    expect(mocks.fullFlow).toHaveBeenCalledOnce();
    expect(upoEvent()?.data.sessionReferenceNumber).toBe('S9');
    expect(mocks.mark).toHaveBeenCalledWith(expect.objectContaining({ invoiceReferenceNumber: 'I9', status: 'accepted' }));
  });
});

describe('job wysyłki — odpowiedź 440 „duplikat”', () => {
  const ctx: JobContext = {
    attempt: 0,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    step: { run: async (_n, fn) => fn(), sleep: vi.fn(), sendEvent: mocks.sendEvent, scheduleAfter: vi.fn() },
  };
  const zdarzenie = {
    invoiceId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    nip: '1234567890',
    environment: 'test' as const,
    invoice: { internalNumber: 'FV 1/2026', type: 'VAT', issueDate: '2026-10-01' } as Invoice,
  };

  it('duplikat NASZEJ wcześniejszej wysyłki → przyjmujemy jej numer KSeF', async () => {
    mocks.fullFlow.mockRejectedValue(new KsefInvoiceRejectedError(440, DUPLIKAT));
    mocks.ownSubmission.mockResolvedValue({ ...REF, payloadHash: null });

    await expect(runSubmitInvoice(zdarzenie, ctx)).resolves.toMatchObject({ success: true, ksefNumber: ORYGINAL });
    expect(mocks.ownSubmission).toHaveBeenCalledWith(zdarzenie.tenantId, zdarzenie.invoiceId, SESJA, ORYGINAL);
    expect(mocks.status).toHaveBeenCalledWith(
      zdarzenie.invoiceId,
      expect.objectContaining({ ksef_status: 'accepted', ksef_number: ORYGINAL }),
      zdarzenie.tenantId,
    );
  });

  it('duplikat spoza naszej historii → do uzgodnienia (znacznik), nie przypinamy cudzego numeru', async () => {
    mocks.fullFlow.mockRejectedValue(new KsefInvoiceRejectedError(440, DUPLIKAT));
    mocks.ownSubmission.mockResolvedValue(null);

    const blad = (await runSubmitInvoice(zdarzenie, ctx).catch((e: unknown) => e)) as Error;

    expect(blad).toBeInstanceOf(NonRetriableError);
    expect(blad.message).toContain(`[${KSEF_DUPLICATE_RECONCILE}]`);
    expect(blad.message).toContain(ORYGINAL);
    expect(mocks.status).not.toHaveBeenCalled();
  });

  it('wygasła sesja (401) → nowa sesja i ponowienie, nie „odrzucona”', async () => {
    mocks.fullFlow.mockRejectedValue(new KsefApiError(401, 'unauthorized', 'unauthorized'));

    await expect(runSubmitInvoice(zdarzenie, ctx)).rejects.toBeInstanceOf(RetryAfterError);
    expect(mocks.invalidate).toHaveBeenCalledWith('1234567890', expect.anything());
  });
});

describe('downloadUpoFromKsef — UPO z zasobów sesji (AUD-17)', () => {
  it('bez numeru sesji nie pyta KSeF i mówi, co zrobić', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const wynik = await downloadUpoFromKsef('t', ORYGINAL, { env: 'test' });

    expect(wynik).toMatchObject({ success: false, errorCode: 'NO_SESSION_REFERENCE', retryable: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('pobiera z /sessions/{ref}/invoices/ksef/{numer}/upo', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('<UPO><DataPrzyjecia>2026-10-01T10:00:00Z</DataPrzyjecia></UPO>', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await downloadUpoFromKsef('t', ORYGINAL, { env: 'test', sessionReferenceNumber: SESJA });

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url.endsWith(`/v2/sessions/${SESJA}/invoices/ksef/${ORYGINAL}/upo`)).toBe(true);
  });
});
