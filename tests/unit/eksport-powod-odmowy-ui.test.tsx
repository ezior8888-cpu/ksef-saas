import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/app/actions/exports', () => ({
  startExportAction: vi.fn(),
  downloadExportFileAction: vi.fn(),
}));

import { RecentExports, type ManualExportJobWithFiles } from '@/components/exports/exports-center';

/**
 * W9 (C5a, ustalenie recenzji): eksport, który odmówił z powodem dla
 * człowieka (np. „JPK wstrzymany: faktura FV/WDT/1 …”), zapisuje go
 * w `export_jobs.error_message` — Centrum eksportu pokazywało tylko „Błąd”.
 */

const job = (o: Partial<ManualExportJobWithFiles>): ManualExportJobWithFiles => ({
  id: 'job-1', tenant_id: 't', format: 'jpk_fa', status: 'failed', period_start: '2026-09-01', period_end: '2026-09-30',
  invoices_count: 0, error_message: null, export_files: [],
  ...o,
} as unknown as ManualExportJobWithFiles);

describe('Centrum eksportu — powód nieudanego eksportu', () => {
  it('nieudany eksport pokazuje powód z error_message', () => {
    const powod = 'JPK wstrzymany: faktura FV/WDT/1 ma stawkę VAT „0 WDT”.';
    const html = renderToStaticMarkup(<RecentExports jobs={[job({ error_message: powod })]} />);
    expect(html).toContain('FV/WDT/1');
    expect(html).toContain('JPK wstrzymany');
  });

  it('gotowy eksport nie pokazuje starego powodu', () => {
    const html = renderToStaticMarkup(<RecentExports jobs={[job({ status: 'completed', error_message: 'stary błąd' })]} />);
    expect(html).not.toContain('stary błąd');
  });
});
