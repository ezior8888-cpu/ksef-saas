import { describe, expect, it } from 'vitest';

import {
  createDailyCap,
  FLO_DAILY_NEW_CARDS_CAP,
  readTodayCardCounts,
  unlimitedCap,
  warsawDayStart,
} from '@/lib/flo/daily-cap';
import type { FloDbClient } from '@/lib/flo/db-types';
import { runFloTick, type FloTickSources } from '@/lib/flo/tick';

import { createFakeDb } from './flo-fake-db';

/**
 * Wspólny dzienny limit nowych kart (plan FLO 2, K1.4).
 *
 * Każda reguła pulsu pilnuje się dziś sama, ale nikt nie pilnuje SUMY —
 * a klient widzi właśnie sumę. Testy sprawdzają obie strony tej samej
 * zasady: limit zatrzymuje lawinę NOWYCH pytań i nie dotyka niczego, co
 * jest domknięciem rozmowy już zaczętej.
 */

/** 07:30 w Warszawie — godzina pulsu. */
const NOW = new Date('2026-09-17T05:30:00.000Z');
const TENANT = 'ten-1';

function flag(kind: string, tenantId = TENANT) {
  return { tenant_id: tenantId, kind, enabled: true, reason: 'alfa' };
}

/** Karty, które konto dostało już DZISIAJ — rodzaj obojętny. */
function cardsFromToday(count: number, tenantId = TENANT) {
  return Array.from({ length: count }, (_, i) => ({
    id: `dzis-${tenantId}-${i}`,
    tenant_id: tenantId,
    kind: 'tax.deadline',
    topic_key: `tax.deadline:${i}`,
    status: 'open',
    created_at: '2026-09-17T04:00:00.000Z',
    expires_at: '2026-09-30T00:00:00.000Z',
    dismissed_reason: null,
  }));
}

function overdueInvoice(id = 'inv-1') {
  return {
    id,
    number: `FV/${id}`,
    contractorName: 'Nowak Sp. z o.o.',
    grossTotal: 4300,
    paidAmount: 0,
    dueDate: '2026-09-10',
    remindersPaused: false,
  };
}

function invoiceState() {
  return {
    facts: {
      status: 'accepted',
      dueDate: '2026-09-10',
      grossTotal: 4300,
      paidAmount: 0,
      remindersPaused: 0,
    },
    context: { invoiceNumber: 'FV/inv-1', contractorName: 'Nowak Sp. z o.o.' },
  };
}

/** Konto założone tydzień temu — O-01 ma co powiedzieć. */
function youngAccount() {
  return {
    createdAt: '2026-09-10T09:00:00.000Z',
    hasNip: false,
    hasKsefCertificate: false,
    hasTaxProfile: false,
    hasContractor: false,
    hasFirstInvoice: false,
    firstInvoiceDelivered: false,
  };
}

function tickSources(overrides: Partial<FloTickSources> = {}): FloTickSources {
  return {
    listTenantIds: async () => [TENANT],
    readGlobalKill: async () => false,
    paymentConfirm: {
      readOverdueInvoices: async () => [],
      readInvoiceState: async () => invoiceState(),
      readGlobalKill: async () => false,
    },
    expenseMissing: {
      readRecentExpenses: async () => [],
      readGlobalKill: async () => false,
    },
    invoiceMissing: {
      readIssuedInvoices: async () => [],
      readGlobalKill: async () => false,
    },
    onboarding: { readAccount: async () => null, readGlobalKill: async () => false },
    ...overrides,
  };
}

