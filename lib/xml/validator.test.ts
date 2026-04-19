import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Invoice } from '@/types/invoice';
import { finalizeInvoice, type InvoiceInput } from './invoice-calculator';
import { generateFA3Xml } from './fa3-generator';
import { validateFA3, validateInvoiceXml } from './validator';

function baseInvoiceInput(overrides: Partial<InvoiceInput> = {}): InvoiceInput {
  return {
    internalNumber: 'FV 2026/04/001',
    type: 'VAT',
    issueDate: '2026-04-19',
    saleDate: '2026-04-19',
    seller: {
      nip: '5260001246',
      name: 'ACME Software sp. z o.o.',
      address: {
        countryCode: 'PL',
        addressLine1: 'ul. Przykładowa 1/2',
        addressLine2: '00-001 Warszawa',
      },
      email: 'biuro@acme.test',
    },
    buyer: {
      nip: '5252241585',
      name: 'Klient sp. z o.o.',
      address: {
        countryCode: 'PL',
        addressLine1: 'ul. Klienta 10',
        addressLine2: '02-001 Warszawa',
      },
      email: 'kontakt@klient.test',
    },
    lines: [
      {
        ordinal: 1,
        name: 'Licencja SaaS – plan Pro (miesiąc)',
        unit: 'usł.',
        quantity: 1,
        unitPriceNet: 199,
        vatRate: '23',
      },
    ],
    payment: {
      currency: 'PLN',
      dueDate: '2026-05-03',
      method: 'transfer',
      bankAccount: 'PL61109010140000071219812874',
      bankName: 'Santander Bank Polska',
    },
    ...overrides,
  };
}

function buildInvoice(overrides: Partial<InvoiceInput> = {}): Invoice {
  return finalizeInvoice(baseInvoiceInput(overrides));
}

test('validateFA3: poprawnie wygenerowany XML przechodzi walidację XSD', async () => {
  const xml = generateFA3Xml(buildInvoice());
  const result = await validateFA3(xml);

  assert.equal(
    result.valid,
    true,
    `oczekiwano valid=true, otrzymano błędy:\n${result.errors
      .map((e) => e.raw)
      .join('\n')}`,
  );
  assert.deepEqual(result.errors, []);
});

test('validateFA3: brak wymaganych elementów zwraca errory z lokalizacją', async () => {
  const xml = generateFA3Xml(buildInvoice());
  const broken = xml.replace(/<P_1>[^<]+<\/P_1>/, '');

  const result = await validateFA3(broken);

  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0, 'oczekiwano przynajmniej jednego błędu');

  const first = result.errors[0];
  assert.ok(first.line > 0, 'line powinien być > 0');
  assert.ok(first.message.length > 0);
  assert.ok(first.raw.includes('invoice.xml'));
});

test('validateFA3: niepoprawny format daty → schema validity error', async () => {
  const xml = generateFA3Xml(buildInvoice());
  const broken = xml.replace('<P_1>2026-04-19</P_1>', '<P_1>not-a-date</P_1>');

  const result = await validateFA3(broken);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /P_1|date|Data/i.test(e.message)),
    'oczekiwano błędu o P_1 / dacie',
  );
});

test('validateFA3: cache XSD - kolejne wywołania nie czytają z dysku', async () => {
  const xml = generateFA3Xml(buildInvoice());

  const r1 = await validateFA3(xml);
  const r2 = await validateFA3(xml);

  assert.equal(r1.valid, true);
  assert.equal(r2.valid, true);
});

test('validateInvoiceXml: alias dla validateFA3', async () => {
  const xml = generateFA3Xml(buildInvoice());
  const result = await validateInvoiceXml(xml);

  assert.equal(result.valid, true);
});
