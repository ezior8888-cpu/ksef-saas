import type { Json } from '@/types/database';

export class KsefExpenseCurrencyNotSupportedError extends Error {
  constructor() {
    super('Raport wstrzymany: koszt ze skrzynki KSeF nie ma potwierdzonej waluty lub przeliczenia PLN. Sprawdź historyczne wydatki.');
    this.name = 'KsefExpenseCurrencyNotSupportedError';
  }
}

/**
 * Wydatku KSeF bez kursu nie wolno włączyć do KPiR. Sprawdzamy ślad przy
 * wydatku, a nie sam checkbox: historyczne koszty nie mają go wcale.
 */
export function hasKsefCurrencyRate(
  raw: Json | null,
  currency: string,
  issueDate: string,
): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  if (raw.source !== 'ksef_inbox' || raw.currency !== currency) return false;
  const fx = raw.fx;
  if (!fx || typeof fx !== 'object' || Array.isArray(fx)) return false;
  return fx.currency === currency
    && typeof fx.mid === 'number'
    && Number.isFinite(fx.mid)
    && fx.mid > 0
    && typeof fx.tableNo === 'string'
    && fx.tableNo.trim().length > 0
    && typeof fx.effectiveDate === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(fx.effectiveDate)
    && fx.effectiveDate < issueDate
    && fx.appliedFor === issueDate;
}

export interface KsefExpenseForPlnReport {
  source: string | null;
  ksef_invoice_id: string | null;
  issue_date: string;
  is_reviewed: boolean;
  ocr_extracted_data: Json | null;
}

/**
 * Stare koszty KSeF mogą mieć is_deductible=true, choć kwoty są nadal w EUR.
 * Raport/eksport musi wtedy odmówić obliczenia zamiast wyświetlić fałszywe PLN.
 * Funkcja nie naprawia danych; operator uzgadnia je z XML i KPiR/JPK.
 */
export async function assertKsefExpensesReadyForPln(
  expenses: readonly KsefExpenseForPlnReport[],
  loadCurrencies: (invoiceIds: string[]) => Promise<ReadonlyMap<string, string | null>>,
): Promise<void> {
  const ksef = expenses.filter((expense) =>
    expense.source === 'ksef_inbox' || expense.ksef_invoice_id !== null,
  );
  if (ksef.length === 0) return;

  const fail = (): never => {
    throw new KsefExpenseCurrencyNotSupportedError();
  };
  if (ksef.some((expense) => !expense.ksef_invoice_id)) fail();

  const ids = [...new Set(ksef.map((expense) => expense.ksef_invoice_id!))];
  const currencies = new Map<string, string | null>();
  for (let start = 0; start < ids.length; start += 200) {
    const batch = await loadCurrencies(ids.slice(start, start + 200));
    for (const [id, currency] of batch) currencies.set(id, currency);
  }

  for (const expense of ksef) {
    const currency = currencies.get(expense.ksef_invoice_id!)?.trim().toUpperCase() ?? '';
    if (!currency) fail();
    if (!/^[A-Z]{3}$/.test(currency)) fail();
    if (currency !== 'PLN' && (
      !expense.is_reviewed
      || !hasKsefCurrencyRate(expense.ocr_extracted_data, currency, expense.issue_date)
    )) fail();
  }
}
