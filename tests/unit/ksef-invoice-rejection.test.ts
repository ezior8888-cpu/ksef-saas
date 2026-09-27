import { NonRetriableError, RetryAfterError } from 'inngest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobContext } from '@/lib/jobs/registry';
import type { Invoice } from '@/types/invoice';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  fullFlow: vi.fn(),
  offline: vi.fn(),
  status: vi.fn(),
  claim: vi.fn(),
  current: {
    ksef_status: 'queued',
    submitted_to_ksef_at: null as string | null,
    ksef_number: null as string | null,
    ksef_environment: 'test',
  },
  storedInvoice: { internalNumber: 'FV 1/2026', type: 'VAT' } as Record<string, unknown>,
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
  claimInvoiceForKsefSend: mocks.claim,
  InvoiceStatusConflictError: class InvoiceStatusConflictError extends Error {},
  updateInvoiceStatus: mocks.status,
}));
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => {
    const q = {
      select: () => q,
      eq: () => q,
      maybeSingle: async () => ({ data: {
        id: '11111111-1111-4111-8111-111111111111',
        ksef_status: mocks.current.ksef_status,
        submitted_to_ksef_at: mocks.current.submitted_to_ksef_at,
        ksef_number: mocks.current.ksef_number,
        ksef_environment: mocks.current.ksef_environment,
        invoice_kind: 'regular', invoice_type: 'VAT', internal_number: 'FV 1/2026',
        fa3_data: mocks.storedInvoice,
      }, error: null }),
    };
    return { from: () => q };
  },
}));
vi.mock('@/lib/audit/log-system', () => ({ logAuditSystem: vi.fn() }));
vi.mock('@/lib/analytics/server', () => ({ trackServer: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), addBreadcrumb: vi.fn() }));

import { KsefInvoiceRejectedError, submitInvoice } from '@/lib/ksef/submit';
import { onSubmitInvoiceExhausted, runSubmitInvoice } from '@/lib/inngest/jobs/submit-invoice';
import { KSEF_DUPLICATE_RECONCILIATION_CODE } from '@/lib/ksef/submit-reconciliation';
import { InvoiceStatusConflictError } from '@/lib/supabase/admin-queries';
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
const CLAIMED_AT = '2026-09-27T10:00:00.000Z';

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
  vi.stubEnv('KSEF_ENV', 'test');
  mocks.current.ksef_status = 'queued';
  mocks.current.submitted_to_ksef_at = null;
  mocks.current.ksef_number = null;
  mocks.current.ksef_environment = 'test';
  mocks.storedInvoice = { internalNumber: 'FV 1/2026', type: 'VAT' };
  mocks.claim.mockResolvedValue(CLAIMED_AT);
});
afterEach(() => vi.unstubAllEnvs());

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

