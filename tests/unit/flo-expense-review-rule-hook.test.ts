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

const updates = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      // Wykonawca oznacza koszt warunkiem `id` ORAZ `tenant_id` i żąda
      // zwrotu wiersza — brak wiersza znaczy „nie Twój koszt".
      update: (patch: Record<string, unknown>) => {
        const where: Record<string, unknown> = {};
        const builder = {
          eq: (column: string, value: unknown) => {
            where[column] = value;
            return builder;
          },
          select: () => builder,
          maybeSingle: async () => {
            updates.push({ ...patch, id: where.id, tenant_id: where.tenant_id });
            return { data: { id: where.id }, error: null };
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
  updates.length = 0;
  proposeRuleAfterReview.mockReset();
});

describe('W-01 → W-03', () => {
  it('potwierdzenie kosztu pyta o regułę dla tego kosztu i konta', async () => {
    proposeRuleAfterReview.mockResolvedValue('created');

    const result = await confirmExpense();

    expect(updates).toEqual([{ is_reviewed: true, id: 'exp-2', tenant_id: TENANT }]);
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
    expect(updates).toEqual([{ is_reviewed: true, id: 'exp-2', tenant_id: TENANT }]);
  });
});
