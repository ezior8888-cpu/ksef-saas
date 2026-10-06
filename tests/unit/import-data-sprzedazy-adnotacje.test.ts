import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MemoryTables } from './helpers/baza-w-pamieci';

const db = vi.hoisted(() => ({ tables: {} as MemoryTables }));
vi.mock('@/lib/supabase/server', async () => {
  const { memoryClient: client } = await import('./helpers/baza-w-pamieci');
  return { createAdminClient: () => client(db.tables) };
});
vi.mock('@/lib/supabase/admin', async () => {
  const { memoryClient: client } = await import('./helpers/baza-w-pamieci');
  return { createAdminClient: () => client(db.tables) };
});

import { fetchInvoicesForExport } from '@/lib/exports/data-fetcher';
import { generateJpkFa } from '@/lib/exports/jpk-fa-generator';
import { validateJpkFa } from '@/lib/exports/jpk-fa-validator';
import { generateJpkV7m } from '@/lib/exports/jpk-v7m-generator';
import { validateJpkV7m } from '@/lib/exports/jpk-v7m-validator';
import { parseFa3Xml } from '@/lib/import/fa3-parser';
import { processImportedInvoices } from '@/lib/import/import-engine';
import { parentAnnotationsForCorrection } from '@/lib/invoices/correction-annotations';
import { generateFA3Xml } from '@/lib/xml/fa3-generator';
import { finalizeInvoice } from '@/lib/xml/invoice-calculator';
import { validateFA3 } from '@/lib/xml/validator';
import type { Invoice, VatRate } from '@/types/invoice';

/**
 * C5b (plan „zero zgubionych faktur”, C5): import historii z KSeF gubił datę
 * sprzedaży (P_6, OkresFa, P_6A — `sale_date` zawsze NULL) i całe Adnotacje
 * (metoda kasowa, MPP, samofakturowanie, odwrotne obciążenie, zwolnienie,
 * procedury szczególne). JPK dostawał wtedy „nie dotyczy” tam, gdzie oryginał
 * w KSeF mówi „tak”, a faktury z procedurą, której FaktFlow nie wykazuje
 * (P_23, marża, nowe środki transportu, FP, TP, GTU…), szły do JPK po cichu.
 *
 * Prawdziwy łańcuch jak w C5a: plik FA(3) z generatora (zmieniony tak, jak
 * wystawiłby go inny program, i sprawdzony XSD MF) → `parseFa3Xml` →
 * `processImportedInvoices` → `fetchInvoicesForExport` → JPK z walidacją XSD.
 * Atrapa tylko bazy. NIP fikcyjny 1234567890 (AGENTS.md).
 */

const T = 'firma-a';
const NIP = '1234567890';
const ADRES = {
  voivodeship: 'MAZOWIECKIE', county: 'Warszawa', commune: 'Mokotów', street: 'ul. Testowa',
  buildingNumber: '1', city: 'Warszawa', postCode: '00-001',
};
const BASIS = 'art. 113 ust. 1 ustawy o VAT';

let ksefCounter = 0;
const ksefNumber = () => `${NIP}-20260910-0100A0B0C0D${++ksefCounter}-AF`.slice(0, 35);

function invoice(number: string, lines: Array<{ rate: VatRate; net: number }>, o: Partial<Invoice> = {}): Invoice {
  const finalized = finalizeInvoice({
    internalNumber: number,
    type: 'VAT',
    issueDate: '2026-09-10',
    saleDate: '2026-09-10',
    seller: { nip: NIP, name: 'Firma testowa', address: { countryCode: 'PL', addressLine1: 'ul. Testowa 1', addressLine2: '00-001 Warszawa' } },
    buyer: { nip: NIP, name: 'Nabywca testowy', address: { countryCode: 'PL', addressLine1: 'ul. Testowa 2', addressLine2: '00-002 Warszawa' } },
    lines: lines.map((l, i) => ({ ordinal: i + 1, name: `Usługa ${i + 1}`, unit: 'usł.', quantity: 1, unitPriceNet: l.net, vatRate: l.rate })),
    payment: { currency: 'PLN', dueDate: '2026-09-24', method: 'transfer', bankAccount: '61109010140000071219812874' },
    ...o,
  } as Invoice);
  const needsBasis = lines.some((l) => l.rate === 'zw');
  return (needsBasis ? { ...finalized, annotations: { vatExemptionBasis: BASIS } } : finalized) as Invoice;
}

