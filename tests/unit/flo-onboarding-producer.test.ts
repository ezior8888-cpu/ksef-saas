import { describe, expect, it } from 'vitest';

import {
  accountAgeDays,
  GUIDE_FOR_DAYS,
  produceOnboardingStep,
  runOnboardingSweep,
  type OnboardingAccount,
  type OnboardingSources,
} from '@/lib/flo/functions/onboarding-producer';
import { ruleRun, runFloTick } from '@/lib/flo/tick';

import { createFakeDb } from './flo-fake-db';

/**
 * O-01 w pulsie — pierwsze kroki na nowym koncie (plan FLO 2, K1.11).
 *
 * Zasada z modułu O-01 obowiązuje i tutaj: SUKCES ONBOARDINGU NIE ZALEŻY OD
 * CERTYFIKATU KSeF. Osobny test pilnuje, że konto bez certyfikatu przechodzi
 * całą ścieżkę do końca.
 */

const NOW = new Date('2026-09-25T05:30:00.000Z');
const TENANT = 'ten-1';

function alphaFlag(tenantId = TENANT) {
  return {
    tenant_id: tenantId,
    kind: 'onboarding.step',
    enabled: true,
    reason: 'alfa O-01',
  };
}

/** Konto założone tydzień temu, bez NIP-u i bez czegokolwiek dalej. */
function account(overrides: Partial<OnboardingAccount> = {}): OnboardingAccount {
  return {
    createdAt: '2026-09-18T09:00:00.000Z',
    hasNip: false,
    hasKsefCertificate: false,
    hasTaxProfile: false,
    hasContractor: false,
    hasFirstInvoice: false,
    firstInvoiceDelivered: false,
    ...overrides,
  };
}

function sources(state: OnboardingAccount | null = account()) {
  const calls = { account: 0 };
  const value: OnboardingSources = {
    readAccount: async () => {
      calls.account++;
      return state;
    },
    readGlobalKill: async () => false,
  };
  return { value, calls };
}

function liveCard(overrides: Record<string, unknown> = {}) {
  return {
    id: 'card-1',
    tenant_id: TENANT,
    kind: 'onboarding.step',
    topic_key: 'onboarding.step',
    status: 'open',
    expires_at: '2026-10-18T09:00:00.000Z',
    dismissed_reason: null,
    ...overrides,
  };
}

describe('O-01 — kogo prowadzimy', () => {
  it('młode konto dostaje pierwszy krok ścieżki', async () => {
    const db = createFakeDb({ flo_kind_flags: [alphaFlag()] });

    const outcome = await produceOnboardingStep(TENANT, NOW, db.client, sources().value);

    expect(outcome).toBe('created');
    const row = db.tables.flo_proposals[0]!;
    expect(row.topic_key).toBe('onboarding.step');
    expect(row.title).toContain('dane firmy');
    const payload = row.payload as Record<string, unknown>;
    expect(payload.step).toBe('company_data');
    // Karta prowadzi do miejsca, nie ma czego wykonać.
    expect(payload.primaryIntent).toBe('open');
  });

  it('konto starsze niż trzydzieści dni: kreator milczy', async () => {
    // Po miesiącu klient wie, gdzie co jest. Kreator w trzecim miesiącu to
    // wyrzut sumienia, nie pomoc.
    const db = createFakeDb({ flo_kind_flags: [alphaFlag()] });

    const outcome = await produceOnboardingStep(
      TENANT,
      NOW,
      db.client,
      sources(account({ createdAt: '2026-07-01T09:00:00.000Z' })).value,
    );

    expect(outcome).toBe('too_old');
    expect(GUIDE_FOR_DAYS).toBe(30);
    expect(db.tables.flo_proposals).toHaveLength(0);
  });

  it('konto bez daty założenia traktujemy jak stare', async () => {
    const db = createFakeDb({ flo_kind_flags: [alphaFlag()] });

    const outcome = await produceOnboardingStep(
      TENANT,
      NOW,
      db.client,
      sources(account({ createdAt: '' })).value,
    );

    expect(outcome).toBe('too_old');
    expect(accountAgeDays('', NOW)).toBe(Number.POSITIVE_INFINITY);
  });

  it('konto poza kanarkiem: stanu nawet nie czytamy', async () => {
    const db = createFakeDb();
    const src = sources();

    expect(await produceOnboardingStep(TENANT, NOW, db.client, src.value)).toBe(
      'disabled',
    );
    expect(src.calls.account).toBe(0);
  });

  it('konta nie ma — odmowa bez śladu', async () => {
    const db = createFakeDb({ flo_kind_flags: [alphaFlag()] });

    expect(
      await produceOnboardingStep(TENANT, NOW, db.client, sources(null).value),
    ).toBe('missing');
    expect(db.tables.flo_proposals).toHaveLength(0);
  });
});

