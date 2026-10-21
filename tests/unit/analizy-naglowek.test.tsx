import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { use } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/analizy/sprzedaz',
  useRouter: () => ({ prefetch: () => {}, push: () => {}, refresh: () => {}, replace: () => {} }),
  redirect: nav.redirect,
}));

const { AnalizyHeader, ANALIZY_MODES } = await import('@/components/analizy/analizy-header');
const { AnalizySlot } = await import('@/components/analizy/card-slot');
const { analyticsMonthOptions, currentMonthKey } = await import('@/lib/analytics-finance/months');
const { default: AnalizyRedirect } = await import('@/app/(dashboard)/analizy/page');

/**
 * Nagłówek `/analizy/*` po poprawce Bartosza 21.10.2026 (Analizy 1:1
 * z Finory, jedna pozycja menu): tytuł według rodzaju analizy, przełącznik
 * „Sprzedaż | Koszty” jako nawigacja z `aria-current`, wybrany miesiąc
 * przechodzi na drugą analizę tylko, gdy nie jest bieżącym; `/analizy`
 * przekierowuje na sprzedaż; szkielety kart mają pudełka kart Finory.
 */

/** SSR wstawia <!-- --> między sąsiednie węzły tekstowe — usuwamy je. */
function html(node: React.ReactElement): string {
  return renderToStaticMarkup(node).replace(/<!-- -->/g, '');
}

const NOW = new Date('2026-10-17T10:00:00Z');
const CURRENT = currentMonthKey(NOW);

function header(mode: 'sprzedaz' | 'koszty', month: string) {
  return html(
    <AnalizyHeader mode={mode} options={analyticsMonthOptions(NOW)} month={month} currentMonth={CURRENT} />,
  );
}

/** Znacznik `<nav aria-label="Rodzaj analizy">…</nav>`. */
function switchNav(out: string): string {
  const match = out.match(/<nav[^>]*aria-label="Rodzaj analizy"[^>]*>.*?<\/nav>/);
  expect(match, 'przełącznik „Rodzaj analizy”').not.toBeNull();
  return match![0];
}

/** Linki przełącznika: [href, etykieta, czy aria-current="page"]. */
function switchLinks(out: string): Array<[string, string, boolean]> {
  return [...switchNav(out).matchAll(/<a([^>]*)>(.*?)<\/a>/g)].map((m) => [
    m[1]!.match(/href="([^"]*)"/)![1]!,
    m[2]!,
    m[1]!.includes('aria-current="page"'),
  ]);
}

describe('AnalizyHeader — tytuł według rodzaju analizy', () => {
  it('sprzedaż: jeden <h1> „Analiza sprzedaży”, podpis, wybór miesiąca po polsku', () => {
    const out = header('sprzedaz', '2026-09');
    expect(out.match(/<h1/g)).toHaveLength(1);
    expect(out).toContain('<h1 class="text-2xl font-semibold">Analiza sprzedaży</h1>');
    expect(out).toContain(ANALIZY_MODES.sprzedaz.description);
    expect(out).toContain('aria-label="Wybierz miesiąc"');
    expect(out).toContain('Wrzesień 2026');
  });

  it('koszty: jeden <h1> „Analiza kosztów” i własny podpis', () => {
    const out = header('koszty', CURRENT);
    expect(out.match(/<h1/g)).toHaveLength(1);
    expect(out).toContain('<h1 class="text-2xl font-semibold">Analiza kosztów</h1>');
    expect(out).toContain('Śledź wydatki, VAT i stałe koszty miesiąc po miesiącu.');
    expect(out).not.toContain('Analiza sprzedaży</h1>');
  });

  it('wiersz nagłówka jak w Finorze, przełącznik przed wyborem miesiąca', () => {
    const out = header('sprzedaz', CURRENT);
    expect(out).toContain('class="flex justify-between gap-3 max-sm:flex-col sm:items-center"');
    expect(out).toContain('class="flex items-center gap-3 max-sm:justify-between"');
    expect(out.indexOf('aria-label="Rodzaj analizy"')).toBeLessThan(out.indexOf('aria-label="Wybierz miesiąc"'));
    // Wybór miesiąca bez `max-sm:self-end` Finory (sterowanie stoi w grupie).
    expect(out).not.toContain('max-sm:self-end');
  });
});

describe('przełącznik „Sprzedaż | Koszty”', () => {
  it('nawigacja z dwoma linkami, aktywny ma aria-current="page" i wygląd segmentu', () => {
    const out = header('koszty', CURRENT);
    expect(switchLinks(out)).toEqual([
      ['/analizy/sprzedaz', 'Sprzedaż', false],
      ['/analizy/koszty', 'Koszty', true],
    ]);
    const navTag = switchNav(out);
    // Tor `dark:bg-card`, nie `dark:bg-background`: przełącznik stoi na stronie
    // (`bg-background`), nie na karcie — tor w kolorze strony znikał w ciemnym
    // motywie (poprawka z przeglądu 21.10.2026, warstwy jak w Finorze: jaśniejszy
    // tor na stronie, jeszcze jaśniejsza pigułka).
    expect(navTag).toContain('bg-muted text-muted-foreground inline-flex h-8 w-fit items-center gap-0 p-1 dark:bg-card');
    expect(navTag).not.toContain('dark:bg-background');
    expect(navTag).toMatch(/<a[^>]*aria-current="page"[^>]*class="[^"]*bg-card text-foreground dark:bg-input/);
    expect(header('sprzedaz', CURRENT).match(/aria-current="page"/g)).toHaveLength(1);
    expect(switchLinks(header('sprzedaz', CURRENT)).map(([, , active]) => active)).toEqual([true, false]);
  });

  it('bieżący miesiąc: adresy bez ?miesiac=', () => {
    for (const [href] of switchLinks(header('sprzedaz', CURRENT))) {
      expect(href).not.toContain('miesiac');
    }
  });

  it('wcześniejszy miesiąc przechodzi na drugą analizę (?miesiac=RRRR-MM)', () => {
    expect(switchLinks(header('sprzedaz', '2026-09')).map(([href]) => href)).toEqual([
      '/analizy/sprzedaz?miesiac=2026-09',
      '/analizy/koszty?miesiac=2026-09',
    ]);
  });
});

