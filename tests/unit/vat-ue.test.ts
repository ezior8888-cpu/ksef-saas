import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { KOD_UE, addressCountryForKodUE, isForeignEuVat, isNpIiBuyerVat, parseVatUe } from '@/lib/invoices/vat-ue';

describe('numer VAT-UE nabywcy (AUD-70)', () => {
  it('lista KodUE jest równa TKodyKrajowUE ze schematu FA(3)', () => {
    const xsd = readFileSync('lib/xml/schemas/fa3/schemat.xsd', 'utf8');
    const start = xsd.indexOf('name="TKodyKrajowUE"');
    const end = xsd.indexOf('</xsd:simpleType>', start);
    const fromXsd = [...xsd.slice(start, end).matchAll(/enumeration value="([A-Z]{2})"/g)].map((m) => m[1]);
    expect([...KOD_UE].sort()).toEqual(fromXsd.sort());
  });

  it.each([
    ['DE123456789', { kodUE: 'DE', numer: '123456789', normalized: 'DE123456789' }],
    ['de 123-456.789', { kodUE: 'DE', numer: '123456789', normalized: 'DE123456789' }],
    ['EL123456789', { kodUE: 'EL', numer: '123456789', normalized: 'EL123456789' }],
    ['FRXX123456789', { kodUE: 'FR', numer: 'XX123456789', normalized: 'FRXX123456789' }],
  ])('rozbiera %s', (raw, expected) => {
    expect(parseVatUe(raw)).toEqual(expected);
  });

  it.each(['', 'GR123456789', 'US123456789', 'DE', 'DE1234567890123', 'DE12345_678'])('odrzuca %j', (raw) => {
    expect(parseVatUe(raw)).toBeNull();
  });

  it('polski prefiks nie jest nabywcą z innego państwa', () => {
    expect(isForeignEuVat('PL1234567890')).toBe(false);
    expect(isForeignEuVat('DE123456789')).toBe(true);
    expect(isForeignEuVat('nie-numer')).toBe(false);
  });

  it('np II tylko dla podatnika z innego państwa członkowskiego — bez PL i XI', () => {
    // XI (Irlandia Płn.) ma numer VAT-UE tylko dla towarów; usługa dla firmy
    // z Irlandii Płn. to usługa dla podatnika spoza UE, nie art. 100 ust. 1 pkt 4.
    expect(isNpIiBuyerVat('DE123456789')).toBe(true);
    expect(isNpIiBuyerVat('EL123456789')).toBe(true);
    expect(isNpIiBuyerVat('XI123456789')).toBe(false);
    expect(isNpIiBuyerVat('PL1234567890')).toBe(false);
    expect(isNpIiBuyerVat('zly')).toBe(false);
  });

  it('adres Grecji to GR, reszta jak prefiks', () => {
    expect(addressCountryForKodUE('EL')).toBe('GR');
    expect(addressCountryForKodUE('XI')).toBe('XI');
    expect(addressCountryForKodUE('DE')).toBe('DE');
  });
});
