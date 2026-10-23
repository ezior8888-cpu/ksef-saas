import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { prerenderToNodeStream } from 'react-dom/static';
import { RiArrowDownSLine, RiArrowUpSLine, RiFileList3Line } from '@remixicon/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Read } from '@/lib/demo/fake-postgrest';

import { memoryClient, type MemoryTables } from './helpers/baza-w-pamieci';
import { color, contrast, themes } from './helpers/kontrast';

/**
 * Pulpit = strona Finance Finory 1:1 (decyzja Bartosza 19.10.2026), od E5
 * PLAN-PRAWDZIWE-DANE na prawdziwych danych: te same karty, siatka, klasy
 * i animacje, zmienione tylko napisy i źródło liczb (polecenie Bartosza
 * 23.10.2026: „wszystko IDENTYCZNE rozmiarowo i designowo”). Przed
 * weryfikacją KSeF karty czytają atrapę bazy tymi samymi loaderami.
 */

type Proof = { verifiedAt: string | null; verifiedEnvironment: string | null };

const state = vi.hoisted(() => ({
  ctx: null as unknown as { supabase: unknown; tenantId: string; user: { id: string; email: string | null }; role: 'owner' },
  proof: null as Proof | null,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ prefetch: () => {}, push: () => {}, refresh: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  redirect: (to: string) => { throw new Error(`redirect ${to}`); },
}));
vi.mock('@/lib/supabase/page-context', () => ({ getPageContext: async () => state.ctx }));
vi.mock('@/lib/dashboard-shell-data', () => ({ getTenantKsefProof: async () => state.proof }));

const { ZNACZNIKI_PRZYKLADU } = await import('@/lib/demo/znaczniki');
const { default: DashboardHomePage } = await import('@/app/(dashboard)/dashboard/page');
const { default: StatisticsCard } = await import('@/components/dashboard/finora/statistics-card-03');
const { financeChartConfig } = await import('@/components/dashboard/finora/chart-finance');
const adaptery = await import('@/components/dashboard/finora/adaptery');
const { danePrzykladowe, DEMO_TENANT } = await import('@/lib/demo/dane-przykladowe');
const { fakePostgrest } = await import('@/lib/demo/fake-postgrest');

/** Klasy dzisiejszego (sprzed E5) Pulpitu Finory — zrzut z renderu 23.10.2026. */
const KLASY_FINORY: string[] = JSON.parse(
  readFileSync(join(process.cwd(), 'tests/fixtures/pulpit-finora-klasy.json'), 'utf8'),
);

/** Klasy, które musiały zniknąć: wysokość kolumn należności liczona z danych (`style`), nie wpisana. */
const KLASY_USUNIETE = ['h-[17%]', 'h-[18%]', 'h-[65%]'];
/**
 * Klasy dodane z konieczności danych: przycięcie długiej nazwy (prawdziwe
 * pozycje i firmy są dłuższe niż „Dell XPS 13”) i kolor spadku VAT.
 */
const KLASY_DODANE = ['truncate', 'min-w-0', 'text-destructive'];

const NOW = new Date('2026-10-23T08:00:00Z');
/** T9 (PLAN-PRAWDZIWE-DANE §9): odczyty całego Pulpitu na atrapie, zmierzone 23.10.2026. */
const READS_PULPITU = 24;
const ZWERYFIKOWANA: Proof = { verifiedAt: '2026-10-12T08:00:00Z', verifiedEnvironment: 'test' };

async function html(node: ReactNode): Promise<string> {
  const { prelude } = await prerenderToNodeStream(<>{node}</>);
  let out = '';
  for await (const chunk of prelude) out += String(chunk);
  return out;
}

function decode(text: string): string {
  return text
    .replaceAll('&amp;', '&')
    .replaceAll('&#x27;', "'")
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<')
    .replaceAll('&quot;', '"');
}

/**
 * Prerender strumieniuje: najpierw szkielet slotu (fallback `Suspense`),
 * potem gotową kartę podmienianą skryptem. Do porównania klas liczy się
 * karta, więc szkielety wypadają.
 */
function bezSzkieletow(markup: string): string {
  return markup.replace(/<!--\$\?--><template id="B:\d+"><\/template>[\s\S]*?<!--\/\$-->/g, '');
}

