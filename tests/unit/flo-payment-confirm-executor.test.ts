import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * K-01 — wykonawca „zapłacił?" i jego cofnięcie.
 *
 * Najważniejszy test w tym pliku to „cała droga: Tak → cofnij". Idzie
 * PRAWDZIWYM wykonawcą propozycji (`executeProposal`: re-walidacja, żeton,
 * wykonawca, zapis) i PRAWDZIWYM `undoAction`. Atrapą jest wyłącznie klient
 * administracyjny, a atrapa tabeli `payments` zachowuje się jak baza w tych
 * dwóch miejscach, na których wykonawca się wykładał:
 *
 * - odrzuca kolumny, których tabela nie ma, i brak `payment_date` (NOT NULL),
 *   tak jak PostgREST — poprzednia wersja wykonawcy wstawiała `paid_at`,
 *   `source` i `note`, a rzutowanie ukrywało to przed typecheckiem;
 * - po każdym wstawieniu i usunięciu przelicza `invoices.paid_amount` jako
 *   sumę wpłat, tak jak trigger `recalculate_invoice_paid_amount` (00014).
 */

vi.mock('@/lib/feature-flags/global-flags', () => ({
  getGlobalFlagForExecution: vi.fn(async () => false),
  getGlobalFlag: vi.fn(async () => false),
}));

const store = vi.hoisted(() => ({
  invoices: new Map<string, Record<string, unknown>>(),
  payments: [] as Array<Record<string, unknown>>,
  calls: { insert: 0, delete: 0, update: 0 },
}));

vi.mock('@/lib/supabase/admin', () => {
  // Kolumny `public.payments` z migracji 00014 — i nic ponad to.
  const COLUMNS = new Set([
    'id',
    'tenant_id',
    'invoice_id',
    'amount',
    'payment_date',
    'payment_method',
    'bank_import_id',
    'bank_transaction_ref',
    'bank_payer_name',
    'bank_payer_account',
    'match_confidence',
    'match_method',
    'is_auto_matched',
    'is_confirmed',
    'notes',
    'created_at',
    'updated_at',
  ]);

  // Trigger `recalculate_invoice_paid_amount`.
  const recalculate = (invoiceId: unknown) => {
    const invoice = store.invoices.get(String(invoiceId));
    if (!invoice) return;
    invoice.paid_amount = store.payments
      .filter((p) => p.invoice_id === invoiceId)
      .reduce((sum, p) => sum + Number(p.amount), 0);
  };

  type Row = Record<string, unknown>;
  const rowsOf = (table: string): Row[] =>
    table === 'invoices' ? [...store.invoices.values()] : store.payments;

  // Zapytanie z łańcuchem warunków `eq`/`is` — wykonawca i cofnięcie od
  // granicy firm pytają zawsze o `id` ORAZ `tenant_id`, a cofnięcie dokłada
  // warunki compare-and-set na polach wstawionego wiersza.
  const query = (table: string, mode: 'read' | 'delete' | 'update') => {
    const filters: Array<(row: Row) => boolean> = [];
    const run = () => {
      const matched = rowsOf(table).filter((row) => filters.every((f) => f(row)));
      if (mode === 'update') store.calls.update++;
      if (mode === 'delete') {
        store.calls.delete++;
        for (const row of matched) {
          const index = store.payments.indexOf(row);
          if (index >= 0) store.payments.splice(index, 1);
          recalculate(row.invoice_id);
        }
      }
      return matched.map((row) => ({ ...row }));
    };
    const builder = {
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return builder;
      },
      is: (column: string, value: null) => {
        filters.push((row) => (row[column] ?? null) === value);
        return builder;
      },
      select: () => builder,
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
        Promise.resolve({ data: run(), error: null }).then(resolve),
    };
    return builder;
  };

  return {
    createAdminClient: () => ({
      from: (table: string) => ({
        select: () => query(table, 'read'),
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              store.calls.insert++;
              const unknown = Object.keys(row).find((key) => !COLUMNS.has(key));
              if (unknown) {
                return {
                  data: null,
                  error: {
                    message: `Could not find the '${unknown}' column of 'payments' in the schema cache`,
                  },
                };
              }
              if (!row.payment_date) {
                return {
                  data: null,
                  error: {
                    message:
                      'null value in column "payment_date" of relation "payments" violates not-null constraint',
                  },
                };
              }
              const inserted = { id: `pay-${store.payments.length + 1}`, ...row };
              store.payments.push(inserted);
              recalculate(row.invoice_id);
              return { data: { id: inserted.id }, error: null };
            },
          }),
        }),
        update: () => query(table, 'update'),
        delete: () => query(table, 'delete'),
      }),
    }),
  };
});

