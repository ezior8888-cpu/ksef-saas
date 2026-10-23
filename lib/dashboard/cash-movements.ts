import type { CostEntry } from '@/lib/dashboard/costs';
import { costHref, isKsefInvoiceCost } from '@/lib/dashboard/ksef-invoice-cost';
import type { InflowEntry } from '@/lib/dashboard/inflows';
import type { Receivables } from '@/lib/dashboard/receivables';
import { shortCompanyName } from '@/lib/format/company-name';
import { addDaysToIsoDate } from '@/lib/format/warsaw-date';
import { roundToCents } from '@/lib/xml/invoice-calculator';

/**
 * Czyste agregaty kart `/przeplywy` (plan Finora §5 P2) na wynikach
 * `getInflows` (wpływy, §2.4 pkt 14) i `getCostsWithKsefPurchases` (koszty
 * brutto: wydatki i faktury zakupu z KSeF bez wydatku, E10) oraz
 * `getReceivables` (§2.4 pkt 11). Bez własnego odczytu bazy: każda karta
 * liczy z tych samych zbiorów, więc liczby się nie rozjeżdżają.
 *
 * Wpływ = `paid_amount` faktury w dniu oznaczenia wpłaty. Wydatek = brutto
 * dokumentu kosztowego (`CostEntry.outflow`) w dniu jego wystawienia —
 * koszty nie mają w bazie dnia zapłaty (N7).
 *
 * Wszystkie daty to RRRR-MM-DD w Europe/Warsaw; „dziś” przychodzi z
 * `todayInWarsaw` wywołującego (§2.4 pkt 10).
 */

// ─── Kalendarz (arytmetyka UTC na polach daty, bez strefy procesu) ────────

function utcDate(iso: string): Date {
  return new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))));
}

function addDays(iso: string, days: number): string {
  return addDaysToIsoDate(iso, days) ?? iso;
}

