import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  roundToCents,
  roundToDecimals,
  getVatPercentage,
  calculateLineItem,
  summarizeVatPerRate,
  calculateInvoiceTotals,
  finalizeInvoice,
  validateNipChecksum,
  validateIban,
  parseIsoDate,
  validateInvoice,
  type InvoiceInput,
} from './invoice-calculator';
import type { Invoice, InvoiceLineItem } from '@/types/invoice';

// ═══════════════════════════════════════════════════════════════
// Zaokrąglanie
// ═══════════════════════════════════════════════════════════════

describe('roundToCents', () => {
  it('zaokrągla typowe kwoty do 2 miejsc', () => {
    assert.equal(roundToCents(1.234), 1.23);
    assert.equal(roundToCents(1.235), 1.24);
    assert.equal(roundToCents(1000), 1000);
  });

  it('obsługuje edge case 1.005 (bug naiwnego Math.round)', () => {
    // Naiwne: Math.round(1.005 * 100) / 100 === 1 (źle)
    // Nasza wersja z epsilon: 1.01 (poprawnie)
    assert.equal(roundToCents(1.005), 1.01);
  });

  it('obsługuje liczby ujemne symetrycznie', () => {
    assert.equal(roundToCents(-1.005), -1.01);
    assert.equal(roundToCents(-1.234), -1.23);
  });

  it('zwraca 0 dla 0', () => {
    assert.equal(roundToCents(0), 0);
  });

  it('sumuje bez akumulacji błędów FP', () => {
    // 0.1 + 0.2 === 0.30000000000000004 w IEEE 754
    assert.equal(roundToCents(0.1 + 0.2), 0.3);
  });
});

describe('roundToDecimals', () => {
  it('zaokrągla do 8 miejsc (precyzja P_9A)', () => {
    assert.equal(roundToDecimals(1.123456789, 8), 1.12345679);
  });
  it('zaokrągla do 4 miejsc', () => {
    assert.equal(roundToDecimals(1.23456, 4), 1.2346);
  });
});

// ═══════════════════════════════════════════════════════════════
// VAT
// ═══════════════════════════════════════════════════════════════

describe('getVatPercentage', () => {
  it('mapuje stawki liczbowe', () => {
    assert.equal(getVatPercentage('23'), 23);
    assert.equal(getVatPercentage('8'), 8);
    assert.equal(getVatPercentage('5'), 5);
    assert.equal(getVatPercentage('0'), 0);
  });
  it('zw/oo/np dają 0', () => {
    assert.equal(getVatPercentage('zw'), 0);
    assert.equal(getVatPercentage('oo'), 0);
    assert.equal(getVatPercentage('np'), 0);
  });
});

describe('calculateLineItem', () => {
  it('23% od 1000 netto daje 230 VAT i 1230 brutto', () => {
    const result = calculateLineItem({ quantity: 1, unitPriceNet: 1000, vatRate: '23' });
    assert.deepEqual(result, { netAmount: 1000, vatAmount: 230, grossAmount: 1230 });
  });

  it('8% od 250 netto daje 20 VAT', () => {
    const result = calculateLineItem({ quantity: 5, unitPriceNet: 50, vatRate: '8' });
    assert.deepEqual(result, { netAmount: 250, vatAmount: 20, grossAmount: 270 });
  });

  it('zw daje 0 VAT', () => {
    const result = calculateLineItem({ quantity: 1, unitPriceNet: 100, vatRate: 'zw' });
    assert.deepEqual(result, { netAmount: 100, vatAmount: 0, grossAmount: 100 });
  });

  it('zaokrągla pośrednie wyniki', () => {
    // 3 * 33.33 = 99.99 netto, 23% = 22.9977 → 23.00 vat, brutto 122.99
    const result = calculateLineItem({ quantity: 3, unitPriceNet: 33.33, vatRate: '23' });
    assert.equal(result.netAmount, 99.99);
    assert.equal(result.vatAmount, 23);
    assert.equal(result.grossAmount, 122.99);
  });
});

