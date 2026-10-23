import { readCompletePages } from '@/lib/accounting/read-complete-pages';
import { OutgoingInvoiceCurrencyNotSupportedError } from '@/lib/exports/currency-guard';
import { addDaysToIsoDate, todayInWarsaw } from '@/lib/format/warsaw-date';
import { amountDueOf, outstandingOf } from '@/lib/invoices/amount-due';
import { requireConfiguredKsefEnvironment } from '@/lib/ksef/claim-environment';
import type { PageContext } from '@/lib/supabase/page-context';
import { roundToCents } from '@/lib/xml/invoice-calculator';

/**
 * Wpływy pieniędzy — JEDNA droga odczytu dla Przepływów, karty Należności
 * Pulpitu i Analiz (PLAN-PRAWDZIWE-DANE E11, decyzja Bartosza D-W
 * 23.10.2026: klient NIC nie oznacza).
 *
 * Faktura sprzedaży to wpływ w jednym dniu (`inflowDay`), w tej kolejności:
 * 1. `paid_at` — prawdziwa zapłata potwierdzona w FaktWay (wpłaty / FLO;
 *    wyzwalacz 00073 ustawia go dopiero przy pełnej zapłacie), dzień
 *    w Europe/Warsaw; kwota `paid_amount`;
 * 2. `Zaplacono = 1` + `DataZaplaty` z FA(3) (`fa3_data.parsed.paidDate`,
 *    import pliku i historii KSeF) — faktura wystawiona po zapłacie;
 * 3. termin płatności (`payment_due_date`) — zakładamy zapłatę w terminie;
 * 4. bez terminu — dzień wystawienia.
 * Przy 3–4 kwota to brutto do zapłaty (`amountDueOf`: ROZ — reszta po
 * zaliczkach), a `outstanding` to reszta po potwierdzonych wpłatach
 * częściowych — tę kwotę pokazują Spodziewane wpływy i Należności. Wpłaty
 * częściowej nie dzielimy na osobny dzień: bez `payments` (plan Finora §2.4
 * pkt 14) jej dnia nie znamy, więc liczy się w dniu terminu razem z resztą.
 *
 * Faktury jak przychód (`getSalesInvoices`): sprzedaż przyjęta w KSeF
 * w aktywnym środowisku, z każdego pochodzenia (FaktWay, plik, historia
 * KSeF), korekta jako różnica ze znakiem. Strażniki jak przychód, ale tylko
 * dla faktur z dniem wpływu w zakresie: przyjęta faktura bez środowiska
 * (`ENVIRONMENT_ERROR`) i faktura spoza PLN (`InflowCurrencyError` — ten sam
 * typ co strażnik przychodu, z numerem dokumentu) zatrzymują kartę.
 * Przypomnienia i `/payments/overdue` zostają na `getReceivables`
 * i `paid_at` — tu nic o zaległościach.
 */

const ENVIRONMENT_ERROR = 'Przyjęte faktury wymagają uzgodnienia środowiska KSeF';
const KNOWN_ENVIRONMENTS: ReadonlySet<string> = new Set(['test', 'demo', 'production']);

/** Data zapłaty z FA(3) zapisana przy imporcie (`ParsedInvoice.paidDate`). */
const FA3_PAID_DATE = 'fa3_data->parsed->>paidDate';

const INFLOW_COLUMNS = `id, direction, ksef_status, ksef_environment, invoice_kind, currency, gross_total, paid_amount, payment_data, payment_due_date, paid_at, issue_date, internal_number, buyer_nip, buyer_data, is_b2c, fa3_paid_date:${FA3_PAID_DATE}` as const;

/**
 * Faktura sprzedaży spoza PLN z dniem wpływu w zakresie karty: bez kursu nie
 * zgadujemy złotówek (jak przychód, `assertOutgoingInvoicesInPln`). Ten sam
 * typ, więc karty pokazują komunikat (`pulpitErrorMessage`) z numerem
 * dokumentu; wyjście daje karta błędu (Przepływy: „napisz do nas”, Pulpit
 * i Analizy: link do Przepływów) — protokół napraw pkt 4.
 */
