import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobContext } from '@/lib/jobs/registry';

/**
 * Paczka Co-Pilota: pg-boss ponawia job OD POCZĄTKU. Do 01.10.2026 błąd po
 * wysłanym mailu (licznik paczek, ustawienia) kończył się nowymi eksportami
 * i DRUGIM mailem do księgowej z tą samą paczką. Do tego `emailed_at`
 * (historia paczek w ustawieniach) nigdy nie był zapisywany.
 */

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  exportJobs: [] as Record<string, unknown>[],
  emails: 0,
  failRpc: false,
  failMark: false,
  failCheck: false,
}));

vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: async () => {
        db.emails++;
        return { data: { id: `mail-${db.emails}` }, error: null };
      },
    };
  },
}));
vi.mock('@/lib/storage/r2', () => ({
  downloadFromR2: async () => Buffer.from('plik'),
  getSignedInvoiceUrl: async () => 'https://example.test/plik',
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async () => ({ error: db.failRpc ? { message: 'chwilowy błąd bazy' } : null }),
    from: (table: string) => {
      const eqs: Array<[string, unknown]> = [];
      const ins: Array<[string, unknown[]]> = [];
      const notNull: string[] = [];
      let insertRow: Row | null = null;
      let patch: Row | null = null;
      const q: Record<string, unknown> = {};
      const matches = (r: Row) =>
        eqs.every(([k, v]) => r[k] === v) &&
        ins.every(([k, vs]) => vs.includes(r[k])) &&
        notNull.every((k) => r[k] != null);
      const run = () => {
        if (table === 'export_jobs') {
          if (patch) {
            if (db.failMark) return { data: null, error: { message: 'chwilowy błąd bazy' } };
            const rows = db.exportJobs.filter(matches);
            for (const r of rows) Object.assign(r, patch);
            return { data: rows, error: null };
          }
          if (notNull.length > 0 && db.failCheck) return { data: null, error: { message: 'chwilowy błąd bazy' } };
          return { data: db.exportJobs.filter(matches).map((r) => ({ ...r })), error: null };
        }
        if (table === 'export_files') {
          return { data: [{ filename: 'kpir.xlsx', r2_path: 'r2/kpir.xlsx', size_bytes: 10 }], error: null };
        }
        return { data: null, error: null };
      };
      Object.assign(q, {
        select: () => q,
        insert: (r: Row) => { insertRow = r; return q; },
        update: (r: Row) => { patch = r; return q; },
        eq: (k: string, v: unknown) => { eqs.push([k, v]); return q; },
        in: (k: string, vs: unknown[]) => { ins.push([k, vs]); return q; },
        not: (k: string) => { notNull.push(k); return q; },
        limit: () => q,
        single: async () => {
          if (table === 'export_jobs' && insertRow) {
            const row = { id: `job-${db.exportJobs.length + 1}`, emailed_at: null, ...insertRow, status: 'completed' };
            db.exportJobs.push(row);
            return { data: { id: row.id }, error: null };
          }
          if (table === 'tenants') return { data: { name: 'Moja Firma', nip: '5260001246' }, error: null };
          return { data: null, error: null };
        },
        maybeSingle: async () => {
          if (table === 'accountant_settings') {
            return { data: { tenant_id: 'ten-1', preferred_formats: ['kpir_excel'], cc_emails: [] }, error: null };
          }
          return { data: null, error: null };
        },
        then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, err),
      });
      return q;
    },
  }),
}));

import { runCoPilotSendPackage } from '@/lib/jobs/runners/co-pilot-monthly';

