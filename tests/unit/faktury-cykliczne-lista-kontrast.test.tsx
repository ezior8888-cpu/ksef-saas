import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

/**
 * Plan Finora E9 (P6), przegląd C11 i C12 — kontrast WCAG AA (4,5:1, tekst
 * 12 px) liczony z wartości oklch z `app/globals.css` i `tailwindcss/theme.css`,
 * także na tle, na którym tekst NAPRAWDĘ leży: wiersz tabeli w stanie hover /
 * z otwartym menu (`bg-muted/50`), zaznaczony (`bg-muted`) i przycisk strony
 * pod kursorem (`hover:bg-primary/20`). Klasy czytamy z renderowanego znacznika,
 * więc test pilnuje tego, co widzi klient, a nie stałej obok.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/app/actions/recurring-invoices', () => ({
  createRecurringInvoiceAction: vi.fn(),
  updateRecurringInvoiceAction: vi.fn(),
  pauseRecurringInvoiceAction: vi.fn(),
  resumeRecurringInvoiceAction: vi.fn(),
  deleteRecurringInvoiceAction: vi.fn(),
}));
vi.mock('@/app/actions/recurring-invoice-templates', () => ({ searchRecurringTemplatesAction: vi.fn() }));

import { RecurringInvoicesView } from '@/app/(dashboard)/invoices/recurring/_components/recurring-invoices-view';
import { RECURRING_STATUS_STYLES } from '@/app/(dashboard)/invoices/recurring/_components/recurring-status-badge';
import type { RecurringInvoiceListItem } from '@/lib/invoices/recurring/queries';

const ROOT = join(__dirname, '..', '..');
const css = readFileSync(join(ROOT, 'app/globals.css'), 'utf8');
const twTheme = readFileSync(join(ROOT, 'node_modules/tailwindcss/theme.css'), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`\n${selector} {\n`);
  expect(start, `brak bloku ${selector}`).toBeGreaterThanOrEqual(0);
  const body = css.slice(start, css.indexOf('\n}', start));
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)) vars[m[1]] = m[2].trim();
  return vars;
}

type Rgb = [number, number, number];

/** `oklch(0.55 0.22 262.96)` albo `oklch(55.5% 0.163 48.998)` → liniowe sRGB (obcięte do gamutu). */
function oklch(value: string): Rgb {
  const m = /^oklch\(([\d.]+)(%?) ([\d.]+) ([\d.]+)\)$/.exec(value);
  if (!m) throw new Error(`nie oklch: ${value}`);
  const l = m[2] ? Number(m[1]) / 100 : Number(m[1]);
  const [c, h] = [Number(m[3]), (Number(m[4]) * Math.PI) / 180];
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l3 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m3 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s3 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb: Rgb = [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ];
  return rgb.map((x) => Math.min(1, Math.max(0, x))) as Rgb;
}

const encode = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
const decode = (x: number) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);

/** Kolor z kryciem `alpha` na tle (mieszanie w sRGB, jak przeglądarka). */
function over(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return fg.map((x, i) => decode(encode(x) * alpha + encode(bg[i]) * (1 - alpha))) as Rgb;
}