describe('Dzienny limit — liczenie', () => {
  it('przepuszcza pięć kart i zatrzymuje szóstą', () => {
    const cap = createDailyCap(new Map());

    for (let i = 0; i < FLO_DAILY_NEW_CARDS_CAP; i++) {
      expect(cap.canAsk(TENANT)).toBe(true);
      cap.spend(TENANT);
    }

    expect(cap.canAsk(TENANT)).toBe(false);
    expect(FLO_DAILY_NEW_CARDS_CAP).toBe(5);
  });

  it('karty postawione dzisiaj wliczają się do limitu', () => {
    // Punktem wyjścia nie jest zero, tylko to, co konto już dostało.
    // Inaczej drugie uruchomienie pulsu dałoby drugą porcję kart.
    const cap = createDailyCap(new Map([[TENANT, FLO_DAILY_NEW_CARDS_CAP]]));

    expect(cap.canAsk(TENANT)).toBe(false);
  });

  it('konta nie dzielą limitu między sobą', () => {
    const cap = createDailyCap(new Map([[TENANT, FLO_DAILY_NEW_CARDS_CAP]]));

    expect(cap.canAsk(TENANT)).toBe(false);
    expect(cap.canAsk('ten-2')).toBe(true);
  });

  it('licznik zatrzymanych liczy tylko realne odmowy', () => {
    const cap = createDailyCap(new Map([[TENANT, FLO_DAILY_NEW_CARDS_CAP]]));

    expect(cap.withheld).toBe(0);
    cap.canAsk('ten-2');
    expect(cap.withheld).toBe(0);
    cap.canAsk(TENANT);
    cap.canAsk(TENANT);
    expect(cap.withheld).toBe(2);
  });

  it('limit bez limitu nie zatrzymuje niczego', () => {
    const cap = unlimitedCap();

    for (let i = 0; i < 50; i++) cap.spend(TENANT);

    expect(cap.canAsk(TENANT)).toBe(true);
    expect(cap.withheld).toBe(0);
  });
});

describe('Dzienny limit — granica doby', () => {
  it('latem doba zaczyna się o 22:00 UTC dnia poprzedniego', () => {
    // Czas letni: +2 godziny. Północ w Warszawie to 22:00 UTC dnia
    // poprzedniego, a nie północ UTC.
    expect(warsawDayStart(NOW).toISOString()).toBe('2026-09-16T22:00:00.000Z');
  });

  it('zimą o 23:00 UTC dnia poprzedniego', () => {
    const zima = new Date('2026-01-20T10:00:00.000Z');

    expect(warsawDayStart(zima).toISOString()).toBe('2026-01-19T23:00:00.000Z');
  });

  it('karta z 00:30 czasu polskiego należy do dzisiaj', async () => {
    // Granica po UTC zepchnęłaby ją do wczoraj i konto dostałoby tego dnia
    // o jedną kartę za dużo.
    const db = createFakeDb({
      flo_proposals: [
        {
          id: 'noc',
          tenant_id: TENANT,
          kind: 'tax.deadline',
          topic_key: 'tax.deadline:noc',
          status: 'open',
          created_at: '2026-09-16T22:30:00.000Z',
          expires_at: '2026-09-30T00:00:00.000Z',
        },
      ],
    });

    const counts = await readTodayCardCounts([TENANT], NOW, db.client);

    expect(counts.get(TENANT)).toBe(1);
  });
});

describe('Dzienny limit — odczyt z bazy', () => {
  it('liczy dzisiejsze karty obserwowanych kont, wczorajszych nie', async () => {
    const db = createFakeDb({
      flo_proposals: [
        ...cardsFromToday(2),
        ...cardsFromToday(1, 'ten-2'),
        // Wczorajsza — dzisiejszego limitu nie dotyka.
        {
          id: 'wczoraj',
          tenant_id: TENANT,
          kind: 'tax.deadline',
          topic_key: 'tax.deadline:wczoraj',
          status: 'open',
          created_at: '2026-09-16T04:00:00.000Z',
          expires_at: '2026-09-30T00:00:00.000Z',
        },
        // Konto spoza przebiegu — nie interesuje nas.
        ...cardsFromToday(3, 'ten-obcy'),
      ],
    });

    const counts = await readTodayCardCounts([TENANT, 'ten-2'], NOW, db.client);

    expect(counts.get(TENANT)).toBe(2);
    expect(counts.get('ten-2')).toBe(1);
    expect(counts.has('ten-obcy')).toBe(false);
  });

  it('pusta lista kont nie pyta bazy o nic', async () => {
    const wybuchowa = {
      from() {
        throw new Error('puls bez kont nie powinien czytać kart');
      },
    } as unknown as FloDbClient;

    await expect(readTodayCardCounts([], NOW, wybuchowa)).resolves.toEqual(
      new Map(),
    );
  });
});

