import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * AUD-107 (decyzja B7): budżet AI na firmę dla OCR i klasyfikatora —
 * 3 zł miesięcznie (mechanizm `lib/flo/budget.ts`, tabela `flo_usage`),
 * dzienny limit liczby rozpoznań OCR (także w trialu) i alarm w Sentry
 * po przekroczeniu dwukrotności celu. Błąd odczytu zużycia = odmowa.
 */

const mocks = vi.hoisted(() => ({ spend: vi.fn(), record: vi.fn(), sentry: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ captureMessage: mocks.sentry }));
vi.mock('@/lib/cache/redis', () => ({ isRedisConfigured: () => false, getRedis: () => { throw new Error('brak'); } }));
vi.mock('@/lib/flo/budget', async (orig) => ({
  ...(await orig<typeof import('@/lib/flo/budget')>()),
  readSpend: mocks.spend,
  recordUsage: mocks.record,
}));

import { AI_DAILY_OCR_LIMIT, checkTenantAiBudget, recordTenantAiUsage } from '@/lib/ai/tenant-ai-budget';
import { USD_PLN } from '@/lib/flo/budget';

const usd = (pln: number) => pln / USD_PLN;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.spend.mockResolvedValue({ monthUsd: 0, todayUsd: 0 });
});

describe('budżet AI firmy', () => {
  it('poniżej limitu — zgoda', async () => {
    expect(await checkTenantAiBudget('t-ok', 'ocr')).toEqual({ allowed: true });
  });

  it('miesięczne 3 zł wykorzystane — odmowa z komunikatem', async () => {
    mocks.spend.mockResolvedValue({ monthUsd: usd(3.01), todayUsd: 0 });
    expect(await checkTenantAiBudget('t-month', 'ocr')).toEqual({ allowed: false, message: expect.stringContaining('miesięczny limit') });
  });

  it('dzienny koszt agenta FLO nie blokuje OCR — liczy się limit liczby rozpoznań', async () => {
    mocks.spend.mockResolvedValue({ monthUsd: usd(1), todayUsd: usd(0.9) });
    expect((await checkTenantAiBudget('t-daycost', 'ocr')).allowed).toBe(true);
  });

  it(`po ${AI_DAILY_OCR_LIMIT} rozpoznaniach w dobie — odmowa`, async () => {
    for (let i = 0; i < AI_DAILY_OCR_LIMIT; i += 1) {
      expect((await checkTenantAiBudget('t-count', 'ocr')).allowed).toBe(true);
    }
    expect(await checkTenantAiBudget('t-count', 'ocr')).toEqual({ allowed: false, message: expect.stringContaining('dzienny limit') });
  });

  it('błąd odczytu zużycia — odmowa (nie wiemy, ile już kosztowało)', async () => {
    mocks.spend.mockRejectedValue(new Error('fixture db'));
    expect((await checkTenantAiBudget('t-err', 'classify')).allowed).toBe(false);
  });

  it('ponad 2× cel miesięczny — alarm w Sentry, ale bez blokady', async () => {
    mocks.spend.mockResolvedValue({ monthUsd: usd(2), todayUsd: 0 });
    expect((await checkTenantAiBudget('t-alert', 'classify')).allowed).toBe(true);
    expect(mocks.sentry).toHaveBeenCalledWith(expect.stringContaining('AI'), expect.objectContaining({ level: 'warning' }));
  });

  it('zapis zużycia idzie do budżetu firmy z cennikiem modelu OCR', async () => {
    await recordTenantAiUsage('t-rec', { inputTokens: 1000, outputTokens: 200 });
    expect(mocks.record).toHaveBeenCalledWith('t-rec', 'claude-sonnet-4-6', { inputTokens: 1000, outputTokens: 200 });
  });
});
