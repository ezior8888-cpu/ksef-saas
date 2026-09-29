import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobContext } from '@/lib/jobs/registry';

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  format: 'comarch_optima',
  updates: [] as Array<{ table: string; patch: Row }>,
}));

/** Atrapa: zlecenie eksportu w wybranym formacie; zapisuje zmiany statusu. */
function builder(table: string) {
  let patch: Row | null = null;
  const q: Record<string, unknown> = {};
  Object.assign(q, {
    select: () => q,
    eq: () => q,
    in: () => q,
    update: (p: Row) => ((patch = p), q),
    single: async () => ({
      data: { id: 'job-1', tenant_id: 'ten-1', format: db.format, period_start: '2026-09-01', period_end: '2026-09-30', status: 'pending' },
      error: null,
    }),
    then: (ok: (v: { error: null }) => unknown) => {
      if (patch) db.updates.push({ table, patch });
      return Promise.resolve({ error: null }).then(ok);
    },
  });
  return q;
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: builder }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/app/actions/exports', () => ({ triggerCoPilotNowAction: vi.fn(), updateAccountantSettingsAction: vi.fn() }));

import { CoPilotSettingsForm } from '@/components/exports/co-pilot-settings-form';
import { isExportFormatSuspended, SUSPENDED_EXPORT_FORMATS } from '@/lib/exports/suspended-formats';
import { packageFormats } from '@/lib/flo/functions/accountant-format';
import { parseFormats } from '@/lib/inngest/jobs/co-pilot-monthly';
import { onExportsGenerateExhausted, runExportsGenerate } from '@/lib/inngest/jobs/exports-generate';

/**
 * Comarch Optima wstrzymana (29.09.2026): generator robił własny układ
 * (`<Faktury>/<Naglowek>`), a Optima importuje „Praca rozproszona”
 * (`<ROOT xmlns=".../cdn/optima/offline">`, `REJESTRY_SPRZEDAZY_VAT`).
 * Księgowa z Optimą ma dostać CSV, a nie plik, którego program nie przyjmie.
 */

const ctx: JobContext = {
  attempt: 0,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  step: { run: async (_n, fn) => fn(), sleep: vi.fn(), sendEvent: vi.fn(), scheduleAfter: vi.fn() },
};
const POWOD = SUSPENDED_EXPORT_FORMATS.comarch_optima!;

beforeEach(() => {
  db.format = 'comarch_optima';
  db.updates = [];
});

describe('Comarch Optima — wstrzymana', () => {
  it('jest na liście wstrzymanych, z powodem dla człowieka', () => {
    expect(isExportFormatSuspended('comarch_optima')).toBe(true);
    expect(POWOD).toContain('Comarch Optima');
    expect(isExportFormatSuspended('csv_universal')).toBe(false);
  });

  it.each([
    [['comarch_optima', 'kpir_excel'], ['csv_universal', 'kpir_excel']],
    [['comarch_optima', 'csv_universal'], ['csv_universal']],
    [['jpk_fa', 'kpir_excel'], ['jpk_fa', 'kpir_excel']],
  ])('paczka Co-Pilot z ustawień %j → %j (Optima zamienia się w CSV)', (zapisane, oczekiwane) => {
    expect(parseFormats(zapisane)).toEqual(oczekiwane);
  });

  it('FLO: wybrana Optima → sam CSV', () => {
    expect(packageFormats({ chosen: 'comarch_optima', isFirstPackage: false })).toEqual(['csv_universal']);
    expect(packageFormats({ chosen: 'comarch_optima', isFirstPackage: true })).toEqual(['csv_universal']);
  });

  it('job: zlecenie Optimy kończy się bez pliku i bez ponawiania, z powodem', async () => {
    const run = runExportsGenerate({ exportJobId: 'job-1' }, ctx);
    await expect(run).rejects.toMatchObject({ name: 'NonRetriableError' });
    await expect(run).rejects.toThrow(POWOD);
    expect(db.updates.some((u) => u.patch.status === 'generating')).toBe(false);
  });

  it('po wyczerpaniu prób klient widzi powód, nie ogólny błąd', async () => {
    await onExportsGenerateExhausted(new Error(POWOD), { exportJobId: 'job-1' });
    expect(db.updates[0]!.patch).toMatchObject({ status: 'failed', error_message: POWOD });
  });

  it('formularz paczki nie oferuje Optimy, a zapisany wcześniej wybór nie wraca', () => {
    const html = renderToStaticMarkup(
      <CoPilotSettingsForm
        initialSettings={{ preferred_formats: ['comarch_optima', 'kpir_excel'] } as never}
        recentJobs={[]}
      />,
    );
    expect(html).not.toContain('Comarch Optima');
    expect(html).toContain('KPiR Excel');
  });
});