describe('Dzienny limit w pulsie', () => {
  it('konto u sufitu nie dostaje nowych kart z żadnej reguły', async () => {
    const db = createFakeDb({
      flo_kind_flags: [flag('payment.confirm'), flag('onboarding.step')],
      flo_proposals: cardsFromToday(FLO_DAILY_NEW_CARDS_CAP),
    });

    const result = await runFloTick(
      undefined,
      NOW,
      db.client,
      tickSources({
        paymentConfirm: {
          readOverdueInvoices: async () => [overdueInvoice()],
          readInvoiceState: async () => invoiceState(),
          readGlobalKill: async () => false,
        },
        onboarding: {
          readAccount: async () => youngAccount(),
          readGlobalKill: async () => false,
        },
      }),
    );

    expect(result.confirmAsked).toBe(0);
    expect(result.onboardingGuided).toBe(0);
    // Dwie reguły miały o co zapytać i obie zostały zatrzymane — licznik
    // mówi operatorowi, ile agent przemilczał.
    expect(result.withheld).toBe(2);
    expect(db.tables.flo_proposals).toHaveLength(FLO_DAILY_NEW_CARDS_CAP);
  });

  it('ostatnie wolne miejsce dostaje reguła pilniejsza', async () => {
    // Kolejność reguł w pulsie jest hierarchią ważności: pieniądze przed
    // prowadzeniem za rękę. Limit tej hierarchii nie odwraca.
    const db = createFakeDb({
      flo_kind_flags: [flag('payment.confirm'), flag('onboarding.step')],
      flo_proposals: cardsFromToday(FLO_DAILY_NEW_CARDS_CAP - 1),
    });

    const result = await runFloTick(
      undefined,
      NOW,
      db.client,
      tickSources({
        paymentConfirm: {
          readOverdueInvoices: async () => [overdueInvoice()],
          readInvoiceState: async () => invoiceState(),
          readGlobalKill: async () => false,
        },
        onboarding: {
          readAccount: async () => youngAccount(),
          readGlobalKill: async () => false,
        },
      }),
    );

    expect(result.confirmAsked).toBe(1);
    expect(result.onboardingGuided).toBe(0);
    expect(result.withheld).toBe(1);
  });

  it('limit jednego konta nie zamyka ust na pozostałych', async () => {
    const db = createFakeDb({
      flo_kind_flags: [flag('payment.confirm'), flag('payment.confirm', 'ten-2')],
      flo_proposals: cardsFromToday(FLO_DAILY_NEW_CARDS_CAP),
    });

    const result = await runFloTick(
      undefined,
      NOW,
      db.client,
      tickSources({
        listTenantIds: async () => [TENANT, 'ten-2'],
        paymentConfirm: {
          readOverdueInvoices: async () => [overdueInvoice()],
          readInvoiceState: async () => invoiceState(),
          readGlobalKill: async () => false,
        },
      }),
    );

    expect(result.confirmAsked).toBe(1);
    expect(result.withheld).toBe(1);
    expect(
      db.tables.flo_proposals.filter((r) => r.tenant_id === 'ten-2'),
    ).toHaveLength(1);
  });

  it('limit nie zatrzymuje zamykania nieaktualnych kart', async () => {
    // Zamknięcie karty to domknięcie rozmowy, którą agent sam zaczął.
    // Gdyby limit je blokował, klient patrzyłby na pytanie o fakturę,
    // która dawno jest opłacona.
    const db = createFakeDb({
      flo_kind_flags: [flag('payment.confirm')],
      flo_proposals: [
        ...cardsFromToday(FLO_DAILY_NEW_CARDS_CAP),
        {
          id: 'stare-pytanie',
          tenant_id: TENANT,
          kind: 'payment.confirm',
          topic_key: 'payment.confirm:inv-1',
          status: 'open',
          created_at: '2026-09-15T05:30:00.000Z',
          expires_at: '2026-09-30T00:00:00.000Z',
          dismissed_reason: null,
        },
      ],
    });

    // Faktura przestała być zaległa — została opłacona.
    const result = await runFloTick(undefined, NOW, db.client, tickSources());

    expect(result.confirmClosed).toBe(1);
    expect(result.withheld).toBe(0);
    const closed = db.tables.flo_proposals.find((r) => r.id === 'stare-pytanie');
    expect(closed?.status).not.toBe('open');
  });
});
