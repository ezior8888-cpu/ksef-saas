import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `inngest_run_log` czytają panel `/admin/system`, metryki biznesowe i raport
 * dzienny („błędy jobów”), ale do 01.10.2026 nic do niej nie pisało — wskaźnik
 * był zawsze 0. Worker pg-boss zapisuje teraz każdy przebieg.
 */

const db = vi.hoisted(() => ({
  inserts: [] as Record<string, unknown>[],
  rows: [] as Record<string, unknown>[],
  insertError: null as { message: string } | null,
  insertThrows: false,
}));
vi.mock('@/lib/auth/admin-guard', () => ({ requireAdmin: vi.fn(async () => undefined) }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const q: Record<string, unknown> = {};
      Object.assign(q, {
        insert: async (row: Record<string, unknown>) => {
          if (db.insertThrows) throw new Error('brak połączenia');
          db.inserts.push(row);
          return { error: db.insertError };
        },
        select: () => q,
        gte: () => q,
        order: () => q,
        limit: async () => ({ data: db.rows, error: null }),
      });
      return q;
    },
  }),
}));

import { getInngestJobStats } from '@/lib/admin/system';
import { recordJobRun } from '@/lib/jobs/run-log';

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  db.inserts = [];
  db.rows = [];
  db.insertError = null;
  db.insertThrows = false;
  log = vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('zapis przebiegu joba', () => {
  it('sukces: kolejka, identyfikator, status zgodny z CHECK w 00003, czas', async () => {
    await recordJobRun({ queue: 'ocr.process-photo', runId: 'job-1', status: 'succeeded', durationMs: 1234.6 });
    expect(db.inserts).toEqual([
      { event_name: 'ocr.process-photo', run_id: 'job-1', status: 'succeeded', duration_ms: 1235, error_message: null },
    ]);
  });

  it('błąd: komunikat bez adresów e-mail i obcięty, bez payloadu i identyfikatorów firmy', async () => {
    const error = new Error(`Nie wysłano do jan.kowalski@firma.test: ${'x'.repeat(600)}`);
    await recordJobRun({ queue: 'exports.co-pilot.send-package', runId: 'job-2', status: 'failed', durationMs: 10, error });
    const row = db.inserts[0]!;
    expect(row.status).toBe('failed');
    expect(String(row.error_message)).not.toContain('jan.kowalski@firma.test');
    expect(String(row.error_message).length).toBeLessThanOrEqual(500);
    expect(row).not.toHaveProperty('payload');
    expect(row).not.toHaveProperty('tenant_id');
  });

  it.each([
    ['baza zwraca błąd', () => { db.insertError = { message: 'permission denied' }; }],
    ['klient rzuca', () => { db.insertThrows = true; }],
  ])('%s — job dalej idzie, zostaje wpis w logu kontenera', async (_label, setup) => {
    setup();
    await expect(
      recordJobRun({ queue: 'cron.jobs-watchdog', runId: 'job-3', status: 'succeeded', durationMs: 1 }),
    ).resolves.toBeUndefined();
    expect(String(log.mock.calls[0]?.[0])).toContain('zapis przebiegu nieudany');
  });
});

describe('panel /admin/system liczy zapisy workera', () => {
  it("'succeeded' to sukces, 'failed' to błąd", async () => {
    db.rows = [
      { event_name: 'ocr.process-photo', status: 'succeeded', duration_ms: 100, created_at: '2026-10-01T10:00:00Z' },
      { event_name: 'ocr.process-photo', status: 'failed', duration_ms: 50, created_at: '2026-10-01T10:05:00Z' },
    ];
    const [stat] = await getInngestJobStats();
    expect(stat).toMatchObject({ eventName: 'ocr.process-photo' });
    expect(stat).toMatchObject({ totalRuns: 2, successCount: 1, errorCount: 1 });
  });
});

describe('worker.ts zapisuje każdy przebieg', () => {
  const source = readFileSync(join(process.cwd(), 'lib/jobs/worker.ts'), 'utf8');
  const handled = source.slice(source.indexOf('await def.handler('));

  it('po udanym handlerze — succeeded, w catch — failed przed decyzją o ponowieniu', () => {
    expect(handled.indexOf("status: 'succeeded'")).toBeGreaterThan(-1);
    expect(handled.indexOf("status: 'succeeded'")).toBeLessThan(handled.indexOf('} catch (err) {'));
    const failed = handled.indexOf("status: 'failed'");
    expect(failed).toBeGreaterThan(handled.indexOf('} catch (err) {'));
    expect(failed).toBeLessThan(handled.indexOf('decideRetry('));
  });
});
