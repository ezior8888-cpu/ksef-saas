import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobContext } from '@/lib/jobs/registry';

/**
 * Maile z dnia 12 i 14 sekwencji powitalnej mówiły „2 dni do końca trialu”
 * i „trial zakończony, konto read-only, po 30 dniach dane usuwane
 * permanentnie (RODO)”. Regulamin (§3 ust. 3) daje 30 dni trialu, faktur nie
 * wolno usunąć przez 10 lat, a aplikacja nie ma trybu tylko do odczytu.
 * Dzień 14 szedł też do płacących — `subscription_tier` nikt nie aktualizuje.
 * Wstrzymane 01.10.2026.
 */

const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@/lib/email/send', () => ({ sendEmail: mocks.send }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    const q: Record<string, unknown> = {};
    Object.assign(q, {
      from: () => q,
      select: () => q,
      eq: () => q,
      limit: () => q,
      maybeSingle: async () => ({ data: null, error: null }),
      then: (ok: (v: unknown) => unknown) => Promise.resolve({ count: 3, error: null }).then(ok),
    });
    return q;
  },
}));

import { runEmailDay12, runEmailDay14, runEmailDay8 } from '@/lib/inngest/jobs/email-sequence';

const scheduleAfter = vi.fn();
const ctx: JobContext = {
  attempt: 0,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  step: { run: async (_n, fn) => fn(), sleep: vi.fn(), sendEvent: vi.fn(), scheduleAfter },
};
const DANE = { email: 'nowy@firma.test', firstName: 'Jan', userId: '33333333-3333-4333-8333-333333333333' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sekwencja powitalna: maile 12 i 14 wstrzymane', () => {
  it('dzień 8 wysyła statystyki i NIE planuje dnia 12', async () => {
    await runEmailDay8(DANE, ctx);
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(scheduleAfter).not.toHaveBeenCalled();
  });

  it.each([
    ['12', runEmailDay12],
    ['14', runEmailDay14],
  ])('zaplanowane wcześniej zdarzenie dnia %s jest odbierane bez maila', async (_d, run) => {
    expect(await run(DANE)).toEqual({ skipped: 'wstrzymany' });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('kolejki dnia 12 i 14 dalej mają handler — wcześniej zaplanowane zdarzenia nie wiszą', () => {
    const handlers = readFileSync(join(process.cwd(), 'lib/jobs/handlers/package-b.ts'), 'utf8');
    expect(handlers).toContain("eventJob('email.trial-day-12', runEmailDay12");
    expect(handlers).toContain("eventJob('email.trial-day-14', runEmailDay14");
  });

  it('w kodzie nie zostały obietnice sprzeczne z regulaminem i retencją', () => {
    const source = readFileSync(join(process.cwd(), 'lib/inngest/jobs/email-sequence.ts'), 'utf8');
    for (const tekst of ['2 dni do końca trialu</h1>', 'read-only. Możesz', 'usuwane permanentnie']) {
      expect(source).not.toContain(tekst);
    }
  });
});
