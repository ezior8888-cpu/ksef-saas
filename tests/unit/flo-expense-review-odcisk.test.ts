import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Spójność odcisku karty przeglądu wydatku z tym, co przeczyta baza (E16 a).
 *
 * Odcisk liczy karta (`buildExpenseReviewProposal`) przy tworzeniu, a przy
 * kliknięciu wykonawca liczy go jeszcze raz z wiersza `expenses`
 * (`computeFingerprint` → `readState`). Rozjazd = „Zgadza się” kończy się
 * „dane się zmieniły”, choć nikt niczego nie ruszał. Tak było przy wydatku
 * bez kursu NBP: karta wpisywała `deductible: 1`, a baza ma
 * `is_deductible = false`.
 *
 * Atrapa zwraca wiersz w kształcie, w jakim zapisał go `process-ocr`.
 */

const db = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  reads: [] as Array<{ table: string; columns: string; where: Record<string, unknown> }>,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: (columns: string) => {
        const where: Record<string, unknown> = {};
        const builder = {
          eq: (column: string, value: unknown) => {
            where[column] = value;
            return builder;
          },
          maybeSingle: async () => {
            db.reads.push({ table, columns, where: { ...where } });
            const row = db.row;
            if (!row || where.id !== row.id || where.tenant_id !== row.tenant_id) {
              return { data: null, error: null };
            }
            return { data: row, error: null };
          },
        };
        return builder;
      },
    }),
  }),
}));

import { computeFingerprint } from '@/lib/flo/fingerprint';
import {
  buildExpenseReviewProposal,
  type OcrFacts,
} from '@/lib/flo/functions/expense-review';

const TENANT = 'ten-1';
const NOW = new Date('2026-10-03T12:00:00.000Z');

function facts(overrides: Partial<OcrFacts> = {}): OcrFacts {
  return {
    sellerName: 'Sklep Testowy',
    sellerNip: '1234567890',
    netAmount: null,
    vatAmount: null,
    grossAmount: 312.4,
    issueDate: '2026-09-30',
    confidence: 0.95,
    categoryLabel: 'paliwo',
    ...overrides,
  };
}

/** Wiersz `expenses` tak, jak go zapisał `process-ocr` (z domyślnymi kolumnami). */
function expenseRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'exp-1',
    tenant_id: TENANT,
    gross_amount: 312.4,
    kpir_column: 'col_13',
    is_reviewed: false,
    // DEFAULT TRUE w 00034; `process-ocr` wpisuje false tylko bez kursu.
    is_deductible: true,
    ...overrides,
  };
}

async function freshAtClick(proposal: ReturnType<typeof buildExpenseReviewProposal>) {
  // Ładunek wraca z JSONB — bez pól `undefined`.
  const payload = JSON.parse(JSON.stringify(proposal.payload)) as Record<string, unknown>;
  return computeFingerprint('expense.review', payload, TENANT);
}

beforeEach(() => {
  db.row = null;
  db.reads = [];
});

describe('odcisk karty = odcisk z bazy przy kliknięciu', () => {
  it('złotówki — bez nowych pól, jak dotąd', async () => {
    db.row = expenseRow();
    const proposal = buildExpenseReviewProposal({
      tenantId: TENANT,
      expenseId: 'exp-1',
      facts: facts(),
      history: { count: 12, medianGross: 300 },
      applied: { kpirColumn: 'col_13', categoryLabel: 'paliwo' },
      now: NOW,
    });

    const { fingerprint, state } = await freshAtClick(proposal);
    expect(state.facts).toEqual(proposal.payload?.facts);
    expect(fingerprint).toBe(proposal.fingerprint);
    // Odczyt dotyczy tego wydatku i tego konta.
    expect(db.reads[0]).toMatchObject({
      table: 'expenses',
      where: { id: 'exp-1', tenant_id: TENANT },
    });
  });

  it('waluta przeliczona kursem — kwoty w złotych, koszt w KPiR', async () => {
    // 100 EUR po kursie 4,3050 = 430,50 zł; w faktach waluta kwot to PLN.
    db.row = expenseRow({ gross_amount: 430.5 });
    const proposal = buildExpenseReviewProposal({
      tenantId: TENANT,
      expenseId: 'exp-1',
      facts: facts({ grossAmount: 430.5, amountCurrency: 'PLN' }),
      history: { count: 12, medianGross: 300 },
      applied: { kpirColumn: 'col_13', categoryLabel: 'paliwo' },
      deductible: true,
      now: NOW,
    });

    const { fingerprint } = await freshAtClick(proposal);
    expect(fingerprint).toBe(proposal.fingerprint);
  });

  it('waluta bez kursu — kwoty w euro, koszt poza KPiR', async () => {
    db.row = expenseRow({ gross_amount: 100, is_deductible: false });
    const proposal = buildExpenseReviewProposal({
      tenantId: TENANT,
      expenseId: 'exp-1',
      facts: facts({ grossAmount: 100, amountCurrency: 'EUR' }),
      history: { count: 12, medianGross: 300 },
      applied: { kpirColumn: 'col_13', categoryLabel: 'paliwo' },
      now: NOW,
    });

    const { fingerprint, state } = await freshAtClick(proposal);
    expect(state.facts.deductible).toBe(0);
    expect(fingerprint).toBe(proposal.fingerprint);
  });

  it('kwota z więcej niż dwoma miejscami — tak, jak ją zaokrągli NUMERIC(14,2)', async () => {
    // Postgres zapisał „2.135” jako 2,14 (połówki od zera); PostgREST oddaje
    // liczbę, czasem napis — oba muszą dać ten sam odcisk.
    const proposal = buildExpenseReviewProposal({
      tenantId: TENANT,
      expenseId: 'exp-1',
      facts: facts({ grossAmount: 2.135 }),
      history: { count: 12, medianGross: 2 },
      applied: { kpirColumn: 'col_13', categoryLabel: 'paliwo' },
      now: NOW,
    });

    db.row = expenseRow({ gross_amount: 2.14 });
    expect((await freshAtClick(proposal)).fingerprint).toBe(proposal.fingerprint);

    db.row = expenseRow({ gross_amount: '2.14' });
    expect((await freshAtClick(proposal)).fingerprint).toBe(proposal.fingerprint);
  });

  it('kontrola: zmiana w bazie daje inny odcisk', async () => {
    // Bez tego testy wyżej mogłyby przechodzić przez atrapę, która nic nie czyta.
    db.row = expenseRow({ is_deductible: false });
    const proposal = buildExpenseReviewProposal({
      tenantId: TENANT,
      expenseId: 'exp-1',
      facts: facts(),
      history: { count: 12, medianGross: 300 },
      applied: { kpirColumn: 'col_13', categoryLabel: 'paliwo' },
      now: NOW,
    });

    expect((await freshAtClick(proposal)).fingerprint).not.toBe(proposal.fingerprint);
  });
});