// ═══════════════════════════════════════════════════════════════
// Sumy per stawka
// ═══════════════════════════════════════════════════════════════

const makeLine = (
  overrides: Partial<InvoiceLineItem> & Pick<InvoiceLineItem, 'ordinal' | 'vatRate'>
): InvoiceLineItem => {
  const base: InvoiceLineItem = {
    ordinal: overrides.ordinal,
    name: 'Testowa pozycja',
    unit: 'szt.',
    quantity: 1,
    unitPriceNet: 100,
    vatRate: overrides.vatRate,
    netAmount: 100,
    vatAmount: overrides.vatRate === '23' ? 23 : 0,
    grossAmount: overrides.vatRate === '23' ? 123 : 100,
  };
  return { ...base, ...overrides };
};

describe('summarizeVatPerRate', () => {
  it('grupuje pozycje po stawce', () => {
    const lines: InvoiceLineItem[] = [
      makeLine({ ordinal: 1, vatRate: '23', netAmount: 1000, vatAmount: 230, grossAmount: 1230 }),
      makeLine({ ordinal: 2, vatRate: '23', netAmount: 500, vatAmount: 115, grossAmount: 615 }),
      makeLine({ ordinal: 3, vatRate: '8', netAmount: 200, vatAmount: 16, grossAmount: 216 }),
    ];
    const result = summarizeVatPerRate(lines);
    assert.equal(result.length, 2);
    const rate23 = result.find((r) => r.rate === '23');
    const rate8 = result.find((r) => r.rate === '8');
    assert.deepEqual(rate23, { rate: '23', netSum: 1500, vatSum: 345 });
    assert.deepEqual(rate8, { rate: '8', netSum: 200, vatSum: 16 });
  });

  it('pusta lista → pusta tablica', () => {
    assert.deepEqual(summarizeVatPerRate([]), []);
  });
});