// Fikcyjny NIP nie ma sumy kontrolnej — walidacja treści wyłączona, XSD sprawdzamy osobno.
const xmlOf = (inv: Invoice) => generateFA3Xml(inv, { validate: false, generatedAt: new Date('2026-09-10T08:00:00Z') });
const xml23 = (number: string) => xmlOf(invoice(number, [{ rate: '23', net: 1000 }]));

// ── Zmiany pliku, jakie robi inny program wystawiający fakturę ───────────────
const replaceOnce = (xml: string, from: string, to: string) => {
  expect(xml, `brak ${from} w pliku`).toContain(from);
  return xml.replace(from, to);
};
const setP6 = (xml: string, date: string) => xml.replace(/<P_6>[^<]*<\/P_6>/, `<P_6>${date}</P_6>`);
const noP6 = (xml: string) => xml.replace(/<P_6>[^<]*<\/P_6>/, '');
const period = (xml: string, from: string, to: string) =>
  xml.replace(/<P_6>[^<]*<\/P_6>/, `<OkresFa><P_6_Od>${from}</P_6_Od><P_6_Do>${to}</P_6_Do></OkresFa>`);
const lineDates = (xml: string, dates: string[]) =>
  dates.reduce((x, d, i) => replaceOnce(x, `<NrWierszaFa>${i + 1}</NrWierszaFa>`, `<NrWierszaFa>${i + 1}</NrWierszaFa><P_6A>${d}</P_6A>`), xml);
const flag = (xml: string, field: string, value: string) => replaceOnce(xml, `<${field}>2</${field}>`, `<${field}>${value}</${field}>`);
const afterRodzaj = (xml: string, fragment: string) => replaceOnce(xml, '</RodzajFaktury>', `</RodzajFaktury>${fragment}`);
const afterP12 = (xml: string, fragment: string) => replaceOnce(xml, '</P_12>', `</P_12>${fragment}`);

async function expectSchemaValid(xml: string) {
  const result = await validateFA3(xml);
  expect(result.errors, 'plik testowy musi przejść XSD FA(3) — taki KSeF przyjmuje').toEqual([]);
  expect(result.valid).toBe(true);
}

async function importXml(xml: string, o: { direction?: 'outgoing' | 'incoming'; ksef?: string } = {}) {
  return processImportedInvoices({
    tenantId: T,
    importJobId: 'job-1',
    source: 'ksef_history',
    invoiceDirection: o.direction ?? 'outgoing',
    invoiceKsefStatus: 'accepted',
    ksefEnvironment: 'test',
    invoices: [parseFa3Xml(xml, { ksefNumber: o.ksef ?? ksefNumber() })],
  });
}

const stored = (number: string) => db.tables.invoices!.find((r) => r.internal_number === number)!;
const fa3 = (number: string) => stored(number).fa3_data as Record<string, unknown>;

async function exportData() {
  return fetchInvoicesForExport({ tenantId: T, periodStart: '2026-09-01', periodEnd: '2026-09-30', direction: 'issued' });
}
async function jpkFa() {
  const data = await exportData();
  return generateJpkFa({
    issuer: { ...data.issuer, taxOfficeCode: '1433', registeredAddress: ADRES },
    periodStart: '2026-09-01', periodEnd: '2026-09-30', issuedInvoices: data.issuedInvoices,
    generatedAt: new Date('2026-10-01T08:00:00Z'),
  });
}
async function jpkV7m() {
  const data = await exportData();
  return generateJpkV7m({
    issuer: { nip: NIP, name: 'Firma testowa', email: 'biuro@example.test', taxOfficeCode: '1433' },
    periodStart: '2026-09-01', periodEnd: '2026-09-30', issuedInvoices: data.issuedInvoices,
    generatedAt: new Date('2026-10-01T10:00:00Z'),
  });
}
function fragment(xml: string, start: string, end: string): string {
  const i = xml.indexOf(start);
  expect(i, `brak ${start}`).toBeGreaterThanOrEqual(0);
  return xml.slice(i, xml.indexOf(end, i));
}
async function expectJpkRefusal(number: string, reason: RegExp) {
  await expect(jpkFa()).rejects.toThrow(new RegExp(`JPK wstrzymany:.*${number.replace(/\//g, '\\/')}`));
  await expect(jpkFa()).rejects.toThrow(reason);
  await expect(jpkV7m()).rejects.toThrow(reason);
}

