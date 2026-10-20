import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/settings',
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import TotalVisitorsCard from '@/components/dashboard/finora/chart-total-visitors';
import { KpirView, type KpirInvoiceRow } from '@/components/expenses/kpir-view';
import SettingsNav from '@/components/settings/finora/settings-nav';

import { color, contrast, oklch, over, rowBackgrounds, themes, type Rgb, type Theme } from './helpers/kontrast';

/** Pełne escapowanie znaków specjalnych wyrażenia regularnego (CodeQL js/incomplete-sanitization). */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * WCAG 1.4.3 (tekst ≥ 4,5:1): miejsca z tekstem na półprzezroczystym tle
 * primary / chart-2, które przeoczył przegląd `finora-kontrast-primary-10`
 * (weryfikacja adwersaryjna 21.10.2026): plakietka procentu na Pulpicie
 * (primary/15 i /25), aktywna zakładka ustawień w ciemnym motywie
 * (primary/20, hover /30), plakietka „Przychód” w KPiR (chart-2/10) i opis
 * zaznaczonego formatu w ustawieniach eksportu (muted-foreground na primary/10).
 */

/** Klasy elementu, którego `class` zawiera wszystkie `needles`. */
function classOf(html: string, ...needles: string[]): string {
  const cls = [...html.matchAll(/\sclass="([^"]*)"/g)]
    .map((m) => m[1])
    .find((c) => needles.every((n) => c.split(/\s+/).includes(n)));
  expect(cls, `brak elementu z ${needles.join(' ')}`).toBeDefined();
  return cls!;
}

/** Kolor (`text-x` / `bg-x/NN`) dla wariantu (`''`, `dark:`, `hover:`, `dark:hover:`); `null`, gdy brak. */
function pick(cls: string, kind: 'text' | 'bg', variant: string): { token: string; alpha: number } | null {
  const re = new RegExp(`(?:^|\\s)${escapeRegExp(variant)}${kind}-([a-z0-9-]+?)(?:/(\\d+))?(?=\\s|$)`, 'g');
  const NOT_COLOR = /^(xs|sm|base|lg|[0-9]?xl|left|right|center|nowrap|wrap|balance|pretty|ellipsis|clip|start|end|justify)$/;
  for (const m of cls.matchAll(re)) {
    if (NOT_COLOR.test(m[1])) continue;
    return { token: m[1], alpha: m[2] ? Number(m[2]) / 100 : 1 };
  }
  return null;
}

function ratio(cls: string, theme: Theme, variants: string[], base: Rgb): number {
  const first = (kind: 'text' | 'bg') => variants.map((v) => pick(cls, kind, v)).find(Boolean)!;
  const text = first('text');
  const bg = first('bg');
  return contrast(color(text.token, theme), over(color(bg.token, theme), bg.alpha, base));
}

describe('kontrast tekstu na tle primary/chart-2 (przeoczone)', () => {
  it('Pulpit: plakietka procentu w „Odwiedzający” (primary/15, ciemny /25)', () => {
    const cls = classOf(
      renderToStaticMarkup(<TotalVisitorsCard title="Odwiedzający" totalVisitors="1 234" percentage={12} visitorData={[]} />),
      'bg-primary/15',
      // Plakietka (tekst), nie AvatarFallback z ikoną (wystarcza 3:1, WCAG 1.4.11).
      'focus-visible:ring-primary/20',
    );
    expect(ratio(cls, themes.jasny, [''], oklch(themes.jasny['--card']))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(cls, themes.ciemny, ['dark:', ''], oklch(themes.ciemny['--card']))).toBeGreaterThanOrEqual(4.5);
  });

  it('Ustawienia: aktywna zakładka w ciemnym motywie (tło strony i arkusz na telefonie, spoczynek i hover)', () => {
    const cls = classOf(
      renderToStaticMarkup(<SettingsNav tabs={[{ href: '/settings', label: 'Firma' }]} />),
      'dark:bg-primary/20',
    );
    const t = themes.ciemny;
    for (const base of [oklch(t['--background']), oklch(t['--popover'])]) {
      expect(ratio(cls, t, ['dark:', ''], base)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(cls, t, ['dark:hover:', 'dark:', 'hover:', ''], base)).toBeGreaterThanOrEqual(4.5);
    }
    // Jasny motyw bez zmian (text-chart-3 na primary/15 i /20).
    expect(ratio(cls, themes.jasny, ['hover:', ''], oklch(themes.jasny['--background']))).toBeGreaterThanOrEqual(4.5);
  });

  it('KPiR: plakietka „Przychód” (chart-2/10) na karcie i w wierszach tabeli', () => {
    const faktura = {
      id: 'inv', internal_number: 'FV/1/09/2026', issue_date: '2026-09-03', sale_date: '2026-09-03',
      gross_total: 1230, net_total: 1000, buyer_data: { name: 'Klient' }, invoice_kind: 'regular',
    } as KpirInvoiceRow;
    const cls = classOf(renderToStaticMarkup(<KpirView month={9} year={2026} invoices={[faktura]} expenses={[]} />), 'bg-chart-2/10');
    for (const [name, variants] of [['jasny', ['']], ['ciemny', ['dark:', '']]] as const) {
      const t = themes[name];
      for (const base of [oklch(t['--card']), ...Object.values(rowBackgrounds(t))]) {
        expect(ratio(cls, t, [...variants], base), name).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('Eksport do księgowej: opis zaznaczonego formatu nie jest szary na primary/10', () => {
    // muted-foreground na primary/10 nad kartą: 4,23:1 w jasnym — za mało dla tekstu 12 px.
    const t = themes.jasny;
    const tlo = over(color('primary', t), 0.1, oklch(t['--card']));
    expect(contrast(color('muted-foreground', t), tlo)).toBeLessThan(4.5);
    expect(contrast(color('accent-foreground', t), tlo)).toBeGreaterThanOrEqual(4.5);
    const source = readFileSync(join(process.cwd(), 'components/exports/co-pilot-settings-form.tsx'), 'utf8');
    expect(source).toContain("selected ? 'text-accent-foreground' : 'text-muted-foreground'");
  });
});