describe('calculateInvoiceTotals', () => {
  it('sumuje wszystkie pozycje', () => {
    const lines: InvoiceLineItem[] = [
      makeLine({ ordinal: 1, vatRate: '23', netAmount: 1000, vatAmount: 230, grossAmount: 1230 }),
      makeLine({ ordinal: 2, vatRate: '8', netAmount: 200, vatAmount: 16, grossAmount: 216 }),
    ];
    assert.deepEqual(calculateInvoiceTotals(lines), {
      netTotal: 1200,
      vatTotal: 246,
      grossTotal: 1446,
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// finalizeInvoice
// ═══════════════════════════════════════════════════════════════

const SAMPLE_INPUT: InvoiceInput = {
  internalNumber: 'FV/2026/04/001',
  type: 'VAT',
  issueDate: '2026-04-19',
  seller: {
    nip: '5260001246',
    name: 'Sprzedawca Sp. z o.o.',
    address: { countryCode: 'PL', addressLine1: 'ul. Testowa 1', addressLine2: '00-001 Warszawa' },
  },
  buyer: {
    nip: '5252344078', // prawdziwy NIP z checksumem
    name: 'Nabywca Sp. z o.o.',
    address: { countryCode: 'PL', addressLine1: 'ul. Inna 2', addressLine2: '00-002 Warszawa' },
  },
  lines: [
    { ordinal: 1, name: 'Usługa programistyczna', unit: 'godz.', quantity: 10, unitPriceNet: 200, vatRate: '23' },
  ],
  payment: {
    currency: 'PLN',
    dueDate: '2026-05-19',
    method: 'transfer',
    bankAccount: 'PL61109010140000071219812874',
  },
};

describe('finalizeInvoice', () => {
  it('buduje pełny Invoice z wejścia bez wyliczeń', () => {
    const invoice = finalizeInvoice(SAMPLE_INPUT);
    assert.equal(invoice.lines.length, 1);
    assert.equal(invoice.lines[0].netAmount, 2000);
    assert.equal(invoice.lines[0].vatAmount, 460);
    assert.equal(invoice.lines[0].grossAmount, 2460);
    assert.equal(invoice.netTotal, 2000);
    assert.equal(invoice.vatTotal, 460);
    assert.equal(invoice.grossTotal, 2460);
    assert.equal(invoice.payment.amountDue, 2460);
  });
});

// ═══════════════════════════════════════════════════════════════
// NIP checksum
// ═══════════════════════════════════════════════════════════════

describe('validateNipChecksum', () => {
  it('akceptuje prawdziwy NIP testowy KSeF (5260001246)', () => {
    assert.equal(validateNipChecksum('5260001246'), true);
  });
  it('akceptuje inny znany NIP (5252344078)', () => {
    assert.equal(validateNipChecksum('5252344078'), true);
  });
  it('odrzuca 1234567890 (zły checksum)', () => {
    assert.equal(validateNipChecksum('1234567890'), false);
  });
  it('odrzuca za krótki', () => {
    assert.equal(validateNipChecksum('123'), false);
  });
  it('odrzuca z literami', () => {
    assert.equal(validateNipChecksum('PL52600012'), false);
  });
  it('odrzuca pusty', () => {
    assert.equal(validateNipChecksum(''), false);
  });
});

// ═══════════════════════════════════════════════════════════════
// IBAN
// ═══════════════════════════════════════════════════════════════

describe('validateIban', () => {
  it('akceptuje prawidłowy polski IBAN', () => {
    assert.equal(validateIban('PL61109010140000071219812874'), true);
  });
  it('akceptuje IBAN ze spacjami', () => {
    assert.equal(validateIban('PL61 1090 1014 0000 0712 1981 2874'), true);
  });
  it('odrzuca zły checksum', () => {
    assert.equal(validateIban('PL00109010140000071219812874'), false);
  });
  it('odrzuca za krótki', () => {
    assert.equal(validateIban('PL12345'), false);
  });
  it('odrzuca bez kodu kraju', () => {
    assert.equal(validateIban('1234567890'), false);
  });
});

// ═══════════════════════════════════════════════════════════════
// parseIsoDate
// ═══════════════════════════════════════════════════════════════

describe('parseIsoDate', () => {
  it('parsuje prawidłową datę', () => {
    const d = parseIsoDate('2026-04-19');
    assert.ok(d);
    assert.equal(d.getUTCFullYear(), 2026);
    assert.equal(d.getUTCMonth(), 3);
    assert.equal(d.getUTCDate(), 19);
  });
  it('odrzuca 2026-02-31 (normalizowana na 03-03)', () => {
    assert.equal(parseIsoDate('2026-02-31'), null);
  });
  it('odrzuca zły format', () => {
    assert.equal(parseIsoDate('19.04.2026'), null);
    assert.equal(parseIsoDate('2026/04/19'), null);
    assert.equal(parseIsoDate(''), null);
  });
});

// ═══════════════════════════════════════════════════════════════
// validateInvoice - happy path i typowe błędy
// ═══════════════════════════════════════════════════════════════

const MOCK_NOW = new Date('2026-04-19T12:00:00Z');

describe('validateInvoice', () => {
  it('happy path - prawidłowa faktura bez błędów', () => {
    const invoice = finalizeInvoice(SAMPLE_INPUT);
    const errors = validateInvoice(invoice, MOCK_NOW);
    assert.deepEqual(errors, []);
  });

  it('odrzuca zły NIP sprzedawcy', () => {
    const invoice = finalizeInvoice({
      ...SAMPLE_INPUT,
      seller: { ...SAMPLE_INPUT.seller, nip: '1234567890' },
    });
    const errors = validateInvoice(invoice, MOCK_NOW);
    assert.ok(errors.some((e) => e.includes('NIP sprzedawcy')));
  });

  it('odrzuca nabywcę bez identyfikatora', () => {
    const invoice: Invoice = {
      ...finalizeInvoice(SAMPLE_INPUT),
      buyer: {
        name: 'Jan Kowalski',
        address: { countryCode: 'PL', addressLine1: 'ul. X 1', addressLine2: '00-000 Warszawa' },
      },
    };
    const errors = validateInvoice(invoice, MOCK_NOW);
    assert.ok(errors.some((e) => e.includes('nabywca musi mieć') || e.includes('Nabywca musi')));
  });

  it('odrzuca nabywcę z dwoma identyfikatorami naraz', () => {
    const invoice: Invoice = {
      ...finalizeInvoice(SAMPLE_INPUT),
      buyer: {
        ...SAMPLE_INPUT.buyer,
        vatUeNumber: 'DE123456789',
      },
    };
    const errors = validateInvoice(invoice, MOCK_NOW);
    assert.ok(errors.some((e) => e.includes('tylko jeden identyfikator')));
  });

  it('odrzuca datę wystawienia przed 2025-09-01', () => {
    const invoice = finalizeInvoice({ ...SAMPLE_INPUT, issueDate: '2025-08-31' });
    const errors = validateInvoice(invoice, MOCK_NOW);
    assert.ok(errors.some((e) => e.includes('wcześniejsza niż minimalna')));
  });

  it('odrzuca datę wystawienia > 30 dni w przyszłość', () => {
    const invoice = finalizeInvoice({ ...SAMPLE_INPUT, issueDate: '2026-06-01' });
    const errors = validateInvoice(invoice, MOCK_NOW);
    assert.ok(errors.some((e) => e.includes('30 dni w przyszłości')));
  });

  it('odrzuca saleDate > issueDate', () => {
    const invoice = finalizeInvoice({
      ...SAMPLE_INPUT,
      saleDate: '2026-05-01',
      issueDate: '2026-04-19',
    });
    const errors = validateInvoice(invoice, MOCK_NOW);
    assert.ok(errors.some((e) => e.includes('sprzedaży')));
  });

  it('odrzuca pustą listę pozycji', () => {
    const invoice: Invoice = { ...finalizeInvoice(SAMPLE_INPUT), lines: [], netTotal: 0, vatTotal: 0, grossTotal: 0, payment: { ...SAMPLE_INPUT.payment, amountDue: 0 } };
    const errors = validateInvoice(invoice, MOCK_NOW);
    assert.ok(errors.some((e) => e.includes('co najmniej jedną pozycję')));
  });

  it('odrzuca brak IBAN przy przelewie', () => {
    const invoice: Invoice = {
      ...finalizeInvoice(SAMPLE_INPUT),
      payment: {
        ...finalizeInvoice(SAMPLE_INPUT).payment,
        bankAccount: undefined,
      },
    };
    const errors = validateInvoice(invoice, MOCK_NOW);
    assert.ok(errors.some((e) => e.includes('numer rachunku')));
  });

  it('odrzuca zły IBAN', () => {
    const invoice: Invoice = {
      ...finalizeInvoice(SAMPLE_INPUT),
      payment: {
        ...finalizeInvoice(SAMPLE_INPUT).payment,
        bankAccount: 'PL00000000000000000000000000',
      },
    };
    const errors = validateInvoice(invoice, MOCK_NOW);
    assert.ok(errors.some((e) => e.includes('IBAN')));
  });

  it('akceptuje płatność gotówkową bez IBAN', () => {
    const invoice = finalizeInvoice({
      ...SAMPLE_INPUT,
      payment: { currency: 'PLN', dueDate: '2026-05-19', method: 'cash' },
    });
    const errors = validateInvoice(invoice, MOCK_NOW);
    assert.deepEqual(errors, []);
  });

  it('wykrywa rozjechane totale na fakturze', () => {
    const invoice: Invoice = {
      ...finalizeInvoice(SAMPLE_INPUT),
      netTotal: 9999,
    };
    const errors = validateInvoice(invoice, MOCK_NOW);
    assert.ok(errors.some((e) => e.includes('Suma netto')));
  });
});
