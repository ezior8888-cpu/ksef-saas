// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

/**
 * Poprawka Bartosza 21.10.2026: na telefonie koło „Nowa” (plus, /invoices/new)
 * nachodziło na własny napis, bo stało wyniesione ponad krawędź paska
 * (`-mt-5`), a napis podciągnięty pod nie (`-mt-3`). Teraz koło stoi
 * dokładnie tam, gdzie był napis, a napis zostaje tylko dla czytników ekranu
 * (`sr-only`) — link nadal ma nazwę dostępną „Nowa”.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  onchange: null,
  dispatchEvent: () => false,
})) as typeof window.matchMedia;

const nav = vi.hoisted(() => ({ pathname: '/dashboard' }));

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ prefetch: () => {}, push: () => {}, refresh: () => {}, replace: () => {} }),
}));
vi.mock('@/app/(auth)/login/actions', () => ({ signOut: async () => {} }));

const { BottomNav } = await import('@/components/dashboard/bottom-nav');
const { dashboardMobileTabs } = await import('@/lib/dashboard-nav-config');

function mount(pathname: string) {
  nav.pathname = pathname;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<BottomNav />));
  return {
    bar: host.querySelector('nav[aria-label="Nawigacja główna"]')!,
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

/** Nazwa dostępna linku: tekst bez elementów `aria-hidden` (jak w przeglądarce). */
function nazwaDostepna(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (!(node instanceof Element) || node.getAttribute('aria-hidden') === 'true') return '';
  return [...node.childNodes].map(nazwaDostepna).join('').trim();
}

/** Tekst WIDOCZNY: pomija `aria-hidden` oraz elementy `sr-only`. */
function widocznyTekst(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (!(node instanceof Element)) return '';
  if (node.getAttribute('aria-hidden') === 'true' || node.classList.contains('sr-only')) return '';
  return [...node.childNodes].map(widocznyTekst).join('').trim();
}

describe('Dolna nawigacja — koło „Nowa” zasłania napis', () => {
  it('koło nie jest wyniesione (bez -mt-5), a napis jest tylko dla czytników (sr-only)', () => {
    const m = mount('/dashboard');
    const link = m.bar.querySelector<HTMLAnchorElement>('a[href="/invoices/new"]')!;
    expect(link).not.toBeNull();

    const circle = link.querySelector<HTMLElement>('span[aria-hidden="true"]')!;
    expect(circle.className).toContain('rounded-full');
    expect(circle.className).not.toContain('-mt-5');

    // Napis: osobny span po kole, sr-only, bez podciągania pod koło (-mt-3).
    const label = [...link.querySelectorAll('span')].find((s) => s.textContent === 'Nowa')!;
    expect(label).toBeDefined();
    expect(label.classList.contains('sr-only')).toBe(true);
    expect(label.className).not.toContain('-mt-3');
    expect(link.innerHTML).not.toMatch(/-mt-[35]/);

    // Wzrokowo w slocie jest samo koło — żadnego widocznego tekstu.
    expect(widocznyTekst(link)).toBe('');
    m.unmount();
  });

  it('slot „Nowa” ma dolny bezpieczny obszar jak pozostałe — koło nie zjeżdża w strefę paska domowego iPhone’a', () => {
    const m = mount('/dashboard');
    const slots = [...m.bar.querySelectorAll<HTMLElement>('a, button')];
    const nowa = m.bar.querySelector<HTMLAnchorElement>('a[href="/invoices/new"]')!;
    expect(nowa.className).toContain('pb-[var(--ff-safe-b)]');
    for (const slot of slots) expect(slot.className, slot.textContent ?? '').toContain('pb-[var(--ff-safe-b)]');
    m.unmount();
  });

  it('link zachowuje nazwę dostępną „Nowa” i aria-current na /invoices/new', () => {
    const poza = mount('/dashboard');
    const linkPoza = poza.bar.querySelector<HTMLAnchorElement>('a[href="/invoices/new"]')!;
    expect(nazwaDostepna(linkPoza)).toBe('Nowa');
    expect(linkPoza.hasAttribute('aria-current')).toBe(false);
    poza.unmount();

    const na = mount('/invoices/new');
    const linkNa = na.bar.querySelector<HTMLAnchorElement>('a[href="/invoices/new"]')!;
    expect(nazwaDostepna(linkNa)).toBe('Nowa');
    expect(linkNa.getAttribute('aria-current')).toBe('page');
    na.unmount();
  });

  it('pozostałe sloty bez zmian: widoczne podpisy, bez sr-only', () => {
    const m = mount('/dashboard');
    for (const tab of dashboardMobileTabs.filter((t) => !t.emphasis)) {
      const slot =
        tab.href === null
          ? [...m.bar.querySelectorAll('button')].find((b) => b.textContent === tab.label)!
          : m.bar.querySelector<HTMLAnchorElement>(`a[href="${tab.href}"]`)!;
      expect(slot, `slot ${tab.label}`).toBeDefined();
      expect(widocznyTekst(slot)).toBe(tab.label);
      expect(slot.querySelector('.sr-only')).toBeNull();
    }
    m.unmount();
  });
});
