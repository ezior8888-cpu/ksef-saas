// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/app/actions/exports', () => ({
  startExportAction: vi.fn(),
  downloadExportFileAction: vi.fn(),
}));

import { NewExportForm } from '@/components/exports/exports-center';
import { includeReceivedAfterFormatChange } from '@/lib/exports/form-defaults';

/**
 * F-058 (audyt bloku 1): KPiR Excel bierze koszty (faktury otrzymane
 * i paragony z `expenses`) tylko przy zaznaczonym „Faktury otrzymane”, a to
 * pole było domyślnie odznaczone — klient dostawał księgę z samymi
 * przychodami. Wybór formatu KPiR zaznacza koszty.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function render() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<NewExportForm />));
  return host;
}

const button = (el: HTMLElement, text: string) =>
  [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) as HTMLButtonElement;

const kosztyZaznaczone = (el: HTMLElement) =>
  [...el.querySelectorAll('[role="checkbox"]')]
    .find((b) => /otrzymane/i.test(b.textContent ?? ''))
    ?.getAttribute('aria-checked');

describe('includeReceivedAfterFormatChange', () => {
  it('KPiR zawsze z kosztami', () => {
    expect(includeReceivedAfterFormatChange('kpir_excel', false)).toBe(true);
  });

  it('inne formaty zostawiają wybór użytkownika', () => {
    expect(includeReceivedAfterFormatChange('jpk_fa', false)).toBe(false);
    expect(includeReceivedAfterFormatChange('csv_universal', true)).toBe(true);
  });
});

describe('Centrum eksportu — KPiR z kosztami (F-058)', () => {
  it('wybór „KPiR Excel” zaznacza koszty', () => {
    const el = render();
    expect(kosztyZaznaczone(el)).toBe('false');
    act(() => button(el, 'KPiR Excel').click());
    expect(kosztyZaznaczone(el)).toBe('true');
  });

  it('przy KPiR etykieta mówi, że chodzi o koszty, także paragony', () => {
    const el = render();
    act(() => button(el, 'KPiR Excel').click());
    expect(el.textContent).toContain('paragony');
  });
});
