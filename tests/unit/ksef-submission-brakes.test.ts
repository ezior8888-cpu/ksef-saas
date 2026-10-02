import { NonRetriableError } from 'inngest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { JobContext } from '@/lib/jobs/registry';
import type { Invoice } from '@/types/invoice';

/**
 * Krok 5 planu automatyzacji — hamulce i konfiguracja fail-closed.
 *
 * - AUD-63: wyłącznik `killAllKsefSubmissions` istniał, ale nikt go nie czytał.
 * - AUD-03/04: korekty liczone błędnie — na KSeF produkcyjnym zostają szkicem.
 * - AUD-09: brak `JOBS_BACKEND` po cichu wybierał Inngest.
 * - AUD-20: mocki KSeF/GUS/Anthropic/Resend włączała sama zmienna.
 */

const ID = '11111111-1111-4111-8111-111111111111';
const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const mocks = vi.hoisted(() => ({
  flag: vi.fn(),
  send: vi.fn(),
  offline: vi.fn(),
  health: vi.fn(),
  audit: vi.fn(),
  verification: vi.fn(),
  fullFlow: vi.fn(),
  credentials: vi.fn(),
  findOpen: vi.fn(),
  sendEvent: vi.fn(),
  invoice: {} as Record<string, unknown>,
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/feature-flags/global-flags', () => ({ getGlobalFlagForExecution: mocks.flag }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/jobs/enqueue', () => ({ sendJobEvent: mocks.send }));
vi.mock('@/lib/audit/log', () => ({ logAudit: mocks.audit }));
vi.mock('@/lib/audit/log-system', () => ({ logAuditSystem: mocks.audit }));
vi.mock('@/lib/auth/ksef-verification-guard', () => ({
  requireKsefVerification: mocks.verification,
  requireKsefVerificationForBackgroundJob: mocks.verification,
  KsefNotVerifiedError: class KsefNotVerifiedError extends Error {},
}));
vi.mock('@/lib/ksef/health-check', () => ({ shouldUseOfflineMode: mocks.health }));
vi.mock('@/lib/ksef/offline-queue', () => ({ addToOfflineQueue: mocks.offline }));
vi.mock('@/lib/ksef/submit-invoice-full', () => ({ submitInvoiceFullFlow: mocks.fullFlow }));
vi.mock('@/lib/ksef/submission-log', () => ({
  recordKsefSubmissionSent: vi.fn(),
  markKsefSubmission: vi.fn(),
  findOpenKsefSubmission: mocks.findOpen,
  isOwnKsefSession: vi.fn(async () => false),
  findSessionReferenceForKsefNumber: vi.fn(async () => null),
}));
vi.mock('@/lib/inngest/jobs/tenant-boundary', () => ({ requireInvoiceTenant: vi.fn() }));
vi.mock('@/lib/supabase/admin-queries', () => ({
  getTenantKsefCredentials: mocks.credentials,
  updateInvoiceStatus: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: async () => {
    let patch: Record<string, unknown> | null = null;
    const q = {
      select: () => q,
      eq: () => q,
      in: () => q,
      or: () => q,
      update: (p: Record<string, unknown>) => { patch = p; return q; },
      maybeSingle: async () => {
        if (patch) {
          mocks.updates.push(patch);
          Object.assign(mocks.invoice, patch);
          return { data: { id: ID }, error: null };
        }
        return { data: { ...mocks.invoice }, error: null };
      },
      then: (resolve: (v: unknown) => unknown) => {
        if (patch) mocks.updates.push(patch);
        return Promise.resolve({ data: null, error: null }).then(resolve);
      },
    };
    return { from: () => q };
  },
}));
vi.mock('@/lib/cache/invalidation', () => ({ invalidateTenantDashboard: vi.fn() }));
vi.mock('@/lib/analytics/server', () => ({ trackServer: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), addBreadcrumb: vi.fn() }));

import { enqueueKsefSubmitAfterDraft } from '@/lib/invoices/ksef-submit-enqueue';
import { onSubmitInvoiceExhausted, runSubmitInvoice } from '@/lib/inngest/jobs/submit-invoice';
import {
  KOR_HOLD_MESSAGE,
  KSEF_PAUSED_MESSAGE,
} from '@/lib/ksef/submission-holds';
import {
  assertPgBossWorkerBackend,
  getJobsBackend,
  resolveJobsBackend,
} from '@/lib/jobs/config';
import { isAnthropicMocked, isGusMocked, isKsefMocked, isResendMocked } from '@/lib/test-mode';

const noDatabaseAccess = { from: vi.fn() } as unknown as SupabaseClient;

function enqueueParams(type: Invoice['type'], auditKind: 'regular' | 'correction') {
  return {
    supabase: noDatabaseAccess,
    tenantId: TENANT,
    userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    invoiceId: ID,
    nip: '1234567890',
    environment: 'test' as const,
    invoice: { type, internalNumber: 'FK/1' } as Invoice,
    auditKind,
  };
}

const ctx: JobContext = {
  attempt: 0,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  step: {
    run: async (_name, fn) => fn(),
    sleep: vi.fn(),
    sendEvent: mocks.sendEvent,
    scheduleAfter: vi.fn(),
  },
};

function submitEvent(type: Invoice['type'] = 'VAT') {
  return {
    invoiceId: ID,
    tenantId: TENANT,
    nip: '1234567890',
    environment: 'test' as const,
    invoice: { type, internalNumber: 'FV/1', issueDate: '2026-10-01' } as Invoice,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.flag.mockResolvedValue(false);
  mocks.verification.mockResolvedValue(undefined);
  mocks.health.mockResolvedValue({ offline: false });
  mocks.findOpen.mockResolvedValue(null);
  mocks.credentials.mockResolvedValue({ type: 'token', nip: '1234567890' });
  // Faktura w bazie = treść zdarzenia `submitEvent()` (kontrola z #63).
  mocks.invoice = {
    id: ID,
    ksef_status: 'queued',
    ksef_number: null,
    ksef_environment: 'test',
    invoice_type: 'VAT',
    invoice_kind: 'regular',
    internal_number: 'FV/1',
    fa3_data: { type: 'VAT', internalNumber: 'FV/1', issueDate: '2026-10-01' },
  };
  mocks.updates = [];
  vi.stubEnv('KSEF_ENV', 'test');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('wyłącznik wysyłek przy kolejkowaniu', () => {
  it('włączony wyłącznik zatrzymuje fakturę przed kolejką i Offline24', async () => {
    mocks.flag.mockResolvedValue(true);
    const result = await enqueueKsefSubmitAfterDraft(enqueueParams('VAT', 'regular'));
    expect(result).toEqual({ ok: false, error: KSEF_PAUSED_MESSAGE });
    expect(mocks.flag).toHaveBeenCalledWith('killAllKsefSubmissions');
    expect(mocks.verification).not.toHaveBeenCalled();
    expect(mocks.health).not.toHaveBeenCalled();
    expect(mocks.offline).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('awaria odczytu wyłącznika = brak wysyłki (fail-closed)', async () => {
    mocks.flag.mockRejectedValue(new Error('baza niedostępna'));
    const result = await enqueueKsefSubmitAfterDraft(enqueueParams('VAT', 'regular'));
    expect(result.ok).toBe(false);
    expect(mocks.verification).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

describe('blokada korekt przy kolejkowaniu', () => {
  it('korekta na KSeF produkcyjnym zostaje szkicem', async () => {
    vi.stubEnv('KSEF_ENV', 'production');
    const result = await enqueueKsefSubmitAfterDraft(enqueueParams('KOR', 'correction'));
    expect(result).toEqual({ ok: false, error: KOR_HOLD_MESSAGE });
    expect(mocks.verification).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('korekta oznaczona tylko rodzajem akcji też jest zatrzymana', async () => {
    vi.stubEnv('KSEF_ENV', 'production');
    const result = await enqueueKsefSubmitAfterDraft(enqueueParams('VAT', 'correction'));
    expect(result).toEqual({ ok: false, error: KOR_HOLD_MESSAGE });
  });

  it('na KSeF TEST korekta przechodzi dalej (sprawdzenie poprawki)', async () => {
    mocks.verification.mockRejectedValue(new Error('stop po bramkach'));
    await expect(
      enqueueKsefSubmitAfterDraft(enqueueParams('KOR', 'correction')),
    ).rejects.toThrow('stop po bramkach');
    expect(mocks.verification).toHaveBeenCalled();
  });
});

describe('hamulce w jobie wysyłki', () => {
  it('włączony wyłącznik: neutralny błąd ze znacznikiem, bez sondy zdrowia i wysyłki', async () => {
    mocks.flag.mockResolvedValue(true);
    const error = await runSubmitInvoice(submitEvent(), ctx).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NonRetriableError);
    expect((error as Error).message).toMatch(/^\[KSEF_PAUSED\] /);
    expect(mocks.health).not.toHaveBeenCalled();
    expect(mocks.offline).not.toHaveBeenCalled();
    expect(mocks.fullFlow).not.toHaveBeenCalled();
  });

  it('wyłącznik włączony w trakcie joba zatrzymuje wysyłkę tuż przed KSeF', async () => {
    mocks.flag.mockResolvedValueOnce(false).mockResolvedValue(true);
    const error = await runSubmitInvoice(submitEvent(), ctx).catch((e: unknown) => e);
    expect((error as Error).message).toMatch(/^\[KSEF_PAUSED\] /);
    expect(mocks.findOpen).toHaveBeenCalled();
    expect(mocks.fullFlow).not.toHaveBeenCalled();
  });

  it('awaria odczytu wyłącznika: ponowienie (zwykły błąd), nigdy wysyłka', async () => {
    mocks.flag.mockRejectedValue(new Error('Nie udało się sprawdzić wyłącznika funkcji'));
    const error = await runSubmitInvoice(submitEvent(), ctx).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(NonRetriableError);
    expect(mocks.fullFlow).not.toHaveBeenCalled();
  });

  it('korekta na produkcji zatrzymana po typie zapisanym w bazie, nawet gdy zdarzenie mówi VAT', async () => {
    vi.stubEnv('KSEF_ENV', 'production');
    mocks.invoice.invoice_type = 'KOR';
    mocks.invoice.invoice_kind = 'correction';
    const error = await runSubmitInvoice({ ...submitEvent('VAT'), environment: 'production' }, ctx)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NonRetriableError);
    expect((error as Error).message).toMatch(/^\[KOR_HOLD\] /);
    expect(mocks.health).not.toHaveBeenCalled();
    expect(mocks.fullFlow).not.toHaveBeenCalled();
  });
});

describe('wyczerpanie prób po hamulcu = stan „do uzgodnienia”, nie „odrzucona”', () => {
  it.each(['KSEF_PAUSED', 'KOR_HOLD'] as const)('%s', async (code) => {
    mocks.invoice.ksef_status = 'queued';
    const message = code === 'KSEF_PAUSED' ? KSEF_PAUSED_MESSAGE : KOR_HOLD_MESSAGE;
    const result = await onSubmitInvoiceExhausted(
      new NonRetriableError(`[${code}] ${message}`),
      submitEvent(),
      ctx,
    );
    expect(result).toMatchObject({ handled: true, finalStatus: 'failed' });
    expect(mocks.updates[0]).toMatchObject({
      ksef_status: 'failed',
      last_error: message,
      last_error_code: code,
    });
    expect(mocks.offline).not.toHaveBeenCalled();
    expect(mocks.sendEvent).toHaveBeenCalledWith('emit-failure', expect.objectContaining({
      name: 'invoice/submit.failed',
      data: expect.objectContaining({ terminal: true, manualReconciliationRequired: true }),
    }));
  });
});

describe('JOBS_BACKEND fail-closed', () => {
  it('jawna wartość wygrywa wszędzie', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'production');
    vi.stubEnv('JOBS_BACKEND', 'pgboss');
    expect(getJobsBackend()).toBe('pgboss');
    vi.stubEnv('JOBS_BACKEND', ' inngest ');
    expect(getJobsBackend()).toBe('inngest');
  });

  it.each([undefined, '', 'pg-boss', 'PGBOSS'])('na produkcji brak lub literówka (%s) = błąd, nie Inngest', (value) => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'production');
    vi.stubEnv('JOBS_BACKEND', value as string);
    expect(resolveJobsBackend()).toBeNull();
    expect(() => getJobsBackend()).toThrow(/JOBS_BACKEND/);
  });

  it('build produkcyjny bez markera środowiska też jest traktowany jak produkcja', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', '');
    vi.stubEnv('APP_ENV', '');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JOBS_BACKEND', '');
    expect(() => getJobsBackend()).toThrow(/JOBS_BACKEND/);
  });

  it('lokalnie (NODE_ENV=test) brak zmiennej = Inngest Dev Server, jak dotąd', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'development');
    vi.stubEnv('JOBS_BACKEND', '');
    expect(getJobsBackend()).toBe('inngest');
  });

  it('worker startuje wyłącznie przy jawnym pgboss', () => {
    vi.stubEnv('JOBS_BACKEND', 'pgboss');
    expect(() => assertPgBossWorkerBackend()).not.toThrow();
    vi.stubEnv('JOBS_BACKEND', 'inngest');
    expect(() => assertPgBossWorkerBackend()).toThrow(/zatrzymaj workera/);
    vi.stubEnv('JOBS_BACKEND', '');
    expect(() => assertPgBossWorkerBackend()).toThrow(/JOBS_BACKEND=pgboss/);
  });
});

describe('mocki integracji nie działają na produkcji', () => {
  const ALL = ['E2E_MOCK_KSEF', 'E2E_MOCK_GUS', 'E2E_MOCK_ANTHROPIC', 'E2E_MOCK_RESEND'];
  const checks = () => [isKsefMocked(), isGusMocked(), isAnthropicMocked(), isResendMocked()];

  it('lokalnie zmienna włącza mock (Playwright)', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'development');
    for (const name of ALL) vi.stubEnv(name, '1');
    expect(checks()).toEqual([true, true, true, true]);
  });

  it('na produkcji ta sama zmienna jest ignorowana', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'production');
    for (const name of ALL) vi.stubEnv(name, '1');
    expect(checks()).toEqual([false, false, false, false]);
  });

  it('build bez markera środowiska też ignoruje mocki', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', '');
    vi.stubEnv('APP_ENV', '');
    vi.stubEnv('NODE_ENV', 'production');
    for (const name of ALL) vi.stubEnv(name, '1');
    expect(checks()).toEqual([false, false, false, false]);
  });
});
