import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/actions/tax-office', () => ({ updateTaxOfficeAction: vi.fn() }));

import { TaxOfficeForm } from '@/components/settings/tax-office-form';
import { normalizeTaxOfficeCode, readTenantTaxOffice } from '@/lib/exports/tax-office';
import { isKnownTaxOffice, TAX_OFFICES, taxOfficeName } from '@/lib/exports/tax-offices';

/**
 * Urząd skarbowy firmy (KodUrzedu w JPK). Do 27.09 JPK_FA wpisywał każdemu
 * klientowi 1408 — według słownika MF to Kozienice, nie Warszawa, jak
 * twierdził komentarz w kodzie.
 */

describe('słownik urzędów (MF KodyUrzedowSkarbowych_v8-0E)', () => {
  it('400 urzędów, kody 4-cyfrowe, bez duplikatów', () => {
    expect(TAX_OFFICES).toHaveLength(400);
    expect(TAX_OFFICES.every(([code]) => /^\d{4}$/.test(code))).toBe(true);
    expect(new Set(TAX_OFFICES.map(([code]) => code)).size).toBe(400);
  });

  it.each([
    ['1408', 'URZĄD SKARBOWY W KOZIENICACH'],
    ['1433', 'URZĄD SKARBOWY WARSZAWA-MOKOTÓW'],
    ['1471', 'PIERWSZY MAZOWIECKI URZĄD SKARBOWY W WARSZAWIE'],
  ])('%s = %s', (code, name) => {
    expect(taxOfficeName(code)).toBe(name);
  });

  it('nieznany kod', () => {
    expect(taxOfficeName('9999')).toBeNull();
    expect(isKnownTaxOffice('9999')).toBe(false);
  });
});

describe('normalizeTaxOfficeCode', () => {
  it.each([
    ['1433 — URZĄD SKARBOWY WARSZAWA-MOKOTÓW', '1433'],
    ['  1433  ', '1433'],
    ['', null],
    [null, null],
  ])('%j → %j', (input, expected) => {
    expect(normalizeTaxOfficeCode(input)).toBe(expected);
  });

  it.each(['9999', '14330', 'Kraków', '143'])('odrzuca %j', (input) => {
    expect(() => normalizeTaxOfficeCode(input)).toThrow(/wybierz go z listy/);
  });
});

describe('readTenantTaxOffice', () => {
  const klient = (result: { data?: unknown; error?: { code?: string; message: string } | null }) =>
    ({
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: result.data ?? null, error: result.error ?? null }) }) }),
      }),
    }) as unknown as Parameters<typeof readTenantTaxOffice>[0];

  it('przed migracją 00092 (42703) → null, strona działa', async () => {
    await expect(readTenantTaxOffice(klient({ error: { code: '42703', message: 'no column' } }), 't')).resolves.toBeNull();
  });

  it('inny błąd bazy rzuca — błąd to nie „nie ustawiono”', async () => {
    await expect(readTenantTaxOffice(klient({ error: { code: '57014', message: 'timeout' } }), 't')).rejects.toThrow(/timeout/);
  });

  it('kod ze słownika → kod; spoza słownika → null', async () => {
    await expect(readTenantTaxOffice(klient({ data: { tax_office_code: '1433' } }), 't')).resolves.toBe('1433');
    await expect(readTenantTaxOffice(klient({ data: { tax_office_code: '9999' } }), 't')).resolves.toBeNull();
  });
});

describe('formularz urzędu', () => {
  it('pokazuje zapisany urząd z nazwą i podpowiada wszystkie 400', () => {
    const html = renderToStaticMarkup(<TaxOfficeForm initialCode="1433" />);
    // Samo pole — ten sam tekst jest też w podpowiedziach (datalist).
    const pole = /<input[^>]*id="tax-office"[^>]*>/.exec(html)?.[0] ?? '';
    expect(pole).toContain('value="1433 — URZĄD SKARBOWY WARSZAWA-MOKOTÓW"');
    expect(html.match(/<option /g)).toHaveLength(400);
  });

  it('bez urzędu — puste pole', () => {
    const html = renderToStaticMarkup(<TaxOfficeForm initialCode={null} />);
    expect(html).toContain('id="tax-office"');
    expect(html).not.toMatch(/id="tax-office"[^>]*value="\d/);
  });
});
