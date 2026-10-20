import { readCompletePages } from '@/lib/accounting/read-complete-pages';
import {
  kpirCostAmount,
  VAT_DEDUCTIBLE_DOCUMENTS,
} from '@/lib/categorization/kpir-cost';
import { assertKsefExpensesReadyForPln } from '@/lib/expenses/ksef-currency-review';
import { filterExpensesForKsefEnvironment } from '@/lib/expenses/ksef-environment';
import { requireConfiguredKsefEnvironment } from '@/lib/ksef/claim-environment';
import type { PageContext } from '@/lib/supabase/page-context';
import { roundToCents } from '@/lib/xml/invoice-calculator';

/**
 * Koszty dla kart Pulpitu — plan Finora §2.4 pkt 12. JEDNA droga odczytu,
 * ta sama co na `/przeplywy` i w eksporcie (`fetchExpensesForExport`):
 *
 * `expenses` z `is_deductible = true` w zakresie dat → `readCompletePages`
 * → `filterExpensesForKsefEnvironment` → `assertKsefExpensesReadyForPln`.
 *
 * Faktura `incoming` i jej wydatek to JEDEN koszt (00121), więc czytamy tylko
 * `expenses` — faktur zakupu nigdy nie dodajemy osobno.
 */

export interface CostEntry {
  id: string;
  issueDate: string;
  sellerNip: string | null;
  sellerName: string | null;
  /** Koszt jak w KPiR: `kpirCostAmount` (netto + VAT bez prawa do odliczenia). */
  cost: number;
  /** Wypływ pieniędzy: `gross_amount` z tego samego wiersza. */
  outflow: number;
  /**
   * VAT do odliczenia: `vat_deductible_amount` tylko dla dokumentów
   * z `VAT_DEDUCTIBLE_DOCUMENTS` (ta sama reguła co JPK_V7M), inaczej 0.
   */
  vatDeductible: number;
  /** Numer dokumentu (faktura, paragon) — lista operacji na `/przeplywy`. */
  documentNumber: string | null;
  /** Kategoria wydatku nadana przy kategoryzacji; `null` = bez kategorii. */
  categoryLabel: string | null;
  /** Czy wydatek zatwierdzono (dane z OCR i KSeF czekają na akceptację). */
  isReviewed: boolean;
}

/**
 * Komunikat `filterExpensesForKsefEnvironment`, gdy nie da się ODCZYTAĆ
 * faktur KSeF (błąd PostgREST-a). To awaria odczytu, nie brak uzgodnienia —
 * klient nie ma czego uzgadniać, więc dostaje inny tekst.
 */
const PROVENANCE_READ_FAILED = 'KSeF expense invoice provenance check is unavailable';

const EXPENSE_COLUMNS =
  'id, source, ksef_invoice_id, issue_date, seller_nip, seller_name, document_number, category_label, net_amount, vat_amount, gross_amount, vat_deductible_amount, document_type, is_reviewed, ocr_extracted_data';

/**
 * Koszty z zakresu `[from, toExclusive)` (daty RRRR-MM-DD), posortowane po
 * `issue_date`, potem `id`.
 *
 * Wyjątki (karta pokazuje ich treść klientowi, więc są po polsku):
 * - niepełny odczyt stron — komunikat z `readCompletePages`;
 * - błąd odczytu faktur KSeF przy sprawdzaniu środowiska — „Nie można
 *   sprawdzić środowiska kosztów KSeF” (oryginał w `cause`);
 * - koszt ze skrzynki KSeF bez uzgodnionego środowiska — „Koszty ze skrzynki
 *   KSeF wymagają uzgodnienia środowiska KSeF” (oryginał w `cause`);
 * - koszt KSeF w walucie obcej bez przeglądu i kursu —
 *   `KsefExpenseCurrencyNotSupportedError` bez zmian.
 */
export async function getCosts(
  supabase: PageContext['supabase'],
  tenantId: string,
  range: { from: string; toExclusive: string },
): Promise<CostEntry[]> {
  const environment = requireConfiguredKsefEnvironment();

  const rows = await readCompletePages('Nie można odczytać kosztów', (from, to) =>
    supabase
      .from('expenses')
      .select(EXPENSE_COLUMNS, { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('is_deductible', true)
      .gte('issue_date', range.from)
      .lt('issue_date', range.toExclusive)
      .order('id', { ascending: true })
      .range(from, to),
  );

  let visible: typeof rows;
  try {
    visible = await filterExpensesForKsefEnvironment(supabase, tenantId, environment, rows);
  } catch (cause) {
    // Funkcja wspólna z eksportem rzuca po angielsku; klient widzi ten tekst.
    if (cause instanceof Error && cause.message === PROVENANCE_READ_FAILED) {
      throw new Error('Nie można sprawdzić środowiska kosztów KSeF', { cause });
    }
    throw new Error('Koszty ze skrzynki KSeF wymagają uzgodnienia środowiska KSeF', { cause });
  }

  // C-11: koszt KSeF w walucie obcej bez przeglądu i kursu zatrzymuje kartę.
  await assertKsefExpensesReadyForPln(
    visible.map((row) => ({
      source: row.source,
      ksef_invoice_id: row.ksef_invoice_id,
      issue_date: row.issue_date,
      is_reviewed: row.is_reviewed === true,
      ocr_extracted_data: row.ocr_extracted_data ?? null,
    })),
    async (ids) => {
      const { data, error } = await supabase
        .from('invoices')
        .select('id, currency')
        .eq('tenant_id', tenantId)
        .in('id', ids);
      if (error) throw new Error('Nie można sprawdzić walut faktur KSeF');
      return new Map((data ?? []).map((row) => [row.id as string, row.currency as string | null]));
    },
  );

  visible.sort((a, b) =>
    a.issue_date.localeCompare(b.issue_date) || a.id.localeCompare(b.id));

  return visible.map((row) => ({
    id: row.id,
    issueDate: row.issue_date,
    sellerNip: typeof row.seller_nip === 'string' && row.seller_nip.trim()
      ? row.seller_nip.trim()
      : null,
    sellerName: typeof row.seller_name === 'string' && row.seller_name.trim()
      ? row.seller_name
      : null,
    cost: kpirCostAmount(row),
    outflow: Number(row.gross_amount ?? 0),
    // Brak typu dokumentu = faktura, jak w `nonDeductedVat` i eksporcie JPK.
    vatDeductible: VAT_DEDUCTIBLE_DOCUMENTS.has(row.document_type ?? 'invoice')
      ? Number(row.vat_deductible_amount ?? 0)
      : 0,
    documentNumber: typeof row.document_number === 'string' && row.document_number.trim()
      ? row.document_number.trim()
      : null,
    categoryLabel: typeof row.category_label === 'string' && row.category_label.trim()
      ? row.category_label.trim()
      : null,
    isReviewed: row.is_reviewed === true,
  }));
}

/**
 * Suma `cost` dla każdego klucza miesiąca `RRRR-MM` z `monthKeys`, w tej
 * samej kolejności, zaokrąglona do groszy. Koszt spoza kluczy jest pomijany.
 */
export function sumCostsByMonth(
  entries: readonly CostEntry[],
  monthKeys: readonly string[],
): number[] {
  const byMonth = new Map<string, number>();
  for (const entry of entries) {
    const key = entry.issueDate.slice(0, 7);
    byMonth.set(key, (byMonth.get(key) ?? 0) + entry.cost);
  }
  return monthKeys.map((key) => roundToCents(byMonth.get(key) ?? 0));
}