const ctx: JobContext = {
  attempt: 0,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  step: { run: async (_n, fn) => fn(), sleep: vi.fn(), sendEvent: vi.fn(), scheduleAfter: vi.fn() },
};
const paczka = (manual: boolean) =>
  ({
    tenantId: 'ten-1',
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    formats: ['kpir_excel'],
    accountantEmail: 'ksiegowa@example.test',
    accountantName: 'Księgowa',
    manual,
  }) as Parameters<typeof runCoPilotSendPackage>[0];

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  db.exportJobs = [];
  db.emails = 0;
  db.failRpc = false;
  db.failMark = false;
  db.failCheck = false;
  vi.stubEnv('RESEND_API_KEY', 're_test_klucz');
  vi.stubEnv('RESEND_FROM_EMAIL', 'paczki@example.test');
  log = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  log.mockRestore();
});

describe('Co-Pilot: paczka z crona wychodzi raz', () => {
  it('mail wysłany, padł licznik paczek — ponowienie nie wysyła drugiego maila ani nowych eksportów', async () => {
    db.failRpc = true;
    await expect(runCoPilotSendPackage(paczka(false), ctx)).rejects.toThrow('chwilowy błąd bazy');
    expect(db.emails).toBe(1);
    expect(db.exportJobs).toHaveLength(1);

    db.failRpc = false;
    expect(await runCoPilotSendPackage(paczka(false), ctx)).toEqual({ success: true, skipped: 'already-emailed' });
    expect(db.emails).toBe(1);
    expect(db.exportJobs).toHaveLength(1);
  });

  it('po wysyłce eksporty mają emailed_at — historia paczek w ustawieniach go pokazuje', async () => {
    await runCoPilotSendPackage(paczka(false), ctx);
    expect(db.exportJobs[0]!.emailed_at).toEqual(expect.any(String));
  });

  it('paczka za inny okres albo wysłana ręcznie nie blokuje paczki z crona', async () => {
    db.exportJobs.push(
      { id: 'stara', tenant_id: 'ten-1', trigger_source: 'co_pilot_monthly', period_start: '2026-08-01', period_end: '2026-08-31', emailed_at: '2026-09-05' },
      { id: 'reczna', tenant_id: 'ten-1', trigger_source: 'manual', period_start: '2026-09-01', period_end: '2026-09-30', emailed_at: '2026-10-02' },
      { id: 'inna-firma', tenant_id: 'ten-2', trigger_source: 'co_pilot_monthly', period_start: '2026-09-01', period_end: '2026-09-30', emailed_at: '2026-10-05' },
    );
    expect(await runCoPilotSendPackage(paczka(false), ctx)).toMatchObject({ success: true, emailedTo: 'ksiegowa@example.test' });
    expect(db.emails).toBe(1);
  });

  it('wcześniejsza próba bez wysłanego maila (eksport padł) nie blokuje paczki', async () => {
    db.exportJobs.push({ id: 'nieudana', tenant_id: 'ten-1', trigger_source: 'co_pilot_monthly', period_start: '2026-09-01', period_end: '2026-09-30', emailed_at: null });
    expect(await runCoPilotSendPackage(paczka(false), ctx)).toMatchObject({ success: true, emailedTo: 'ksiegowa@example.test' });
    expect(db.emails).toBe(1);
  });

  it('ręczne wysłanie z ustawień zawsze idzie — to decyzja klienta', async () => {
    await runCoPilotSendPackage(paczka(true), ctx);
    await runCoPilotSendPackage(paczka(true), ctx);
    expect(db.emails).toBe(2);
  });

  it('nie da się zapisać emailed_at — mail już wyszedł, job kończy się sukcesem z wpisem w logu', async () => {
    db.failMark = true;
    expect(await runCoPilotSendPackage(paczka(false), ctx)).toMatchObject({ success: true });
    expect(db.emails).toBe(1);
    expect(String(log.mock.calls[0]?.[0])).toContain('nie zapisano emailed_at');
  });

  it('nie da się sprawdzić, czy paczka wyszła — job rzuca zamiast wysyłać w ciemno', async () => {
    db.failCheck = true;
    await expect(runCoPilotSendPackage(paczka(false), ctx)).rejects.toThrow('chwilowy błąd bazy');
    expect(db.emails).toBe(0);
  });
});
