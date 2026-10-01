import PDFDocument from 'pdfkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  /** Kolejne odpowiedzi `maybeSingle` — najpierw korekta, potem faktura korygowana. */
  answers: [] as Array<{ data: Row | null; error: { message: string } | null }>,
  queries: [] as Array<{ table: string; select: string; eq: Array<[string, string]> }>,
}));

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: (select: string) => {
        const q = { table, select, eq: [] as Array<[string, string]> };
        db.queries.push(q);
        const chain = {
          eq: (k: string, v: string) => (q.eq.push([k, v]), chain),
          maybeSingle: async () => db.answers.shift() ?? { data: null, error: null },
        };
        return chain;
      },
    }),
  }),
}));

import { loadInvoiceForPdf } from '@/lib/pdf/invoice-data';
import { correctedInvoiceLines, renderInvoicePdf, type CorrectedInvoiceRef } from '@/lib/pdf/invoice-renderer';
import type { Invoice } from '@/types/invoice';

/**
 * Faktura korygująca musi wskazać fakturę, której dotyczy: numer i datę
 * wystawienia, a w KSeF — jej numer KSeF (art. 106j ust. 2 ustawy o VAT).
 * XML ma to w `DaneFaKorygowanej`; PDF korekty do 01.10.2026 miał tylko
 * tytuł „Faktura korygująca” — nabywca spoza KSeF nie wiedział, co jest
 * korygowane.
 */

const KSEF_PIERWOTNEJ = '5260001246-20260905-0100001AF629-AF';

function korekta(o: Row = {}): Row {
  return {
    id: 'kor-1',
    tenant_id: 'ten-1',
    internal_number: 'KOR/1/10',
    invoice_type: 'KOR',
    issue_date: '2026-10-01',
    parent_invoice_id: 'inv-9',
    correction_reason: ' Błędna cena ',
    seller_data: {},
    buyer_data: {},
    payment_data: {},
    invoice_line_items: [],
    ...o,
  };
}

const pierwotna = { internal_number: 'FV/9/09', issue_date: '2026-09-05', ksef_number: KSEF_PIERWOTNEJ };

beforeEach(() => {
  db.answers = [];
  db.queries = [];
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('loader PDF: faktura korygowana z bazy, w obrębie firmy', () => {
  it('korekta → numer, data, numer KSeF i przyczyna faktury korygowanej', async () => {
    db.answers = [{ data: korekta(), error: null }, { data: pierwotna, error: null }];
    const data = await loadInvoiceForPdf('kor-1', 'ten-1');
    expect(data?.correctedInvoice).toEqual({
      number: 'FV/9/09',
      issueDate: '2026-09-05',
      ksefNumber: KSEF_PIERWOTNEJ,
      reason: 'Błędna cena',
    });
    // Rodzic czytany po ID i firmie korekty — `parent_invoice_id` to zapisywalne dane.
    expect(db.queries[1]).toMatchObject({ table: 'invoices', eq: [['id', 'inv-9'], ['tenant_id', 'ten-1']] });
  });

  it('zwykła faktura — bez dodatkowego zapytania i bez danych korekty', async () => {
    db.answers = [{ data: korekta({ invoice_type: 'VAT', parent_invoice_id: null, correction_reason: null }), error: null }];
    const data = await loadInvoiceForPdf('kor-1', 'ten-1');
    expect(data?.correctedInvoice).toBeNull();
    expect(db.queries).toHaveLength(1);
  });

  it('faktura korygowana poza firmą (albo usunięta) — null, nie cudze dane', async () => {
    db.answers = [{ data: korekta(), error: null }, { data: null, error: null }];
    expect((await loadInvoiceForPdf('kor-1', 'ten-1'))?.correctedInvoice).toBeNull();
  });

  it('błąd odczytu faktury korygowanej rzuca — nie udaje „nie dotyczy”', async () => {
    db.answers = [{ data: korekta(), error: null }, { data: null, error: { message: 'timeout' } }];
    await expect(loadInvoiceForPdf('kor-1', 'ten-1')).rejects.toThrow(/faktury korygowanej.*timeout/);
  });

  it('pierwotna spoza KSeF i bez przyczyny — same numer i data', async () => {
    db.answers = [{ data: korekta({ correction_reason: '  ' }), error: null }, { data: { ...pierwotna, ksef_number: null }, error: null }];
    expect((await loadInvoiceForPdf('kor-1', 'ten-1'))?.correctedInvoice).toEqual({
      number: 'FV/9/09',
      issueDate: '2026-09-05',
      ksefNumber: null,
      reason: null,
    });
  });
});

describe('renderer: wiersze o fakturze korygowanej', () => {
  const ref: CorrectedInvoiceRef = { number: 'FV/9/09', issueDate: '2026-09-05', ksefNumber: KSEF_PIERWOTNEJ, reason: 'Błędna cena' };

  it('numer z datą, numer KSeF, przyczyna', () => {
    expect(correctedInvoiceLines(ref)).toEqual([
      'Korekta faktury nr FV/9/09 z dnia 2026-09-05',
      `Numer KSeF faktury korygowanej: ${KSEF_PIERWOTNEJ}`,
      'Przyczyna korekty: Błędna cena',
    ]);
    expect(correctedInvoiceLines({ ...ref, ksefNumber: null, reason: null })).toEqual([
      'Korekta faktury nr FV/9/09 z dnia 2026-09-05',
    ]);
    expect(correctedInvoiceLines(null)).toEqual([]);
  });

  it('PDF korekty naprawdę je drukuje', async () => {
    const text = vi.spyOn(PDFDocument.prototype, 'text');
    const invoice = {
      internalNumber: 'KOR/1/10',
      type: 'KOR',
      issueDate: '2026-10-01',
      seller: { nip: '5260001246', name: 'Moja Firma', address: { countryCode: 'PL', addressLine1: 'ul. A 1' } },
      buyer: { nip: '5252241585', name: 'Klient', address: { countryCode: 'PL', addressLine1: 'ul. B 2' } },
      lines: [],
      netTotal: 0,
      vatTotal: 0,
      grossTotal: 0,
      payment: { currency: 'PLN', dueDate: '2026-10-15', method: 'transfer' },
    } as unknown as Invoice;
    await renderInvoicePdf(invoice, { correctedInvoice: ref });
    const printed = text.mock.calls.map((c) => String(c[0]));
    expect(printed).toContain('Korekta faktury nr FV/9/09 z dnia 2026-09-05');
    expect(printed).toContain(`Numer KSeF faktury korygowanej: ${KSEF_PIERWOTNEJ}`);
    expect(printed).toContain('Przyczyna korekty: Błędna cena');
  });
});
