// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Sesja 4 planu skalowania (HOR-V1, LIM-08): import CSV idzie przez Server
 * Action, która przyjmuje najwyżej 1 MB (domyślny limit Next). Okno obiecywało
 * „max 10 MB”, więc plik 1–10 MB przechodził kontrolę w przeglądarce i padał
 * na serwerze angielskim komunikatem Next. Teraz okno zatrzymuje go przed
 * wysłaniem, po polsku i z radą, co zrobić. Właściwa naprawa (własny limit
 * importu) to decyzja Bartosza — opis w PR.
 */

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const actions = vi.hoisted(() => ({ startFileImportAction: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@/app/actions/import-danych', () => actions);

import { FileImportDialog } from '@/components/onboarding/file-import-dialog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MB = 1024 * 1024;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

async function chooseAndStart(file: File) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<FileImportDialog source="fakturownia_csv" tenantId="org-1" onClose={() => {}} />);
  });
  const input = document.body.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const start = [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes('Rozpocznij import'))!;
  await act(async () => {
    start.click();
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const csv = (size: number) => new File([new Uint8Array(size)], 'faktury-2025.csv', { type: 'text/csv' });

describe('FileImportDialog — limit wgrywania pliku', () => {
  it('CSV 1,5 MB → komunikat o limicie 1 MB, akcja niewołana', async () => {
    await chooseAndStart(csv(1.5 * MB));

    expect(actions.startFileImportAction).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledOnce();
    const message = String(toast.error.mock.calls[0]![0]);
    expect(message).toContain('1,5 MB');
    expect(message).toContain('1 MB');
  });

  it('okno nie obiecuje już 10 MB', async () => {
    await chooseAndStart(csv(10));
    expect(document.body.textContent).not.toContain('10 MB');
  });

  it('CSV 300 KB → akcja wołana', async () => {
    actions.startFileImportAction.mockResolvedValue({ success: false, error: 'Plik nie wygląda na eksport z Fakturowni.' });
    await chooseAndStart(csv(300 * 1024));

    expect(actions.startFileImportAction).toHaveBeenCalledOnce();
    expect(toast.error).toHaveBeenCalledWith('Plik nie wygląda na eksport z Fakturowni.');
  });

  it('odrzucona obietnica akcji (413, sieć) → polski komunikat zamiast tekstu Next', async () => {
    actions.startFileImportAction.mockRejectedValue(new Error('Body exceeded 1 MB limit.'));
    await chooseAndStart(csv(300 * 1024));

    expect(toast.error).toHaveBeenCalledOnce();
    const message = String(toast.error.mock.calls[0]![0]);
    expect(message).not.toContain('Body exceeded');
    expect(message).toMatch(/Nie udało się wysłać/);
  });
});