function klasy(markup: string): Set<string> {
  const out = new Set<string>();
  for (const m of bezSzkieletow(markup).matchAll(/class="([^"]*)"/g)) {
    for (const c of decode(m[1]!).split(/\s+/)) if (c) out.add(c);
  }
  return out;
}

function pulpit(tables: MemoryTables = {}) {
  state.ctx = {
    supabase: memoryClient(tables),
    tenantId: 'firma-a',
    user: { id: 'uzytkownik-1', email: null },
    role: 'owner',
  };
  return DashboardHomePage().then(html);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  state.proof = { verifiedAt: null, verifiedEnvironment: null };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Finanse (Z17 po zmianie Bartosza): stos Koszty + Zysk + VAT', () => {
  const props = adaptery.finanseProps({
    months: [
      { key: '2026-09', label: 'Wrz' },
      { key: '2026-10', label: 'Paź' },
    ],
    net: [30000, 8000],
    vat: [6900, 1840],
    costs: [11000, 9500.5],
    tryb: 'prawdziwe',
    verifiedAt: null,
  });

  it('zysk = przychód − koszty w każdym miesiącu; słupek = sprzedaż brutto', () => {
    const [wrz, paz] = props.months;
    expect(wrz).toMatchObject({ month: 'Wrz', revenue: 30000, result: 19000, profit: 19000, costs: 11000, vat: 6900 });
    expect(wrz!.costs + wrz!.profit + wrz!.vat).toBeCloseTo(30000 + 6900, 2);
    // Strata: zysk w słupku 0, strata w dymku (wynik ujemny).
    expect(paz).toMatchObject({ profit: 0, result: -1500.5, costs: 9500.5, vat: 1840 });
  });

  it('trzy serie w tych samych kolorach Finory, z prawdziwymi nazwami', () => {
    expect(financeChartConfig.profit).toEqual({ label: 'Zysk', color: 'var(--chart-2)' });
    expect(financeChartConfig.vat).toEqual({ label: 'VAT należny', color: 'var(--chart-3)' });
    expect(financeChartConfig.costs).toEqual({ label: 'Koszty', color: 'var(--chart-4)' });
    const src = readFileSync(join(process.cwd(), 'components/dashboard/finora/chart-finance.tsx'), 'utf8');
    const bars = [...src.matchAll(/<Bar dataKey='(\w+)' stackId='a'/g)].map((m) => m[1]);
    expect(bars).toEqual(['profit', 'vat', 'costs']);
    // Oś Y z danych, nie wpisany zakres 0–50.
    expect(src).not.toMatch(/domain=\{\[0, 50\]\}|ticks=\{\[/);
  });

  it('Raport: ten miesiąc, „Strata” przy stracie, średnia netto w podtytule', () => {
    expect(props.report.rows.map((r) => r.title)).toEqual(['Strata', 'Przychody netto', 'Koszty']);
    expect(props.report.rows[0]!.amount).toBe('1500,50 zł');
    expect(props.report.subTitle.replace(/\u00a0/g, ' ')).toBe('Ten miesiąc · średnio 30 tys. zł');
  });

  it('koszty z KSeF dopiero od weryfikacji (Z9): podpis „od DD.MM” w Raporcie i dymku', () => {
    const p = adaptery.finanseProps({
      months: [{ key: '2026-09', label: 'Wrz' }, { key: '2026-10', label: 'Paź' }],
      net: [1, 2], vat: [0, 0], costs: [0, 0], tryb: 'prawdziwe', verifiedAt: '2026-10-12T08:00:00Z',
    });
    expect(p.costsLabel).toBe('Koszty (KSeF od 12.10)');
    expect(p.report.rows[2]!.title).toBe('Koszty (KSeF od 12.10)');
  });
});

describe('Kafle: strzałka i znak liczone z danych', () => {
  const card = (changePct: number | null) =>
    renderToStaticMarkup(
      <StatisticsCard icon={<RiFileList3Line />} value="12" title="Faktury w KSeF" changePct={changePct} badgeContent="Ten miesiąc" />,
    );
  const gora = renderToStaticMarkup(<RiArrowUpSLine className="size-4" />);
  const dol = renderToStaticMarkup(<RiArrowDownSLine className="size-4" />);

  it('spadek: strzałka w dół i minus typograficzny', () => {
    const markup = card(-12.4);
    expect(markup).toContain('−12%');
    expect(markup).toContain(dol);
    expect(markup).not.toContain(gora);
  });

  it('wzrost: strzałka w górę', () => {
    const markup = card(5);
    expect(markup).toContain('+5%');
    expect(markup).toContain(gora);
  });

  it('brak poprzedniego miesiąca: „—” bez strzałki', () => {
    const markup = card(null);
    expect(markup).toContain('—');
    expect(markup).not.toContain(gora);
    expect(markup).not.toContain(dol);
  });
});

describe('Kolor trendu ze znaku (VAT należny)', () => {
  it('spadek w `text-destructive` ma kontrast tekstu ≥ 4,5:1 na karcie w obu motywach', () => {
    for (const theme of Object.values(themes)) {
      expect(contrast(color('destructive', theme), color('card', theme))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('adapter: spadek → destructive, wzrost → primary, brak podstawy → bez procentu', () => {
    const months = [{ label: 'Wrz' }, { label: 'Paź' }];
    expect(adaptery.vatNaleznyProps({ months, vatSeries: [1000, 800] }, 'prawdziwe')).toMatchObject({ side: '−20%', sideTone: 'destructive' });
    expect(adaptery.vatNaleznyProps({ months, vatSeries: [1000, 1100] }, 'prawdziwe')).toMatchObject({ side: '+10%', sideTone: 'primary' });
    expect(adaptery.vatNaleznyProps({ months, vatSeries: [0, 1100] }, 'prawdziwe')).toMatchObject({ side: null });
  });
});

describe('Pulpit przed weryfikacją KSeF: dane przykładowe przez te same loadery', () => {
  it('karty Finory z prawdziwymi podpisami, bez napisów szablonu', async () => {
    const markup = await pulpit();
    for (const text of [
      'Finanse', 'Ostatnie 7 miesięcy', 'Raport', 'Ten miesiąc', 'Zobacz przepływy',
      'Faktury w KSeF', 'Średnia faktura', 'Przychód netto', 'VAT należny', 'Ostatni rok',
      'Należności', 'Szczegóły', 'Najlepiej sprzedające się', 'Najwięksi klienci', 'Przykład',
    ]) {
      expect(markup).toContain(text);
    }
    for (const text of [
      'Przegląd roczny', 'Zobacz raport', 'Zamówienia', 'Zysk łącznie', 'Przychód łącznie', 'Wyświetlenia',
      'Odwiedzający', 'Najczęściej kupowane', 'Komputer', 'Tablet', 'Telefon', 'Samsung', 'Udostępnij',
      'Aktualizuj', 'Total Orders', 'View Report',
    ]) {
      expect(markup).not.toContain(text);
    }
    expect(markup).not.toMatch(/\$\d/);
    expect(markup).not.toContain('/images/avatars');
    expect(markup).toContain('href="/przeplywy"');
    expect(markup).toContain('href="/payments/overdue"');
  });

  it('siatka Finory bez zmian: te same kontenery col-span', async () => {
    const markup = await pulpit();
    expect(markup).toContain('class="grid grid-cols-6 gap-6"');
    expect(markup).toContain('class="col-span-full grid grid-cols-2 gap-6 lg:col-span-3 xl:col-span-2"');
    expect(markup).toMatch(/class="[^"]*grid grid-cols-1 gap-x-2 gap-y-4 lg:grid-cols-5 col-span-full xl:col-span-4"/);
    expect(markup).toMatch(/class="[^"]*gap-4 col-span-full lg:col-span-3 xl:col-span-2"/);
    expect(markup).toMatch(/class="[^"]*gap-x-2 gap-y-6 lg:flex-row col-span-full xl:col-span-4"/);
  });

  it('karta nie zmienia klas układu: ten sam zbiór klas co Pulpit Finory', async () => {
    const nowe = klasy(await pulpit());
    const stare = new Set(KLASY_FINORY);
    const brakujace = KLASY_FINORY.filter((c) => !nowe.has(c) && !KLASY_USUNIETE.includes(c));
    const dodatkowe = [...nowe].filter((c) => !stare.has(c) && !KLASY_DODANE.includes(c));
    expect(brakujace).toEqual([]);
    expect(dodatkowe).toEqual([]);
  });
});

describe('Pulpit po weryfikacji KSeF: prawdziwe dane', () => {
  beforeEach(() => {
    state.proof = ZWERYFIKOWANA;
  });

  it('pusta firma: bez znaczników przykładu, puste stany zamiast wymyślonych liczb', async () => {
    const markup = await pulpit({ ksef_history_sync: [] });
    expect(ZNACZNIKI_PRZYKLADU.filter((z) => markup.includes(z))).toEqual([]);
    expect(markup).toContain('Finanse');
    expect(markup).toContain('Pokażemy to, gdy wystawisz pierwszą fakturę');
    expect(markup).not.toContain('Pobieramy faktury z KSeF');
  });

  it('historia sprzedaży się pobiera (stan B): puste karty mówią „Pobieramy faktury z KSeF…”', async () => {
    const markup = await pulpit({
      ksef_history_sync: [{
        tenant_id: 'firma-a',
        environment: 'test',
        direction: 'outgoing',
        created_at: '2026-10-23T07:00:00Z',
        backfill_completed_at: null,
        client_paused_at: null,
        last_error_code: null,
      }],
    });
    expect(markup).toContain('Pobieramy faktury z KSeF…');
    expect(markup).not.toContain('Pokażemy to, gdy wystawisz pierwszą fakturę');
  });

  it('strona dynamiczna, bez stałych z szablonu i bez FLO', () => {
    const src = readFileSync(join(process.cwd(), 'app/(dashboard)/dashboard/page.tsx'), 'utf8');
    expect(src).toContain("export const dynamic = 'force-dynamic'");
    expect(src).toContain('kontekstDanych');
    expect(src).not.toMatch(/components\/flo\/|ff-flo-legacy|listProposals/);
    expect(src).not.toMatch(/visitorData|productsBySalesData =|StatisticsCardData/);
  });
});

describe('Odporność i koszt: karty czytają osobno', () => {
  beforeEach(() => {
    state.proof = ZWERYFIKOWANA;
  });

  function zweryfikowanaZDanymi(tables: ReturnType<typeof danePrzykladowe>, reads: Read[] = []) {
    state.ctx = {
      supabase: fakePostgrest(tables, reads),
      tenantId: DEMO_TENANT,
      user: { id: 'uzytkownik-1', email: null },
      role: 'owner',
    };
    return DashboardHomePage().then(html).then(bezSzkieletow);
  }

  it('faktura w EUR sprzed 10 miesięcy zabiera tylko karty, których okno ją obejmuje', async () => {
    const tables = danePrzykladowe(NOW, 'test');
    const wzor = tables.invoices!.find((f) => f.issue_date === '2025-12-15') ?? tables.invoices![0]!;
    tables.invoices!.push({ ...wzor, id: 'eur-1', currency: 'EUR', issue_date: '2025-12-15', sale_date: '2025-12-15' });

    const markup = await zweryfikowanaZDanymi(tables);
    const blad = 'Raport wstrzymany: faktura sprzedaży nie ma potwierdzonej waluty PLN.';
    // Finanse i VAT (wspólne okno 12 miesięcy) oraz rankingi (12 + poprzednie 12).
    expect(markup.split(blad).length - 1).toBe(3);
    // Kafle, przychód (5 miesięcy i rok wcześniej) i należności zostają.
    expect(markup).toContain('Faktury w KSeF');
    expect(markup).toContain('Średnia faktura');
    expect(markup).toContain('Przychód netto');
    expect(markup).toMatch(/\d+% zaległe/);
  });

  it('T9: liczba odczytów bazy na cały Pulpit — wzrost wymaga świadomej zmiany tej liczby', async () => {
    const reads: Read[] = [];
    await zweryfikowanaZDanymi(danePrzykladowe(NOW, 'test'), reads);
    // Poza RSC `cache()` nie deduplikuje, więc to górna granica; na produkcji
    // Finanse i VAT dzielą jedną serię sprzedaży (mniej odczytów).
    expect(reads.length).toBe(READS_PULPITU);
  });
});
