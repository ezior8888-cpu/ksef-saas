import { describe, expect, it } from 'vitest';

import {
  buyerB2CSchema,
  buyerSchema,
  invoiceLineSchema,
  sellerSchema,
} from '@/lib/validators/invoice-validators';

/**
 * TEST-4 (audyt przedlaunchowy): walidacja faktury. To ostatnia linia obrony
 * przed wysłaniem śmieci do KSeF. NIP musi mieć poprawną sumę kontrolną,
 * stawki VAT muszą być z dozwolonego zbioru, ilości dodatnie.
 *
 * NIP z poprawną sumą kontrolną: 5260001246 (zweryfikowany).
 * NIP z błędną sumą kontrolną: 1234567890 (mod11 = 10 → nieprawidłowy).
 */

const VALID_NIP = '5260001246';
const INVALID_CHECKSUM_NIP = '1234567890';

const validAddress = {
  addressLine1: 'ul. Testowa 1',
  addressLine2: '00-001 Warszawa',
  countryCode: 'PL',
};

describe('invoiceLineSchema', () => {
  const base = {
    name: 'Usługa programistyczna',
    unit: 'szt',
    quantity: 1,
    unitPriceNet: 100,
    vatRate: '23' as const,
  };

  it('poprawna pozycja przechodzi', () => {
    expect(invoiceLineSchema.safeParse(base).success).toBe(true);
  });

  it('cena 0 dozwolona (np. gratis), ujemna odrzucona', () => {
    expect(invoiceLineSchema.safeParse({ ...base, unitPriceNet: 0 }).success).toBe(true);
    expect(invoiceLineSchema.safeParse({ ...base, unitPriceNet: -1 }).success).toBe(false);
  });

  it('ilość musi być dodatnia (0 i ujemne odrzucone)', () => {
    expect(invoiceLineSchema.safeParse({ ...base, quantity: 0 }).success).toBe(false);
    expect(invoiceLineSchema.safeParse({ ...base, quantity: -2 }).success).toBe(false);
  });

  it('tylko dozwolone stawki VAT (23/8/5/0/oo/np)', () => {
    for (const r of ['23', '8', '5', '0', 'oo', 'np']) {
      expect(invoiceLineSchema.safeParse({ ...base, vatRate: r }).success).toBe(true);
    }
    expect(invoiceLineSchema.safeParse({ ...base, vatRate: 'zw' }).success).toBe(false);
    expect(invoiceLineSchema.safeParse({ ...base, vatRate: '22' }).success).toBe(false);
  });

  it('nazwa pusta lub > 512 znaków odrzucona', () => {
    expect(invoiceLineSchema.safeParse({ ...base, name: '' }).success).toBe(false);
    expect(invoiceLineSchema.safeParse({ ...base, name: 'x'.repeat(513) }).success).toBe(false);
  });
});

describe('sellerSchema — NIP checksum', () => {
  const base = { nip: VALID_NIP, name: 'Moja Firma', address: validAddress };

  it('poprawny NIP przechodzi', () => {
    expect(sellerSchema.safeParse(base).success).toBe(true);
  });

  it('NIP z błędną sumą kontrolną odrzucony', () => {
    expect(sellerSchema.safeParse({ ...base, nip: INVALID_CHECKSUM_NIP }).success).toBe(false);
  });

  it('NIP o złej długości odrzucony', () => {
    expect(sellerSchema.safeParse({ ...base, nip: '123' }).success).toBe(false);
    expect(sellerSchema.safeParse({ ...base, nip: '52600012460' }).success).toBe(false);
  });

  it('countryCode domyślnie PL', () => {
    const r = sellerSchema.safeParse({
      nip: VALID_NIP,
      name: 'F',
      address: { addressLine1: 'a', addressLine2: 'b' },
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.address.countryCode).toBe('PL');
  });
});

describe('buyerB2CSchema — identyfikator zależny od typu', () => {
  const base = { type: 'b2c' as const, name: 'Jan Kowalski', address: validAddress };

  it('idType=pesel WYMAGA pesel', () => {
    expect(
      buyerB2CSchema.safeParse({ ...base, idType: 'pesel' }).success,
    ).toBe(false); // brak pesel
    expect(
      buyerB2CSchema.safeParse({ ...base, idType: 'pesel', pesel: '44051401359' }).success,
    ).toBe(true); // poprawny PESEL
  });

  it('idType=id_card WYMAGA idNumber', () => {
    expect(buyerB2CSchema.safeParse({ ...base, idType: 'id_card' }).success).toBe(false);
    expect(
      buyerB2CSchema.safeParse({ ...base, idType: 'id_card', idNumber: 'ABC12345' }).success,
    ).toBe(true);
  });

  it('idType=no_id nie wymaga identyfikatora', () => {
    expect(buyerB2CSchema.safeParse({ ...base, idType: 'no_id' }).success).toBe(true);
  });
});

describe('buyerSchema — discriminated union b2b/b2c', () => {
  it('rozróżnia b2b (NIP) i b2c (PESEL) po polu type', () => {
    const b2b = buyerSchema.safeParse({
      type: 'b2b',
      idType: 'nip',
      nip: VALID_NIP,
      name: 'Firma',
      address: validAddress,
    });
    expect(b2b.success).toBe(true);

    const b2c = buyerSchema.safeParse({
      type: 'b2c',
      idType: 'no_id',
      name: 'Osoba',
      address: validAddress,
    });
    expect(b2c.success).toBe(true);
  });

  it('zły type odrzucony', () => {
    expect(buyerSchema.safeParse({ type: 'b2x', name: 'X' }).success).toBe(false);
  });
});
