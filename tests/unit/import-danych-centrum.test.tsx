import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ctx = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/lib/supabase/page-context', () => ({ getPageContext: ctx.get }));
// Okno importu z pliku woła akcję serwera — tu tylko render, bez kolejki jobów.
vi.mock('@/app/onboarding/magic-import/actions', () => ({ startFileImportAction: vi.fn() }));

import ImportDanychPage from '@/app/(dashboard)/import-danych/page';
import { ImportCenter } from '@/components/import-danych/import-center';
import {
  completedSummary,
  failureNote,
  FILE_SOURCES,
  formatIsoDay,
  formatWarsawDay,
  IMPORT_HISTORY_LIMIT,
  importProgressHref,
  magicImportHref,
  progressPercent,
  sourceDetail,
  sourceLabel,
  statusGroup,
  summarizeImports,
  warningCount,
  type ImportHistoryJob,
} from '@/components/import-danych/import-model';

/**
 * Centrum importu `/import-danych` (poprawka Bartosza 22.10.2026: import
 * danych w stylu Finory): kafle z liczbami z `import_jobs`, karty źródeł
 * (KSeF i pięć programów jak w onboardingu) i historia importów w karcie do
 * stopki. Logika importu bez zmian — sprawdzamy tylko, że ekran mówi prawdę
 * o danych i prowadzi do istniejących ścieżek.
 */

function job(overrides: Partial<ImportHistoryJob> = {}): ImportHistoryJob {
  return {
    id: 'imp-1',
    source: 'ksef_history',
    direction: 'issued',
    date_from: '2026-04-01',
    date_to: '2026-09-30',
    status: 'completed',
    progress_percent: 100,
    progress_message: 'Import zakończony',
    invoices_imported: 0,
    contractors_created: 0,
    contractors_updated: 0,
    products_created: 0,
    warnings: [],
    source_filename: null,
    created_at: '2026-10-01T08:00:00Z',
    completed_at: '2026-10-01T08:01:00Z',
    ...overrides,
  };
}

describe('model widoku importu', () => {
  it('statusy: kroki joba to „w toku”, nieznany status nie udaje sukcesu', () => {
    for (const s of ['pending', 'queued', 'parsing', 'extracting', 'deduplicating', 'inserting']) {
      expect(statusGroup(s)).toBe('running');
    }
    expect(statusGroup('completed')).toBe('completed');
    expect(statusGroup('failed')).toBe('failed');
    expect(statusGroup('cancelled')).toBe('cancelled');
    expect(statusGroup('cos-nowego')).toBe('failed');
  });

  it('źródła: nazwy jak w onboardingu, nieznane i puste nie wywracają listy', () => {
    expect(sourceLabel('ksef_history')).toBe('Magiczny import z KSeF');
    expect(sourceLabel('fakturownia_csv')).toBe('Fakturownia');
    expect(sourceLabel('jpk_fa')).toBe('Plik JPK_FA');
    expect(sourceLabel(null)).toBe('Import');
    expect(sourceLabel('xyz')).toBe('Import');
    expect(FILE_SOURCES.map((s) => s.id)).toEqual(['fakturownia_csv', 'infakt_csv', 'wfirma_csv', 'ifirma_csv', 'jpk_fa']);
  });

  it('podpis źródła: nazwa pliku albo zakres dat KSeF, przy zakupach z kierunkiem', () => {
    expect(sourceDetail(job({ source: 'infakt_csv', source_filename: 'eksport.csv' }))).toBe('eksport.csv');
    expect(sourceDetail(job())).toBe('01.04.2026 – 30.09.2026');
    expect(sourceDetail(job({ direction: 'received' }))).toBe('01.04.2026 – 30.09.2026 · otrzymane');
    expect(sourceDetail(job({ date_from: null, date_to: null }))).toBeNull();
  });

  it('wynik zakończonego importu po polsku; same zera to „Brak nowych faktur”', () => {
    expect(completedSummary(job({ invoices_imported: 1 }))).toBe('1 faktura');
    expect(
      completedSummary(job({ invoices_imported: 22, contractors_created: 2, contractors_updated: 1, products_created: 5 })),
    ).toBe('22 faktury · 3 kontrahenci · 5 produktów');
    expect(completedSummary(job({ invoices_imported: 124, contractors_created: 18, products_created: 1 }))).toBe(
      '124 faktury · 18 kontrahentów · 1 produkt',
    );
    expect(completedSummary(job())).toBe('Brak nowych faktur');
    expect(completedSummary(job({ invoices_imported: null, contractors_created: null }))).toBe('Brak nowych faktur');
  });

  it('błąd: powód z joba albo ogólny, plus to, co mimo błędu zapisano', () => {
    expect(failureNote(job({ status: 'failed', progress_message: 'Zawęź zakres dat i ponów import.' }))).toEqual({
      reason: 'Zawęź zakres dat i ponów import.',
      saved: null,
    });
    expect(failureNote(job({ status: 'failed', progress_message: '  ', invoices_imported: 1 }))).toEqual({
      reason: 'Import się nie udał.',
      saved: 'Zapisano 1 fakturę',
    });
    expect(failureNote(job({ status: 'failed', progress_message: null, invoices_imported: 37 })).saved).toBe('Zapisano 37 faktur');
  });

  it('sumy kafli: faktury też z częściowo nieudanych, kontrahenci i produkty tylko nowi', () => {
    const jobs = [
      job({ id: 'a', status: 'extracting', completed_at: null }),
      job({ id: 'b', invoices_imported: 10, contractors_created: 2, contractors_updated: 7, products_created: 4 }),
      job({ id: 'c', status: 'failed', invoices_imported: 5 }),
      job({ id: 'd', source: 'fakturownia_csv', invoices_imported: 3, contractors_created: 1, products_created: 1 }),
    ];
    const summary = summarizeImports(jobs);
    expect(summary).toMatchObject({ invoices: 18, contractors: 3, products: 5, partial: false });
    // Najnowszy ZAKOŃCZONY — nie ten w toku ani nieudany.
    expect(summary.lastCompleted?.id).toBe('b');
    expect(summarizeImports([job({ status: 'failed' })]).lastCompleted).toBeNull();
    // Pełna lista (limit zapytania) — kafle mówią, że to suma z ostatnich importów.
    expect(summarizeImports(Array.from({ length: IMPORT_HISTORY_LIMIT }, (_, i) => job({ id: `j${i}` }))).partial).toBe(true);
  });

  it('pomocnicze: procent w granicach, daty po polsku w czasie warszawskim, ostrzeżenia tylko tekstowe', () => {
    expect(progressPercent({ progress_percent: 45.4 })).toBe(45);
    expect(progressPercent({ progress_percent: 140 })).toBe(100);
    expect(progressPercent({ progress_percent: -3 })).toBe(0);
    expect(formatIsoDay('2026-04-01')).toBe('01.04.2026');
    expect(formatIsoDay('zle')).toBe('zle');
    // 22:30 UTC 12.10 to już 13.10 w Polsce (CEST).
    expect(formatWarsawDay('2026-10-12T22:30:00Z')).toBe('13.10.2026');
    expect(warningCount(job({ warnings: ['a', 2, 'b', null] }))).toBe(2);
    expect(warningCount(job({ warnings: {} }))).toBe(0);
  });

  it('adresy istniejących ścieżek: magiczny import i postęp joba', () => {
    expect(magicImportHref('org 1')).toBe('/onboarding/magic-import?tenantId=org%201');
    expect(importProgressHref('imp-1')).toBe('/onboarding/progress/imp-1');
  });
});