describe('O-01 — ścieżka', () => {
  it('AWARIA: konto BEZ certyfikatu KSeF przechodzi ścieżkę do końca', async () => {
    // Produkt, który w tym momencie mówi „najpierw zdobądź certyfikat", jest
    // produktem, z którego klient wyjdzie i nie wróci.
    const db = createFakeDb({ flo_kind_flags: [alphaFlag()] });
    const state = account({ hasNip: true, hasContractor: true, hasFirstInvoice: true });

    const outcome = await produceOnboardingStep(TENANT, NOW, db.client, sources(state).value);

    expect(outcome).toBe('created');
    const payload = db.tables.flo_proposals[0]!.payload as Record<string, unknown>;
    expect(payload.step).toBe('deliver_invoice');
    expect(payload.deliveryMethod).toBe('pdf_email');
    expect(payload.requiresKsefCertificate).toBe(false);
    expect(String(db.tables.flo_proposals[0]!.body)).toContain('PDF');
  });

  it('kolejny krok PODMIENIA kartę i nie przesuwa jej ważności', async () => {
    const db = createFakeDb({
      flo_kind_flags: [alphaFlag()],
      flo_proposals: [liveCard()],
    });

    const outcome = await produceOnboardingStep(
      TENANT,
      NOW,
      db.client,
      sources(account({ hasNip: true })).value,
    );

    expect(outcome).toBe('refreshed');
    expect(db.tables.flo_proposals).toHaveLength(1);
    expect(db.tables.flo_proposals[0]!.expires_at).toBe('2026-10-18T09:00:00.000Z');
    expect((db.tables.flo_proposals[0]!.payload as Record<string, unknown>).step).toBe(
      'first_contractor',
    );
  });

  it('pierwsza faktura doręczona: kreator znika', async () => {
    // Instrukcja wisząca przy zrobionej robocie wygląda, jakby agent nie
    // zauważył sukcesu.
    const db = createFakeDb({
      flo_kind_flags: [alphaFlag()],
      flo_proposals: [liveCard()],
    });

    const outcome = await produceOnboardingStep(
      TENANT,
      NOW,
      db.client,
      sources(
        account({
          hasNip: true,
          hasContractor: true,
          hasFirstInvoice: true,
          firstInvoiceDelivered: true,
        }),
      ).value,
    );

    expect(outcome).toBe('finished');
    expect(db.tables.flo_proposals[0]).toMatchObject({
      status: 'expired',
      dismissed_reason: 'stale',
    });
  });

  it('skończona ścieżka bez otwartej karty to cisza, nie zapis', async () => {
    const db = createFakeDb({ flo_kind_flags: [alphaFlag()] });
    const writesBefore = db.writes;

    const outcome = await produceOnboardingStep(
      TENANT,
      NOW,
      db.client,
      sources(
        account({
          hasNip: true,
          hasContractor: true,
          hasFirstInvoice: true,
          firstInvoiceDelivered: true,
        }),
      ).value,
    );

    expect(outcome).toBe('nothing');
    expect(db.writes).toBe(writesBefore);
  });
});

describe('O-01 — wszystkie konta', () => {
  it('awaria jednego konta nie zabiera kreatora pozostałym', async () => {
    const db = createFakeDb({ flo_kind_flags: [alphaFlag('ten-bad'), alphaFlag()] });
    const errors: string[] = [];

    const result = await runOnboardingSweep(
      ['ten-bad', TENANT],
      NOW,
      db.client,
      {
        readAccount: async (tenantId) => {
          if (tenantId === 'ten-bad') throw new Error('timeout zapytania');
          return account();
        },
        readGlobalKill: async () => false,
      },
      { error: (message: string) => errors.push(message) },
    );

    expect(result).toEqual({ asked: 1, closed: 0, failed: 1 });
    expect(errors[0]).toContain('ten-bad');
  });

  it('skończony kreator liczy się jako karta ZAMKNIĘTA, nie postawiona', async () => {
    // Wspólne słownictwo przebiegu (K1.3): „kreator skończony" to to samo
    // co zamknięcie pytania o zapłaconą fakturę — sprawa się rozwiązała.
    // Policzenie tego jako `asked` kazałoby operatorowi czytać zamknięcia
    // jako nowe karty.
    const db = createFakeDb({
      flo_kind_flags: [alphaFlag()],
      flo_proposals: [liveCard()],
    });

    const result = await runOnboardingSweep([TENANT], NOW, db.client, {
      readAccount: async () =>
        account({
          hasNip: true,
          hasContractor: true,
          hasFirstInvoice: true,
          firstInvoiceDelivered: true,
        }),
      readGlobalKill: async () => false,
    });

    expect(result).toEqual({ asked: 0, closed: 1, failed: 0 });
  });

  it('puls prowadzi nowe konto i zwraca liczby', async () => {
    const db = createFakeDb({ flo_kind_flags: [alphaFlag()] });

    const result = await runFloTick(undefined, NOW, db.client, {
      listTenantIds: async () => [TENANT],
      readGlobalKill: async () => false,
      paymentConfirm: {
        readOverdueInvoices: async () => [],
        readInvoiceState: async () => ({ facts: {}, context: {} }),
        readGlobalKill: async () => false,
      },
      expenseMissing: { readRecentExpenses: async () => [], readGlobalKill: async () => false },
      invoiceMissing: { readIssuedInvoices: async () => [], readGlobalKill: async () => false },
      onboarding: sources().value,
    });

    expect(ruleRun(result, 'onboarding.step')).toEqual({
      kind: 'onboarding.step',
      asked: 1,
      closed: 0,
      failed: 0,
    });
    expect(result.failedTenants).toBe(0);
  });
});
