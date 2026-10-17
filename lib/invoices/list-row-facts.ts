import { readCompletePages } from '@/lib/accounting/read-complete-pages';
import {
  isReceivableBase,
  RECEIVABLE_BASE_COLUMNS,
  type ReceivableBaseRow,
  type ReceivableContext,
} from '@/lib/dashboard/receivables';
import { outstandingOf } from '@/lib/invoices/amount-due';
import { parentsWithOpenCorrection } from '@/lib/invoices/correction-parents';
import { requireConfiguredKsefEnvironment } from '@/lib/ksef/claim-environment';
import { todayInWarsaw } from '@/lib/format/warsaw-date';
import type { PageContext } from '@/lib/supabase/page-context';
import type { KsefEnvironment } from '@/types/ksef';

/**
 * Fakty wierszy listy faktur (P3, PLAN-FINORA §5) dla BIEŻĄCEJ strony
 * (≤ 50 wierszy): ikona płatności, kolumna „Do zapłaty” i link „Korekta”.
 *
 * - Płatność i kwota tylko dla faktur z §2.4 pkt 11 — predykat
 *   `isReceivableBase` z `lib/dashboard/receivables.ts`, ten sam co w sumie
 *   należności (bez drugiej kopii warunków). Reszta dostaje `null`, a UI „—”.
 * - „Po terminie” z daty w Europe/Warsaw, nie z `payment_status`.
 * - „Korekta” tylko dla faktur, które przyjmuje formularz
 *   `app/(dashboard)/invoices/new/correction/page.tsx`, i bez korekty w toku
 *   (`lib/invoices/correction-parents.ts`, K4).
 */

/** Kolumny, które strona listy musi wybrać, żeby policzyć fakty wiersza. */
export const LIST_ROW_FACT_COLUMNS = `${RECEIVABLE_BASE_COLUMNS}, ksef_number` as const;

export interface ListRowFactsRow extends ReceivableBaseRow {
  ksef_number: string | null;
}

export type InvoicePaymentState = 'paid' | 'overdue' | 'unpaid';

export interface InvoiceListRowFacts {
  /** null = faktura spoza §2.4 pkt 11 → „—”. */
  payment: InvoicePaymentState | null;
  /** `outstandingOf`; null razem z `payment`. 0 = „Opłacona”. */
  outstanding: number | null;
  /** Czy pokazać „Korekta” w menu wiersza. */
  canCorrect: boolean;
}

export interface CorrectionContext {
  environment: KsefEnvironment;
  /** Rodzice z korektą w toku (`parentsWithOpenCorrection`). */
  openCorrectionParents: ReadonlySet<string>;
}

/** Ten sam zbiór warunków co zapytanie formularza korekty + K4. */
function isCorrectionParentCandidate(row: ListRowFactsRow, environment: KsefEnvironment): boolean {
  return row.direction === 'outgoing'
    && row.ksef_status === 'accepted'
    && row.invoice_kind === 'regular'
    && row.ksef_environment === environment
    && typeof row.ksef_number === 'string' && row.ksef_number !== '';
}

export function canCorrectInvoice(row: ListRowFactsRow, ctx: CorrectionContext): boolean {
  return isCorrectionParentCandidate(row, ctx.environment) && !ctx.openCorrectionParents.has(row.id);
}

/** Ikona i kwota „Do zapłaty”; `today` = RRRR-MM-DD w Europe/Warsaw. */
export function paymentFactsOf(
  row: ReceivableBaseRow,
  ctx: ReceivableContext,
  today: string,
): Pick<InvoiceListRowFacts, 'payment' | 'outstanding'> {
  if (!isReceivableBase(row, ctx)) return { payment: null, outstanding: null };
  const outstanding = outstandingOf(row);
  if (outstanding === 0 || row.payment_status === 'paid') return { payment: 'paid', outstanding };
  const due = row.payment_due_date;
  const overdue = typeof due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(due) && due < today;
  return { payment: overdue ? 'overdue' : 'unpaid', outstanding };
}

const LOOKUP_CHUNK = 100;

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

interface PageChildren {
  childIds: Set<string>;
  openCorrectionParents: Set<string>;
}

/**
 * Dzieci wierszy strony w tej firmie: korekty (`parent_invoice_id`) i ROZ
 * (`advance_invoice_ids`). Każde dziecko w dowolnym statusie wyklucza
 * należność (jak widok 00145); korekty w toku blokują „Korekta” (K4).
 * Odczyt pełny i liczony — błąd rzuca, bo „nie wiem” to nie „bez dzieci”.
 */
async function loadPageChildren(
  supabase: PageContext['supabase'],
  tenantId: string,
  ids: readonly string[],
): Promise<PageChildren> {
  const childIds = new Set<string>();
  const corrections: Array<{ parent_invoice_id: string | null; ksef_status: string | null }> = [];
  for (const chunk of chunks(ids, LOOKUP_CHUNK)) {
    const [byParent, bySettlement] = await Promise.all([
      readCompletePages('Nie można odczytać korekt faktur na liście', (from, to) => supabase
        .from('invoices')
        .select('id, parent_invoice_id, invoice_kind, ksef_status', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .in('parent_invoice_id', chunk)
        .order('id', { ascending: true })
        .range(from, to)),
      readCompletePages('Nie można odczytać faktur rozliczających zaliczki na liście', (from, to) => supabase
        .from('invoices')
        .select('id, advance_invoice_ids', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .overlaps('advance_invoice_ids', chunk)
        .order('id', { ascending: true })
        .range(from, to)),
    ]);
    for (const row of byParent) {
      if (!row.parent_invoice_id) continue;
      childIds.add(row.parent_invoice_id);
      if (row.invoice_kind === 'correction') corrections.push(row);
    }
    for (const row of bySettlement) {
      for (const id of row.advance_invoice_ids ?? []) {
        if (chunk.includes(id)) childIds.add(id);
      }
    }
  }
  return { childIds, openCorrectionParents: parentsWithOpenCorrection(corrections) };
}

export async function loadInvoiceListRowFacts(
  supabase: PageContext['supabase'],
  tenantId: string,
  rows: readonly ListRowFactsRow[],
  now: Date = new Date(),
): Promise<Map<string, InvoiceListRowFacts>> {
  const environment = requireConfiguredKsefEnvironment();
  const today = todayInWarsaw(now);

  // Dzieci czytamy tylko dla wierszy, którym mogą coś zmienić: kandydatów
  // należności (przed odjęciem dzieci) i kandydatów na rodzica korekty.
  const noChildren: ReceivableContext = { environment, childIds: new Set() };
  const lookupIds = [...new Set(rows
    .filter((row) => isReceivableBase(row, noChildren) || isCorrectionParentCandidate(row, environment))
    .map((row) => row.id))];
  const children: PageChildren = lookupIds.length > 0
    ? await loadPageChildren(supabase, tenantId, lookupIds)
    : { childIds: new Set(), openCorrectionParents: new Set() };

  const receivableCtx: ReceivableContext = { environment, childIds: children.childIds };
  const correctionCtx: CorrectionContext = { environment, openCorrectionParents: children.openCorrectionParents };
  const result = new Map<string, InvoiceListRowFacts>();
  for (const row of rows) {
    result.set(row.id, {
      ...paymentFactsOf(row, receivableCtx, today),
      canCorrect: canCorrectInvoice(row, correctionCtx),
    });
  }
  return result;
}