export class InflowCurrencyError extends OutgoingInvoiceCurrencyNotSupportedError {
  constructor(document: string, currency: string) {
    super();
    this.name = 'InflowCurrencyError';
    this.message =
      `Raport wstrzymany: faktura sprzedaży ${document} nie ma potwierdzonej waluty PLN (${currency || 'brak waluty'}). `
      + 'Faktury walutowe wymagają uzgodnienia z księgową.';
  }
}

/** Skąd dzień wpływu: prawdziwa zapłata, termin płatności albo dzień wystawienia. */
export type InflowBasis = 'paid' | 'due' | 'issued';

export interface InflowEntry {
  /** Id faktury. */
  id: string;
  /** Dzień wpływu w Europe/Warsaw, RRRR-MM-DD (`inflowDay`). */
  date: string;
  basis: InflowBasis;
  /** PLN ze znakiem dokumentu: wpłata, brutto do zapłaty albo różnica korekty. */
  amount: number;
  /** Reszta do zapłaty po wpłatach częściowych; 0 przy prawdziwej zapłacie i korekcie in minus. */
  outstanding: number;
  /** Termin płatności faktury, RRRR-MM-DD; `null` bez terminu. */
  dueDate: string | null;
  invoiceKind: string | null;
  internalNumber: string | null;
  /** `b2c`, `nip:<cyfry>`, `name:<nazwa małymi literami>` albo `invoice:<id>` (bez nabywcy). */
  buyerKey: string;
  /** Nazwa nabywcy z faktury; `null`, gdy faktura jej nie ma. */
  buyerName: string | null;
  buyerNip: string | null;
  /** Nabywca B2C (`is_b2c`) — w rankingach jedna pozycja „Konsumenci”. */
  consumers: boolean;
}

/** Kolumny dnia wpływu (`inflowDay`). */
export interface InflowDayRow {
  paid_at: string | null;
  fa3_paid_date: string | null;
  payment_due_date: string | null;
  issue_date: string | null;
}

interface InflowRow extends InflowDayRow {
  id: string;
  direction: string | null;
  ksef_status: string | null;
  ksef_environment: string | null;
  invoice_kind: string | null;
  currency: string | null;
  gross_total: number | string | null;
  paid_amount: number | string | null;
  payment_data: unknown;
  internal_number: string | null;
  buyer_nip: string | null;
  buyer_data: unknown;
  is_b2c: boolean | null;
}

