import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Wpięcie W-03 w wykonawcę W-01 (plan FLO 2, K1.8).
 *
 * Sprawdzamy dwie rzeczy i tylko te dwie — logika samego pytania o regułę ma
 * własny plik (`flo-expense-rule-producer.test.ts`):
 *
 * 1. potwierdzenie kosztu w ogóle pyta o regułę, dla TEGO kosztu i konta;
 * 2. awaria tego pytania nie psuje potwierdzenia — bo koszt jest już
 *    oznaczony, a człowiek zobaczyłby „nie udało mi się tego dokończyć"
 *    i tę samą kartę do kliknięcia po raz drugi.
 */

const db = vi.hoisted(() => ({
  expense: {
    id: 'exp-2',
    tenant_id: 'ten-1',
    source: 'ocr_photo',
    ksef_invoice_id: null,
    is_reviewed: false,
  } as {
    id: string;
    tenant_id: string;
    source: string;
    ksef_invoice_id: string | null;
    is_reviewed: boolean;
  } | null,
  reads: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
  attempts: [] as Array<Record<string, unknown>>,
  readError: false,
  raceToKsef: false as false | 'source' | 'link',
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: (columns: string) => {
        const where: Record<string, unknown> = {};
        const builder = {
          eq: (column: string, value: unknown) => {
            where[column] = value;
            return builder;
          },
          maybeSingle: async () => {
            db.reads.push({ columns, ...where });
            if (db.readError) return { data: null, error: { message: 'read failed' } };
            const row = db.expense;
            if (!row || where.id !== row.id || where.tenant_id !== row.tenant_id) {
              return { data: null, error: null };
            }
            return {
              data: { source: row.source, ksef_invoice_id: row.ksef_invoice_id },
              error: null,
            };
          },
        };
        return builder;
      },
      update: (patch: Record<string, unknown>) => {
        const equal: Record<string, unknown> = {};
        const unequal: Record<string, unknown> = {};
        const is: Record<string, unknown> = {};
        const builder = {
          eq: (column: string, value: unknown) => {
            equal[column] = value;
            return builder;
          },
          neq: (column: string, value: unknown) => {
            unequal[column] = value;
            return builder;
          },
          is: (column: string, value: unknown) => {
            is[column] = value;
            return builder;
          },
          select: () => builder,
          maybeSingle: async () => {
            db.attempts.push({ ...patch, id: equal.id, tenant_id: equal.tenant_id,
              source_not: unequal.source, ksef_invoice_id_is: is.ksef_invoice_id });
            const row = db.expense;
            if (row && db.raceToKsef === 'source') row.source = 'ksef_inbox';
            if (row && db.raceToKsef === 'link') row.ksef_invoice_id = 'inv-1';
            if (!row || equal.id !== row.id || equal.tenant_id !== row.tenant_id ||
                row.source === unequal.source || row.ksef_invoice_id !== is.ksef_invoice_id) {
              return { data: null, error: null };
            }
            row.is_reviewed = true;
            db.updates.push({ ...patch, id: equal.id, tenant_id: equal.tenant_id });
            return { data: { id: row.id }, error: null };
          },
        };
        return builder;
      },
    }),
  }),
}));

const proposeRuleAfterReview = vi.hoisted(() => vi.fn());

vi.mock('@/lib/flo/functions/expense-rules', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/flo/functions/expense-rules')>()),
  proposeRuleAfterReview,
  productionRuleLearningSources: () => ({ marker: 'produkcyjne' }),
}));

import type { FloProposalRow } from '@/lib/flo/db-types';
import '@/lib/flo/functions/expense-review';
import { getFloHandler } from '@/lib/flo/handlers';

const TENANT = 'ten-1';

function proposal(): FloProposalRow {
  return {
    id: 'prop-1',
    tenant_id: TENANT,
    kind: 'expense.review',
    topic_key: 'expense.review:exp-2',
    status: 'executing',
    priority: 60,
    title: 'Adobe, 120,00 zł',
    body: 'Zaksięgowałem jako oprogramowanie.',
    payload: { expenseId: 'exp-2' },
    evidence: [],
    fingerprint: 'x',
    expires_at: '2026-10-23T00:00:00.000Z',
    created_at: '2026-09-23T09:00:00.000Z',
    approved_at: null,
    approved_by: null,
    executed_at: null,
    dismissed_reason: null,
  };
}

