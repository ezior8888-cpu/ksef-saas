import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * K-02 — wykonawca ponagleń: okno bezpieczeństwa i zapis przypomnienia.
 *
 * To jest funkcja o największym promieniu w agencie: wiadomość do OBCEJ firmy,
 * bez cofnięcia. Najważniejszy test w pliku: „wpłata od tego kontrahenta na
 * INNĄ fakturę wczoraj — nie wysyłamy". Poprzednia wersja pytała o wpłaty
 * tylko do tej jednej faktury i do tego o kolumnę `payments.paid_at`, której
 * tabela nie ma — więc okno nie działało w ogóle.
 *
 * Atrapą jest wyłącznie klient administracyjny. Zachowuje się jak PostgREST
 * tam, gdzie wykonawca się wykładał: nieznana kolumna to błąd zapytania,
 * a wpłaty są złączone z fakturami po `invoice_id`.
 */

const store = vi.hoisted(() => ({
  invoices: [] as Array<Record<string, unknown>>,
  payments: [] as Array<Record<string, unknown>>,
  reminders: [] as Array<Record<string, unknown>>,
}));

const sendJobEvent = vi.hoisted(() =>
  vi.fn<(event: unknown) => Promise<{ ok: boolean }>>(async () => ({ ok: true })),
);

vi.mock('@/lib/jobs/enqueue', () => ({ sendJobEvent }));

vi.mock('@/lib/supabase/admin', () => {
  // Kolumny z migracji 00014 (`payments`, `payment_reminders`) i z typów
  // `invoices` — tylko te, które mają tu znaczenie, plus kilka sąsiednich,
  // żeby literówka nie trafiła przypadkiem w istniejącą nazwę.
  const COLUMNS: Record<string, Set<string>> = {
    payments: new Set([
      'id', 'tenant_id', 'invoice_id', 'amount', 'payment_date', 'payment_method',
      'is_auto_matched', 'is_confirmed', 'notes', 'created_at', 'updated_at',
    ]),
    invoices: new Set([
      'id', 'tenant_id', 'buyer_nip', 'buyer_data', 'gross_total', 'paid_amount',
      'paid_at', 'payment_due_date', 'origin', 'direction',
    ]),
    payment_reminders: new Set([
      'id', 'tenant_id', 'invoice_id', 'stage', 'channel', 'scheduled_for',
      'status', 'sent_at', 'created_at', 'failure_reason',
    ]),
  };

  const missing = (table: string, column: string) => ({
    data: null,
    error: { code: '42703', message: `column ${table}.${column} does not exist` },
  });

  /** „a, b, invoices!inner(c)" → [[tabela, kolumna], …] */
  function columnsOf(table: string, select: string): Array<[string, string]> {
    const out: Array<[string, string]> = [];
    for (const part of select.split(/,(?![^(]*\))/).map((p) => p.trim())) {
      const embedded = /^(\w+)!inner\((.+)\)$/.exec(part);
      if (embedded) {
        for (const col of embedded[2]!.split(',')) out.push([embedded[1]!, col.trim()]);
      } else {
        out.push([table, part]);
      }
    }
    return out;
  }

  function invoiceOf(payment: Record<string, unknown>) {
    return store.invoices.find((i) => i.id === payment.invoice_id);
  }

  return {
    createAdminClient: () => ({
      from: (table: string) => ({
        select: (select: string) => {
          let bad = columnsOf(table, select).find(([t, c]) => !COLUMNS[t]?.has(c));
          const eqs: Array<[string, unknown]> = [];
          const ors: Array<[string, string]> = [];
          let orderBy: string | null = null;

          const run = () => {
            if (bad) return missing(bad[0], bad[1]);
            if (orderBy && !COLUMNS[table]!.has(orderBy)) return missing(table, orderBy);

            if (table === 'invoices') {
              const row = store.invoices.find((r) => eqs.every(([c, v]) => r[c] === v));
              return { data: row ? { buyer_nip: row.buyer_nip } : null, error: null };
            }

            const rows = store.payments
              .filter((p) =>
                eqs.every(([c, v]) =>
                  c === 'invoices.buyer_nip' ? invoiceOf(p)?.buyer_nip === v : p[c] === v,
                ),
              )
              .filter(
                (p) =>
                  ors.length === 0 ||
                  ors.some(([c, v]) => String(p[c] ?? '') >= v),
              )
              .map((p) => ({
                payment_date: p.payment_date,
                created_at: p.created_at,
                invoices: { buyer_nip: invoiceOf(p)?.buyer_nip ?? null },
              }));
            return { data: rows, error: null };
          };

          const builder = {
            eq: (column: string, value: unknown) => {
              eqs.push([column, value]);
              return builder;
            },
            or: (filter: string) => {
              for (const clause of filter.split(',')) {
                const [column, op, ...rest] = clause.split('.');
                if (op !== 'gte') throw new Error(`atrapa nie zna operatora ${op}`);
                if (!COLUMNS[table]!.has(column!)) bad ??= [table, column!];
                ors.push([column!, rest.join('.')]);
              }
              return builder;
            },
            order: (column: string) => {
              orderBy = column;
              return builder;
            },
            limit: () => builder,
            maybeSingle: async () => run(),
            then: (resolve: (v: unknown) => unknown) => Promise.resolve(run()).then(resolve),
          };
          return builder;
        },
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            maybeSingle: async () => {
              const unknownColumn = Object.keys(row).find(
                (key) => !COLUMNS[table]?.has(key),
              );
              if (unknownColumn) return missing(table, unknownColumn);
              const inserted = { id: `rem-${store.reminders.length + 1}`, ...row };
              store.reminders.push(inserted);
              return { data: { id: inserted.id }, error: null };
            },
          }),
        }),
      }),
    }),
  };
});

