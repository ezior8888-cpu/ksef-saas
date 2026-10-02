/**
 * Lista faktur wystawionych — parametry z adresu i budowa filtrów zapytania
 * (F-086 w raporcie audytu bloku 1). Do 02.10.2026 lista pokazywała sztywno
 * 100 najnowszych faktur bez wyszukiwania i stron; starszych nie dało się
 * znaleźć. Filtry i stronicowanie działają w bazie, na pełnym zbiorze.
 *
 * Moduł bez importów — parsowanie i budowa filtrów są czystymi funkcjami.
 */

export const INVOICE_PAGE_SIZE = 50;

/** Maksymalna długość frazy wyszukiwania (dłuższa i tak nic nie znajdzie). */
const MAX_QUERY_LENGTH = 80;

export const INVOICE_STATUS_FILTERS = {
  wszystkie: { label: 'Wszystkie', statuses: null },
  szkice: { label: 'Szkice', statuses: ['draft'] },
  w_toku: { label: 'W toku', statuses: ['queued', 'sending', 'offline_queued'] },
  przyjete: { label: 'Przyjęte w KSeF', statuses: ['accepted'] },
  bledy: { label: 'Odrzucone i błędy', statuses: ['rejected', 'failed'] },
} as const satisfies Record<string, { label: string; statuses: readonly string[] | null }>;

export type InvoiceStatusFilter = keyof typeof INVOICE_STATUS_FILTERS;

export interface InvoiceListParams {
  /** Fraza: numer faktury, nazwa lub NIP nabywcy, kwota brutto. */
  q: string;
  status: InvoiceStatusFilter;
  /** Data wystawienia od / do (RRRR-MM-DD) albo null. */
  from: string | null;
  to: string | null;
  /** Numer strony od 1. */
  page: number;
}

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

function isoDateOrNull(v: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
}

export function parseInvoiceListParams(sp: SearchParams): InvoiceListParams {
  const status = first(sp.status);
  const page = Number.parseInt(first(sp.strona), 10);
  return {
    q: sanitizeSearch(first(sp.q)),
    status: status in INVOICE_STATUS_FILTERS ? (status as InvoiceStatusFilter) : 'wszystkie',
    from: isoDateOrNull(first(sp.od)),
    to: isoDateOrNull(first(sp.do)),
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, 10_000) : 1,
  };
}

/**
 * Fraza bezpieczna dla filtra `or()` PostgREST: bez znaków składni
 * (przecinek, nawiasy, cudzysłów, ukośnik wsteczny) i bez symboli
 * wieloznacznych (`%`, `*`) wpisanych przez użytkownika.
 */
export function sanitizeSearch(raw: string): string {
  return raw
    .replace(/[,()"\\%*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
}

/** Kwota z frazy („1230”, „1 230,50”, „1230.5”) albo null. */
export function amountFromSearch(q: string): number | null {
  const compact = q.replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(compact)) return null;
  const n = Number(compact);
  return Number.isFinite(n) ? n : null;
}

/**
 * Warunek `or()` dla wyszukiwania: numer faktury, nazwa nabywcy, NIP
 * nabywcy (z NIP-u bez kresek i spacji), a gdy fraza jest kwotą — także
 * równa kwota brutto. `null` = brak frazy.
 */
export function searchOrFilter(q: string): string | null {
  const term = sanitizeSearch(q);
  if (!term) return null;
  const parts = [
    `internal_number.ilike.%${term}%`,
    `buyer_data->>name.ilike.%${term}%`,
  ];
  const nipDigits = term.replace(/[\s-]/g, '');
  if (/^\d{3,10}$/.test(nipDigits)) parts.push(`buyer_nip.ilike.%${nipDigits}%`);
  const amount = amountFromSearch(term);
  if (amount !== null) parts.push(`gross_total.eq.${amount.toFixed(2)}`);
  return parts.join(',');
}

/** Zakres wierszy `range(from, to)` dla strony (włącznie). */
export function pageRange(page: number, size = INVOICE_PAGE_SIZE): [number, number] {
  const start = (Math.max(1, page) - 1) * size;
  return [start, start + size - 1];
}

/** Czy użytkownik zawęził listę (filtr albo dalsza strona). */
export function isFilteredList(p: InvoiceListParams): boolean {
  return p.q !== '' || p.status !== 'wszystkie' || p.from !== null || p.to !== null || p.page > 1;
}

/** Adres listy z parametrami (pomija wartości domyślne). */
export function invoiceListHref(p: InvoiceListParams, overrides: Partial<InvoiceListParams> = {}): string {
  const merged = { ...p, ...overrides };
  const qs = new URLSearchParams();
  if (merged.q) qs.set('q', merged.q);
  if (merged.status !== 'wszystkie') qs.set('status', merged.status);
  if (merged.from) qs.set('od', merged.from);
  if (merged.to) qs.set('do', merged.to);
  if (merged.page > 1) qs.set('strona', String(merged.page));
  const s = qs.toString();
  return s ? `/invoices?${s}` : '/invoices';
}
