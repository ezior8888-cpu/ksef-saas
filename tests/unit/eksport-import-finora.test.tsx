import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const ctx = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/app/actions/exports', () => ({ startExportAction: vi.fn(), downloadExportFileAction: vi.fn() }));
vi.mock('@/lib/supabase/page-context', () => ({ getPageContext: ctx.get }));

import ImportDanychPage from '@/app/(dashboard)/import-danych/page';
import { ExportsCenter, RecentExports, type ManualExportJobWithFiles } from '@/components/exports/exports-center';

/**
 * Eksport i Import danych (P13): karty z ikonami w stylu Accounts Finory,
 * logika bez zmian (formaty, okres, „Co dołączyć”, historia, magiczny import).
 */

function job(overrides: Partial<ManualExportJobWithFiles> = {}): ManualExportJobWithFiles {
  return {
    id: 'job-1', tenant_id: 't', format: 'jpk_fa', status: 'completed', period_start: '2026-09-01',
    period_end: '2026-09-30', invoices_count: 12, error_message: null, trigger_source: 'manual',
    export_files: [{ id: 'f1', filename: 'jpk.xml', format: 'jpk_fa', size_bytes: 10, download_count: 0 }],
    ...overrides,
  } as ManualExportJobWithFiles;
}

describe('Eksport — karty formatów w stylu Accounts', () => {
  const html = renderToStaticMarkup(<ExportsCenter recentJobs={[job()]} />);

  it('nagłówek, karty formatów z rodzajem pliku i wybranym formatem', () => {
    expect(html).toContain('Eksport danych księgowych');
    expect(html).toContain('JPK_FA(4)');
    expect(html).toContain('Plik XML');
    expect(html).toContain('KPiR Excel');
    expect(html).toContain('Arkusz Excel');
    expect(html).toContain('CSV uniwersalny');
    expect(html.match(/Wybrany/g)).toHaveLength(1);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('role="checkbox"');
    expect(html).toContain('Wygeneruj plik');
  });

  it('historia: okres DD.MM.RRRR, status i „Pobierz” przy gotowym pliku', () => {
    expect(html).toContain('01.09.2026 — 30.09.2026');
    expect(html).toContain('12 faktur');
    expect(html).toContain('Gotowe');
    expect(html).toContain('Pobierz');
  });

  it('bez dawnego wyglądu: szkło, ikony Material', () => {
    expect(html).not.toContain('ff-glass-pane');
    expect(html).not.toContain('material-symbols');
    expect(html).not.toContain('backdrop-blur');
  });

  it('pusta historia i nieudany eksport z powodem', () => {
    expect(renderToStaticMarkup(<RecentExports jobs={[]} />)).toContain('Brak eksportów. Wygeneruj pierwszy plik po lewej.');
    const failed = renderToStaticMarkup(<RecentExports jobs={[job({ status: 'failed', error_message: 'JPK wstrzymany: brak urzędu', export_files: [] })]} />);
    expect(failed).toContain('JPK wstrzymany: brak urzędu');
    expect(failed).toContain('Błąd');
    expect(failed).not.toContain('Pobierz');
  });
});

function tenantClient(row: Record<string, unknown> | null) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    single: async () => ({ data: row, error: null }),
  };
  return { from: () => builder };
}

describe('Import danych — karta w stylu Accounts', () => {
  it('z certyfikatem: cała karta prowadzi do magicznego importu', async () => {
    ctx.get.mockResolvedValue({ supabase: tenantClient({ name: 'Firma', nip: '1234567890', has_ksef_credentials: true }), tenantId: 'org-1' });
    const html = renderToStaticMarkup(await ImportDanychPage());
    expect(html).toContain('Magiczny Import historii');
    expect(html).toContain('Gotowy');
    expect(html).toContain('href="/onboarding/magic-import?tenantId=org-1"');
    expect(html).toContain('Rozpocznij Magiczny Import');
    expect(html).toContain('NIP <span class="font-mono">1234567890</span>');
  });

  it('bez certyfikatu: plakietka i link do ustawień KSeF, bez startu importu', async () => {
    ctx.get.mockResolvedValue({ supabase: tenantClient({ name: 'Firma', nip: null, has_ksef_credentials: false }), tenantId: 'org-1' });
    const html = renderToStaticMarkup(await ImportDanychPage());
    expect(html).toContain('Wymaga certyfikatu KSeF');
    expect(html).toContain('href="/settings/ksef"');
    expect(html).not.toContain('/onboarding/magic-import');
    expect(html).not.toContain('ff-glass-pane');
  });
});