import type { FloProposalRow } from '@/lib/flo/db-types';
import {
  latestPaymentMoment,
  paymentDateWindowStart,
  SAFETY_WINDOW_MS,
} from '@/lib/flo/functions/payment-chase';
import '@/lib/flo/functions/payment-chase-handler';
import { getFloHandler } from '@/lib/flo/handlers';

const NOW = new Date('2026-09-17T12:00:00.000Z');
const TENANT = 'ten-1';

function invoice(id: string, buyerNip: string | null, tenantId = TENANT) {
  store.invoices.push({ id, tenant_id: tenantId, buyer_nip: buyerNip });
}

function payment(
  invoiceId: string,
  dates: { paymentDate: string; createdAt: string },
  tenantId = TENANT,
) {
  store.payments.push({
    id: `pay-${store.payments.length + 1}`,
    tenant_id: tenantId,
    invoice_id: invoiceId,
    amount: 1000,
    payment_date: dates.paymentDate,
    created_at: dates.createdAt,
  });
}

function proposal(overrides: Record<string, unknown> = {}): FloProposalRow {
  return {
    id: 'prop-1',
    tenant_id: TENANT,
    kind: 'payment.chase',
    topic_key: 'payment.chase:inv-1:stage_1',
    status: 'executing',
    priority: 10,
    title: 'Nowak nie zapłacił',
    body: '4 300,00 zł po terminie',
    payload: {
      invoiceId: 'inv-1',
      stage: 'stage_1',
      facts: { grossTotal: 4300, paidAmount: 0, remindersPaused: 0 },
      ...overrides,
    },
    evidence: [],
    fingerprint: 'x',
    expires_at: '2026-09-19T00:00:00.000Z',
    created_at: '2026-09-17T07:30:00.000Z',
    approved_at: null,
    approved_by: null,
    executed_at: null,
    dismissed_reason: null,
  };
}