import { createAdminClient } from '@/lib/supabase/admin';
import { isValueValid } from '@/components/flo/gating';
import type { FloProposalRow } from '@/lib/flo/db-types';
import { approvalOperationHash, proposalApprovalVersion } from '@/lib/flo/approval-version';
import { executeProposal } from '@/lib/flo/execute';
import { readState } from '@/lib/flo/fingerprint';
import { FLO_FIXTURES } from '@/lib/flo/fixtures';
import {
  buildInvoiceConfirmProposal,
  CONFIRMATION_NOTE,
  planPaymentConfirmation,
} from '@/lib/flo/functions/payment-confirm';
import { getFloHandler } from '@/lib/flo/handlers';
import { parsePlnAmount } from '@/lib/flo/money';
import { toProposalView } from '@/lib/flo/proposals';
import { undoAction, UNDO_WINDOW_MS } from '@/lib/flo/undo';
import type { FloApproveInput } from '@/types/flo';

import { createFakeDb } from './flo-fake-db';

/** 00:30 w Warszawie, 17 września — a w UTC jeszcze 16 września. */
const NOW = new Date('2026-09-16T22:30:00.000Z');
const TENANT = 'ten-1';

/** Faktura na 4 300 zł z wcześniejszą wpłatą 1 000 zł, zapisaną jak należy. */
function seedInvoice(id = 'A') {
  store.invoices.set(id, {
    id,
    tenant_id: TENANT,
    internal_number: `FV/${id}`,
    buyer_data: { name: 'Nowak Sp. z o.o.' },
    ksef_status: 'accepted',
    gross_total: 4300,
    paid_amount: 1000,
    payment_due_date: '2026-09-10',
    reminders_paused: false,
  });
  store.payments.push({
    id: `pay-earlier-${id}`,
    tenant_id: TENANT,
    invoice_id: id,
    amount: 1000,
    payment_date: '2026-09-12',
  });
}

/** Karta dokładnie taka, jaką postawi producent w pulsie. */
async function cardFor(invoiceId = 'A') {
  const state = await readState('payment.confirm', { invoiceId }, TENANT);
  const card = buildInvoiceConfirmProposal({
    tenantId: TENANT,
    invoiceId,
    state,
    now: NOW,
  });
  if (!card) throw new Error('faktura w teście powinna być zaległa');
  return card;
}

function proposalRow(card: Awaited<ReturnType<typeof cardFor>>) {
  return {
    id: 'prop-1',
    tenant_id: TENANT,
    kind: card.kind,
    topic_key: card.topicKey,
    status: 'open',
    priority: card.priority ?? 50,
    title: card.title,
    body: card.body,
    payload: card.payload ?? {},
    evidence: card.evidence ?? [],
    fingerprint: card.fingerprint,
    expires_at: card.expiresAt.toISOString(),
    created_at: '2026-09-16T05:30:00.000Z',
    approved_at: null,
    approved_by: null,
    executed_at: null,
    dismissed_reason: null,
  };
}

