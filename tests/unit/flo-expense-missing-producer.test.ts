import { describe, expect, it } from 'vitest';

import {
  ASK_FROM_DAY,
  produceMissingDocs,
  runMissingDocsSweep,
  type ExpenseMissingSources,
} from '@/lib/flo/functions/expense-missing-producer';
import type { ExpenseRecord } from '@/lib/flo/functions/expense-missing';
import { ruleRun, runFloTick } from '@/lib/flo/tick';

import { createFakeDb } from './flo-fake-db';

/**
 * W-04 w pulsie — „co miesiąc masz tu koszt, a w tym miesiącu nie widzę
 * dokumentu" (plan FLO 2, K1.9).
 *
 * Najważniejsze testy dotyczą milczenia: przed dziesiątym dniem miesiąca,
 * gdy dokument już jest, i gdy dokument się znalazł po pokazaniu karty.
 */

/** 15 września 2026, 07:30 w Warszawie — puls po dziesiątym dniu miesiąca. */
const NOW = new Date('2026-09-15T05:30:00.000Z');
const TENANT = 'ten-1';
const TOPIC = 'expense.missing:2026-09';

function alphaFlag(tenantId = TENANT) {
  return {
    tenant_id: tenantId,
    kind: 'expense.missing',
    enabled: true,
    reason: 'alfa W-04',
  };
}

/** Hosting co miesiąc: czerwiec, lipiec, sierpień — i cisza we wrześniu. */
function hostingHistory(): ExpenseRecord[] {
  return [
    { id: 'e1', sellerName: 'OVH', grossAmount: 49, issueDate: '2026-06-05' },
    { id: 'e2', sellerName: 'OVH', grossAmount: 49, issueDate: '2026-07-05' },
    { id: 'e3', sellerName: 'OVH', grossAmount: 49, issueDate: '2026-08-05' },
  ];
}

function sources(expenses: ExpenseRecord[] = hostingHistory()) {
  const calls = { expenses: 0 };
  const value: ExpenseMissingSources = {
    readRecentExpenses: async () => {
      calls.expenses++;
      return expenses;
    },
    readGlobalKill: async () => false,
  };
  return { value, calls };
}

