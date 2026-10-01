import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobContext } from '@/lib/jobs/registry';

/**
 * Retencja kopii bazy liczona samą datą: dzienne > 30 dni, tygodniowe > 56 dni
 * idą do kosza. Gdy nowe kopie od miesiąca się nie udawały (a alerty z workera
 * do 01.10.2026 nie wychodziły), cleanup kasował ostatnie DOBRE kopie — po
 * 30 dniach cichej awarii nie zostawała żadna.
 */

type Row = { id: string; kind: 'daily' | 'weekly' | 'manual'; status: 'running' | 'success' | 'failed'; r2_key: string | null; started_at: string };

const state = vi.hoisted(() => ({
  rows: [] as Row[],
  deletedR2: [] as string[],
  deletedRows: [] as string[],
  keepError: false,
}));

vi.mock('@/lib/backup/r2-backup-client', () => ({
  deleteSnapshot: vi.fn(async (key: string) => { state.deletedR2.push(key); }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: () => {
      const eqs: Array<[string, unknown]> = [];
      let before: string | null = null;
      let isDelete = false;
      let limitN = Infinity;
      let ordered = false;
      let ascending = true;
      const q: Record<string, unknown> = {};
      const run = () => {
        if (isDelete) {
          const id = eqs.find(([k]) => k === 'id')?.[1] as string;
          state.deletedRows.push(id);
          state.rows = state.rows.filter((r) => r.id !== id);
          return { error: null };
        }
        if (ordered && state.keepError) return { data: null, error: { message: 'baza niedostępna' } };
        let rows = state.rows.filter((r) => eqs.every(([k, v]) => r[k as keyof Row] === v));
        if (before) rows = rows.filter((r) => r.started_at < before!);
        if (ordered) {
          rows = [...rows].sort((a, b) =>
            ascending ? a.started_at.localeCompare(b.started_at) : b.started_at.localeCompare(a.started_at));
        }
        return { data: rows.slice(0, limitN).map((r) => ({ ...r })), error: null };
      };
      Object.assign(q, {
        select: () => q,
        delete: () => { isDelete = true; return q; },
        eq: (k: string, v: unknown) => { eqs.push([k, v]); return isDelete ? Promise.resolve(run()) : q; },
        lt: (_k: string, v: string) => { before = v; return Promise.resolve(run()); },
        order: (_k: string, o?: { ascending?: boolean }) => { ordered = true; ascending = o?.ascending ?? true; return q; },
        limit: (n: number) => { limitN = n; return Promise.resolve(run()); },
      });
      return q;
    },
  }),
}));

import { runCleanupOldBackups } from '@/lib/inngest/jobs/cleanup-old-backups';

const ctx: JobContext = {
  attempt: 0,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  step: { run: async (_n, fn) => fn(), sleep: vi.fn(), sendEvent: vi.fn(), scheduleAfter: vi.fn() },
};
const dni = (n: number) => new Date(Date.now() - n * 86400_000).toISOString();
const kopia = (id: string, ageDays: number, status: Row['status'] = 'success', kind: Row['kind'] = 'daily'): Row =>
  ({ id, kind, status, r2_key: `${id}.sql.gz`, started_at: dni(ageDays) });

beforeEach(() => {
  state.rows = [];
  state.deletedR2 = [];
  state.deletedRows = [];
  state.keepError = false;
});

describe('retencja kopii bazy', () => {
  it('zdrowy backup: stare kopie idą do kosza, świeże zostają', async () => {
    state.rows = [
      ...Array.from({ length: 10 }, (_, i) => kopia(`nowa-${i}`, i + 1)),
      kopia('stara-1', 40),
      kopia('stara-2', 45),
    ];
    expect(await runCleanupOldBackups(ctx)).toMatchObject({ removed: 2 });
    expect(state.deletedRows.sort()).toEqual(['stara-1', 'stara-2']);
  });

  it('miesiąc nieudanych kopii: 7 ostatnich DOBRYCH zostaje mimo wieku', async () => {
    state.rows = [
      ...Array.from({ length: 35 }, (_, i) => kopia(`nieudana-${i}`, i + 1, 'failed')),
      ...Array.from({ length: 10 }, (_, i) => kopia(`dobra-${i}`, 36 + i)),
    ];
    await runCleanupOldBackups(ctx);
    const dobreZostaly = state.rows.filter((r) => r.status === 'success').map((r) => r.id);
    expect(dobreZostaly).toEqual(['dobra-0', 'dobra-1', 'dobra-2', 'dobra-3', 'dobra-4', 'dobra-5', 'dobra-6']);
    expect(state.deletedRows).toEqual(expect.arrayContaining(['dobra-7', 'dobra-8', 'dobra-9']));
  });

  it('tygodniowe po retencji też chronione, jeśli są ostatnimi dobrymi', async () => {
    state.rows = [kopia('tygodniowa', 70, 'success', 'weekly'), kopia('dzienna-nieudana', 40, 'failed')];
    await runCleanupOldBackups(ctx);
    expect(state.rows.map((r) => r.id)).toEqual(['tygodniowa']);
  });

  it('nie da się ustalić ostatnich dobrych kopii — nic nie kasujemy', async () => {
    state.rows = [kopia('stara', 40)];
    state.keepError = true;
    await expect(runCleanupOldBackups(ctx)).rejects.toThrow('backup_keep_lookup_failed');
    expect(state.deletedRows).toEqual([]);
    expect(state.deletedR2).toEqual([]);
  });
});
