import { describe, expect, it } from 'vitest';

import {
  daysAfterExpected,
  groupByContractor,
  itemNamesFromFa3,
  produceMissingInvoice,
  runMissingInvoiceSweep,
  type InvoiceMissingSources,
  type IssuedInvoice,
} from '@/lib/flo/functions/invoice-missing-producer';
import { recordSubjectDismissal } from '@/lib/flo/decisions';
import { ruleRun, runFloTick } from '@/lib/flo/tick';

import { createFakeDb } from './flo-fake-db';

/**
 * P-03 w pulsie — „zwykle fakturujesz ich około 10., w tym miesiącu nie widzę
 * faktury" (plan FLO 2, K1.10).
 *
 * Najostrożniejsza funkcja z całej trójki: pyta o CUDZĄ DECYZJĘ BIZNESOWĄ.
 * Dlatego większość testów dotyczy milczenia — za wcześnie, inne usługi,
 * klient stracony, pytanie już padło, klient fakturuje gdzie indziej.
 */

const NOW = new Date('2026-09-25T05:30:00.000Z');
const TENANT = 'ten-1';
const KEY = '1234567890';
const TOPIC = `invoice.draft:missing:${KEY}`;

function alphaFlag(tenantId = TENANT) {
  return {
    tenant_id: tenantId,
    kind: 'invoice.draft',
    enabled: true,
    reason: 'alfa P-03',
  };
}

/** Comiesięczna opieka nad serwerem: czerwiec, lipiec, sierpień. */
function monthly(overrides: Partial<IssuedInvoice>[] = []): IssuedInvoice[] {
  const base = ['2026-06-10', '2026-07-10', '2026-08-10'].map((issueDate, i) => ({
    id: `inv-${i}`,
    issueDate,
    grossTotal: 2460,
    itemNames: ['Opieka nad serwerem'],
    contractorKey: KEY,
    contractorName: 'Kowalski sp. z o.o.',
  }));
  return base.map((invoice, i) => ({ ...invoice, ...(overrides[i] ?? {}) }));
}

function sources(invoices: IssuedInvoice[] = monthly()) {
  const calls = { invoices: 0 };
  const value: InvoiceMissingSources = {
    readIssuedInvoices: async () => {
      calls.invoices++;
      return invoices;
    },
    readGlobalKill: async () => false,
  };
  return { value, calls };
}

// ═══════════════════════════════════════════════════════════════
// Funkcje czyste
// ═══════════════════════════════════════════════════════════════

describe('P-03 — odczyt danych', () => {
  it('nazwy pozycji z fa3_data; śmieci nie przechodzą', () => {
    expect(
      itemNamesFromFa3({ lines: [{ name: 'Opieka nad serwerem' }, { name: '' }, 7] }),
    ).toEqual(['Opieka nad serwerem']);
    expect(itemNamesFromFa3(null)).toEqual([]);
    expect(itemNamesFromFa3({ lines: 'bzdura' })).toEqual([]);
  });

  it('dni liczone od SPODZIEWANEJ faktury, nie od dnia miesiąca', () => {
    // Przy rytmie dwutygodniowym „typowy dzień miesiąca" nie znaczy nic.
    expect(daysAfterExpected('2026-08-10', 30, NOW)).toBe(16);
    expect(daysAfterExpected('2026-09-20', 30, NOW)).toBeLessThan(0);
    expect(daysAfterExpected('bzdura', 30, NOW)).toBe(0);
  });

  it('faktury grupowane po kontrahencie', () => {
    const grouped = groupByContractor([
      ...monthly(),
      { ...monthly()[0]!, contractorKey: 'inny', id: 'x' },
    ]);
    expect([...grouped.keys()]).toEqual([KEY, 'inny']);
    expect(grouped.get(KEY)).toHaveLength(3);
  });
});

// ═══════════════════════════════════════════════════════════════
// Kiedy agent milczy
// ═══════════════════════════════════════════════════════════════