function liveCard(overrides: Record<string, unknown> = {}) {
  return {
    id: 'card-1',
    tenant_id: TENANT,
    kind: 'expense.missing',
    topic_key: TOPIC,
    status: 'open',
    expires_at: '2026-10-06T00:00:00.000Z',
    dismissed_reason: null,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// Kiedy milczymy
// ═══════════════════════════════════════════════════════════════

describe('W-04 — kiedy agent milczy', () => {
  it('przed dziesiątym dniem miesiąca: nie pytamy i nic nie czytamy', async () => {
    // Faktura za hosting potrafi przyjść piątego. Pytanie pierwszego byłoby
    // nagabywaniem o coś, co jest w drodze.
    const db = createFakeDb({ flo_kind_flags: [alphaFlag()] });
    const src = sources();

    const result = await produceMissingDocs(
      TENANT,
      new Date('2026-09-09T05:30:00.000Z'),
      db.client,
      src.value,
    );

    expect(result.outcome).toBe('too_early');
    expect(ASK_FROM_DAY).toBe(10);
    expect(src.calls.expenses).toBe(0);
    expect(db.tables.flo_proposals).toHaveLength(0);
  });

  it('dokument za ten miesiąc już jest: cisza', async () => {
    const db = createFakeDb({ flo_kind_flags: [alphaFlag()] });

    const result = await produceMissingDocs(
      TENANT,
      NOW,
      db.client,
      sources([
        ...hostingHistory(),
        { id: 'e4', sellerName: 'OVH', grossAmount: 49, issueDate: '2026-09-04' },
      ]).value,
    );

    expect(result.outcome).toBe('nothing');
    expect(db.tables.flo_proposals).toHaveLength(0);
  });

  it('konto poza kanarkiem: kosztów nawet nie czytamy', async () => {
    const db = createFakeDb();
    const src = sources();

    const result = await produceMissingDocs(TENANT, NOW, db.client, src.value);

    expect(result.outcome).toBe('disabled');
    expect(src.calls.expenses).toBe(0);
  });

  it('„nigdy więcej takich": cisza bez odczytu', async () => {
    const db = createFakeDb({
      flo_kind_flags: [alphaFlag()],
      flo_decisions: [
        {
          tenant_id: TENANT,
          kind: 'expense.missing',
          accepted: 0,
          dismissed: 2,
          muted_until: '2026-12-01T00:00:00.000Z',
        },
      ],
    });
    const src = sources();

    const result = await produceMissingDocs(TENANT, NOW, db.client, src.value);

    expect(result.outcome).toBe('disabled');
    expect(src.calls.expenses).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Kiedy pytamy
// ═══════════════════════════════════════════════════════════════

describe('W-04 — pytanie o zgubiony dokument', () => {
  it('trzy miesiące z rzędu, w tym miesiącu pusto: pytamy o DOKUMENT', async () => {
    const db = createFakeDb({ flo_kind_flags: [alphaFlag()] });

    const result = await produceMissingDocs(TENANT, NOW, db.client, sources().value);

    expect(result.outcome).toBe('created');
    const row = db.tables.flo_proposals[0]!;
    expect(row.topic_key).toBe(TOPIC);
    expect(row.title).toContain('OVH');
    // Zasada językowa: pytamy o dokument, nie proponujemy dopisania kwoty.
    expect(String(row.body)).toContain('zgubił się');
    expect(String(row.body)).not.toContain('dodać');

    const payload = row.payload as Record<string, unknown>;
    // Karta nie ma czego wykonać — prowadzi do wgrania dokumentu.
    expect(payload.primaryIntent).toBe('open');
    expect(payload.primaryLabel).toBe('Wgraj dokument');
  });

  it('drugi przebieg w tym samym miesiącu odświeża kartę, nie przesuwa ważności', async () => {
    const db = createFakeDb({ flo_kind_flags: [alphaFlag()] });
    const src = sources().value;

    await produceMissingDocs(TENANT, NOW, db.client, src);
    const first = { ...db.tables.flo_proposals[0]! };

    const result = await produceMissingDocs(
      TENANT,
      new Date('2026-09-16T05:30:00.000Z'),
      db.client,
      src,
    );

    expect(result.outcome).toBe('refreshed');
    expect(db.tables.flo_proposals).toHaveLength(1);
    expect(db.tables.flo_proposals[0]!.expires_at).toBe(first.expires_at);
  });

  it('AWARIA: dokument się znalazł — otwarte pytanie znika', async () => {
    // Klient wgrał fakturę po zobaczeniu karty. Pytanie o coś, co system już
    // widzi, traktuje go jak niekompetentnego.
    const db = createFakeDb({
      flo_kind_flags: [alphaFlag()],
      flo_proposals: [liveCard()],
    });

    const result = await produceMissingDocs(
      TENANT,
      NOW,
      db.client,
      sources([
        ...hostingHistory(),
        { id: 'e4', sellerName: 'OVH', grossAmount: 49, issueDate: '2026-09-12' },
      ]).value,
    );

    expect(result).toEqual({ outcome: 'closed', closed: 1 });
    expect(db.tables.flo_proposals[0]).toMatchObject({
      status: 'expired',
      dismissed_reason: 'stale',
    });
  });

  it('zatwierdzonej karty nie zamykamy — i nie próbujemy nawet zapisu', async () => {
    // Człowiek już się zgodził. Zapis z warunkiem `status = 'open'` i tak by
    // nic nie zmienił, ale nie chcemy polegać na jednej warstwie: liczba
    // zapisów ma zostać zerem.
    const db = createFakeDb({
      flo_kind_flags: [alphaFlag()],
      flo_proposals: [liveCard({ status: 'approved' })],
    });
    const writesBefore = db.writes;

    const result = await produceMissingDocs(
      TENANT,
      NOW,
      db.client,
      sources([
        ...hostingHistory(),
        { id: 'e4', sellerName: 'OVH', grossAmount: 49, issueDate: '2026-09-12' },
      ]).value,
    );

    expect(result).toEqual({ outcome: 'nothing', closed: 0 });
    expect(db.tables.flo_proposals[0]!.status).toBe('approved');
    expect(db.writes).toBe(writesBefore);
  });
});

// ═══════════════════════════════════════════════════════════════
// Wszystkie konta i puls
// ═══════════════════════════════════════════════════════════════

describe('W-04 — wszystkie konta', () => {
  it('awaria jednego konta nie zabiera pytań pozostałym', async () => {
    const db = createFakeDb({ flo_kind_flags: [alphaFlag('ten-bad'), alphaFlag()] });
    const errors: string[] = [];

    const result = await runMissingDocsSweep(
      ['ten-bad', TENANT],
      NOW,
      db.client,
      {
        readRecentExpenses: async (tenantId) => {
          if (tenantId === 'ten-bad') throw new Error('timeout zapytania');
          return hostingHistory();
        },
        readGlobalKill: async () => false,
      },
      { error: (message: string) => errors.push(message) },
    );

    expect(result).toEqual({ asked: 1, closed: 0, failed: 1 });
    expect(errors[0]).toContain('ten-bad');
    expect(db.tables.flo_proposals).toHaveLength(1);
  });

  it('przed dziesiątym przebieg nie wchodzi nawet w pętlę po kontach', async () => {
    const db = createFakeDb({ flo_kind_flags: [alphaFlag()] });
    const src = sources();

    const result = await runMissingDocsSweep(
      [TENANT],
      new Date('2026-09-02T05:30:00.000Z'),
      db.client,
      src.value,
    );

    expect(result).toEqual({ asked: 0, closed: 0, failed: 0 });
    expect(src.calls.expenses).toBe(0);
  });

  it('puls pyta o zgubione dokumenty i zwraca liczby', async () => {
    const db = createFakeDb({ flo_kind_flags: [alphaFlag()] });

    const result = await runFloTick(undefined, NOW, db.client, {
      listTenantIds: async () => [TENANT],
      readGlobalKill: async () => false,
      paymentConfirm: {
        readOverdueInvoices: async () => [],
        readInvoiceState: async () => ({ facts: {}, context: {} }),
        readGlobalKill: async () => false,
      },
      expenseMissing: sources().value,
      invoiceMissing: { readIssuedInvoices: async () => [] },
    onboarding: { readAccount: async () => null },
    });

    expect(ruleRun(result, 'expense.missing')).toEqual({
      kind: 'expense.missing',
      asked: 1,
      closed: 0,
      failed: 0,
    });
    expect(result.failedTenants).toBe(0);
  });
});
