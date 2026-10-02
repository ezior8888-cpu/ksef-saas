import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * F-086 (audyt bloku 1): lista faktur pokazywała sztywno 100 najnowszych
 * pozycji — bez wyszukiwania, filtrów i stron. Starszych faktur nie dało się
 * znaleźć. Teraz filtry i stronicowanie idą do bazy (pełny zbiór).
 */

const calls = vi.hoisted(() => [] as Array<[string, unknown[]]>);
const result = vi.hoisted(() => ({ data: [] as unknown[], count: 0 }));

vi.mock('@/lib/supabase/page-context', () => ({
  getPageContext: async () => {
    const chain: Record<string, unknown> = {};
    for (const m of ['from', 'select', 'eq', 'in', 'gte', 'lte', 'or', 'order']) {
      chain[m] = (...args: unknown[]) => { calls.push([m, args]); return chain; };
    }
    chain.range = async (...args: unknown[]) => {
      calls.push(['range', args]);
      return { data: result.data, error: null, count: result.count };
    };
    return { supabase: chain, tenantId: 'ten-1' };
  },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import InvoicesPage from '@/app/(dashboard)/invoices/page';
import {
  amountFromSearch,
  invoiceListHref,
  pageRange,
  parseInvoiceListParams,
  sanitizeSearch,
  searchOrFilter,
} from '@/lib/invoices/list-query';

beforeEach(() => {
  calls.length = 0;
  result.data = [];
  result.count = 0;
});

const called = (m: string) => calls.filter(([name]) => name === m).map(([, args]) => args);

describe('parametry listy z adresu', () => {
  it('domyślnie: bez frazy, wszystkie statusy, strona 1', () => {
    expect(parseInvoiceListParams({})).toEqual({ q: '', status: 'wszystkie', from: null, to: null, page: 1 });
  });

  it('odrzuca złe wartości zamiast przekazać je do zapytania', () => {
    expect(parseInvoiceListParams({ status: 'cokolwiek', od: '2026-02-31', do: 'wczoraj', strona: '-3' }))
      .toEqual({ q: '', status: 'wszystkie', from: null, to: null, page: 1 });
  });

  it('czyta poprawne filtry', () => {
    expect(parseInvoiceListParams({ q: ' FV/1 ', status: 'bledy', od: '2026-09-01', do: '2026-09-30', strona: '2' }))
      .toEqual({ q: 'FV/1', status: 'bledy', from: '2026-09-01', to: '2026-09-30', page: 2 });
  });
});

describe('fraza wyszukiwania', () => {
  it('usuwa znaki składni filtra i symbole wieloznaczne', () => {
    expect(sanitizeSearch('a,b(c)"d\\e%f*g')).toBe('a b c d e f g');
  });

  it('rozpoznaje kwotę', () => {
    expect(amountFromSearch('1230')).toBe(1230);
    expect(amountFromSearch('1 230,50')).toBe(1230.5);
    expect(amountFromSearch('FV/1')).toBeNull();
  });

  it('tekst: numer i nazwa nabywcy', () => {
    expect(searchOrFilter('Kowalski')).toBe('internal_number.ilike.%Kowalski%,buyer_data->>name.ilike.%Kowalski%');
  });

  it('cyfry: także NIP nabywcy i kwota brutto', () => {
    expect(searchOrFilter('526-000-12-46')).toContain('buyer_nip.ilike.%5260001246%');
    expect(searchOrFilter('1230')).toContain('gross_total.eq.1230.00');
  });

  it('pusta fraza — bez filtra', () => {
    expect(searchOrFilter('  ,() ')).toBeNull();
  });
});

describe('strony i adresy', () => {
  it('zakres wierszy strony', () => {
    expect(pageRange(1)).toEqual([0, 49]);
    expect(pageRange(3)).toEqual([100, 149]);
  });

  it('adres pomija wartości domyślne', () => {
    const p = parseInvoiceListParams({ q: 'FV', status: 'przyjete' });
    expect(invoiceListHref(p, { page: 2 })).toBe('/invoices?q=FV&status=przyjete&strona=2');
    expect(invoiceListHref(parseInvoiceListParams({}))).toBe('/invoices');
  });
});

describe('strona /invoices — zapytanie do bazy', () => {
  it('bez filtrów: pierwsza strona, liczba wszystkich pozycji', async () => {
    await InvoicesPage({ searchParams: Promise.resolve({}) });
    expect(called('select')[0]![1]).toEqual({ count: 'exact' });
    expect(called('range')).toEqual([[0, 49]]);
    expect(called('in')).toEqual([]);
    expect(called('or')).toEqual([]);
  });

  it('filtry trafiają do zapytania, strona 3 → wiersze 100–149', async () => {
    await InvoicesPage({
      searchParams: Promise.resolve({ q: 'FV/1', status: 'przyjete', od: '2026-09-01', do: '2026-09-30', strona: '3' }),
    });
    expect(called('eq')).toEqual(expect.arrayContaining([['tenant_id', 'ten-1'], ['direction', 'outgoing']]));
    expect(called('in')).toEqual([['ksef_status', ['accepted']]]);
    expect(called('gte')).toEqual([['issue_date', '2026-09-01']]);
    expect(called('lte')).toEqual([['issue_date', '2026-09-30']]);
    expect(called('or')).toEqual([['internal_number.ilike.%FV/1%,buyer_data->>name.ilike.%FV/1%']]);
    expect(called('range')).toEqual([[100, 149]]);
  });
});