function monthKeyOf(year: number, monthIndex: number): string {
  const d = new Date(Date.UTC(year, monthIndex, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** „Kwi” — ten sam podpis co w `getSalesSeries`. */
function shortMonthLabel(monthKey: string): string {
  const raw = utcDate(`${monthKey}-01`)
    .toLocaleDateString('pl-PL', { month: 'short', timeZone: 'UTC' })
    .replace(/\./g, '')
    .trim();
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** „kwiecień 2026”. */
function longMonthLabel(monthKey: string): string {
  return utcDate(`${monthKey}-01`).toLocaleDateString('pl-PL', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** „05.10” z RRRR-MM-DD. */
function dayMonth(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
}

/** „05.10.2026” z RRRR-MM-DD (bez Date, więc bez strefy). */
export function formatPlDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/** Poniedziałek tygodnia, w którym leży `iso`. */
function mondayOf(iso: string): string {
  const dow = utcDate(iso).getUTCDay(); // 0 = niedziela
  return addDays(iso, -((dow + 6) % 7));
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((utcDate(toIso).getTime() - utcDate(fromIso).getTime()) / 86_400_000);
}

function cents(value: number): number {
  return roundToCents(value) || 0;
}

// ─── Wykres „Wpływy i wydatki” (Finora `chart-cash-flow.tsx`) ─────────────

export interface FlowBucket {
  key: string;
  /** Podpis osi. */
  label: string;
  /** Podpis w dymku: pełny okres. */
  period: string;
  /** Wpływy, PLN. */
  inflow: number;
  /** Wydatki brutto, PLN. */
  outflow: number;
  /** Liczba wpłat w okresie — 0 znaczy „brak oznaczonych wpłat”, nie „0 zł”. */
  inflowCount: number;
}

export interface CashFlowChartData {
  /** Siedem tygodni (pn–nd) z bieżącym. */
  week: FlowBucket[];
  /** Siedem miesięcy kalendarzowych z bieżącym. */
  month: FlowBucket[];
  /** Lata od pierwszego z danymi (najwyżej pięć) do bieżącego. */
  year: FlowBucket[];
}

export const CASH_FLOW_CHART_WEEKS = 7;
export const CASH_FLOW_CHART_MONTHS = 7;
export const CASH_FLOW_CHART_YEARS = 5;

interface Movement {
  date: string;
  inflow: number;
  outflow: number;
  isInflow: boolean;
}

function movementsOf(inflows: readonly InflowEntry[], costs: readonly CostEntry[]): Movement[] {
  return [
    ...inflows.map((i) => ({ date: i.paidOn, inflow: i.amount, outflow: 0, isInflow: true })),
    ...costs.map((c) => ({ date: c.issueDate, inflow: 0, outflow: c.outflow, isInflow: false })),
  ];
}

function fill(
  buckets: Array<Omit<FlowBucket, 'inflow' | 'outflow' | 'inflowCount'>>,
  movements: readonly Movement[],
  bucketOf: (date: string) => string | null,
): FlowBucket[] {
  const sums = new Map(buckets.map((b) => [b.key, { inflow: 0, outflow: 0, inflowCount: 0 }]));
  for (const m of movements) {
    const key = bucketOf(m.date);
    const sum = key === null ? undefined : sums.get(key);
    if (!sum) continue;
    sum.inflow += m.inflow;
    sum.outflow += m.outflow;
    if (m.isInflow) sum.inflowCount += 1;
  }
  return buckets.map((b) => {
    const sum = sums.get(b.key)!;
    return { ...b, inflow: cents(sum.inflow), outflow: cents(sum.outflow), inflowCount: sum.inflowCount };
  });
}

/**
 * Trzy widoki przełącznika Tydzień / Miesiąc / Rok. Ruchy spoza okien
 * są pomijane (wywołujący czyta zakres z zapasem).
 */
export function buildCashFlowChart(
  inflows: readonly InflowEntry[],
  costs: readonly CostEntry[],
  today: string,
): CashFlowChartData {
  const movements = movementsOf(inflows, costs);
  const year = Number(today.slice(0, 4));
  const monthIndex = Number(today.slice(5, 7)) - 1;

  const thisMonday = mondayOf(today);
  const weeks = Array.from({ length: CASH_FLOW_CHART_WEEKS }, (_, i) => {
    const start = addDays(thisMonday, -7 * (CASH_FLOW_CHART_WEEKS - 1 - i));
    const end = addDays(start, 6);
    return { key: start, label: dayMonth(start), period: `${dayMonth(start)}–${formatPlDate(end)}` };
  });
  const firstMonday = weeks[0]!.key;
  const week = fill(weeks, movements, (date) => {
    if (date < firstMonday || date > addDays(thisMonday, 6)) return null;
    return mondayOf(date);
  });

  const months = Array.from({ length: CASH_FLOW_CHART_MONTHS }, (_, i) => {
    const key = monthKeyOf(year, monthIndex - (CASH_FLOW_CHART_MONTHS - 1 - i));
    return { key, label: shortMonthLabel(key), period: longMonthLabel(key) };
  });
  const month = fill(months, movements, (date) => date.slice(0, 7));

  const years = Array.from({ length: CASH_FLOW_CHART_YEARS }, (_, i) => {
    const key = String(year - (CASH_FLOW_CHART_YEARS - 1 - i));
    return { key, label: key, period: `rok ${key}` };
  });
  const allYears = fill(years, movements, (date) => date.slice(0, 4));
  // Lata przed pierwszym ruchem to nie „zero”, tylko czas przed FaktWay —
  // zostaje pierwszy rok z danymi i każdy następny (bieżący zawsze).
  const firstWithData = allYears.findIndex((b) => b.inflowCount > 0 || b.outflow !== 0);
  const yearBuckets = firstWithData === -1 ? allYears.slice(-1) : allYears.slice(firstWithData);

  return { week, month, year: yearBuckets };
}

// ─── Kafle „Wpłynęło / Wydano w tym miesiącu” (Finora `statistics-area-stat-card.tsx`) ─

export interface MonthFlow {
  /** Suma bieżącego miesiąca, PLN. */
  amount: number;
  /** Suma poprzedniego miesiąca, PLN. */
  prevAmount: number;
  /** Liczba ruchów w bieżącym miesiącu (wpłat albo dokumentów kosztowych). */
  count: number;
  /** Zmiana vs poprzedni miesiąc w procentach; `null`, gdy poprzedni ≤ 0. */
  changePct: number | null;
  /**
   * Suma narastająca od 1. dnia miesiąca do dziś (albo do późniejszego
   * dokumentu w tym miesiącu) — punkty wykresu; ostatni = `amount`.
   */
  daily: Array<{ date: string; value: number }>;
}

function monthFlow(entries: ReadonlyArray<{ date: string; amount: number }>, today: string): MonthFlow {
  const monthKey = today.slice(0, 7);
  const year = Number(today.slice(0, 4));
  const monthIndex = Number(today.slice(5, 7)) - 1;
  const prevKey = monthKeyOf(year, monthIndex - 1);

  // Cały miesiąc, jak słupek bieżącego miesiąca na wykresie i dawny kafel
  // „Wydatki miesiąca” — dokument kosztowy z datą z dalszej części miesiąca
  // też się liczy.
  const inMonth = entries.filter((e) => e.date.slice(0, 7) === monthKey);
  const amount = cents(inMonth.reduce((s, e) => s + e.amount, 0));
  const prevAmount = cents(entries.filter((e) => e.date.slice(0, 7) === prevKey).reduce((s, e) => s + e.amount, 0));

  const byDay = new Map<string, number>();
  for (const e of inMonth) byDay.set(e.date, (byDay.get(e.date) ?? 0) + e.amount);
  // Wykres do dziś, a gdy w miesiącu jest dokument z późniejszą datą — do niego,
  // żeby ostatni punkt równał się kwocie kafla.
  const lastDay = inMonth.reduce((last, e) => (e.date > last ? e.date : last), today);
  const daily: MonthFlow['daily'] = [];
  let running = 0;
  for (let day = `${monthKey}-01`; day <= lastDay; day = addDays(day, 1)) {
    running += byDay.get(day) ?? 0;
    daily.push({ date: day, value: cents(running) });
  }

  return {
    amount,
    prevAmount,
    count: inMonth.length,
    changePct: prevAmount > 0 ? ((amount - prevAmount) / prevAmount) * 100 : null,
    daily,
  };
}

export function monthFlows(
  inflows: readonly InflowEntry[],
  costs: readonly CostEntry[],
  today: string,
): { inflow: MonthFlow; outflow: MonthFlow } {
  return {
    inflow: monthFlow(inflows.map((i) => ({ date: i.paidOn, amount: i.amount })), today),
    outflow: monthFlow(costs.map((c) => ({ date: c.issueDate, amount: c.outflow })), today),
  };
}

// ─── „Skąd i dokąd płyną pieniądze” (Finora `widget-top-cash-flow-sources.tsx`) ─

export interface CashFlowSource {
  key: string;
  name: string;
  direction: 'in' | 'out';
  consumers: boolean;
  nip: string | null;
  /** PLN. */
  amount: number;
  /** Liczba wpłat albo dokumentów kosztowych. */
  count: number;
  /** Udział w sumie swojej strony (wpływy albo wydatki), procent całkowity. */
  share: number;
}

const CONSUMERS_NAME = 'Konsumenci';
const UNNAMED_BUYER = 'Nabywca bez nazwy';
const UNNAMED_SELLER = 'Dostawca bez nazwy';

interface Group {
  key: string;
  direction: 'in' | 'out';
  consumers: boolean;
  nip: string | null;
  amount: number;
  count: number;
  name: string;
  newest: { date: string; id: string };
}

function sellerIdentity(cost: CostEntry): { key: string; nip: string | null } {
  const nip = (cost.sellerNip ?? '').replace(/\D/g, '');
  if (nip !== '') return { key: `nip:${nip}`, nip };
  if (cost.sellerName) return { key: `name:${cost.sellerName.trim().toLowerCase()}`, nip: null };
  return { key: `expense:${cost.id}`, nip: null };
}

function isNewer(a: { date: string; id: string }, b: { date: string; id: string }): boolean {
  return a.date > b.date || (a.date === b.date && a.id > b.id);
}

/**
 * Najwięksi klienci (+, opłacone faktury według nabywcy) i dostawcy (−,
 * wydatki brutto według `seller_nip`) razem, malejąco po kwocie. Grupa
 * z sumą ≤ 0 (np. sama korekta in minus) nie jest źródłem pieniędzy.
 */
export function topCashFlowSources(
  inflows: readonly InflowEntry[],
  costs: readonly CostEntry[],
  limit = 5,
): CashFlowSource[] {
  const groups = new Map<string, Group>();
  const add = (
    groupKey: string,
    base: Omit<Group, 'amount' | 'count' | 'newest' | 'name'>,
    name: string,
    amount: number,
    stamp: { date: string; id: string },
  ) => {
    const existing = groups.get(groupKey);
    if (!existing) {
      groups.set(groupKey, { ...base, amount, count: 1, name, newest: stamp });
      return;
    }
    existing.amount += amount;
    existing.count += 1;
    if (isNewer(stamp, existing.newest)) {
      existing.newest = stamp;
      existing.name = name;
    }
  };

  for (const inflow of inflows) {
    const name = inflow.consumers ? CONSUMERS_NAME : shortCompanyName(inflow.buyerName ?? UNNAMED_BUYER);
    add(
      `in:${inflow.buyerKey}`,
      { key: `in:${inflow.buyerKey}`, direction: 'in', consumers: inflow.consumers, nip: inflow.buyerNip },
      name,
      inflow.amount,
      { date: inflow.paidOn, id: inflow.id },
    );
  }
  for (const cost of costs) {
    const identity = sellerIdentity(cost);
    add(
      `out:${identity.key}`,
      { key: `out:${identity.key}`, direction: 'out', consumers: false, nip: identity.nip },
      shortCompanyName(cost.sellerName ?? UNNAMED_SELLER),
      cost.outflow,
      { date: cost.issueDate, id: cost.id },
    );
  }

  const positive = [...groups.values()]
    .map((g) => ({ ...g, amount: cents(g.amount) }))
    .filter((g) => g.amount > 0);
  const sideTotal = { in: 0, out: 0 };
  for (const g of positive) sideTotal[g.direction] += g.amount;

  return positive
    .sort((a, b) => b.amount - a.amount || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .slice(0, limit)
    .map((g) => ({
      key: g.key,
      name: g.name,
      direction: g.direction,
      consumers: g.consumers,
      nip: g.nip,
      amount: g.amount,
      count: g.count,
      share: sideTotal[g.direction] > 0 ? Math.round((g.amount / sideTotal[g.direction]) * 100) : 0,
    }));
}

// ─── „Spodziewane wpływy” (Finora `widget-upcoming-bills.tsx`) ─────────────

export interface UpcomingInflow {
  id: string;
  name: string;
  internalNumber: string | null;
  dueDate: string;
  /** 0 = termin dziś. */
  daysLeft: number;
  /** `outstandingOf`, PLN. */
  amount: number;
}

export const UPCOMING_DAYS = 30;

/**
 * Należności (§2.4 pkt 11, wynik `getReceivables`) z terminem od dziś do
 * dziś + `days` włącznie, najbliższy termin pierwszy. Faktury po terminie
 * i bez terminu tu nie trafiają — to karta „Zaległości”.
 */
export function upcomingInflows(
  receivables: Pick<Receivables, 'byInvoice'>,
  today: string,
  days = UPCOMING_DAYS,
  limit = 5,
): { items: UpcomingInflow[]; count: number; total: number } {
  const last = addDays(today, days);
  const all = receivables.byInvoice
    .filter((inv) => inv.paymentDueDate !== null && inv.paymentDueDate >= today && inv.paymentDueDate <= last)
    .map((inv) => ({
      id: inv.id,
      name: shortCompanyName(inv.buyerName ?? UNNAMED_BUYER),
      internalNumber: inv.internalNumber,
      dueDate: inv.paymentDueDate!,
      daysLeft: daysBetween(today, inv.paymentDueDate!),
      amount: inv.outstanding,
    }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    items: all.slice(0, limit),
    count: all.length,
    total: cents(all.reduce((s, i) => s + i.amount, 0)),
  };
}

// ─── „Ostatnie operacje” i „Wszystkie operacje” ───────────────────────────

/**
 * Wpłata „paid”; wydatek „reviewed” / „pending” (opisany albo do akceptacji);
 * faktura zakupu z KSeF bez wydatku „ksef” — nie ma jej w Wydatkach, więc nie
 * jest ani zatwierdzona, ani do akceptacji (E10).
 */
export type OperationStatus = 'paid' | 'reviewed' | 'pending' | 'ksef';

export interface CashFlowOperation {
  /** Unikalny w liście: `in:<id faktury>` albo `out:<id wydatku lub faktury zakupu>`. */
  id: string;
  direction: 'in' | 'out';
  /** RRRR-MM-DD: dzień wpłaty albo dzień wystawienia dokumentu kosztowego. */
  date: string;
  counterparty: string;
  nip: string | null;
  /** Numer faktury albo dokumentu kosztowego. */
  reference: string | null;
  category: string;
  status: OperationStatus;
  /** PLN ze znakiem dokumentu (korekta kosztu in minus jest ujemna). */
  amount: number;
  href: string;
}

const INFLOW_CATEGORY: Record<string, string> = {
  regular: 'Sprzedaż',
  advance: 'Zaliczka',
  final: 'Faktura końcowa',
};

/** Wpływy i wydatki razem, od najnowszego dnia; w dniu wpływy przed wydatkami. */
export function cashFlowOperations(
  inflows: readonly InflowEntry[],
  costs: readonly CostEntry[],
): CashFlowOperation[] {
  const rows: CashFlowOperation[] = [
    ...inflows.map((i): CashFlowOperation => ({
      id: `in:${i.id}`,
      direction: 'in',
      date: i.paidOn,
      counterparty: i.consumers && !i.buyerName ? CONSUMERS_NAME : shortCompanyName(i.buyerName ?? UNNAMED_BUYER),
      nip: i.buyerNip,
      reference: i.internalNumber,
      category: INFLOW_CATEGORY[i.invoiceKind ?? ''] ?? 'Sprzedaż',
      status: 'paid',
      amount: i.amount,
      href: `/invoices/${i.id}`,
    })),
    ...costs
      .filter((c) => c.outflow !== 0)
      .map((c): CashFlowOperation => ({
        id: `out:${c.id}`,
        direction: 'out',
        date: c.issueDate,
        counterparty: shortCompanyName(c.sellerName ?? UNNAMED_SELLER),
        nip: c.sellerNip,
        reference: c.documentNumber,
        category: c.categoryLabel ?? 'Bez kategorii',
        status: isKsefInvoiceCost(c) ? 'ksef' : c.isReviewed ? 'reviewed' : 'pending',
        amount: c.outflow,
        href: costHref(c),
      })),
  ];
  return rows.sort((a, b) =>
    b.date.localeCompare(a.date)
    || (a.direction === b.direction ? 0 : a.direction === 'in' ? -1 : 1)
    || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

/** Pierwszy dzień miesiąca po `today` (RRRR-MM-DD). */
export function nextMonthStart(today: string): string {
  return `${monthKeyOf(Number(today.slice(0, 4)), Number(today.slice(5, 7)))}-01`;
}

/** 1 stycznia roku sprzed `years − 1` lat (okno widoku „Rok”). */
export function yearsWindowStart(today: string, years = CASH_FLOW_CHART_YEARS): string {
  return `${Number(today.slice(0, 4)) - (years - 1)}-01-01`;
}
