import { describe, expect, it } from 'vitest';

import { runFloTick, type FloTickSources } from '@/lib/flo/tick';

import { createFakeDb } from './flo-fake-db';

/**
 * AUD-111: strażnik zawieszonych kart przestawiał je na „zatwierdzona” bez
 * warunku na „wykonuję” — karta zakończona w międzyczasie wracała do
 * zatwierdzenia i mogła zostać wykonana drugi raz.
 */

const NOW = new Date('2026-08-26T12:00:00.000Z');
const NO_TENANTS: FloTickSources = {
  listTenantIds: async () => [],
  paymentConfirm: { readOverdueInvoices: async () => [], readInvoiceState: async () => ({ facts: {}, context: {} }) },
  expenseMissing: { readRecentExpenses: async () => [] },
  invoiceMissing: { readIssuedInvoices: async () => [] },
  onboarding: { readAccount: async () => null },
} as unknown as FloTickSources;

describe('strażnik zawieszonych kart FLO', () => {
  it('karta zakończona w trakcie przebiegu strażnika zostaje „done”', async () => {
    let finished = false;
    const db = createFakeDb(
      { flo_proposals: [{ id: 'p1', tenant_id: 't1', kind: 'wrapped.ready', status: 'executing', approved_at: '2026-08-26T10:00:00.000Z' }] },
      () => {
        if (!finished) { finished = true; db.tables.flo_proposals[0]!.status = 'done'; }
      },
    );
    await runFloTick(undefined, NOW, db.client, NO_TENANTS);
    expect(db.tables.flo_proposals[0]!.status).toBe('done');
  });
});