beforeEach(() => {
  vi.stubEnv('KSEF_ENV', 'test');
  ksefCounter = 0;
  db.tables = {
    tenants: [{ id: T, nip: NIP, name: 'Firma testowa', address_json: null }],
    invoices: [], invoice_line_items: [], contractors: [], products: [], expenses: [], xml_documents: [],
  };
});
afterEach(() => vi.unstubAllEnvs());

describe('C5b: data sprzedaży z pliku KSeF (P_6, OkresFa, P_6A)', () => {
  it('P_6 inna niż data wystawienia → sale_date, JPK_FA P_6, JPK_V7M DataSprzedazy (XSD MF)', async () => {
    const xml = setP6(xml23('FV/P6/1'), '2026-08-28');
    await expectSchemaValid(xml);
    await importXml(xml);

    expect(stored('FV/P6/1').sale_date).toBe('2026-08-28');
    const fa = await jpkFa();
    expect(fragment(fa, '<P_2A>FV/P6/1', '</Faktura>')).toContain('<P_6>2026-08-28</P_6>');
    expect((await validateJpkFa(fa)).errors).toEqual([]);
    const v7m = await jpkV7m();
    expect(fragment(v7m, 'FV/P6/1', '</SprzedazWiersz>')).toContain('<DataSprzedazy>2026-08-28</DataSprzedazy>');
    expect((await validateJpkV7m(v7m)).errors).toEqual([]);
  });

  it('bez P_6 → sale_date NULL (data sprzedaży = data wystawienia)', async () => {
    await importXml(noP6(xml23('FV/P6/2')));
    expect(stored('FV/P6/2').sale_date).toBeNull();
  });

  it('OkresFa → sale_date = koniec okresu (P_6_Do), okres zapisany w fa3_data.saleDates', async () => {
    const xml = period(xml23('FV/OKR/1'), '2026-09-01', '2026-09-30');
    await expectSchemaValid(xml);
    await importXml(xml);
    expect(stored('FV/OKR/1').sale_date).toBe('2026-09-30');
    expect(fa3('FV/OKR/1').saleDates).toEqual({ period: { from: '2026-09-01', to: '2026-09-30' } });
  });

  it('P_6A ta sama na każdej pozycji, bez P_6 → sale_date z pozycji', async () => {
    const xml = lineDates(noP6(xmlOf(invoice('FV/P6A/1', [{ rate: '23', net: 1000 }, { rate: '8', net: 100 }]))), ['2026-09-05', '2026-09-05']);
    await expectSchemaValid(xml);
    await importXml(xml);
    expect(stored('FV/P6A/1').sale_date).toBe('2026-09-05');
  });

  it('pozycje z różnymi P_6A → bez jednej daty: ostrzeżenie na początku raportu i odmowa JPK z numerem', async () => {
    const xml = lineDates(noP6(xmlOf(invoice('FV/P6A/2', [{ rate: '23', net: 1000 }, { rate: '8', net: 100 }]))), ['2026-08-28', '2026-09-05']);
    await expectSchemaValid(xml);
    const result = await importXml(xml);

    expect(result.invoicesImported).toBe(1);
    expect(stored('FV/P6A/2').sale_date).toBeNull();
    expect(fa3('FV/P6A/2').saleDates).toMatchObject({ unclear: true });
    expect(result.warnings[0]).toContain('FV/P6A/2');
    expect(result.warnings[0]).toContain('P_6A');
    await expectJpkRefusal('FV/P6A/2', /różnymi datami sprzedaży/);
  });

  it('P_6 sprzeczna z P_6A wszystkich pozycji → niejasna data, odmowa JPK (recenzja projektu, B2)', async () => {
    const xml = lineDates(setP6(xml23('FV/P6A/3'), '2026-08-28'), ['2026-09-05']);
    await expectSchemaValid(xml);
    await importXml(xml);
    expect(fa3('FV/P6A/3').saleDates).toMatchObject({ unclear: true });
    await expectJpkRefusal('FV/P6A/3', /różnymi datami sprzedaży/);
  });

  it('zaliczka z P_6 (data otrzymania zaliczki) → sale_date NULL, jak zaliczki FaktFlow', async () => {
    await importXml(replaceOnce(setP6(xml23('ZAL/P6/1'), '2026-08-28'), '<RodzajFaktury>VAT</RodzajFaktury>', '<RodzajFaktury>ZAL</RodzajFaktury>'));
    expect(stored('ZAL/P6/1').sale_date).toBeNull();
  });
});