describe('ekran Centrum importu', () => {
  const props = { tenantId: 'org-1', tenantName: 'Firma', nip: '1234567890', hasCertificate: true };

  it('z historią: kafle z sumami, historia ze statusami i linkami do szczegółów, karta do stopki', () => {
    const html = renderToStaticMarkup(
      <ImportCenter
        {...props}
        jobs={[
          job({ id: 'run-1', status: 'extracting', progress_percent: 45, completed_at: null }),
          job({ id: 'ok-1', invoices_imported: 124, contractors_created: 18, products_created: 40, warnings: ['w1', 'w2'] }),
          job({ id: 'err-1', status: 'failed', progress_message: 'Lista faktur KSeF jest niepełna. Zawęź zakres dat i ponów import.' }),
        ]}
      />,
    );
    expect(html).toMatch(/^<div class="ff-page-fill flex flex-col gap-6">/);
    expect(html).toContain('<h1 class="text-2xl font-semibold">Import danych</h1>');
    // Kafle: sumy z `import_jobs`.
    expect(html).toContain('Zaimportowane faktury');
    expect(html).toContain('>124</h4>');
    expect(html).toContain('>18</h4>');
    expect(html).toContain('>40</h4>');
    expect(html).toContain('>01.10.2026</h4>');
    // Historia.
    expect(html).toContain('Historia importów');
    expect(html).toContain('W toku');
    expect(html).toContain('Pobieranie faktur');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('Gotowe');
    expect(html).toContain('124 faktury · 18 kontrahentów · 40 produktów');
    expect(html).toContain('2 ostrzeżenia');
    expect(html).toContain('Błąd');
    expect(html).toContain('Zawęź zakres dat i ponów import.');
    expect(html).toContain('href="/onboarding/progress/run-1"');
    expect(html).toContain('href="/onboarding/progress/ok-1"');
    expect(html).toContain('>Postęp<');
    expect(html).toContain('>Szczegóły<');
    // Ostatnie dziecko korzenia to karta historii (sięga stopki).
    expect(html).toMatch(/<div data-slot="card"[^>]*class="[^"]*flex-1[^"]*"><div class="flex w-full flex-1 flex-col">/);
  });

  it('źródła: KSeF i pięć programów z onboardingu, każdy z nazwą od tytułu karty', () => {
    const html = renderToStaticMarkup(<ImportCenter {...props} jobs={[]} />);
    expect(html).toContain('aria-label="Magiczny import z KSeF — rozpocznij import"');
    expect(html).toContain('href="/onboarding/magic-import?tenantId=org-1"');
    for (const name of ['Fakturownia', 'inFakt', 'wFirma', 'iFirma', 'Inny program']) {
      expect(html).toContain(`aria-label="${name} — wgraj plik ${name === 'Inny program' ? 'JPK_FA' : 'CSV'}"`);
    }
    expect(html.match(/>Wgraj plik</g)).toHaveLength(5);
  });

  it('bez certyfikatu: karta KSeF prowadzi do ustawień KSeF, import z pliku zostaje', () => {
    const html = renderToStaticMarkup(<ImportCenter {...props} hasCertificate={false} jobs={[]} />);
    expect(html).toContain('href="/settings/ksef"');
    expect(html).toContain('Wymaga certyfikatu');
    expect(html).not.toContain('/onboarding/magic-import');
    expect(html.match(/>Wgraj plik</g)).toHaveLength(5);
  });

  it('pierwsza wizyta: bez kafli z zerami, pusta historia z trzema krokami', () => {
    const html = renderToStaticMarkup(<ImportCenter {...props} jobs={[]} />);
    expect(html).not.toContain('Zaimportowane faktury');
    expect(html).toContain('Brak importów');
    expect(html).toContain('Wybierz źródło powyżej');
    expect(html).toContain('Pobieramy faktury w tle');
    expect(html).toContain('Kontrahenci i produkty dodają się sami');
  });

  it('historia nie do wczytania: bez kafli (nie znamy liczb), komunikat z „Odśwież”, źródła dalej działają', () => {
    const html = renderToStaticMarkup(<ImportCenter {...props} jobs={null} />);
    expect(html).not.toContain('Zaimportowane faktury');
    expect(html).toContain('Nie udało się wczytać historii');
    expect(html).toMatch(/href="\/import-danych"[^>]*>Odśwież<\/a>/);
    expect(html).toContain('href="/onboarding/magic-import?tenantId=org-1"');
    expect(html.match(/>Wgraj plik</g)).toHaveLength(5);
  });
});