describe('strony /analizy/*', () => {
  const source = (page: string) =>
    readFileSync(join(process.cwd(), 'app', '(dashboard)', 'analizy', page, 'page.tsx'), 'utf8');

  it('korzeń strony nadpisuje --muted w ciemnym motywie i podaje rodzaj analizy', () => {
    for (const page of ['sprzedaz', 'koszty']) {
      const src = source(page);
      expect(src, page).toContain('className="space-y-6 dark:[--muted:var(--background)]"');
      expect(src, page).toContain(`mode="${page}"`);
      expect(src, page).toContain('currentMonth={currentMonthKey(now)}');
    }
  });

  it('/analizy przekierowuje na analizę sprzedaży, miesiąc RRRR-MM idzie dalej', async () => {
    const run = async (params: Record<string, string | string[] | undefined>) => {
      nav.redirect.mockClear();
      await expect(AnalizyRedirect({ searchParams: Promise.resolve(params) })).rejects.toThrow('NEXT_REDIRECT');
      return nav.redirect.mock.calls[0]?.[0];
    };
    expect(await run({})).toBe('/analizy/sprzedaz');
    expect(await run({ miesiac: '2026-09' })).toBe('/analizy/sprzedaz?miesiac=2026-09');
    expect(await run({ miesiac: ['2026-08', '2026-07'] })).toBe('/analizy/sprzedaz?miesiac=2026-08');
    // Śmieci w adresie nie przechodzą dalej.
    expect(await run({ miesiac: '2026-13' })).toBe('/analizy/sprzedaz');
    expect(await run({ miesiac: '2026-09&x=1' })).toBe('/analizy/sprzedaz');
  });
});

describe('AnalizySlot — szkielety w pudełkach kart Finory', () => {
  /** Karta, która nigdy nie dociera — Suspense pokazuje szkielet. */
  function Pending(): React.ReactNode {
    use(new Promise<never>(() => {}));
    return null;
  }

  const skeleton = (variant: Parameters<typeof AnalizySlot>[0]['variant']) =>
    html(
      <AnalizySlot title="Karta" variant={variant} className="md:col-span-2">
        <Pending />
      </AnalizySlot>,
    );

  const count = (out: string, needle: string) => out.split(needle).length - 1;

  it('każdy wariant: karta aria-busy z klasą slotu', () => {
    for (const variant of ['stats', 'bar', 'pie', 'list', 'feed', 'rows', 'heatmap'] as const) {
      const out = skeleton(variant);
      expect(out, variant).toContain('aria-busy="true"');
      expect(out, variant).toContain('md:col-span-2');
    }
  });

  it('bar i pie: pudełka wykresów Finory (max-h-70), koło bez w-full', () => {
    expect(skeleton('bar')).toContain('aspect-video max-h-70 w-full');
    const pie = skeleton('pie');
    expect(pie).toMatch(/class="[^"]*mx-auto aspect-square max-h-70 rounded-full"/);
    expect(pie).not.toMatch(/aspect-square[^"]*w-full/);
  });

  it('list: 6 wierszy z kółkiem size-10; rows: 3 wiersze bg-muted p-3; heatmap: h-48.25', () => {
    const list = skeleton('list');
    expect(count(list, 'size-10 shrink-0 rounded-full')).toBe(6);
    expect(list).toContain('space-y-4');
    const rows = skeleton('rows');
    expect(count(rows, 'class="bg-muted flex items-center gap-3 p-3"')).toBe(3);
    expect(rows).toContain('space-y-2');
    expect(skeleton('heatmap')).toContain('h-48.25 w-full');
  });

  it('feed: 5 wierszy jak „Ostatnie wydatki / faktury” (limit 5 w lib, jak Finora)', () => {
    // Szkielet z 6 wierszami był o wiersz + odstęp wyższy od karty z 5 pozycjami
    // i na telefonie (jedna kolumna) strona skakała o ~50 px przy dojściu danych.
    const feed = skeleton('feed');
    expect(count(feed, 'size-10 shrink-0 rounded-full')).toBe(5);
    expect(feed).toContain('space-y-4');
    expect(feed).toContain('data-slot="card-header"');
  });

  it('stats: 4 kafle jak Monthly Stats, bez nagłówka karty', () => {
    const out = skeleton('stats');
    expect(count(out, 'flex min-w-0 flex-1 items-center justify-between gap-4')).toBe(4);
    expect(out).toContain('flex gap-5 max-xl:flex-col');
    expect(out).not.toContain('data-slot="card-header"');
    expect(skeleton('bar')).toContain('data-slot="card-header"');
  });
});
