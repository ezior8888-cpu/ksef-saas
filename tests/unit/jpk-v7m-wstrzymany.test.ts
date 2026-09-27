import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  inserts: [] as unknown[],
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/jobs/enqueue', () => ({ sendJobEvent: mocks.send }));
vi.mock('@/lib/storage/r2', () => ({ downloadFromR2: vi.fn() }));
vi.mock('@/lib/supabase/auth-context', async (orig) => ({
  ...(await orig<typeof import('@/lib/supabase/auth-context')>()),
  requireUserAndTenant: async () => ({
    user: { id: 'u-1' },
    tenantId: 'ten-1',
    supabase: {
      from: () => {
        const q: Record<string, unknown> = {};
        Object.assign(q, {
          insert: (row: unknown) => {
            mocks.inserts.push(row);
            return q;
          },
          select: () => q,
          single: async () => ({ data: { id: 'job-1' }, error: null }),
        });
        return q;
      },
    },
  }),
}));

import { startExportAction } from '@/app/actions/exports';
import { buildFormatQuestion, packageFormats } from '@/lib/flo/functions/accountant-format';

/**
 * JPK_V7M wstrzymany do czasu wersji (3) — decyzja Igora 27.09.2026.
 * Generator tworzy JPK_V7M(2), a od rozliczenia za luty 2026 obowiązuje (3):
 * plik nie przeszedłby przez bramkę MF, a Co-Pilot wysyłałby go księgowej.
 */

const okres = { periodStart: '2026-08-01', periodEnd: '2026-08-31' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.inserts = [];
});

describe('eksport JPK_V7M wstrzymany', () => {
  it('akcja serwera odmawia przed zapisem joba — także z pominięciem interfejsu', async () => {
    const result = await startExportAction({ format: 'jpk_v7m', ...okres });
    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toContain('JPK_V7M(3)');
    expect(mocks.inserts).toEqual([]);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('inne formaty działają jak dotąd', async () => {
    await expect(startExportAction({ format: 'jpk_fa', ...okres })).resolves.toEqual({
      success: true,
      jobId: 'job-1',
    });
    expect(mocks.inserts).toHaveLength(1);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
});

describe('Co-Pilot / FLO: księgowa nie dostaje JPK_V7M(2)', () => {
  it('karta „w czym pracuje księgowa” nie proponuje JPK_V7M', () => {
    const card = buildFormatQuestion({ tenantId: 'ten-1', periodKey: '2026-08' });
    const values = (card.payload as { options: { value: string }[] }).options.map((o) => o.value);
    expect(values).not.toContain('jpk_v7m');
    expect(values).toContain('csv_universal');
  });

  it.each([true, false])('wybrany JPK_V7M → sam uniwersalny CSV (pierwsza paczka: %s)', (isFirstPackage) => {
    expect(packageFormats({ chosen: 'jpk_v7m', isFirstPackage })).toEqual(['csv_universal']);
  });

  it('pozostałe formaty bez zmian', () => {
    expect(packageFormats({ chosen: 'jpk_fa', isFirstPackage: true })).toEqual(['jpk_fa', 'csv_universal']);
  });
});
