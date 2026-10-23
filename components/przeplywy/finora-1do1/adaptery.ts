import { POBIERAMY } from '@/components/dashboard/finora/adaptery';
import type {
  CashFlowChartData,
  CashFlowOperation,
  CashFlowSource,
  FlowBucket,
  MonthFlow,
  UpcomingInflow,
} from '@/lib/dashboard/cash-movements';
import type { TaxEstimate } from '@/lib/dashboard/tax-estimate';
import type { VatLimitOverview } from '@/lib/dashboard/vat-limit';
import type { TrybDanych } from '@/lib/demo/tryb-danych';
import { formatPlCompactMoney, formatPlInt, formatPlMoney, formatPlPercentChange } from '@/lib/format/pl';
import { INFLOW_EMPTY, INFLOW_EMPTY_TITLE, INFLOW_NOTE } from '@/lib/dashboard/inflow-labels';
import { plural } from '@/lib/i18n/plural';

/**
 * Adaptery Przepływów (PLAN-PRAWDZIWE-DANE §5.3, §6.2, E6): wynik loaderów
 * `lib/dashboard/*` → propsy kart Finory (`finora-1do1/*`). Jeden adapter
 * dla obu trybów — dane przykładowe (atrapa bazy) i prawdziwe mają ten sam
 * kształt aż do propsów; tryb decyduje tylko o linkach (`href: null`
 * w przykładzie — demo nie ma prawdziwych dokumentów, §11 pkt 6) i o tekście
 * pustego stanu („Pobieramy faktury z KSeF…” w stanie B).
 *
 * Zasada Bartosza 23.10.2026: karty IDENTYCZNE rozmiarowo i designowo, więc
 * adaptery dają tylko napisy w istniejących miejscach i o długości dawnych
 * napisów szablonu. Liczba jest prawdziwa albo jej nie ma („—”), a założenie
 * jest nazwane w istniejącym podpisie: wpływy „według terminów płatności”
 * (E11, decyzja D-W: klient nic nie oznacza), koszty z KSeF przed końcem
 * historii zakupów — „KSeF od DD.MM”; dłuższe wyjaśnienie idzie do dymku
 * (`title`).
 * Formatowanie robi serwer; do kart klienckich idą napisy i liczby.
 */

const zl = (n: number) => `${formatPlMoney(n)} zł`;
/** Kwota bez groszy jak w szablonie („34 600 zł”). */
const zlCale = (n: number) => `${formatPlInt(Math.round(n))} zł`;

const synchronizacja = (tryb: TrybDanych) => tryb === 'synchronizacja';
const prawdziwe = (tryb: TrybDanych) => tryb !== 'przyklad';

