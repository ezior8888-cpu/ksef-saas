import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * K-02 — wykonawca ponagleń: okno bezpieczeństwa i zapis przypomnienia.
 *
 * To jest funkcja o największym promieniu w agencie: wiadomość do OBCEJ firmy,
 * bez cofnięcia.
 *
 * Od wydania 25.09 okno bezpieczeństwa (plan FLO 2, 1.1b) liczy
 * `assertReminderSendable` z `lib/reminders/delivery-safety.ts` — ten sam
 * odczyt robi też worker tuż przed wysyłką. Scenariusze, które ten plik
 * sprawdzał na starym wykonawcy, mają teraz swoje odpowiedniki przy workerze
 * w `reminder-dispatch.test.ts`:
 *
 * | stary scenariusz                                   | test w reminder-dispatch                                         |
 * |----------------------------------------------------|------------------------------------------------------------------|
 * | wpłata kontrahenta na INNĄ fakturę wczoraj         | blocks a recent payment assigned to another invoice ...          |
 * | wyciąg zaimportowany dziś ze starym przelewem      | blocks a newly recorded payment with an older payment date       |
 * | wpłata INNEGO kontrahenta / z INNEGO konta         | does not treat a different buyer or tenant as the same contractor|
 * | wpłata sprzed tygodnia nie blokuje                 | does not block on a same-contractor payment older than ...       |
 * | faktura bez NIP-u                                  | rejects a target invoice without a verifiable buyer NIP (SUROWIEJ)|
 * | faktura z innego konta                             | flo-tenant-boundaries: chase rejects a foreign target ...        |
 *
 * Faktura bez NIP-u: dawniej liczyły się wpłaty do niej samej, dziś
 * ponaglenie jest wstrzymane, bo nie da się wiarygodnie sprawdzić wpłat
 * kontrahenta. Świadomie surowiej — zapisane w dzienniku wydania.
 *
 * Tu zostaje to, czego tamten plik nie sprawdza: KOLEJNOŚĆ w samym
 * wykonawcy FLO. Okno ma zadziałać, zanim powstanie wiersz przypomnienia
 * i zanim cokolwiek trafi do kolejki.
 */

const store = vi.hoisted(() => ({
  reminders: [] as Array<Record<string, unknown>>,
  order: [] as string[],
}));

const sendJobEvent = vi.hoisted(() =>
  vi.fn<(event: unknown) => Promise<{ ok: boolean }>>(async () => ({ ok: true })),
);
const safety = vi.hoisted(() => ({
  assertReminderSendable: vi.fn<(delivery: unknown) => Promise<void>>(async () => undefined),
}));
const consent = vi.hoisted(() => ({
  approvedReminderDelivery: vi.fn(),
  hasReminderDispatch: vi.fn(async () => false),
  authorizeReminderDispatch: vi.fn(async () => undefined),
}));

vi.mock('@/lib/jobs/enqueue', () => ({ sendJobEvent }));
vi.mock('@/lib/reminders/delivery-safety', () => safety);
vi.mock('@/lib/reminders/delivery-consent', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/reminders/delivery-consent')>();
  consent.approvedReminderDelivery.mockImplementation(original.approvedReminderDelivery);
  return { ...original, ...consent };
});
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => ({
        select: () => ({
          maybeSingle: async () => {
            store.order.push('insert');
            store.reminders.push(row);
            return { data: { id: row.id }, error: null };
          },
        }),
      }),
    }),
  }),
}));

import type { FloProposalRow } from '@/lib/flo/db-types';
import '@/lib/flo/functions/payment-chase-handler';
import { getFloHandler } from '@/lib/flo/handlers';

const NOW = new Date('2026-09-17T12:00:00.000Z');
const TENANT = 'ten-1';
const DELIVERY = { tenantId: TENANT, invoiceId: 'inv-1', stage: 'stage_1' };

function proposal(payload: Record<string, unknown> = {}): FloProposalRow {
  return {
    id: 'prop-1',
    tenant_id: TENANT,
    kind: 'payment.chase',
    topic_key: 'payment.chase:inv-1:stage_1',
    status: 'executing',
    priority: 10,
    title: 'Nowak nie zapłacił',
    body: '4 300,00 zł po terminie',
    payload: { invoiceId: 'inv-1', stage: 'stage_1', ...payload },
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
  store.reminders.length = 0;
  store.order.length = 0;
  sendJobEvent.mockClear();
  sendJobEvent.mockImplementation(async () => {
    store.order.push('send');
    return { ok: true };
  });
  safety.assertReminderSendable.mockReset().mockImplementation(async () => {
    store.order.push('safety');
  });
  consent.hasReminderDispatch.mockReset().mockResolvedValue(false);
  consent.authorizeReminderDispatch.mockReset().mockImplementation(async () => {
    store.order.push('authorize');
  });
});

afterEach(() => {
  vi.useRealTimers();
});

// ═══════════════════════════════════════════════════════════════
// Wykonawca — kolejność
// ═══════════════════════════════════════════════════════════════

describe('K-02 — okno bezpieczeństwa w wykonawcy', () => {
  it('AWARIA: ostatni odczyt widzi świeżą wpłatę kontrahenta — ani wiersza, ani kolejki', async () => {
    consent.approvedReminderDelivery.mockReturnValueOnce(DELIVERY);
    safety.assertReminderSendable.mockRejectedValueOnce(
      new Error('Kontrahent wpłacił coś w ciągu ostatnich dwóch dni'),
    );

    await expect(chase()).rejects.toThrow(/wpłacił/);
    expect(safety.assertReminderSendable).toHaveBeenCalledWith(DELIVERY);
    expect(store.reminders).toHaveLength(0);
    expect(sendJobEvent).not.toHaveBeenCalled();
  });

  it('ponaglenie idzie z żetonem zgody — okno PRZED zapisem i kolejką', async () => {
    consent.approvedReminderDelivery.mockReturnValueOnce(DELIVERY);

    const result = await chase();

    expect(store.order).toEqual(['safety', 'insert', 'authorize', 'send']);
    // Żeton zgody jest też kluczem przypomnienia: jedna zgoda, jeden wiersz.
    expect(store.reminders).toEqual([
      expect.objectContaining({ id: 'appr-1', tenant_id: TENANT, invoice_id: 'inv-1', stage: 'stage_1' }),
    ]);
    expect(sendJobEvent).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(sendJobEvent.mock.calls[0]![0])).toContain('appr-1');
    expect(result.details).toMatchObject({ invoiceId: 'inv-1', reminderId: 'appr-1' });
  });

  it('etap już zlecony — odmowa bez drugiego wiersza i bez wysyłki', async () => {
    consent.approvedReminderDelivery.mockReturnValueOnce(DELIVERY);
    consent.hasReminderDispatch.mockResolvedValueOnce(true);

    await expect(chase()).rejects.toThrow(/już zlecony/);
    expect(store.reminders).toHaveLength(0);
    expect(sendJobEvent).not.toHaveBeenCalled();
  });

  it('nieznany etap ponaglenia — odmowa, zanim cokolwiek zostanie zapisane', async () => {
    // Prawdziwy `approvedReminderDelivery`: ładunek bez zamrożonej wiadomości
    // albo z nieznanym etapem nie przechodzi schematu.
    await expect(chase(proposal({ stage: 'stage_9' }))).rejects.toThrow();
    expect(safety.assertReminderSendable).not.toHaveBeenCalled();
    expect(store.reminders).toHaveLength(0);
    expect(sendJobEvent).not.toHaveBeenCalled();
  });
});