describe('P-03 — kiedy agent milczy', () => {
  it('za wcześnie po spodziewanym terminie', async () => {
    const db = createFakeDb({ flo_kind_flags: [alphaFlag()] });

    const outcome = await produceMissingInvoice(
      TENANT,
      new Date('2026-09-13T05:30:00.000Z'),
      db.client,
      sources().value,
    );

    expect(outcome).toBe('nothing');
    expect(db.tables.flo_proposals).toHaveLength(0);
  });

  it('różne usługi u tej samej firmy to nie rytm', async () => {
    // „Projekt logo" i „opieka nad serwerem" nie mogą zlać się w jeden rytm
    // tylko dlatego, że wystawione tej samej firmie w podobnych odstępach.
    const db = createFakeDb({ flo_kind_flags: [alphaFlag()] });

    const outcome = await produceMissingInvoice(
      TENANT,
      NOW,
      db.client,
      sources(
        monthly([
          { itemNames: ['Projekt logo'] },
          { itemNames: ['Opieka nad serwerem'] },
          { itemNames: ['Audyt bezpieczeństwa'] },
        ]),
      ).value,
    );

    expect(outcome).toBe('nothing');
  });

  it('AWARIA: po dwóch pominiętych cyklach milkniemy — bez ogłaszania tego', async () => {
    // Agent, który co miesiąc przypomina o straconym kliencie, jest okrutny
    // bez powodu. Uśpienie jest ciche.
    const db = createFakeDb({ flo_kind_flags: [alphaFlag()] });

    const outcome = await produceMissingInvoice(
      TENANT,
      new Date('2026-12-01T05:30:00.000Z'),
      db.client,
      sources().value,
    );

    expect(outcome).toBe('nothing');
    expect(db.tables.flo_proposals).toHaveLength(0);
  });

  it('pytanie o koniec współpracy pada RAZ w życiu profilu', async () => {
    // Dowodem, że już padło, jest karta o tym kluczu — także zamknięta.
    const db = createFakeDb({
      flo_kind_flags: [alphaFlag()],
      flo_proposals: [
        {
          id: 'stara',
          tenant_id: TENANT,
          kind: 'invoice.draft',
          topic_key: TOPIC,
          status: 'dismissed',
          dismissed_reason: 'not_now',
          expires_at: '2026-09-01T00:00:00.000Z',
        },
      ],
    });

    const outcome = await produceMissingInvoice(TENANT, NOW, db.client, sources().value);

    expect(outcome).toBe('nothing');
    expect(db.tables.flo_proposals).toHaveLength(1);
  });

  it('dwa razy „wystawiona poza FaktFlow" zamyka temat', async () => {
    const db = createFakeDb({ flo_kind_flags: [alphaFlag()] });
    await recordSubjectDismissal(TENANT, TOPIC, NOW, db.client);
    await recordSubjectDismissal(TENANT, TOPIC, NOW, db.client);

    const outcome = await produceMissingInvoice(TENANT, NOW, db.client, sources().value);

    expect(outcome).toBe('nothing');
    expect(db.tables.flo_proposals).toHaveLength(0);
  });

  it('„wystawiam ich gdzie indziej" obowiązuje DŁUŻEJ niż wyciszenie sprawy', async () => {
    // Cisza sprawy wygasa po kwartale. Odpowiedź „fakturuję ich w innym
    // programie" nie przestaje być prawdą wraz z nią — pilnuje tego licznik
    // odrzuceń, czytany wprost przez regułę P-03.
    const db = createFakeDb({
      flo_kind_flags: [alphaFlag()],
      flo_decisions: [
        {
          tenant_id: TENANT,
          kind: TOPIC,
          accepted: 0,
          dismissed: 2,
          // Wyciszenie już wygasło.
          muted_until: '2026-06-01T00:00:00.000Z',
          last_at: '2026-06-01T00:00:00.000Z',
        },
      ],
    });

    const outcome = await produceMissingInvoice(TENANT, NOW, db.client, sources().value);

    expect(outcome).toBe('nothing');
    expect(db.tables.flo_proposals).toHaveLength(0);
  });

  it('konto poza kanarkiem: liczymy do trybu cichego, klient nie dostaje karty', async () => {
    // Do 24.09 ten test brzmiał „konto poza kanarkiem: nic nie czytamy"
    // i pilnował BŁĘDU: bramka przed odczytem wycinała też kanarka, więc tryb
    // cichy nie zapisał dla tej reguły ani jednego wpisu. Konto poza
    // kanarkiem ma liczyć — klient nie dostaje karty, operator dostaje wpis.
    const db = createFakeDb();
    const src = sources();

    const outcome = await produceMissingInvoice(TENANT, NOW, db.client, src.value);

    expect(outcome).not.toBe('created');
    expect(src.calls.invoices).toBeGreaterThan(0);
    expect(db.tables.flo_proposals).toHaveLength(0);
  });

  it('konto wypisane przez operatora: faktur nawet nie czytamy', async () => {
    const db = createFakeDb({ flo_kind_flags: [{ tenant_id: TENANT, kind: 'invoice.draft', enabled: false, reason: 'klient poprosił' }] });
    const src = sources();

    const outcome = await produceMissingInvoice(TENANT, NOW, db.client, src.value);

    expect(outcome).toBe('disabled');
    expect(src.calls.invoices).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Kiedy pyta
// ═══════════════════════════════════════════════════════════════

describe('P-03 — pytanie', () => {
  it('rytm bez faktury w tym cyklu: pytamy, nie oskarżając', async () => {
    const db = createFakeDb({ flo_kind_flags: [alphaFlag()] });

    const outcome = await produceMissingInvoice(TENANT, NOW, db.client, sources().value);

    expect(outcome).toBe('created');
    const row = db.tables.flo_proposals[0]!;
    expect(row.topic_key).toBe(TOPIC);
    expect(row.title).toContain('Kowalski sp. z o.o.');
    expect(String(row.body)).toContain('Wystawiłeś ją gdzie indziej?');
    expect(String(row.body)).not.toMatch(/zapomnia|przeoczy|zaniedba/i);
  });

  it('karta daje trzy wyjścia, a „koniec współpracy" dotyczy TEGO klienta', async () => {
    const db = createFakeDb({ flo_kind_flags: [alphaFlag()] });

    await produceMissingInvoice(TENANT, NOW, db.client, sources().value);

    const payload = db.tables.flo_proposals[0]!.payload as Record<string, unknown>;
    expect(payload.primaryLabel).toBe('Wystaw fakturę');
    expect(payload.noPush).toBe(true);
    expect(payload.secondary).toEqual([
      { label: 'Wystawiona poza FaktFlow', intent: 'dismiss' },
      // Bez `scope` jedna zakończona współpraca zamykałaby funkcję dla
      // wszystkich klientów.
      { label: 'Skończyliśmy współpracę', intent: 'mute', scope: 'subject' },
    ]);
  });

  it('klucz tematu niesie rodzaj — inaczej cisza sprawy nie działa', async () => {
    const db = createFakeDb({ flo_kind_flags: [alphaFlag()] });

    await produceMissingInvoice(TENANT, NOW, db.client, sources().value);

    expect(db.tables.flo_proposals[0]!.topic_key).toMatch(/^invoice\.draft:/);
  });
});

// ═══════════════════════════════════════════════════════════════
// Wszystkie konta i puls
// ═══════════════════════════════════════════════════════════════

describe('P-03 — wszystkie konta', () => {
  it('awaria jednego konta nie zabiera pytań pozostałym', async () => {
    const db = createFakeDb({ flo_kind_flags: [alphaFlag('ten-bad'), alphaFlag()] });
    const errors: string[] = [];

    const result = await runMissingInvoiceSweep(
      ['ten-bad', TENANT],
      NOW,
      db.client,
      {
        readIssuedInvoices: async (tenantId) => {
          if (tenantId === 'ten-bad') throw new Error('timeout zapytania');
          return monthly();
        },
        readGlobalKill: async () => false,
      },
      { error: (message: string) => errors.push(message) },
    );

    expect(result).toEqual({ asked: 1, closed: 0, failed: 1 });
    expect(errors[0]).toContain('ten-bad');
  });

  it('puls pyta o brakującą fakturę i zwraca liczbę', async () => {
    const db = createFakeDb({ flo_kind_flags: [alphaFlag()] });

    const result = await runFloTick(undefined, NOW, db.client, {
      listTenantIds: async () => [TENANT],
      readGlobalKill: async () => false,
      paymentConfirm: {
        readOverdueInvoices: async () => [],
        readInvoiceState: async () => ({ facts: {}, context: {} }),
        readGlobalKill: async () => false,
      },
      expenseMissing: { readRecentExpenses: async () => [], readGlobalKill: async () => false },
      invoiceMissing: sources().value,
      onboarding: { readAccount: async () => null },
    });

    expect(ruleRun(result, 'invoice.draft')).toEqual({
      kind: 'invoice.draft',
      asked: 1,
      closed: 0,
      failed: 0,
    });
    expect(result.failedTenants).toBe(0);
  });
});