describe('strona /import-danych — odczyty', () => {
  type Call = { table: string; select?: string; eq: [string, unknown][]; order?: [string, unknown]; limit?: number };
  let calls: Call[];

  function recordingClient(opts: { tenant: Record<string, unknown>; jobs?: ImportHistoryJob[]; jobsError?: { message: string } }) {
    return {
      from: (table: string) => {
        const call: Call = { table, eq: [] };
        calls.push(call);
        const builder = {
          select: (columns: string) => ((call.select = columns), builder),
          eq: (column: string, value: unknown) => (call.eq.push([column, value]), builder),
          order: (column: string, options: unknown) => ((call.order = [column, options]), builder),
          single: async () => ({ data: opts.tenant, error: null }),
          limit: async (count: number) => {
            call.limit = count;
            return opts.jobsError ? { data: null, error: opts.jobsError } : { data: opts.jobs ?? [], error: null };
          },
        };
        return builder;
      },
    };
  }

  beforeEach(() => {
    calls = [];
  });

  it('flaga certyfikatu i ostatnie importy firmy, od najnowszych, bez ścieżki pliku w magazynie', async () => {
    ctx.get.mockResolvedValue({
      supabase: recordingClient({
        tenant: { name: 'Firma', nip: '1234567890', has_ksef_credentials: true },
        jobs: [job({ invoices_imported: 7 })],
      }),
      tenantId: 'org-1',
    });
    const html = renderToStaticMarkup(await ImportDanychPage());

    const tenants = calls.find((c) => c.table === 'tenants');
    expect(tenants?.select).toBe('name, nip, has_ksef_credentials');
    const history = calls.find((c) => c.table === 'import_jobs');
    expect(history?.eq).toEqual([['tenant_id', 'org-1']]);
    expect(history?.order).toEqual(['created_at', { ascending: false }]);
    expect(history?.limit).toBe(IMPORT_HISTORY_LIMIT);
    expect(history?.select).not.toContain('source_file_path');
    expect(history?.select).not.toContain('triggered_by');

    expect(html).toContain('>7</h4>');
    expect(html).toContain('7 faktur');
  });

  it('błąd odczytu historii nie zabiera startu importu', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      ctx.get.mockResolvedValue({
        supabase: recordingClient({
          tenant: { name: 'Firma', nip: '1234567890', has_ksef_credentials: true },
          jobsError: { message: 'permission denied' },
        }),
        tenantId: 'org-1',
      });
      const html = renderToStaticMarkup(await ImportDanychPage());
      expect(html).toContain('Nie udało się wczytać historii');
      expect(html).toContain('href="/onboarding/magic-import?tenantId=org-1"');
      expect(error).toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });
});
