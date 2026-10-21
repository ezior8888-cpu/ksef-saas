import { readCompletePages } from '@/lib/accounting/read-complete-pages';
import { isReceivableBase, RECEIVABLE_BASE_COLUMNS } from '@/lib/dashboard/receivables';
import { addDaysToIsoDate, todayInWarsaw } from '@/lib/format/warsaw-date';
import { requireConfiguredKsefEnvironment } from '@/lib/ksef/claim-environment';
import type { PageContext } from '@/lib/supabase/page-context';
import { roundToCents } from '@/lib/xml/invoice-calculator';

/**
 * Wpływy pieniędzy — plan Finora §2.4 pkt 14. JEDNA droga odczytu dla
 * `/przeplywy` (P2), ten sam wzór co kafel „Opłacone” listy faktur
 * (`paidThisMonth` w `lib/invoices/list-stats.ts`), tylko dla dowolnego
 * zakresu dni zamiast bieżącego miesiąca:
 *
 * - faktury sprzedaży z §2.4 pkt 11 (predykat `isReceivableBase`) BEZ
 *   warunku dzieci i BEZ warunku `payment_status` — wpłata, która wpłynęła,
 *   nie znika po korekcie, a zaliczka i jej ROZ to dwie różne wpłaty;
 * - kwota `paid_amount > 0`, dzień `paid_at` w Europe/Warsaw — to dzień
 *   OZNACZENIA wpłaty, nie przelewu (nie porównujemy go z terminem);
 * - nigdy z `payments` ani `payment_imports`.
 *
 * Przyjęta faktura z wpłatą w zakresie bez środowiska KSeF (albo z nieznanym)
 * zatrzymuje kartę tym samym komunikatem co `getMonthlyFigures`.
 */

const ENVIRONMENT_ERROR = 'Przyjęte faktury wymagają uzgodnienia środowiska KSeF';
const KNOWN_ENVIRONMENTS: ReadonlySet<string> = new Set(['test', 'demo', 'production']);

const INFLOW_COLUMNS = `${RECEIVABLE_BASE_COLUMNS}, paid_at, internal_number, buyer_nip, buyer_data, is_b2c`;

export interface InflowEntry {
  /** Id faktury. */
  id: string;
  /** Dzień oznaczenia wpłaty w Europe/Warsaw, RRRR-MM-DD. */
  paidOn: string;
  /** `paid_amount`, PLN. */
  amount: number;
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

interface InflowRow {
  id: string;
  direction: string | null;
  origin: string | null;
  ksef_status: string | null;
  ksef_environment: string | null;
  invoice_kind: string | null;
  invoice_type: string | null;
  currency: string | null;
  gross_total: number | string | null;
  paid_amount: number | string | null;
  payment_data: unknown;
  payment_due_date: string | null;
  payment_status: string | null;
  paid_at: string | null;
  internal_number: string | null;
  buyer_nip: string | null;
  buyer_data: unknown;
  is_b2c: boolean | null;
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
 * Wpływy z dni `[from, toExclusive)` (RRRR-MM-DD, kalendarz Europe/Warsaw),
 * posortowane po dniu wpłaty, potem po id faktury.
 */
export async function getInflows(
  supabase: PageContext['supabase'],
  tenantId: string,
  range: { from: string; toExclusive: string },
): Promise<InflowEntry[]> {
  const environment = requireConfiguredKsefEnvironment();
  // `paid_at` to znacznik czasu. Okno w UTC poszerzone o dobę z każdej
  // strony, dokładne dni w Warszawie liczy filtr niżej (jak `paidThisMonth`).
  const windowStart = `${addDaysToIsoDate(range.from, -1) ?? range.from}T00:00:00.000Z`;
  const windowEnd = `${addDaysToIsoDate(range.toExclusive, 1) ?? range.toExclusive}T00:00:00.000Z`;

  const rows = await readCompletePages<InflowRow>('Nie można odczytać wpłat', (from, to) => supabase
    .from('invoices')
    .select(INFLOW_COLUMNS, { count: 'exact' })
    .eq('tenant_id', tenantId)
    .eq('direction', 'outgoing')
    .eq('origin', 'app')
    .eq('ksef_status', 'accepted')
    .gte('paid_at', windowStart)
    .lt('paid_at', windowEnd)
    .order('id', { ascending: true })
    .range(from, to));

  const inRange: Array<{ row: InflowRow; paidOn: string }> = [];
  for (const row of rows) {
    if (!row.paid_at) continue;
    const paidAt = new Date(row.paid_at);
    if (Number.isNaN(paidAt.getTime())) continue;
    const paidOn = todayInWarsaw(paidAt);
    if (paidOn >= range.from && paidOn < range.toExclusive) inRange.push({ row, paidOn });
  }
  if (inRange.some(({ row }) => row.ksef_environment === null || !KNOWN_ENVIRONMENTS.has(row.ksef_environment))) {
    throw new Error(ENVIRONMENT_ERROR);
  }

  const withoutChildCondition = { environment, childIds: new Set<string>() };
  const entries: InflowEntry[] = [];
  for (const { row, paidOn } of inRange) {
    if (!isReceivableBase(row, withoutChildCondition)) continue;
    const amount = Number(row.paid_amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const identity = buyerIdentity(row);
    entries.push({
      id: row.id,
      paidOn,
      amount: roundToCents(amount),
      invoiceKind: row.invoice_kind,
      internalNumber: row.internal_number,
      buyerKey: identity.key,
      buyerName: buyerNameOf(row.buyer_data),
      buyerNip: identity.nip,
      consumers: identity.consumers,
    });
  }
  entries.sort((a, b) => a.paidOn.localeCompare(b.paidOn) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return entries;
}