describe('submitInvoice: błąd systemu KSeF (5xx w statusie) to nie odrzucenie', () => {
  // 550: „Przetwarzanie zostało przerwane z przyczyn wewnętrznych systemu.
  // Spróbuj ponownie.” (CIRFMF/ksef-docs, RC5.7). Uwaga recenzji nr 4.
  it.each([
    [550, 'Operacja została anulowana przez system'],
    [500, 'Nieznany błąd'],
  ])('%i → zwykły Error (ponowienie), nie KsefInvoiceRejectedError', async (code, description) => {
    ksefZwraca({ code, description });
    const blad = await submitInvoice('<xml/>', {} as KsefAuth, 'test').catch((e: unknown) => e);

    expect(blad).toBeInstanceOf(Error);
    expect(blad).not.toBeInstanceOf(KsefInvoiceRejectedError);
    expect((blad as Error).message).toContain(`status ${code}`);
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
    environment: 'test' as const,
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
    expect(blad.message).toContain(KSEF_DUPLICATE_RECONCILIATION_CODE);
  });

  it('zserializowany błąd 440 parkuje fakturę do uzgodnienia bez Offline24 i bez prawa do zwykłego resend', async () => {
    const error = Object.assign(
      new Error(`${KSEF_DUPLICATE_RECONCILIATION_CODE}: KSeF ma już fakturę o tym numerze.`),
      { name: 'NonRetriableError' },
    );
    const result = await onSubmitInvoiceExhausted(error, zdarzenie, ctx);

    expect(result).toMatchObject({ handled: true, finalStatus: 'failed' });
    expect(mocks.status).toHaveBeenCalledWith(
      zdarzenie.invoiceId,
      expect.objectContaining({
        ksef_status: 'failed',
        last_error_code: KSEF_DUPLICATE_RECONCILIATION_CODE,
      }),
      zdarzenie.tenantId,
      'queued',
    );
    expect(mocks.offline).not.toHaveBeenCalled();
  });

  it('po claimie awaria sieci wymaga uzgodnienia bez ponownego POST', async () => {
    mocks.fullFlow.mockRejectedValue(new Error('ECONNRESET'));
    await expect(runSubmitInvoice(zdarzenie, ctx)).rejects.toMatchObject({
      name: 'NonRetriableError',
      message: expect.stringContaining('manual reconciliation'),
    });
  });

  it('edycja draftu po preflight, lecz przed claimem, nie może zaakceptować starego XML', async () => {
    const racingContext: JobContext = {
      ...ctx,
      step: {
        ...ctx.step,
        run: async <T,>(name: string, fn: () => Promise<T> | T): Promise<T> => {
          if (name === 'submit-to-ksef') {
            mocks.storedInvoice = {
              internalNumber: 'FV 1/2026', type: 'VAT', buyer: { name: 'Inny nabywca' },
            };
          }
          return fn();
        },
      },
    };
    await expect(runSubmitInvoice(zdarzenie, racingContext)).rejects.toThrow('manual reconciliation');
    expect(mocks.claim).toHaveBeenCalledTimes(1);
    expect(mocks.fullFlow).not.toHaveBeenCalled();
  });

  it('nie ponawia POST, gdy Inngest odtwarza submit-to-ksef po utracie checkpointu', async () => {
    mocks.fullFlow.mockResolvedValue({ ksefNumber: 'TEST-NUMBER' });
    mocks.claim.mockImplementation(async () => {
      mocks.current.ksef_status = 'sending';
      mocks.current.submitted_to_ksef_at = CLAIMED_AT;
      return CLAIMED_AT;
    });
    const replayContext: JobContext = {
      ...ctx,
      step: {
        ...ctx.step,
        run: async <T,>(name: string, fn: () => Promise<T> | T): Promise<T> => {
          if (name === 'submit-to-ksef') {
            await fn(); // KSeF POST succeeded; checkpoint was lost.
            return fn(); // Inngest re-executes the same callback.
          }
          return fn();
        },
      },
    };
    await expect(runSubmitInvoice(zdarzenie, replayContext))
      .rejects.toThrow('manual reconciliation');
    expect(mocks.fullFlow).toHaveBeenCalledTimes(1);
    expect(mocks.claim).toHaveBeenCalledTimes(1);
  });

  it('Inngest wznawia zapis accepted po utracie procesu po udanym POST', async () => {
    mocks.fullFlow.mockResolvedValue({
      ksefNumber: 'TEST-NUMBER',
      acquisitionTimestamp: '2026-09-27T10:01:00.000Z',
      xmlStoragePath: 'invoices/test.xml',
    });
    mocks.claim.mockImplementation(async () => {
      mocks.current.ksef_status = 'sending';
      mocks.current.submitted_to_ksef_at = CLAIMED_AT;
      return CLAIMED_AT;
    });
    const completed = new Map<string, unknown>();
    let crashBeforeSave = true;
    const replayContext: JobContext = {
      ...ctx,
      step: {
        ...ctx.step,
        run: async <T,>(name: string, fn: () => Promise<T> | T): Promise<T> => {
          if (completed.has(name)) return completed.get(name) as T;
          if (name === 'save-ksef-number' && crashBeforeSave) {
            crashBeforeSave = false;
            throw new Error('simulated process crash before DB save');
          }
          const value = await fn();
          completed.set(name, value);
          return value;
        },
      },
    };
    await expect(runSubmitInvoice(zdarzenie, replayContext)).rejects.toThrow('simulated process crash');
    await expect(runSubmitInvoice(zdarzenie, replayContext)).resolves.toMatchObject({
      success: true,
      ksefNumber: 'TEST-NUMBER',
    });
    expect(mocks.fullFlow).toHaveBeenCalledTimes(1);
    expect(mocks.claim).toHaveBeenCalledTimes(1);
    expect(mocks.status).toHaveBeenCalledWith(
      zdarzenie.invoiceId,
      expect.objectContaining({ ksef_status: 'accepted', ksef_number: 'TEST-NUMBER' }),
      zdarzenie.tenantId,
      'sending',
      CLAIMED_AT,
    );
    expect(replayContext.step.sendEvent).toHaveBeenCalledWith('trigger-upo-download', expect.any(Object));
  });

  it('utrata checkpointu po zapisie accepted rozpoznaje własny wynik i domyka UPO', async () => {
    mocks.fullFlow.mockResolvedValue({
      ksefNumber: 'TEST-NUMBER',
      acquisitionTimestamp: '2026-09-27T10:01:00.000Z',
      xmlStoragePath: 'invoices/test.xml',
    });
    mocks.claim.mockImplementation(async () => {
      mocks.current.ksef_status = 'sending';
      mocks.current.submitted_to_ksef_at = CLAIMED_AT;
      return CLAIMED_AT;
    });
    mocks.status.mockImplementationOnce(async () => {
      mocks.current.ksef_status = 'accepted';
      mocks.current.ksef_number = 'TEST-NUMBER';
    }).mockRejectedValueOnce(new InvoiceStatusConflictError());
    const replayContext: JobContext = {
      ...ctx,
      step: {
        ...ctx.step,
        run: async <T,>(name: string, fn: () => Promise<T> | T): Promise<T> => {
          if (name === 'save-ksef-number') {
            await fn(); // DB write succeeded, but the step checkpoint was lost.
            return fn();
          }
          return fn();
        },
      },
    };
    await expect(runSubmitInvoice(zdarzenie, replayContext)).resolves.toMatchObject({
      success: true, ksefNumber: 'TEST-NUMBER',
    });
    expect(mocks.fullFlow).toHaveBeenCalledTimes(1);
    expect(mocks.status).toHaveBeenCalledTimes(2);
    expect(replayContext.step.sendEvent).toHaveBeenCalledWith('trigger-upo-download', expect.any(Object));
  });

  it('stary event Offline24 nie psuje bieżącego draftu ani kolejki online', async () => {
    mocks.current.ksef_status = 'queued';
    const result = await onSubmitInvoiceExhausted(
      new Error('Offline24 automatic replay requires manual reconciliation'),
      { ...zdarzenie, fromOfflineQueue: true, offlineQueueId: '22222222-2222-4222-8222-222222222222' },
      ctx,
    );
    expect(result).toMatchObject({ handled: false, reason: 'offline-state-mismatch' });
    expect(mocks.status).not.toHaveBeenCalled();
    expect(ctx.step.sendEvent).toHaveBeenCalledWith('emit-failure', expect.objectContaining({
      name: 'invoice/submit.failed',
      data: expect.objectContaining({ terminal: true, fromOfflineQueue: true }),
    }));
  });
});