describe('C5b: adnotacje z pliku KSeF w fa3_data.annotations (jak faktury FaktFlow)', () => {
  it('P_16 i P_18A = 1 → liczby 1|2 dla wszystkich flag; JPK_FA P_16/P_18A; korekta dziedziczy', async () => {
    const xml = flag(flag(xml23('FV/MPP/1'), 'P_16', '1'), 'P_18A', '1');
    await expectSchemaValid(xml);
    await importXml(xml);

    expect(fa3('FV/MPP/1').annotations).toEqual({
      cashMethod: 1, selfInvoicing: 2, reverseCharge: 2, splitPayment: 1, simplifiedProcedure: 2, newMeansOfTransport: 2,
    });
    const fa = fragment(await jpkFa(), '<P_2A>FV/MPP/1', '</Faktura>');
    expect(fa).toContain('<P_16>true</P_16>');
    expect(fa).toContain('<P_18A>true</P_18A>');
    expect(parentAnnotationsForCorrection(stored('FV/MPP/1').fa3_data)).toEqual({ cashMethod: 1, splitPayment: 1 });
  });

  it('zwolnienie P_19 + P_19A → podstawa i rodzaj P_19A; JPK_FA P_19A', async () => {
    const xml = xmlOf(invoice('FV/ZW/1', [{ rate: 'zw', net: 500 }]));
    await expectSchemaValid(xml);
    await importXml(xml);
    expect(fa3('FV/ZW/1').annotations).toMatchObject({ vatExemptionBasis: BASIS, vatExemptionBasisKind: 'P_19A' });
    const fa = await jpkFa();
    expect(fragment(fa, '<P_2A>FV/ZW/1', '</Faktura>')).toContain(`<P_19A>${BASIS}</P_19A>`);
    expect((await validateJpkFa(fa)).errors).toEqual([]);
  });

  it('podstawa zwolnienia z dyrektywy (P_19B) → JPK_FA P_19B, nie P_19A (decyzja Bartosza 06.10)', async () => {
    const basis = 'art. 132 ust. 1 lit. i dyrektywy 2006/112/WE';
    const xml = replaceOnce(xmlOf(invoice('FV/ZW/2', [{ rate: 'zw', net: 500 }])), `<P_19A>${BASIS}</P_19A>`, `<P_19B>${basis}</P_19B>`);
    await expectSchemaValid(xml);
    await importXml(xml);
    const fa = await jpkFa();
    const f = fragment(fa, '<P_2A>FV/ZW/2', '</Faktura>');
    expect(f).toContain(`<P_19B>${basis}</P_19B>`);
    expect(f).not.toContain('<P_19A>');
    expect((await validateJpkFa(fa)).errors).toEqual([]);
  });

  it('samofakturowanie (P_17 = 1) → JPK_FA P_17 true', async () => {
    const xml = flag(xml23('FV/P17/1'), 'P_17', '1');
    await expectSchemaValid(xml);
    await importXml(xml);
    expect(fragment(await jpkFa(), '<P_2A>FV/P17/1', '</Faktura>')).toContain('<P_17>true</P_17>');
  });

  it('jawne odwrotne obciążenie (P_18 = 1) przy pozycji „np I” → JPK_FA P_18 true', async () => {
    const xml = flag(xmlOf(invoice('FV/P18/1', [{ rate: 'np', net: 700 }])), 'P_18', '1');
    await expectSchemaValid(xml);
    await importXml(xml);
    expect(fragment(await jpkFa(), '<P_2A>FV/P18/1', '</Faktura>')).toContain('<P_18>true</P_18>');
  });

  it('zwolnienie (P_19) przy pozycji 23% → niezgodne ze stawkami, odmowa JPK', async () => {
    const xml = replaceOnce(xml23('FV/ZW/3'), '<Zwolnienie><P_19N>1</P_19N></Zwolnienie>', `<Zwolnienie><P_19>1</P_19><P_19A>${BASIS}</P_19A></Zwolnienie>`);
    await expectSchemaValid(xml);
    await importXml(xml);
    await expectJpkRefusal('FV/ZW/3', /zwolnienie z VAT \(P_19\) niezgodne ze stawkami/);
  });

  it('adnotacja nieczytelna (P_16 „tak”) → faktura zapisana, ostrzeżenie, odmowa JPK — nigdy domyślne „nie”', async () => {
    // Plik celowo spoza XSD (KSeF by go nie przyjął) — sprawdzamy, że import nie zgaduje.
    const xml = replaceOnce(xml23('FV/ADN/1'), '<P_16>2</P_16>', '<P_16>tak</P_16>');
    const result = await importXml(xml);

    expect(result.invoicesImported).toBe(1);
    expect(fa3('FV/ADN/1').annotations).not.toHaveProperty('cashMethod');
    expect(fa3('FV/ADN/1').annotationProblems).toEqual([expect.stringContaining('P_16')]);
    expect(result.warnings[0]).toContain('FV/ADN/1');
    await expectJpkRefusal('FV/ADN/1', /adnotacj.*nie udało się odczytać/);
  });

  it('plik FA(2) (inna przestrzeń nazw, kod „FA (2)”) → te same adnotacje i data sprzedaży', async () => {
    const xml = setP6(flag(xml23('FV/FA2/1'), 'P_16', '1'), '2026-08-28')
      .replace('http://crd.gov.pl/wzor/2025/06/25/13775/', 'http://crd.gov.pl/wzor/2023/06/29/12648/')
      .replace('kodSystemowy="FA (3)" wersjaSchemy="1-0E"', 'kodSystemowy="FA (2)" wersjaSchemy="1-0E"')
      .replace('<WariantFormularza>3</WariantFormularza>', '<WariantFormularza>2</WariantFormularza>');
    const parsed = parseFa3Xml(xml, { ksefNumber: ksefNumber() });
    expect(parsed.formCode).toBe('FA (2)');
    expect(parsed.warnings.join(' ')).not.toMatch(/FA \(1\)/);
    await processImportedInvoices({
      tenantId: T, importJobId: 'job-1', source: 'ksef_history', invoiceDirection: 'outgoing',
      invoiceKsefStatus: 'accepted', ksefEnvironment: 'test', invoices: [parsed],
    });
    expect(stored('FV/FA2/1').sale_date).toBe('2026-08-28');
    expect(fa3('FV/FA2/1').annotations).toMatchObject({ cashMethod: 1 });
  });
});

