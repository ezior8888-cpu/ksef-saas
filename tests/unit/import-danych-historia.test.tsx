// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const actions = vi.hoisted(() => ({ startFileImportAction: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@/app/onboarding/magic-import/actions', () => actions);

import { ImportHistory } from '@/components/import-danych/import-history';
import { MAX_POLL_TICKS, POLL_INTERVAL_MS, type ImportHistoryJob } from '@/components/import-danych/import-model';
import { ImportSourceGrid } from '@/components/import-danych/import-source-grid';

/**
 * Poprawka Bartosza 22.10.2026 (import danych w stylu Finory): historia
 * importów odświeża się sama, dopóki coś się importuje (co 4 s, najwyżej
 * 45 razy, tylko na widocznej karcie), potem daje ręczne „Odśwież”; koniec
 * importu w czasie wizyty zgłasza powiadomienie. Karty źródeł z pliku
 * otwierają to samo okno `FileImportDialog` co onboarding.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

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
    invoices_imported: 12,
    contractors_created: 3,
    contractors_updated: 0,
    products_created: 0,
    warnings: [],
    source_filename: null,
    created_at: '2026-10-01T08:00:00Z',
    completed_at: '2026-10-01T08:01:00Z',
    ...overrides,
  };
}

const running = (overrides: Partial<ImportHistoryJob> = {}) =>
  job({ status: 'extracting', progress_percent: 30, invoices_imported: null, completed_at: null, ...overrides });

beforeEach(() => {
  vi.useFakeTimers();
  router.refresh.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
});

function mount(node: React.ReactNode) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return host;
}

const rerender = (jobs: ImportHistoryJob[]) => act(() => root!.render(<ImportHistory jobs={jobs} />));
const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const buttons = (el: ParentNode, text: string) =>
  [...el.querySelectorAll<HTMLElement>('button, a')].filter((b) => b.textContent?.trim() === text);

describe('Historia importów — odświeżanie w toku', () => {
  it('co 4 s, dopóki coś się importuje; po 45 razach stop i ręczne „Odśwież”', () => {
    const el = mount(<ImportHistory jobs={[running()]} />);
    tick(POLL_INTERVAL_MS - 1);
    expect(router.refresh).not.toHaveBeenCalled();
    tick(1);
    expect(router.refresh).toHaveBeenCalledTimes(1);

    tick(POLL_INTERVAL_MS * (MAX_POLL_TICKS - 1));
    expect(router.refresh).toHaveBeenCalledTimes(MAX_POLL_TICKS);
    expect(MAX_POLL_TICKS).toBe(45);
    tick(POLL_INTERVAL_MS * 10);
    expect(router.refresh).toHaveBeenCalledTimes(MAX_POLL_TICKS);

    const refresh = buttons(el, 'Odśwież');
    expect(refresh).toHaveLength(1);
    act(() => refresh[0]!.click());
    expect(router.refresh).toHaveBeenCalledTimes(MAX_POLL_TICKS + 1);
    tick(POLL_INTERVAL_MS);
    expect(router.refresh).toHaveBeenCalledTimes(MAX_POLL_TICKS + 2);
  });

  it('bez importów w toku nie odpytuje; koniec importu zatrzymuje odpytywanie', () => {
    mount(<ImportHistory jobs={[job(), job({ id: 'imp-2', status: 'failed' })]} />);
    tick(POLL_INTERVAL_MS * 5);
    expect(router.refresh).not.toHaveBeenCalled();

    rerender([running()]);
    tick(POLL_INTERVAL_MS);
    expect(router.refresh).toHaveBeenCalledTimes(1);
    rerender([job()]);
    tick(POLL_INTERVAL_MS * 5);
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('karta w tle nie odpytuje', () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    try {
      mount(<ImportHistory jobs={[running()]} />);
      tick(POLL_INTERVAL_MS * 3);
      expect(router.refresh).not.toHaveBeenCalled();
    } finally {
      visibility.mockRestore();
    }
  });
});

describe('Historia importów — koniec importu w czasie wizyty', () => {
  it('zakończony: powiadomienie z wynikiem i komunikat dla czytnika', () => {
    const el = mount(<ImportHistory jobs={[running()]} />);
    rerender([job()]);
    expect(toast.success).toHaveBeenCalledWith('Import zakończony', { description: '12 faktur · 3 kontrahenci' });
    expect(el.querySelector('p.sr-only[aria-live="polite"]')?.textContent).toBe(
      'Import zakończony: Magiczny import z KSeF. 12 faktur · 3 kontrahenci',
    );
  });

  it('nieudany: powiadomienie z powodem', () => {
    mount(<ImportHistory jobs={[running()]} />);
    rerender([job({ status: 'failed', progress_message: 'Zawęź zakres dat i ponów import.' })]);
    expect(toast.error).toHaveBeenCalledWith('Import się nie udał', { description: 'Zawęź zakres dat i ponów import.' });
  });

  it('import zakończony przed wizytą nie zgłasza się drugi raz', () => {
    mount(<ImportHistory jobs={[job()]} />);
    rerender([job(), job({ id: 'imp-2' })]);
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe('Karty źródeł — import z pliku', () => {
  it('karta programu otwiera okno importu z pliku tego programu; „Anuluj” je zamyka', async () => {
    const el = mount(<ImportSourceGrid tenantId="org-1" hasCertificate />);
    const card = el.querySelector<HTMLButtonElement>('button[aria-label="Fakturownia — wgraj plik CSV"]');
    expect(card).not.toBeNull();
    act(() => card!.click());
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    expect(document.body.textContent).toContain('Import z Fakturownia CSV');
    const input = document.body.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input?.accept).toBe('.csv');

    act(() => buttons(document.body, 'Anuluj')[0]!.click());
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    expect(document.body.querySelector('input[type="file"]')).toBeNull();
    expect(actions.startFileImportAction).not.toHaveBeenCalled();
  });

  it('„Inny program” to plik JPK_FA (XML)', async () => {
    const el = mount(<ImportSourceGrid tenantId="org-1" hasCertificate={false} />);
    act(() => el.querySelector<HTMLButtonElement>('button[aria-label="Inny program — wgraj plik JPK_FA"]')!.click());
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    expect(document.body.textContent).toContain('Import z JPK_FA (uniwersalny)');
    expect(document.body.querySelector<HTMLInputElement>('input[type="file"]')?.accept).toBe('.xml');
  });
});
