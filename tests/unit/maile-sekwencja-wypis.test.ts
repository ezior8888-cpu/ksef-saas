import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobContext } from '@/lib/jobs/registry';

const s = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('@/lib/email/send', () => ({ sendEmail: s.send }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    const q: Record<string, unknown> = {};
    Object.assign(q, {
      select: () => q,
      eq: () => q,
      limit: () => q,
      maybeSingle: async () => ({ data: null, error: null }),
      then: (ok: (v: unknown) => unknown) => Promise.resolve({ count: 0, error: null }).then(ok),
    });
    return { from: () => q };
  },
}));

import { runEmailDay1, runEmailDay4, runEmailDay8, runEmailWelcome } from '@/lib/jobs/runners/email-sequence';

/**
 * AUD-77 (P3): maile z sekwencji próbnej (dzień 1, 4, 8) szły jako
 * transakcyjne — bez sprawdzenia wypisu i bez nagłówka List-Unsubscribe.
 * To treści o produkcie, nie potwierdzenia operacji: kategoria
 * `product_updates` i identyfikator użytkownika (wypis, preferencje).
 */

const USER = '11111111-1111-4111-8111-111111111111';
const data = { userId: USER, email: 'nowy@example.test', firstName: 'Jan' };
const ctx: JobContext = {
  attempt: 0,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  step: { run: async (_n, fn) => fn(), sleep: vi.fn(), sendEvent: vi.fn(), scheduleAfter: vi.fn() },
};

beforeEach(() => {
  s.send.mockReset().mockResolvedValue({ sent: true });
});

describe('sekwencja próbna — wypis działa', () => {
  it.each([
    ['dzień 1', () => runEmailDay1(data, ctx)],
    ['dzień 4', () => runEmailDay4(data, ctx)],
    ['dzień 8', () => runEmailDay8(data, ctx)],
  ])('%s: product_updates z userId', async (_opis, run) => {
    await run();

    expect(s.send).toHaveBeenCalledTimes(1);
    expect(s.send.mock.calls[0]![0]).toMatchObject({ category: 'product_updates', userId: USER });
  });

  it('powitanie po rejestracji zostaje transakcyjne (potwierdzenie założenia konta)', async () => {
    await runEmailWelcome(data, ctx);

    expect(s.send.mock.calls[0]![0].category ?? 'transactional').toBe('transactional');
  });
});