function isIsoDate(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Dzień wpływu faktury (D-W): prawdziwa zapłata → data zapłaty z FA(3) → termin → wystawienie. */
export function inflowDay(row: InflowDayRow): { date: string; basis: InflowBasis } | null {
  if (row.paid_at) {
    const paidAt = new Date(row.paid_at);
    if (!Number.isNaN(paidAt.getTime())) return { date: todayInWarsaw(paidAt), basis: 'paid' };
  }
  const fa3Paid = row.fa3_paid_date?.trim();
  if (isIsoDate(fa3Paid)) return { date: fa3Paid, basis: 'paid' };
  const due = row.payment_due_date?.slice(0, 10);
  if (isIsoDate(due)) return { date: due, basis: 'due' };
  const issued = row.issue_date?.slice(0, 10);
  if (isIsoDate(issued)) return { date: issued, basis: 'issued' };
  return null;
}

function finiteNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function buyerNameOf(buyerData: unknown): string | null {
  if (typeof buyerData !== 'object' || buyerData === null || Array.isArray(buyerData)) return null;
  const name = (buyerData as Record<string, unknown>).name;
  return typeof name === 'string' && name.trim() !== '' ? name.trim() : null;
}

/** Klucz nabywcy — ta sama reguła co ranking klientów Pulpitu (`rankings.ts`). */
function buyerIdentity(row: InflowRow): { key: string; nip: string | null; consumers: boolean } {
  if (row.is_b2c === true) return { key: 'b2c', nip: null, consumers: true };
  const nip = (row.buyer_nip ?? '').replace(/\D/g, '');
  if (nip !== '') return { key: `nip:${nip}`, nip, consumers: false };
  const name = buyerNameOf(row.buyer_data);
  if (name !== null) return { key: `name:${name.toLowerCase()}`, nip: null, consumers: false };
  return { key: `invoice:${row.id}`, nip: null, consumers: false };
}

/**
 * Wpływy z dniem w `[from, toExclusive)` (RRRR-MM-DD, kalendarz
 * Europe/Warsaw); bez `toExclusive` — także wszystkie przyszłe terminy.
 * Posortowane po dniu wpływu, potem po id faktury.
 */
export async function getInflows(
  supabase: PageContext['supabase'],
  tenantId: string,
  range: { from: string; toExclusive?: string },
): Promise<InflowEntry[]> {
  const environment = requireConfiguredKsefEnvironment();
  // Dzień wpływu ≥ `from` wymaga, by któraś z jego kolumn była ≥ `from`.
  // `paid_at` to znacznik czasu: okno poszerzone o dobę, dokładny dzień
  // w Warszawie liczy filtr niżej. Sama data (bez „:” i „.”, które w `or`
  // PostgREST-a trzeba by cytować). Górnej granicy w zapytaniu nie ma.
  const paidFrom = addDaysToIsoDate(range.from, -1) ?? range.from;
  const anyDateFrom = [
    `paid_at.gte.${paidFrom}`,
    `${FA3_PAID_DATE}.gte.${range.from}`,
    `payment_due_date.gte.${range.from}`,
    `issue_date.gte.${range.from}`,
  ].join(',');

  const rows = await readCompletePages<InflowRow>('Nie można odczytać wpływów', (from, to) => supabase
    .from('invoices')
    .select(INFLOW_COLUMNS, { count: 'exact' })
    .eq('tenant_id', tenantId)
    .eq('direction', 'outgoing')
    .eq('ksef_status', 'accepted')
    .or(anyDateFrom)
    .order('id', { ascending: true })
    .range(from, to));

  const inRange: Array<{ row: InflowRow; date: string; basis: InflowBasis }> = [];
  for (const row of rows) {
    const day = inflowDay(row);
    if (!day || day.date < range.from) continue;
    if (range.toExclusive !== undefined && day.date >= range.toExclusive) continue;
    inRange.push({ row, ...day });
  }
  if (inRange.some(({ row }) => row.ksef_environment === null || !KNOWN_ENVIRONMENTS.has(row.ksef_environment))) {
    throw new Error(ENVIRONMENT_ERROR);
  }
  const active = inRange.filter(({ row }) => row.ksef_environment === environment);
  // Jak przychód (`assertOutgoingInvoicesInPln`): brak waluty też nie potwierdza złotówek.
  const foreign = active.find(({ row }) => row.currency?.trim().toUpperCase() !== 'PLN');
  if (foreign) {
    throw new InflowCurrencyError(foreign.row.internal_number ?? foreign.row.id, foreign.row.currency?.trim().toUpperCase() ?? '');
  }

  const entries: InflowEntry[] = [];
  for (const { row, date, basis } of active) {
    const paidByPayments = basis === 'paid' && Boolean(row.paid_at);
    const amount = roundToCents(paidByPayments ? finiteNumber(row.paid_amount) : amountDueOf(row)) || 0;
    if (amount === 0) continue;
    const identity = buyerIdentity(row);
    const due = row.payment_due_date?.slice(0, 10);
    entries.push({
      id: row.id,
      date,
      basis,
      amount,
      outstanding: basis === 'paid' ? 0 : outstandingOf(row),
      dueDate: isIsoDate(due) ? due : null,
      invoiceKind: row.invoice_kind,
      internalNumber: row.internal_number,
      buyerKey: identity.key,
      buyerName: buyerNameOf(row.buyer_data),
      buyerNip: identity.nip,
      consumers: identity.consumers,
    });
  }
  entries.sort((a, b) => a.date.localeCompare(b.date) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return entries;
}