describe('C5b: procedury i oznaczenia, których FaktFlow nie wykazuje w JPK → zatrzymane z numerem', () => {
  const PODMIOT_UPOWAZNIONY = '<PodmiotUpowazniony><DaneIdentyfikacyjne><NIP>1234567890</NIP><Nazwa>Komornik Sądowy</Nazwa></DaneIdentyfikacyjne>' +
    '<Adres><KodKraju>PL</KodKraju><AdresL1>ul. Sądowa 1</AdresL1></Adres><RolaPU>1</RolaPU></PodmiotUpowazniony>';
  const NST = '<NoweSrodkiTransportu><P_22>1</P_22><P_42_5>2</P_42_5><NowySrodekTransportu><P_22A>2026-09-01</P_22A>' +
    '<P_NrWierszaNST>1</P_NrWierszaNST><P_22B>1500</P_22B></NowySrodekTransportu></NoweSrodkiTransportu>';

  it.each([
    ['procedura trójstronna (P_23)', (x: string) => flag(x, 'P_23', '1'), /procedura trójstronna \(P_23\)/],
    ['marża — towary używane', (x: string) => replaceOnce(x, '<PMarzy><P_PMarzyN>1</P_PMarzyN></PMarzy>', '<PMarzy><P_PMarzy>1</P_PMarzy><P_PMarzy_3_1>1</P_PMarzy_3_1></PMarzy>'), /towary używane/],
    ['nowe środki transportu (P_22)', (x: string) => replaceOnce(x, '<NoweSrodkiTransportu><P_22N>1</P_22N></NoweSrodkiTransportu>', NST), /nowych środków transportu \(P_22\)/],
    ['faktura do paragonu (FP)', (x: string) => afterRodzaj(x, '<FP>1</FP>'), /do paragonu \(FP\)/],
    ['powiązania stron (TP)', (x: string) => afterRodzaj(x, '<TP>1</TP>'), /powiązania .*\(TP\)/],
    ['oznaczenie GTU w pozycji', (x: string) => afterP12(x, '<GTU>GTU_12</GTU>'), /GTU_12/],
    ['procedura w pozycji (WSTO_EE)', (x: string) => afterP12(x, '<Procedura>WSTO_EE</Procedura>'), /WSTO_EE/],
    ['podmiot upoważniony (komornik, RolaPU 1)', (x: string) => replaceOnce(x, '</Podmiot2>', `</Podmiot2>${PODMIOT_UPOWAZNIONY}`), /podmiot upoważniony/],
  ])('%s → ostrzeżenie na początku raportu i odmowa JPK_FA i JPK_V7M', async (_name, change, reason) => {
    const xml = change(xml23('FV/PROC/1'));
    await expectSchemaValid(xml);
    const result = await importXml(xml);
    expect(result.invoicesImported).toBe(1);
    expect(result.warnings[0]).toContain('FV/PROC/1');
    expect(result.warnings[0]).toMatch(reason);
    await expectJpkRefusal('FV/PROC/1', reason);
  });

  it('faktura zakupu z procedurą trójstronną → adnotacje zapisane, bez komunikatu o JPK (dotyczy sprzedaży)', async () => {
    const result = await importXml(flag(xml23('FZ/P23/1'), 'P_23', '1'), { direction: 'incoming' });
    expect(fa3('FZ/P23/1').annotations).toMatchObject({ simplifiedProcedure: 1 });
    expect(result.warnings.join('\n')).not.toMatch(/JPK_FA i JPK_V7M/);
  });
});

