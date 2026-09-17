import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * K-01 w pulsie — producent karty „zapłacił?" (plan FLO 2, zadanie 1.1).
 *
 * Najważniejszy test w tym pliku to „karta przechodzi re-walidację przy
 * kliknięciu". Idzie PRAWDZIWĄ drogą `assertFresh` → `readState`, a atrapą
 * jest wyłącznie tabela faktur. Bez niego producent mógłby tworzyć karty,
 * które wyglądają dobrze w bazie i padają przy każdym kliknięciu — i żaden
 * inny test by tego nie zauważył.
 */

// Tabela `invoices` widziana przez klienta administracyjnego. Współdzielona
// przez atrapę modułu i przez testy, więc musi powstać przed importami.
const invoiceRows = vi.hoisted(() => new Map<string, Record<string, unknown>>());

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: (_column: string, id: string) => ({
          maybeSingle: async () => ({
            data: invoiceRows.has(id) ? { ...invoiceRows.get(id) } : null,
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

import type { FloProposalRow } from '@/lib/flo/db-types';
import { assertFresh, FloStaleError } from '@/lib/flo/fingerprint';
import {
  buildPaymentConfirmProposal,
  selectOverdueForConfirmation,
  type OverdueInvoice,
} from '@/lib/flo/functions/payment-confirm';
import {
  producePaymentConfirm,
  productionPaymentConfirmSources,
  runPaymentConfirmSweep,
  type PaymentConfirmSources,
} from '@/lib/flo/functions/payment-confirm-producer';
import { runFloTick } from '@/lib/flo/tick';

import { createFakeDb } from './flo-fake-db';

/** 07:30 w Warszawie — godzina pulsu. */
const NOW = new Date('2026-09-17T05:30:00.000Z');
const DAY = 86_400_000;
const TENANT = 'ten-1';

function putInvoice(
  id: string,
  overrides: { gross?: number; paid?: number; due?: string; paused?: boolean } = {},
) {
  invoiceRows.set(id, {
    id,
    internal_number: `FV/${id}`,
    buyer_data: { name: 'Nowak Sp. z o.o.' },
    ksef_status: 'accepted',
    gross_total: overrides.gross ?? 4300,
    paid_amount: overrides.paid ?? 0,
    payment_due_date: overrides.due ?? '2026-09-10',
    reminders_paused: overrides.paused ?? false,
  });
}

function toOverdue(row: Record<string, unknown>): OverdueInvoice {
  return {
    id: String(row.id),
    number: String(row.internal_number),
    contractorName: 'Nowak Sp. z o.o.',
    grossTotal: Number(row.gross_total),
    paidAmount: Number(row.paid_amount),
    dueDate: String(row.payment_due_date),
    remindersPaused: row.reminders_paused === true,
  };
}

/**
 * Źródła jak na produkcji, z jedną podmianą: listę faktur po terminie bierzemy
 * z tej samej tabeli, którą czyta re-walidacja. Filtr „po terminie, nieopłacona"
 * robi funkcja czysta — atrapa oddaje wszystko.
 */
function sources(overrides: Partial<PaymentConfirmSources> = {}) {
  const calls = { overdue: 0 };
  const value: PaymentConfirmSources = {
    ...productionPaymentConfirmSources(),
    readOverdueInvoices: async () => {
      calls.overdue++;
      return [...invoiceRows.values()].map(toOverdue);
    },
    readGlobalKill: async () => false,
    ...overrides,
  };
  return { value, calls };
}

/** Konto wpuszczone przez operatora — K-01 jest dziś w kanarku na etapie 0. */
function alphaFlag(tenantId = TENANT) {
  return { tenant_id: tenantId, kind: 'payment.confirm', enabled: true, reason: 'alfa 2026-10' };
}

function card(overrides: Record<string, unknown>) {
  return {
    tenant_id: TENANT,
    kind: 'payment.confirm',
    expires_at: '2026-10-10T00:00:00.000Z',
    dismissed_reason: null,
    ...overrides,
  };
}

beforeEach(() => {
  invoiceRows.clear();
});

// ═══════════════════════════════════════════════════════════════
// Bramki
// ═══════════════════════════════════════════════════════════════

describe('K-01 w pulsie — bramki', () => {
  it('konto poza kanarkiem: faktur nawet nie czytamy i nie zostaje ślad', async () => {
    // Tak wygląda dziś KAŻDE konto na produkcji: `flo_rollout` jest puste.
    putInvoice('A');
    const db = createFakeDb();
    const src = sources();

    const result = await producePaymentConfirm(TENANT, NOW, db.client, src.value);

    expect(result.outcome).toBe('disabled');
    expect(src.calls.overdue).toBe(0);
    expect(db.tables.flo_proposals).toHaveLength(0);
  });

  it('„nigdy więcej takich": cisza bez odczytu faktur', async () => {
    putInvoice('A');
    const db = createFakeDb({
      flo_kind_flags: [alphaFlag()],
      flo_decisions: [
        {
          tenant_id: TENANT,
          kind: 'payment.confirm',
          accepted: 0,
          dismissed: 2,
          muted_until: '2026-12-01T00:00:00.000Z',
        },
      ],
    });
    const src = sources();

    const result = await producePaymentConfirm(TENANT, NOW, db.client, src.value);

    expect(result.outcome).toBe('muted');
    expect(src.calls.overdue).toBe(0);
    expect(db.tables.flo_proposals).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Jedno pytanie
// ═══════════════════════════════════════════════════════════════

describe('K-01 w pulsie — jedno pytanie', () => {
  it('pyta o JEDNĄ fakturę — największą zaległość', async () => {
    putInvoice('A', { gross: 1000 });
    putInvoice('B', { gross: 9000 });
    const db = createFakeDb({ flo_kind_flags: [alphaFlag()] });

    const result = await producePaymentConfirm(TENANT, NOW, db.client, sources().value);

    expect(result.outcome).toBe('created');
    expect(db.tables.flo_proposals).toHaveLength(1);

    const row = db.tables.flo_proposals[0]!;
    expect(row.topic_key).toBe('payment.confirm:B');
    // Numer faktury na karcie — sama nazwa firmy przy dwóch fakturach tego
    // samego kontrahenta prowadzi do zamknięcia niewłaściwej należności.
    expect(row.title).toContain('FV/B');
    expect((row.payload as Record<string, unknown>).invoiceId).toBe('B');
  });

  it('nie pyta w dniu terminu', async () => {
    putInvoice('A', { due: '2026-09-17' });
    const db = createFakeDb({ flo_kind_flags: [alphaFlag()] });

    const result = await producePaymentConfirm(TENANT, NOW, db.client, sources().value);

    expect(result.outcome).toBe('nothing');
    expect(db.tables.flo_proposals).toHaveLength(0);
  });

  it('drugi przebieg odświeża tę samą kartę, ale nie przesuwa jej ważności', async () => {
    putInvoice('A');
    const db = createFakeDb({ flo_kind_flags: [alphaFlag()] });
    const src = sources().value;

    await producePaymentConfirm(TENANT, NOW, db.client, src);
    const first = { ...db.tables.flo_proposals[0]! };

    const tomorrow = new Date(NOW.getTime() + DAY);
    const result = await producePaymentConfirm(TENANT, tomorrow, db.client, src);

    expect(result.outcome).toBe('waiting');
    expect(db.tables.flo_proposals).toHaveLength(1);
    // Liczba dni po terminie idzie z czasem…
    expect(db.tables.flo_proposals[0]!.body).not.toBe(first.body);
    // …ale przemilczana karta ma kiedyś wygasnąć.
    expect(db.tables.flo_proposals[0]!.expires_at).toBe(first.expires_at);
  });

  it('AWARIA: karta przechodzi re-walidację przy kliknięciu', async () => {
    putInvoice('A');
    const db = createFakeDb({ flo_kind_flags: [alphaFlag()] });

    await producePaymentConfirm(TENANT, NOW, db.client, sources().value);
    const row = db.tables.flo_proposals[0]! as unknown as FloProposalRow;

    // Nic się nie zmieniło — kliknięcie ma przejść.
    await expect(assertFresh(row, NOW)).resolves.toBeUndefined();

    // Kontrahent zapłacił między pokazaniem karty a kliknięciem — kliknięcie
    // ma zostać zatrzymane z ludzkim zdaniem, a nie ogólnikiem.
    invoiceRows.get('A')!.paid_amount = 4300;
    await expect(assertFresh(row, NOW)).rejects.toThrow(FloStaleError);
    await expect(assertFresh(row, NOW)).rejects.toThrow(/zapłacił/);
  });

  it('dla porównania: karta zbiorcza nie przeszłaby re-walidacji NIGDY', async () => {
    // Dowód, dlaczego producent nie używa `buildPaymentConfirmProposal`
    // wprost. Dane są identyczne jak przy tworzeniu, a mimo to odcisk się nie
    // zgadza — bo ładunek zbiorczy nie ma `invoiceId`.
    putInvoice('A');
    putInvoice('B');
    const bulk = buildPaymentConfirmProposal({
      tenantId: TENANT,
      selection: selectOverdueForConfirmation(
        [...invoiceRows.values()].map(toOverdue),
        NOW,
      ),
      now: NOW,
    })!;

    await expect(
      assertFresh(
        { kind: bulk.kind, payload: bulk.payload ?? {}, fingerprint: bulk.fingerprint },
        NOW,
      ),
    ).rejects.toThrow(FloStaleError);
  });
});

// ═══════════════════════════════════════════════════════════════
// Kolejka i „pytam raz"
// ═══════════════════════════════════════════════════════════════

describe('K-01 w pulsie — kolejka i „pytam raz"', () => {
  it('jedna żywa karta na konto — reszta czeka', async () => {
    putInvoice('A', { gross: 9000 });
    putInvoice('B', { gross: 5000 });
    putInvoice('C', { gross: 1000 });
    const db = createFakeDb({ flo_kind_flags: [alphaFlag()] });
    const src = sources().value;

    await producePaymentConfirm(TENANT, NOW, db.client, src);
    await producePaymentConfirm(TENANT, new Date(NOW.getTime() + DAY), db.client, src);

    expect(db.tables.flo_proposals).toHaveLength(1);
    expect(db.tables.flo_proposals[0]!.topic_key).toBe('payment.confirm:A');
  });

  it('faktura opłacona w międzyczasie: karta znika, pytamy o następną', async () => {
    // Wpłata przyszła z importu wyciągu. Karta „czy Nowak zapłacił?" o coś,
    // co system już wie, to dokładnie to pytanie, które traktuje klienta
    // jak niekompetentnego.
    putInvoice('A', { gross: 9000 });
    putInvoice('B', { gross: 1000 });
    const db = createFakeDb({ flo_kind_flags: [alphaFlag()] });
    const src = sources().value;

    await producePaymentConfirm(TENANT, NOW, db.client, src);
    invoiceRows.get('A')!.paid_amount = 9000;

    const result = await producePaymentConfirm(
      TENANT,
      new Date(NOW.getTime() + DAY),
      db.client,
      src,
    );

    expect(result).toEqual({ outcome: 'created', closed: 1 });
    const [a, b] = db.tables.flo_proposals;
    expect(a).toMatchObject({ topic_key: 'payment.confirm:A', status: 'expired', dismissed_reason: 'stale' });
    expect(b).toMatchObject({ topic_key: 'payment.confirm:B', status: 'open' });
  });

  it('zatwierdzonej karty nie ruszamy, nawet gdy faktura jest już opłacona', async () => {
    // Człowiek się zgodził. Podmiana albo zamknięcie karty pod ręką byłoby
    // zgodą na jedno i wykonaniem czegoś innego — re-walidacja przy wykonaniu
    // i tak zatrzyma nieaktualną.
    putInvoice('A', { paid: 4300 });
    putInvoice('B');
    const db = createFakeDb({
      flo_kind_flags: [alphaFlag()],
      flo_proposals: [card({ id: 'p', topic_key: 'payment.confirm:A', status: 'approved' })],
    });

    const result = await producePaymentConfirm(TENANT, NOW, db.client, sources().value);

    expect(result.outcome).toBe('waiting');
    expect(db.tables.flo_proposals).toHaveLength(1);
    expect(db.tables.flo_proposals[0]!.status).toBe('approved');
  });

  it('pytam raz: po odpowiedzi, odrzuceniu, cofnięciu i przemilczeniu nie wracamy', async () => {
    putInvoice('A', { gross: 9000 });
    putInvoice('B', { gross: 8000 });
    putInvoice('C', { gross: 7000 });
    putInvoice('D', { gross: 6000 });
    putInvoice('E', { gross: 1000 });
    const db = createFakeDb({
      flo_kind_flags: [alphaFlag()],
      flo_proposals: [
        // Odpowiedź „częściowo" — faktura dalej ma zaległość, ale pytanie padło.
        card({ id: 'a', topic_key: 'payment.confirm:A', status: 'done' }),
        card({ id: 'b', topic_key: 'payment.confirm:B', status: 'dismissed', dismissed_reason: 'not_now' }),
        card({ id: 'c', topic_key: 'payment.confirm:C', status: 'dismissed', dismissed_reason: 'undone' }),
        card({ id: 'd', topic_key: 'payment.confirm:D', status: 'expired', dismissed_reason: 'auto_expired' }),
      ],
    });

    const result = await producePaymentConfirm(TENANT, NOW, db.client, sources().value);

    expect(result.outcome).toBe('created');
    expect(db.tables.flo_proposals.at(-1)!.topic_key).toBe('payment.confirm:E');
  });

  it('karta zamknięta przez zmianę danych nie liczy się jako zadane pytanie', async () => {
    // Pytanie dotyczyło innego stanu faktury i nikt na nie nie odpowiedział.
    putInvoice('A', { paid: 1000 });
    const db = createFakeDb({
      flo_kind_flags: [alphaFlag()],
      flo_proposals: [
        card({ id: 'old', topic_key: 'payment.confirm:A', status: 'expired', dismissed_reason: 'stale' }),
      ],
    });

    const result = await producePaymentConfirm(TENANT, NOW, db.client, sources().value);

    expect(result.outcome).toBe('created');
    expect(db.tables.flo_proposals).toHaveLength(2);
  });

  it('faktura zniknęła między odczytami: pomijamy ją i pytamy o następną', async () => {
    putInvoice('B', { gross: 1000 });
    const ghost = toOverdue({
      id: 'GHOST',
      internal_number: 'FV/GHOST',
      gross_total: 9000,
      paid_amount: 0,
      payment_due_date: '2026-09-10',
      reminders_paused: false,
    });
    const db = createFakeDb({ flo_kind_flags: [alphaFlag()] });

    const result = await producePaymentConfirm(
      TENANT,
      NOW,
      db.client,
      sources({
        readOverdueInvoices: async () => [ghost, ...[...invoiceRows.values()].map(toOverdue)],
      }).value,
    );

    expect(result.outcome).toBe('created');
    expect(db.tables.flo_proposals).toHaveLength(1);
    expect(db.tables.flo_proposals[0]!.topic_key).toBe('payment.confirm:B');
  });
});

// ═══════════════════════════════════════════════════════════════
// Wszystkie konta i puls
// ═══════════════════════════════════════════════════════════════

describe('K-01 w pulsie — wszystkie konta', () => {
  it('awaria jednego konta nie zabiera pytań pozostałym', async () => {
    putInvoice('A');
    const db = createFakeDb({
      flo_kind_flags: [alphaFlag('ten-bad'), alphaFlag()],
    });
    const errors: string[] = [];
    const base = sources().value;

    const result = await runPaymentConfirmSweep(
      ['ten-bad', TENANT],
      NOW,
      db.client,
      {
        ...base,
        readOverdueInvoices: async (tenantId, now) => {
          if (tenantId === 'ten-bad') throw new Error('timeout zapytania');
          return base.readOverdueInvoices(tenantId, now);
        },
      },
      { error: (message: string) => errors.push(message) },
    );

    expect(result).toEqual({ asked: 1, closed: 0, failed: 1 });
    expect(db.tables.flo_proposals).toHaveLength(1);
    expect(db.tables.flo_proposals[0]!.tenant_id).toBe(TENANT);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('ten-bad');
  });

  it('puls zadaje pytanie K-01 i zwraca liczby', async () => {
    putInvoice('A');
    const db = createFakeDb({ flo_kind_flags: [alphaFlag()] });

    const result = await runFloTick(undefined, NOW, db.client, {
      listTenantIds: async () => [TENANT],
      paymentConfirm: sources().value,
    });

    expect(result).toMatchObject({ confirmAsked: 1, confirmClosed: 0, failedTenants: 0 });
    expect(db.tables.flo_proposals).toHaveLength(1);
  });
});