async function confirmExpense() {
  const handler = getFloHandler('expense.review');
  if (!handler) throw new Error('wykonawca W-01 niezarejestrowany');
  return handler({
    proposal: proposal(),
    userId: 'user-1',
    approvalId: 'appr-1',
    snapshot: {},
  });
}

beforeEach(() => {
  db.expense = {
    id: 'exp-2', tenant_id: TENANT, source: 'ocr_photo',
    ksef_invoice_id: null, is_reviewed: false,
  };
  db.reads.length = 0;
  db.updates.length = 0;
  db.attempts.length = 0;
  db.readError = false;
  db.raceToKsef = false;
  proposeRuleAfterReview.mockReset();
});

describe('W-01 → W-03', () => {
  it('potwierdzenie kosztu pyta o regułę dla tego kosztu i konta', async () => {
    proposeRuleAfterReview.mockResolvedValue('created');

    const result = await confirmExpense();

    expect(db.reads).toEqual([{ columns: 'source, ksef_invoice_id', id: 'exp-2', tenant_id: TENANT }]);
    expect(db.attempts).toEqual([{
      is_reviewed: true, id: 'exp-2', tenant_id: TENANT,
      source_not: 'ksef_inbox', ksef_invoice_id_is: null,
    }]);
    expect(db.updates).toEqual([{ is_reviewed: true, id: 'exp-2', tenant_id: TENANT }]);
    expect(proposeRuleAfterReview).toHaveBeenCalledTimes(1);
    const [tenantId, expenseId] = proposeRuleAfterReview.mock.calls[0]!;
    expect(tenantId).toBe(TENANT);
    expect(expenseId).toBe('exp-2');
    expect(result.details).toMatchObject({ expenseId: 'exp-2', rule: 'created' });
  });

  it('AWARIA: awaria pytania o regułę nie psuje potwierdzenia kosztu', async () => {
    proposeRuleAfterReview.mockRejectedValue(new Error('baza nie odpowiada'));

    const result = await confirmExpense();

    expect(result.summary).toBe('koszt potwierdzony przez klienta');
    expect(result.details).toMatchObject({ rule: 'failed' });
    // Najważniejsze: koszt ZOSTAŁ oznaczony jako przejrzany.
    expect(db.updates).toEqual([{ is_reviewed: true, id: 'exp-2', tenant_id: TENANT }]);
  });

  it.each([
    ['źródło KSeF', 'ksef_inbox', null],
    ['powiązana faktura KSeF', 'ocr_photo', 'inv-1'],
  ])('nie potwierdza kosztu KSeF przez FLO: %s', async (_case, source, link) => {
    db.expense = {
      id: 'exp-2', tenant_id: TENANT, source,
      ksef_invoice_id: link, is_reviewed: false,
    };

    await expect(confirmExpense()).rejects.toThrow('Koszt powiązany z KSeF wymaga przeglądu');
    expect(db.attempts).toEqual([]);
    expect(db.updates).toEqual([]);
    expect(proposeRuleAfterReview).not.toHaveBeenCalled();
  });

  it.each([
    ['źródło', 'source'],
    ['powiązanie', 'link'],
  ] as const)('odmawia zapisu gdy po odczycie zmienia się %s na KSeF', async (_case, race) => {
    db.raceToKsef = race;

    await expect(confirmExpense()).rejects.toThrow('Wydatek zmienił się lub wymaga przeglądu');
    expect(db.attempts).toHaveLength(1);
    expect(db.updates).toEqual([]);
    expect(proposeRuleAfterReview).not.toHaveBeenCalled();
  });

  it('odmawia potwierdzenia, gdy nie może odczytać źródła kosztu', async () => {
    db.readError = true;

    await expect(confirmExpense()).rejects.toThrow('Nie można sprawdzić źródła wydatku');
    expect(db.attempts).toEqual([]);
  });
});