describe('C5b: faktury zaimportowane przed C5b i ponowienie importu', () => {
  it('wiersz bez adnotacji (import sprzed C5b) → JPK odmawia z podpowiedzią; ponowny import uzupełnia datę i adnotacje', async () => {
    const xml = flag(setP6(xml23('FV/STARA/1'), '2026-08-28'), 'P_18A', '1');
    const ksef = ksefNumber();
    await importXml(xml, { ksef });
    // Stan sprzed C5b: tylko {import, parsed} i sale_date NULL.
    const row = stored('FV/STARA/1');
    const { import: meta, parsed } = row.fa3_data as Record<string, unknown>;
    row.fa3_data = { import: meta, parsed };
    row.sale_date = null;

    await expectJpkRefusal('FV/STARA/1', /zaimportowana przed .*ponów import/i);

    const again = await importXml(xml, { ksef });
    expect(again.invoicesFailed).toBe(0);
    expect(db.tables.invoices!.filter((r) => r.internal_number === 'FV/STARA/1')).toHaveLength(1);
    expect(stored('FV/STARA/1').sale_date).toBe('2026-08-28');
    expect(fa3('FV/STARA/1').annotations).toMatchObject({ splitPayment: 1 });
    expect(fragment(await jpkFa(), '<P_2A>FV/STARA/1', '</Faktura>')).toContain('<P_18A>true</P_18A>');
  });

  it('ponowienie importu tej samej faktury (job od zera) → duplikat bez błędu, adnotacje bez zmian', async () => {
    const xml = flag(xml23('FV/PON/1'), 'P_16', '1');
    const ksef = ksefNumber();
    await importXml(xml, { ksef });
    const before = structuredClone(fa3('FV/PON/1').annotations);
    const again = await importXml(xml, { ksef });
    expect(again.invoicesFailed).toBe(0);
    expect(again.invoicesImported).toBe(0);
    expect(fa3('FV/PON/1').annotations).toEqual(before);
  });
});