/** Zgoda związana z dokładnie tą wersją karty (bez wpisanej kwoty). */
function approval(row: ReturnType<typeof proposalRow>) {
  const version = proposalApprovalVersion(row);
  return {
    id: 'apr-1',
    proposal_id: 'prop-1',
    tenant_id: TENANT,
    user_id: 'usr-1',
    snapshot: {
      approvalVersion: 1,
      proposalVersion: version,
      operationHash: approvalOperationHash(version),
    },
    created_at: '2026-09-16T22:29:00.000Z',
    consumed_at: null,
    expires_at: '2026-09-16T22:50:00.000Z',
  };
}

/** Wywołanie samego wykonawcy — bez re-walidacji i żetonu. */
async function runHandler(
  payload: Record<string, unknown>,
  input?: FloApproveInput,
) {
  const handler = getFloHandler('payment.confirm');
  if (!handler) throw new Error('wykonawca K-01 niezarejestrowany');
  return handler({
    proposal: { ...proposalRow(await cardFor()), payload } as unknown as FloProposalRow,
    userId: 'usr-1',
    approvalId: 'apr-1',
    snapshot: {},
    input,
  });
}

const paymentsOfA = () => store.payments.filter((p) => p.invoice_id === 'A');

beforeEach(() => {
  store.invoices.clear();
  store.payments.length = 0;
  store.calls = { insert: 0, delete: 0, update: 0 };
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  // Dziennik audytowy nie ma bazy w testach i mówi o tym na konsoli.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ═══════════════════════════════════════════════════════════════
// Karta
// ═══════════════════════════════════════════════════════════════

describe('K-01 — karta ma trzy odpowiedzi', () => {
  it('„Tak", „Jeszcze nie" i „Częściowo" z polem na kwotę — jak w atrapie interfejsu', async () => {
    seedInvoice();
    const card = await cardFor();
    const view = toProposalView(proposalRow(card) as unknown as FloProposalRow)!;
    const fixture = FLO_FIXTURES.find((f) => f.id === 'fx-choice-payment')!;

    expect(view.variant).toBe('choice');
    expect(view.primary).toMatchObject({ label: 'Tak, zapłacił', intent: 'approve' });
    // Przed poprawką `readActions` gubił `inputLabel` i `inputKind`, więc pole
    // „Częściowo" nie sprawdzało kształtu kwoty.
    expect(view.secondary).toEqual(fixture.secondary);
  });

  it('kwota na karcie to należność PO wcześniejszej wpłacie', async () => {
    seedInvoice();
    const card = await cardFor();

    expect(card.body).toContain('3 300,00 zł');
    expect(card.title).toContain('FV/A');
  });
});

// ═══════════════════════════════════════════════════════════════
// Zapis wpłaty
// ═══════════════════════════════════════════════════════════════

describe('K-01 — zapis wpłaty', () => {
  it('„Tak" zapisuje wpłatę do istniejących kolumn, z datą w polskiej strefie', async () => {
    seedInvoice();
    const card = await cardFor();

    const result = await runHandler(card.payload ?? {});

    expect(store.payments.at(-1)).toEqual({
      id: 'pay-2',
      tenant_id: TENANT,
      invoice_id: 'A',
      amount: 3300,
      // 00:30 w Warszawie to już 17 września, choć w UTC dalej 16.
      payment_date: '2026-09-17',
      is_confirmed: true,
      // Odróżnia potwierdzenie z karty od dopasowania z wyciągu.
      match_method: 'flo_confirmation',
      notes: CONFIRMATION_NOTE,
    });
    // Należność zamknięta przez trigger, nie przez wykonawcę.
    expect(store.invoices.get('A')!.paid_amount).toBe(4300);
    expect(store.calls.update).toBe(0);
    expect(result.summary).toBe('faktura FV/A oznaczona jako zapłacona');
  });

  it('„Częściowo: 1 234,56" zapisuje dokładnie tę kwotę', async () => {
    seedInvoice();
    const card = await cardFor();

    const result = await runHandler(card.payload ?? {}, { value: '1 234,56' });

    expect(store.payments.at(-1)!.amount).toBe(1234.56);
    expect(store.invoices.get('A')!.paid_amount).toBe(2234.56);
    expect(result.details).toMatchObject({ kind: 'partial', amount: 1234.56 });
  });

  it('kwota, której nie rozumiemy, to odmowa — nie NaN i nie złotówka', async () => {
    seedInvoice();
    const card = await cardFor();

    // `Number('1.234,56')` = NaN, `parseFloat('1.234,56')` = 1.234.
    await expect(runHandler(card.payload ?? {}, { value: '1.234,56' })).rejects.toThrow(
      /nie rozumiem/i,
    );
    await expect(runHandler(card.payload ?? {}, { value: 'tysiąc' })).rejects.toThrow();
    await expect(runHandler(card.payload ?? {}, { value: '' })).rejects.toThrow();
    expect(store.calls.insert).toBe(0);
  });

  it('kwota większa od należności to literówka, nie nadpłata', async () => {
    seedInvoice();
    const card = await cardFor();

    await expect(runHandler(card.payload ?? {}, { value: '4 300' })).rejects.toThrow(
      /poza zakresem/,
    );
    expect(store.calls.insert).toBe(0);
  });

  it('BEZPIECZEŃSTWO: identyfikator faktury z przeglądarki nie wybiera faktury', async () => {
    // Zapis idzie klientem administracyjnym, z pominięciem RLS. Poprzednia
    // wersja brała fakturę z `selectedIds` — podmienione żądanie dopisywało
    // wpłatę do dowolnej faktury, także cudzego konta.
    seedInvoice('A');
    seedInvoice('CUDZA');
    const card = await cardFor('A');

    await expect(
      runHandler(card.payload ?? {}, { selectedIds: ['CUDZA'] }),
    ).rejects.toThrow(/innej faktury/);
    expect(store.calls.insert).toBe(0);
    expect(store.invoices.get('CUDZA')!.paid_amount).toBe(1000);
  });

  it('należność liczy z faktów sprawdzonych przez re-walidację, nie z treści karty', () => {
    const plan = planPaymentConfirmation({
      invoiceId: 'A',
      number: 'FV/A',
      facts: { grossTotal: 4300, paidAmount: 4000, status: 'accepted' },
      // Śmieci z dawnego ładunku zbiorczego nie mają już żadnej mocy.
      invoices: [{ invoiceId: 'A', outstanding: 4300 }],
    });

    expect(plan).toMatchObject({ amount: 300, kind: 'full' });
  });
});

// ═══════════════════════════════════════════════════════════════
// Cała droga i cofnięcie
// ═══════════════════════════════════════════════════════════════

describe('K-01 — cała droga: „Tak" → cofnij', () => {
  async function approveCard() {
    seedInvoice();
    const card = await cardFor();
    const row = proposalRow(card);
    const db = createFakeDb({
      flo_proposals: [row],
      flo_approvals: [approval(row)],
      // Wykonawca od granicy firm sprawdza kanarek także przy istniejącej
      // karcie — karta K-01 istnieje tylko tam, gdzie funkcję odsłonięto.
      flo_rollout: [
        {
          kind: 'payment.confirm',
          stage: 100,
          stage_since: '2026-09-01T00:00:00.000Z',
          complaints: 0,
          halted: false,
          halt_reason: null,
        },
      ],
    });

    const result = await executeProposal(
      {
        proposalId: 'prop-1',
        tenantId: TENANT,
        userId: 'usr-1',
        approvalId: 'apr-1',
        proposalVersion: proposalApprovalVersion(row),
      },
      NOW,
      db.client,
    );
    return { db, result };
  }

  it('wykonanie zapisuje w karcie, jak cofnąć — tam, gdzie szuka tego cofnięcie', async () => {
    const { db, result } = await approveCard();

    expect(result).toEqual({ ok: true });
    const payload = db.tables.flo_proposals[0]!.payload as Record<string, unknown>;
    expect(db.tables.flo_proposals[0]!.status).toBe('done');
    expect(payload.undo).toMatchObject({
      table: 'payments',
      rowId: 'pay-2',
      op: 'delete',
      after: { tenant_id: TENANT, invoice_id: 'A', amount: 3300 },
    });
    expect(Date.parse(String(payload.undoableUntil)) - NOW.getTime()).toBe(UNDO_WINDOW_MS);
    // Ładunek karty nie zgubił niczego przy dopisaniu cofnięcia.
    expect(payload.invoiceId).toBe('A');
  });

  it('cofnięcie usuwa wstawioną wpłatę, a faktura wraca do stanu sprzed kliknięcia', async () => {
    const { db } = await approveCard();
    expect(store.invoices.get('A')!.paid_amount).toBe(4300);

    const undone = await undoAction(
      'prop-1',
      'usr-1',
      TENANT,
      new Date(NOW.getTime() + 5 * 60_000),
      db.client,
      createAdminClient() as never,
    );

    expect(undone).toEqual({ ok: true });
    // Wcześniejsza wpłata 1 000 zł zostaje — poprzednia wersja cofnięcia
    // ustawiała `paid_amount` na 0 i kasowała ją z faktury.
    expect(paymentsOfA().map((p) => p.id)).toEqual(['pay-earlier-A']);
    expect(store.invoices.get('A')!.paid_amount).toBe(1000);
    expect(store.calls.update).toBe(0);
    expect(db.tables.flo_proposals[0]!).toMatchObject({
      status: 'dismissed',
      dismissed_reason: 'undone',
    });
  });

  it('nie kasuje wpłaty, którą człowiek w międzyczasie poprawił', async () => {
    const { db } = await approveCard();
    store.payments.find((p) => p.id === 'pay-2')!.amount = 3000;

    const undone = await undoAction(
      'prop-1',
      'usr-1',
      TENANT,
      new Date(NOW.getTime() + 5 * 60_000),
      db.client,
      createAdminClient() as never,
    );

    expect(undone).toMatchObject({ ok: false, reason: 'changed' });
    expect(store.calls.delete).toBe(0);
  });

  it('po dziesięciu minutach wpłata zostaje', async () => {
    const { db } = await approveCard();

    const undone = await undoAction(
      'prop-1',
      'usr-1',
      TENANT,
      new Date(NOW.getTime() + UNDO_WINDOW_MS + 1),
      db.client,
      createAdminClient() as never,
    );

    expect(undone).toMatchObject({ ok: false, reason: 'expired' });
    expect(store.calls.delete).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Kwota wpisana w karcie
// ═══════════════════════════════════════════════════════════════

describe('kwota wpisana w karcie', () => {
  it.each([
    ['1 234,56', 1234.56],
    ['1 234,56', 1234.56],
    ['1234.5', 1234.5],
    ['1234', 1234],
    ['  300,00 ', 300],
    ['12 345 678,9', 12345678.9],
  ])('„%s" → %s', (value, expected) => {
    expect(parsePlnAmount(value)).toBe(expected);
  });

  it.each(['', 'tysiąc', '1.234,56', '1,234.56', '-5', '1e3', '12,345', '1 23,4', 'NaN'])(
    '„%s" → odmowa',
    (value) => {
      expect(parsePlnAmount(value)).toBeNull();
    },
  );

  it('serwer rozumie DOKŁADNIE to, co przepuszcza pole w karcie', () => {
    // Dwa miejsca, jedna reguła. Rozjazd oznaczałby albo kwotę, którą
    // interfejs przepuścił, a serwer odrzucił bez powodu, albo odwrotnie.
    const samples = [
      '1 234,56', '1 234,56', '1 234,56', '1234.5', '1234', '0,5',
      '1.234,56', 'tysiąc', '12,345', '1 23,4', '-5', '', '999 999,99', '1,2',
    ];
    for (const sample of samples) {
      expect(parsePlnAmount(sample) !== null, sample).toBe(
        isValueValid(sample, 'amount'),
      );
    }
  });
});