async function chase(row: FloProposalRow = proposal()) {
  const handler = getFloHandler('payment.chase');
  if (!handler) throw new Error('wykonawca K-02 niezarejestrowany');
  return handler({
    proposal: row,
    userId: 'user-1',
    approvalId: 'appr-1',
    snapshot: {},
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  store.invoices.length = 0;
  store.payments.length = 0;
  store.reminders.length = 0;
  sendJobEvent.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

// ═══════════════════════════════════════════════════════════════
// Chwila wpłaty — funkcja czysta
// ═══════════════════════════════════════════════════════════════

describe('K-02 — chwila ostatniej wpłaty', () => {
  it('bierze PÓŹNIEJSZĄ datę: wyciąg zaimportowany dziś ze starym przelewem', () => {
    expect(
      latestPaymentMoment([
        { payment_date: '2026-09-01', created_at: '2026-09-17T09:00:00.000Z' },
      ]),
    ).toBe('2026-09-17T09:00:00.000Z');
  });

  it('dzień przelewu liczy do końca dnia — wpłata „na wczoraj" wpisana wcześniej', () => {
    expect(
      latestPaymentMoment([
        { payment_date: '2026-09-16', created_at: '2026-09-10T08:00:00.000Z' },
      ]),
    ).toBe('2026-09-16T23:59:59.999Z');
  });

  it('bez wpłat albo z nieczytelnymi datami — brak chwili, a nie „teraz" ani zero', () => {
    expect(latestPaymentMoment([])).toBeNull();
    expect(latestPaymentMoment([{ payment_date: null, created_at: 'bzdura' }])).toBeNull();
  });

  it('filtr zapytania i ta funkcja zgadzają się na granicy okna', () => {
    // Gdyby filtr był węższy niż funkcja, zapytanie zgubiłoby wpłatę, którą
    // funkcja uznałaby za świeżą — a ponaglenie by wyszło.
    for (let hour = 0; hour < 48; hour++) {
      const since = new Date(NOW.getTime() - SAFETY_WINDOW_MS + hour * 3_600_000);
      for (const day of ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17']) {
        const inQuery = day >= paymentDateWindowStart(since);
        const moment = latestPaymentMoment([{ payment_date: day, created_at: null }])!;
        expect(inQuery, `${day} przy początku okna ${since.toISOString()}`).toBe(
          Date.parse(moment) >= since.getTime(),
        );
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Wykonawca
// ═══════════════════════════════════════════════════════════════

describe('K-02 — okno bezpieczeństwa w wykonawcy', () => {
  it('AWARIA: wpłata od tego kontrahenta na INNĄ fakturę wczoraj — nie wysyłamy', async () => {
    invoice('inv-1', '1234567890');
    invoice('inv-2', '1234567890');
    payment('inv-2', { paymentDate: '2026-09-16', createdAt: '2026-09-16T08:00:00.000Z' });

    await expect(chase()).rejects.toThrow(/wpłacił coś w ciągu ostatnich dwóch dni/);
    expect(store.reminders).toHaveLength(0);
    expect(sendJobEvent).not.toHaveBeenCalled();
  });

  it('wyciąg zaimportowany dziś ze starym przelewem — nie wysyłamy', async () => {
    invoice('inv-1', '1234567890');
    payment('inv-1', { paymentDate: '2026-09-02', createdAt: '2026-09-17T06:00:00.000Z' });

    await expect(chase()).rejects.toThrow(/wpłacił coś/);
    expect(sendJobEvent).not.toHaveBeenCalled();
  });

  it('wpłata INNEGO kontrahenta nie blokuje — ponaglenie idzie z żetonem zgody', async () => {
    invoice('inv-1', '1234567890');
    invoice('inv-3', '9876543210');
    payment('inv-3', { paymentDate: '2026-09-17', createdAt: '2026-09-17T09:00:00.000Z' });

    const result = await chase();

    expect(result.summary).toContain('stage_1');
    expect(store.reminders).toEqual([
      expect.objectContaining({
        tenant_id: TENANT,
        invoice_id: 'inv-1',
        stage: 'stage_1',
        channel: 'email',
        status: 'pending',
        scheduled_for: NOW.toISOString(),
      }),
    ]);
    expect(sendJobEvent).toHaveBeenCalledTimes(1);
    expect(sendJobEvent.mock.calls[0]![0]).toMatchObject({
      data: { reminderId: 'rem-1', approvalId: 'appr-1' },
    });
  });

  it('wpłata sprzed tygodnia nie blokuje', async () => {
    invoice('inv-1', '1234567890');
    payment('inv-1', { paymentDate: '2026-09-09', createdAt: '2026-09-09T10:00:00.000Z' });

    await expect(chase()).resolves.toBeDefined();
    expect(sendJobEvent).toHaveBeenCalledTimes(1);
  });

  it('wpłata z INNEGO konta o tym samym NIP-ie nie blokuje', async () => {
    // Ten sam kontrahent bywa klientem dwóch naszych kont. Jego wpłata u kogoś
    // innego nie jest informacją dla tego konta — i nie może nią być.
    invoice('inv-1', '1234567890');
    invoice('obca', '1234567890', 'ten-2');
    payment(
      'obca',
      { paymentDate: '2026-09-17', createdAt: '2026-09-17T09:00:00.000Z' },
      'ten-2',
    );

    await expect(chase()).resolves.toBeDefined();
    expect(sendJobEvent).toHaveBeenCalledTimes(1);
  });

  it('faktura bez NIP-u: liczą się wpłaty do niej samej', async () => {
    // Konsument nie ma NIP-u, więc nie ma jak powiązać jego innych faktur.
    // Wpłata innego konsumenta nie może blokować, wpłata do tej faktury musi.
    invoice('inv-1', null);
    invoice('inv-inna', null);
    payment('inv-inna', { paymentDate: '2026-09-17', createdAt: '2026-09-17T09:00:00.000Z' });

    await expect(chase()).resolves.toBeDefined();

    payment('inv-1', { paymentDate: '2026-09-17', createdAt: '2026-09-17T10:00:00.000Z' });
    await expect(chase()).rejects.toThrow(/wpłacił coś/);
  });

  it('BEZPIECZEŃSTWO: faktura z innego konta — odmowa bez zapisu i bez wysyłki', async () => {
    invoice('inv-1', '1234567890', 'ten-2');

    await expect(chase()).rejects.toThrow(/nie ma na tym koncie/);
    expect(store.reminders).toHaveLength(0);
    expect(sendJobEvent).not.toHaveBeenCalled();
  });

  it('nieznany etap ponaglenia — odmowa, zanim cokolwiek zostanie zapisane', async () => {
    invoice('inv-1', '1234567890');

    await expect(chase(proposal({ stage: 'stage_9' }))).rejects.toThrow(
      /bez kompletu danych/,
    );
    expect(store.reminders).toHaveLength(0);
    expect(sendJobEvent).not.toHaveBeenCalled();
  });
});
