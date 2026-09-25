import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobContext } from '@/lib/jobs/registry';

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  existing: new Set<string>(),
  filterError: null as { message: string } | null,
  filterChunks: [] as string[][],
  inserts: [] as Row[][],
  sellerRows: [] as Row[],
  classify: vi.fn((_docs: unknown, _known: ReadonlySet<string>) => [] as unknown[]),
}));

vi.mock('@/lib/supabase/admin-queries', () => ({ getTenantKsefCredentials: vi.fn(async () => ({})) }));
vi.mock('@/lib/ksef/inbox', () => ({ queryReceivedInvoices: vi.fn() }));
vi.mock('@/lib/flo/proposals', () => ({ createProposal: vi.fn() }));
vi.mock('@/lib/flo/functions/expense-inbox', () => ({
  buildInboxSummaryProposal: () => null,
  classifyInboxDocuments: (docs: unknown, known: ReadonlySet<string>) => db.classify(docs, known),
  evaluateContinuity: () => ({ status: 'complete' }),
}));
vi.mock('@/lib/flo/functions/inbox-cursor', () => ({
  readInboxCursor: async () => ({ announcedCount: 0, continuationToken: null }),
  saveInboxCursor: vi.fn(),
  clearInboxCursor: vi.fn(),
}));
vi.mock('@/lib/push/sender', () => ({ sendPushToTenant: vi.fn(async () => ({ sent: 0, failed: 0 })) }));
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: async () => ({
    from: () => {
      let op: 'select' | 'insert' = 'select';
      let rows: Row[] = [];
      let inList: string[] | null = null;
      let sellerList: string[] | null = null;
      const q = {
        select: () => q,
        eq: () => q,
        not: () => q,
        neq: () => q,
        limit: () => q,
        in: (col: string, list: string[]) => {
          if (col === 'ksef_number') inList = list;
          if (col === 'seller_nip') sellerList = list;
          return q;
        },
        insert: (r: Row[]) => {
          op = 'insert';
          rows = r;
          return q;
        },
        then: (ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) => {
          let result: unknown = { data: [], error: null };
          if (op === 'insert') {
            db.inserts.push(rows);
            result = { data: rows.map((r, i) => ({ id: `id-${i}`, ksef_number: r.ksef_number })), error: null };
          } else if (sellerList) {
            const lista = sellerList;
            result = { data: db.sellerRows.filter((r) => lista.includes(r.seller_nip as string)), error: null };
          } else if (inList) {
            db.filterChunks.push(inList);
            result = db.filterError
              ? { data: null, error: db.filterError }
              : { data: inList.filter((n) => db.existing.has(n)).map((n) => ({ ksef_number: n })), error: null };
          }
          return Promise.resolve(result).then(ok, fail);
        },
      };
      return q;
    },
  }),
}));

import { queryReceivedInvoices } from '@/lib/ksef/inbox';
import { KSEF_NUMBERS_PER_QUERY, runInboxPollTenant } from '@/lib/inngest/jobs/inbox-polling';

/**
 * Okno 48 h: każde pobranie (co 15 min) widzi te same faktury ponownie,
 * a baza nie ma unikalności na numer KSeF. `filter-existing` to jedyna
 * ochrona przed duplikatem — a duplikat to podwójny koszt w KPiR (osobny
 * wydatek z auto-kategoryzacji dla każdej kopii).
 */

const ctx: JobContext = {
  attempt: 0,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  step: { run: async (_n, fn) => fn(), sleep: vi.fn(), sendEvent: vi.fn(), scheduleAfter: vi.fn() },
};
const DATA = { tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', nip: '1234567890' };

function faktura(n: number, sellerNip = '5260001246') {
  const numer = `1234567890-20260925-${String(n).padStart(12, '0')}-00`;
  return {
    ksefNumber: numer,
    invoiceNumber: `FV ${n}/2026`,
    acquisitionDate: '2026-09-25T10:00:00Z',
    issueDate: '2026-09-25',
    seller: { nip: sellerNip, name: 'Dostawca' },
    buyer: { identifier: { type: 'Nip', value: '1234567890' } },
    currency: 'PLN',
    grossAmount: 123,
    netAmount: 100,
    vatAmount: 23,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.existing = new Set();
  db.filterError = null;
  db.filterChunks = [];
  db.inserts = [];
  db.sellerRows = [];
  db.classify.mockClear();
});

describe('skrzynka KSeF: filtr już zapisanych faktur', () => {
  it('błąd zapytania NIE znaczy „nic nie ma” — job pada, nic się nie zapisuje', async () => {
    vi.mocked(queryReceivedInvoices).mockResolvedValue([faktura(1), faktura(2)] as never);
    db.filterError = { message: 'URI Too Long' };

    await expect(runInboxPollTenant(DATA, ctx)).rejects.toThrow(/Nie można sprawdzić/);
    expect(db.inserts).toEqual([]);
  });

  it('pytamy paczkami, żeby adres nie przekroczył limitu, i zapisujemy tylko nowe', async () => {
    const wszystkie = Array.from({ length: 250 }, (_, i) => faktura(i));
    vi.mocked(queryReceivedInvoices).mockResolvedValue(wszystkie as never);
    db.existing = new Set([wszystkie[0]!.ksefNumber, wszystkie[120]!.ksefNumber, wszystkie[249]!.ksefNumber]);

    await runInboxPollTenant(DATA, ctx);

    expect(db.filterChunks.map((c) => c.length)).toEqual([100, 100, 50]);
    expect(Math.max(...db.filterChunks.map((c) => c.length))).toBeLessThanOrEqual(KSEF_NUMBERS_PER_QUERY);
    expect(db.inserts).toHaveLength(1);
    expect(db.inserts[0]).toHaveLength(247);
  });

  it('ta sama faktura dwa razy w jednej paczce z KSeF trafia do bazy raz', async () => {
    vi.mocked(queryReceivedInvoices).mockResolvedValue([faktura(7), faktura(7), faktura(8)] as never);

    await runInboxPollTenant(DATA, ctx);

    expect(db.inserts[0]!.map((r) => r.ksef_number)).toEqual([faktura(7).ksefNumber, faktura(8).ksefNumber]);
  });

  it('wszystko już zapisane — żadnego insertu', async () => {
    vi.mocked(queryReceivedInvoices).mockResolvedValue([faktura(1)] as never);
    db.existing = new Set([faktura(1).ksefNumber]);

    await expect(runInboxPollTenant(DATA, ctx)).resolves.toMatchObject({ newlyAdded: 0 });
    expect(db.inserts).toEqual([]);
  });
});

describe('skrzynka KSeF: sito nieznanego sprzedawcy', () => {
  // Recenzja ChatGPT nr 2 (25.09): zapytanie o znanych sprzedawców szło po
  // zapisie i widziało właśnie wstawione faktury — każdy wyglądał na znanego.
  it('„znany” to widziany PRZED tym przebiegiem, nie właśnie zapisany', async () => {
    vi.mocked(queryReceivedInvoices).mockResolvedValue([faktura(1, '1111111111'), faktura(2, '2222222222')] as never);
    db.sellerRows = [
      { id: 'dawna-faktura', seller_nip: '1111111111' },
      // Wiersze z bieżącego zapisu (atrapa nadaje im id-0, id-1):
      { id: 'id-0', seller_nip: '1111111111' },
      { id: 'id-1', seller_nip: '2222222222' },
    ];

    await runInboxPollTenant(DATA, ctx);

    const known = db.classify.mock.calls[0]![1];
    expect([...known]).toEqual(['1111111111']);
  });
});