function contrast(x: Rgb, y: Rgb): number {
  const lum = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const [hi, lo] = [lum(x), lum(y)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

const themes = { jasny: block(':root'), ciemny: block('.dark') } as const;

/** Token motywu aplikacji (`--primary` …) albo paleta Tailwinda (`amber-800`). */
function color(token: string, theme: Record<string, string>): Rgb {
  const tw = new RegExp(`--color-${token}:\\s*(oklch\\([^)]+\\))`).exec(twTheme);
  if (tw) return oklch(tw[1]);
  const value = theme[`--${token}`];
  if (!value) throw new Error(`brak koloru ${token}`);
  return oklch(value);
}

/** Tła, na których leży tekst w tabeli: karta, wiersz hover/menu (`muted/50`), wiersz zaznaczony (`muted`). */
function rowBackgrounds(theme: Record<string, string>): Record<string, Rgb> {
  const card = oklch(theme['--card']);
  const muted = oklch(theme['--muted']);
  return { karta: card, 'wiersz hover/menu': over(muted, 0.5, card), 'wiersz zaznaczony': over(muted, 1, card) };
}

const RECORD = (n: number): RecurringInvoiceListItem => ({
  id: `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
  tenant_id: 'firma-a',
  template_invoice_id: '7f1c2d3e-4b5a-4c6d-8e7f-901234567890',
  name: `Szablon ${n}`,
  frequency: 'monthly',
  day_of_month: 10,
  next_run_date: '2026-11-10',
  active: true,
  created_by: null,
  created_at: '2026-10-01T08:00:00Z',
  updated_at: '2026-10-01T08:00:00Z',
  status: 'active',
  period: '2026-11',
  contractorName: `Kontrahent ${n}`,
  templateNumber: `FV/${n}/10/2026`,
  templateGrossTotal: 100,
});

describe('C11 — plakietki statusu: kontrast także na tle wiersza (hover, menu „⋯”, zaznaczenie)', () => {
  const parse = (style: string, prefix: '' | 'dark:') => {
    const re = new RegExp(`(?:^|\\s)${prefix.replace(':', '\\:')}(text|bg)-([a-z]+-\\d+)(?:/(\\d+))?(?=\\s|$)`, 'g');
    const found: Record<string, { token: string; alpha: number }> = {};
    for (const m of style.matchAll(re)) found[m[1]] = { token: m[2], alpha: m[3] ? Number(m[3]) / 100 : 1 };
    return found;
  };

  for (const status of ['active', 'paused'] as const) {
    it.each(Object.keys(themes))(`${status}: motyw %s ≥ 4,5:1 na karcie, wierszu hover i zaznaczonym`, (name) => {
      const theme = themes[name as keyof typeof themes];
      const dark = name === 'ciemny';
      // Ciemny motyw: `dark:*` nadpisuje jasne klasy; brakujące wartości biorą się z jasnych.
      const light = parse(RECURRING_STATUS_STYLES[status], '');
      const over_ = dark ? parse(RECURRING_STATUS_STYLES[status], 'dark:') : {};
      const text = over_.text ?? light.text;
      const bg = over_.bg ?? light.bg;
      for (const [rowName, row] of Object.entries(rowBackgrounds(theme))) {
        const badge = over(color(bg.token, theme), bg.alpha, row);
        const ratio = contrast(color(text.token, theme), badge);
        expect(ratio, `${status}, ${name}, ${rowName}: ${text.token} na ${bg.token}/${bg.alpha * 100} = ${ratio.toFixed(2)}`)
          .toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

describe('C12 — nieaktywny numer strony w paginacji: kontrast w obu motywach', () => {
  const html = renderToStaticMarkup(
    <RecurringInvoicesView
      items={Array.from({ length: 25 }, (_, i) => RECORD(i + 1))}
      today="2026-10-20"
      candidates={[]}
    />,
  );
  // Przycisk „Strona 2” jest nieaktywny (aktywna jest strona 1).
  const classes = /aria-label="Strona 2" class="([^"]*)"/.exec(html)?.[1] ?? '';
  const textToken = /(?:^|\s)text-(primary|accent-foreground|chart-\d)(?=\s|$)/.exec(classes)?.[1] ?? '';

  it('znaleziono klasę koloru tekstu nieaktywnego numeru strony', () => {
    expect(classes).toContain('bg-primary/10');
    expect(textToken).not.toBe('');
  });

  it.each(Object.keys(themes))('motyw %s: tekst na `primary/10` i pod kursorem (`primary/20`) ≥ 4,5:1', (name) => {
    const theme = themes[name as keyof typeof themes];
    const card = oklch(theme['--card']);
    const text = color(textToken, theme);
    for (const [state, alpha] of [['spoczynek', 0.1], ['hover', 0.2]] as const) {
      const ratio = contrast(text, over(oklch(theme['--primary']), alpha, card));
      expect(ratio, `${name}, ${state}, text-${textToken}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