/** „2026-10-21” → „21.10.2026” (bez `Date`, więc bez strefy). */
function dataPl(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/** „2026-10-21” → „21.10”. */
function dzienMiesiac(iso: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[2]}.${m[1]}` : iso;
}

/**
 * Kierunek pieniędzy, nie dokumentu: korekta kosztu in minus to zwrot (na
 * plus), korekta sprzedaży in minus — oddanie pieniędzy (na minus).
 */
function wplywa(op: Pick<CashFlowOperation, 'direction' | 'amount'>): boolean {
  return op.direction === 'in' ? op.amount >= 0 : op.amount < 0;
}

// ─── Przepływy pieniężne (wykres) ─────────────────────────────────────────

export type ZakladkaWykresu = 'weekly' | 'monthly' | 'yearly';

export interface WykresDane {
  subTitle: string;
  subTitleHint: string;
  tabs: Record<ZakladkaWykresu, FlowBucket[]>;
}

/**
 * Podtytuł wykresu (E11, D-W): wpływy według terminów płatności, koszty
 * brutto — nie dłuższy od dawnego „Oznaczone wpłaty i koszty brutto”
 * (32 znaki; w Outfit węższy). Pełne zdanie w dymku podtytułu
 * (`PODTYTUL_WYKRESU_DYMEK`).
 */
export const PODTYTUL_WYKRESU = 'Terminy płatności, koszty brutto';
export const PODTYTUL_WYKRESU_DYMEK =
  'Wpływy z faktur sprzedaży według terminów płatności (prawdziwa zapłata ma pierwszeństwo, bez terminu — dzień wystawienia); koszty brutto według daty dokumentu';

export function wykresProps(chart: CashFlowChartData, tryb: TrybDanych): WykresDane {
  const empty = [...chart.week, ...chart.month, ...chart.year].every((b) => b.inflowCount === 0 && b.outflow === 0);
  return {
    subTitle: empty && synchronizacja(tryb) ? POBIERAMY : PODTYTUL_WYKRESU,
    subTitleHint: PODTYTUL_WYKRESU_DYMEK,
    tabs: { weekly: chart.week, monthly: chart.month, yearly: chart.year },
  };
}

// ─── Kafle „Wpłynęło / Koszty w tym miesiącu” ─────────────────────────────

export interface KafelMiesiacaDane {
  amount: string;
  amountTitle: string;
  changePercentage: string;
  comparison: string;
  chartData: { label: string; value: number }[];
}

/** Dawny podpis plakietki — zostaje, gdy procent ma podstawę. */
const WOBEC = 'wobec poprzedniego miesiąca';

/**
 * Krzywa narastająca dzień po dniu. 1. dnia miesiąca `daily` ma jeden
 * punkt, z którego wykres obszarowy nic nie rysuje — zero na początku.
 */
function krzywa(flow: MonthFlow): KafelMiesiacaDane['chartData'] {
  const points = flow.daily.map((p) => ({ label: dzienMiesiac(p.date), value: p.value }));
  if (points.length === 1) return [{ label: points[0]!.label, value: 0 }, ...points];
  return points;
}

/**
 * „Wpływy w tym miesiącu (wg terminów)”: wpływy od 1. dnia miesiąca do dziś
 * według terminów płatności (E11, D-W; termin dziś — jeszcze spodziewany);
 * bez żadnego wpływu — „—” i pusty stan, nie „0 zł”.
 */
export function wplywyMiesiacaProps(flow: MonthFlow, tryb: TrybDanych): KafelMiesiacaDane {
  const brak = flow.count === 0;
  return {
    amount: brak ? '—' : zlCale(flow.amount),
    amountTitle: brak ? INFLOW_EMPTY_TITLE : `${zl(flow.amount)} · ${INFLOW_NOTE}`,
    changePercentage: brak || flow.changePct === null ? '—' : formatPlPercentChange(flow.changePct),
    comparison: brak ? (synchronizacja(tryb) ? POBIERAMY : INFLOW_EMPTY) : WOBEC,
    chartData: krzywa(flow),
  };
}

/** „Koszty w tym miesiącu (brutto)”: dokumenty kosztowe według daty dokumentu. */
export function kosztyMiesiacaProps(flow: MonthFlow, tryb: TrybDanych, notaKsef = ''): KafelMiesiacaDane {
  return {
    amount: zlCale(flow.amount),
    amountTitle: `${zl(flow.amount)} brutto, według daty dokumentu${notaKsef}`,
    changePercentage: flow.changePct === null ? '—' : formatPlPercentChange(flow.changePct),
    comparison: flow.count === 0 && synchronizacja(tryb) ? POBIERAMY : WOBEC,
    chartData: krzywa(flow),
  };
}

// ─── Odłóż na podatek / Limit zwolnienia z VAT (pierścień) ────────────────

export interface PierscienDane {
  title: string;
  subtitle: string;
  /** 0–100; 100 = pełny łuk. */
  pct: number;
  /** Trzy wiersze w środku pierścienia (rozmiary jak w szablonie: procent, kwota, podpis). */
  lines: [string, string, string];
  caption: string;
}

/**
 * Płatnik VAT (Z10): szacunek PIT od 1 stycznia, pełny łuk (nie znamy
 * kwoty już odłożonej). W środku stawka, kwota i „do odłożenia” — te same
 * trzy wiersze i rozmiary co „68% / 6,8 tys. zł / z celu”.
 */
export function podatekProps(estimate: TaxEstimate, tryb: TrybDanych): PierscienDane {
  return {
    title: 'Odłóż na podatek',
    subtitle: estimate.amount === 0 && synchronizacja(tryb)
      ? POBIERAMY
      : estimate.fullYear
        ? 'Szacunek PIT od 1 stycznia'
        : estimate.label.replace('Szac. podatek', 'Szacunek PIT'),
    pct: 100,
    lines: ['19%', formatPlCompactMoney(estimate.amount), 'do odłożenia'],
    caption: 'Szacunek: liniowy, bez ZUS',
  };
}

const procent = (pct: number) => Math.max(0, Math.floor(pct));

/**
 * Firma zwolniona z VAT (art. 113): wykorzystanie limitu i prognoza. Bez
 * daty rozpoczęcia działalności procent od pełnego limitu to dolna granica
 * („≥”) — limit proporcjonalny nie jest wyższy niż pełny.
 */
export function limitProps(o: VatLimitOverview, tryb: TrybDanych): PierscienDane {
  const subtitle = o.used === 0 && synchronizacja(tryb) ? POBIERAMY : 'Sprzedaż od 1 stycznia';
  if (o.limit) {
    const l = o.limit;
    return {
      title: 'Limit zwolnienia z VAT',
      subtitle,
      pct: Math.min(100, Math.max(0, l.pct)),
      lines: [`${procent(l.pct)}%`, formatPlCompactMoney(o.used), `z ${formatPlCompactMoney(l.effectiveLimit)}`],
      caption: l.level === 100
        ? 'Limit przekroczony — sprawdź VAT'
        : l.remaining === 0
          ? 'Limit wykorzystany w całości'
          : l.crossesOn
            ? `Limit skończy się ok. ${dataPl(l.crossesOn)}`
            : 'Limit wystarczy do końca roku',
    };
  }
  const pct = o.lowerBound?.pct ?? 0;
  return {
    title: 'Limit zwolnienia z VAT',
    subtitle,
    pct: Math.min(100, Math.max(0, pct)),
    lines: [`≥${procent(pct)}%`, formatPlCompactMoney(o.used), `z ${formatPlCompactMoney(o.annualLimit)}`],
    caption: o.lowerBound?.level === 100 ? 'Pełny limit przekroczony' : 'Uzupełnij datę rozpoczęcia firmy',
  };
}

// ─── Największe źródła przepływów ─────────────────────────────────────────

export interface ZrodloDane {
  sourceName: string;
  sourceType: string;
  amount: string;
  amountTitle: string;
  share: number;
  direction: 'in' | 'out';
  href: string | null;
}

export interface ListaDane<T> {
  items: T[];
  /** Tekst pustej listy (karta bez pozycji). */
  empty: string;
}

const OKRES_12 = 'w ostatnich 12 miesiącach';

export function zrodlaProps(sources: readonly CashFlowSource[], tryb: TrybDanych): ListaDane<ZrodloDane> {
  return {
    items: sources.map((s) => ({
      sourceName: s.name,
      // Wpływ to faktura sprzedaży według terminu (E11), nie oznaczona wpłata.
      sourceType: s.direction === 'in'
        ? `${s.consumers ? 'B2C' : 'Klient'} · ${s.count} ${plural(s.count, ['faktura', 'faktury', 'faktur'])}`
        : `Dostawca · ${s.count} ${plural(s.count, ['dokument', 'dokumenty', 'dokumentów'])}`,
      amount: zlCale(s.amount),
      amountTitle: s.direction === 'in' ? `${zl(s.amount)} ${OKRES_12}, ${INFLOW_NOTE}` : `${zl(s.amount)} ${OKRES_12}`,
      share: s.share,
      direction: s.direction,
      // Konsumenci nie mają karty kontrahenta.
      href: prawdziwe(tryb) && !s.consumers ? '/contractors' : null,
    })),
    empty: synchronizacja(tryb) ? POBIERAMY : 'Brak wpłat i kosztów w 12 miesiącach',
  };
}

// ─── Spodziewane wpływy (dawne „Nadchodzące rachunki”) ────────────────────

export interface SpodziewanyDane {
  title: string;
  titleHint: string;
  dueDate: string;
  amount: string;
  href: string | null;
}

/**
 * E11 (D-W): faktury sprzedaży z terminem w 30 dni, bez prawdziwej zapłaty,
 * kwota = reszta do zapłaty. Podtytuł karty („Następne 30 dni”) nie ma
 * miejsca na zdanie — idzie do dymku podtytułu i czytnika ekranu.
 */
export const SPODZIEWANE_NOTA =
  `Faktury sprzedaży z terminem płatności w najbliższych 30 dniach, bez potwierdzonej zapłaty — ${INFLOW_NOTE}.`;

function termin(daysLeft: number): string {
  if (daysLeft === 0) return 'Termin dziś';
  if (daysLeft === 1) return 'Termin jutro';
  return `Termin za ${daysLeft} dni`;
}

export function wplywySpodziewaneProps(
  items: readonly UpcomingInflow[],
  tryb: TrybDanych,
): ListaDane<SpodziewanyDane> & { note: string } {
  return {
    items: items.map((i) => ({
      title: i.name,
      titleHint: i.internalNumber ? `${i.name} · ${i.internalNumber}` : i.name,
      dueDate: termin(i.daysLeft),
      amount: zl(i.amount),
      href: prawdziwe(tryb) ? `/invoices/${i.id}` : null,
    })),
    empty: synchronizacja(tryb) ? POBIERAMY : 'Brak faktur z terminem w 30 dni',
    note: SPODZIEWANE_NOTA,
  };
}

// ─── Ostatnia aktywność ───────────────────────────────────────────────────

export interface AktywnoscDane {
  /** Rodzaj dokumentu (ikona): wpłata za fakturę albo dokument kosztowy. */
  rodzaj: 'wplata' | 'koszt';
  label: string;
  subLabel: string;
  subLabelTitle: string;
  amount: string;
  direction: 'in' | 'out';
  href: string | null;
}

/**
 * Skąd data w drugim wierszu (E11, D-W): prawdziwa zapłata („Wpłata”), termin
 * płatności („Termin”) albo — faktura bez terminu — dzień wystawienia.
 */
const PODSTAWA: Record<CashFlowOperation['status'], { krotko: string; dymek: string }> = {
  paid: { krotko: 'Wpłata', dymek: 'Wpłata' },
  due: { krotko: 'Termin', dymek: 'Termin płatności' },
  issued: { krotko: 'Wystawiona', dymek: 'Bez terminu płatności, wystawiona' },
  reviewed: { krotko: 'Koszt', dymek: 'Koszt' },
  pending: { krotko: 'Koszt', dymek: 'Koszt' },
  ksef: { krotko: 'Koszt', dymek: 'Koszt' },
};

export function aktywnoscProps(ops: readonly CashFlowOperation[], tryb: TrybDanych): ListaDane<AktywnoscDane> {
  return {
    items: ops.map((op) => {
      const podstawa = op.direction === 'in' ? PODSTAWA[op.status] : PODSTAWA.reviewed;
      return {
        rodzaj: op.direction === 'in' ? 'wplata' : 'koszt',
        label: op.counterparty,
        subLabel: `${podstawa.krotko} · ${dataPl(op.date)}`,
        subLabelTitle: [podstawa.dymek, op.reference, dataPl(op.date)].filter(Boolean).join(' · '),
        amount: zl(Math.abs(op.amount)),
        direction: wplywa(op) ? 'in' : 'out',
        href: prawdziwe(tryb) ? op.href : null,
      };
    }),
    empty: synchronizacja(tryb) ? POBIERAMY : 'Brak wpłat i kosztów w 12 miesiącach',
  };
}

// ─── Tabela operacji ──────────────────────────────────────────────────────

export interface WierszTabeli {
  id: string;
  /** Inicjały zamiast nieistniejących awatarów (ten sam rozmiar). */
  initials: string;
  counterparty: string;
  /** Druga linia: „NIP … · numer dokumentu”. */
  detail: string;
  category: string;
  direction: 'in' | 'out';
  /** Kwota bez znaku; znak i kolor z `direction` (kierunek pieniędzy). */
  amount: number;
  status: CashFlowOperation['status'];
  /** „Otwórz fakturę” / „Otwórz wydatek” w menu wiersza. */
  openLabel: string;
  href: string | null;
}

/** „Alfa sp. z o.o.” → „AL”, „Beta Paliwa” → „BP”. */
export function inicjaly(name: string): string {
  const words = name.split(/\s+/).filter((w) => /^\p{Lu}/u.test(w));
  if (words.length >= 2) return `${words[0]![0]}${words[1]![0]}`;
  const letters = (words[0] ?? name).replace(/[^\p{L}]/gu, '');
  return letters.slice(0, 2).toUpperCase() || '—';
}

export function tabelaProps(
  ops: readonly CashFlowOperation[],
  tryb: TrybDanych,
): { rows: WierszTabeli[]; empty: string } {
  return {
    rows: ops.map((op) => ({
      id: op.id,
      initials: inicjaly(op.counterparty),
      counterparty: op.counterparty,
      detail: [op.nip ? `NIP ${op.nip}` : null, op.reference].filter(Boolean).join(' · ') || '—',
      // Kategoria wpisana przez klienta małą literą — wielka na początku, jak dawne `capitalize`.
      category: op.category.charAt(0).toLocaleUpperCase('pl-PL') + op.category.slice(1),
      direction: wplywa(op) ? 'in' : 'out',
      amount: Math.abs(op.amount),
      status: op.status,
      // Koszt z faktury zakupu z KSeF bez wydatku (E10) otwiera fakturę.
      openLabel: op.direction === 'in' || op.status === 'ksef' ? 'Otwórz fakturę' : 'Otwórz wydatek',
      href: prawdziwe(tryb) ? op.href : null,
    })),
    empty: synchronizacja(tryb) ? POBIERAMY : 'Brak wyników.',
  };
}
