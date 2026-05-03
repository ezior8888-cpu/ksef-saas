/**
 * Generator XML FA(3) dla faktur zaliczkowych (`ZAL`) i rozliczających (`ROZ`).
 * Sekwencje i nazwy jak w `lib/xml/schemas/fa3/schemat.xsd`
 * (`FakturaZaliczkowa`, `Rozliczenie/Odliczenia`, `DoZaplaty`).
 */

import { create } from 'xmlbuilder2';

import type { InvoiceLineItem, VatRate } from '@/types/invoice';
import {
  calculateInvoiceTotals,
  calculateLineItem,
  roundToCents,
  summarizeVatPerRate,
} from '@/lib/xml/invoice-calculator';
import type {
  AdvanceInvoiceData,
  BuyerData,
  FinalInvoiceData,
  InvoiceLine,
  SellerData,
} from '@/types/invoice-types';
import {
  calculateAdvanceTotals,
  calculateFinalInvoiceTotals,
} from '@/lib/invoices/calculator';

const FA3_NAMESPACE = 'http://crd.gov.pl/wzor/2025/06/25/13775/';
const ETD_NAMESPACE =
  'http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2022/01/05/eD/DefinicjeTypy/';

const FORM_SYSTEM_CODE = 'FA (3)';
const FORM_VERSION = '1-0E';
const FORM_VALUE = 'FA';
const DEFAULT_SYSTEM_INFO = 'KSeF SaaS v1.0';

interface VatRateMapping {
  netElement: string;
  vatElement?: string;
  p12Value: string;
}

/** Stawki używane na fakturze zaliczkowej (`AdvanceInvoiceData.vatRate`). */
type AdvanceVatRate = NonNullable<AdvanceInvoiceData['vatRate']>;

const ADVANCE_VAT_RATE_MAP: Record<
  AdvanceVatRate,
  VatRateMapping & { canonical: VatRate }
> = {
  '23': {
    canonical: '23',
    netElement: 'P_13_1',
    vatElement: 'P_14_1',
    p12Value: '23',
  },
  '8': { canonical: '8', netElement: 'P_13_2', vatElement: 'P_14_2', p12Value: '8' },
  '5': { canonical: '5', netElement: 'P_13_3', vatElement: 'P_14_3', p12Value: '5' },
  '0': { canonical: '0', netElement: 'P_13_6_1', p12Value: '0 KR' },
};

const FULL_VAT_RATE_MAP: Record<VatRate, VatRateMapping> = {
  '23': { netElement: 'P_13_1', vatElement: 'P_14_1', p12Value: '23' },
  '8': { netElement: 'P_13_2', vatElement: 'P_14_2', p12Value: '8' },
  '5': { netElement: 'P_13_3', vatElement: 'P_14_3', p12Value: '5' },
  '0': { netElement: 'P_13_6_1', p12Value: '0 KR' },
  zw: { netElement: 'P_13_7', p12Value: 'zw' },
  oo: { netElement: 'P_13_10', p12Value: 'oo' },
  np: { netElement: 'P_13_8', p12Value: 'np I' },
};

const P_13_ORDER: readonly string[] = [
  'P_13_1',
  'P_13_2',
  'P_13_3',
  'P_13_4',
  'P_13_5',
  'P_13_6_1',
  'P_13_6_2',
  'P_13_6_3',
  'P_13_7',
  'P_13_8',
  'P_13_9',
  'P_13_10',
  'P_13_11',
];

const PAYMENT_METHOD_MAP: Record<'transfer' | 'cash' | 'card', string> = {
  cash: '1',
  card: '2',
  transfer: '6',
};

export interface AdvanceInvoiceSettlementRow {
  internal_number: string;
  ksef_number?: string | null;
  /** Kwota zaliczki (brutto), trafia do `<Rozliczenie>/<Odliczenia>/<Kwota>`. */
  advance_amount: number;
  /** Dla tekstu pola `Powód` przy odliczeniu. */
  issue_date: string;
}

export interface GenerateAdvanceXmlOptions {
  generatedAt?: Date;
  prettyPrint?: boolean;
  systemInfo?: string;
}

function formatDecimal(value: number, decimals = 2): string {
  return value.toFixed(decimals);
}

function formatDate(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    throw new Error(`FA(3): nieprawidłowy format daty "${isoDate}" (YYYY-MM-DD).`);
  }
  return isoDate;
}

function formatTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function requireText(value: string | undefined | null, field: string): string {
  if (value === undefined || value === null || value === '') {
    throw new Error(`FA(3): wymagane pole "${field}" jest puste.`);
  }
  return value;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function emitVatSummariesFromMap(
  fa: any,
  summaries: ReturnType<typeof summarizeVatPerRate>,
  map: Record<VatRate, VatRateMapping>,
): void {
  const emissions = new Map<
    string,
    { netElement: string; vatElement?: string; netSum: number; vatSum: number }
  >();

  for (const s of summaries) {
    const mapping = map[s.rate];
    if (!mapping) {
      throw new Error(`FA(3): brak mapowania XSD dla stawki VAT "${String(s.rate)}".`);
    }
    emissions.set(mapping.netElement, {
      netElement: mapping.netElement,
      vatElement: mapping.vatElement,
      netSum: s.netSum,
      vatSum: s.vatSum,
    });
  }

  for (const elementName of P_13_ORDER) {
    const em = emissions.get(elementName);
    if (!em) continue;
    fa.ele(em.netElement).txt(formatDecimal(em.netSum));
    if (em.vatElement) {
      fa.ele(em.vatElement).txt(formatDecimal(em.vatSum));
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildAdnotacjeStandard(fa: any, lines: InvoiceLineItem[]): void {
  const adn = fa.ele('Adnotacje');
  const hasOoLine = lines.some((l) => l.vatRate === 'oo');
  const p18 = hasOoLine ? 1 : 2;
  const hasZwLine = lines.some((l) => l.vatRate === 'zw');
  if (hasZwLine) {
    throw new Error(
      'FA(3): stawka "zw" wymaga rozbudowanych pól Zwolnienie — MVP nieobsługiwane.',
    );
  }

  adn.ele('P_16').txt('2');
  adn.ele('P_17').txt('2');
  adn.ele('P_18').txt(String(p18));
  adn.ele('P_18A').txt('2');
  const zwolnienie = adn.ele('Zwolnienie');
  zwolnienie.ele('P_19N').txt('1');
  adn.ele('NoweSrodkiTransportu').ele('P_22N').txt('1');
  adn.ele('P_23').txt('2');
  adn.ele('PMarzy').ele('P_PMarzyN').txt('1');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildHeader(
  root: any,
  generatedAt: Date,
  systemInfo: string,
): void {
  const naglowek = root.ele('Naglowek');
  naglowek
    .ele('KodFormularza', {
      kodSystemowy: FORM_SYSTEM_CODE,
      wersjaSchemy: FORM_VERSION,
    })
    .txt(FORM_VALUE);
  naglowek.ele('WariantFormularza').txt('3');
  naglowek.ele('DataWytworzeniaFa').txt(formatTimestamp(generatedAt));
  naglowek.ele('SystemInfo').txt(systemInfo);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSeller(root: any, seller: SellerData): void {
  const podmiot1 = root.ele('Podmiot1');
  const dane = podmiot1.ele('DaneIdentyfikacyjne');
  dane.ele('NIP').txt(requireText(seller.nip, 'seller.nip'));
  dane.ele('Nazwa').txt(requireText(seller.name, 'seller.name'));

  const adres = podmiot1.ele('Adres');
  adres
    .ele('KodKraju')
    .txt(requireText(seller.address.countryCode || 'PL', 'seller.address.countryCode'));
  adres.ele('AdresL1').txt(requireText(seller.address.addressLine1, 'seller.address.addressLine1'));
  if (seller.address.addressLine2) {
    adres.ele('AdresL2').txt(seller.address.addressLine2);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildBuyer(root: any, buyer: BuyerData): void {
  const podmiot2 = root.ele('Podmiot2');
  const dane = podmiot2.ele('DaneIdentyfikacyjne');

  if (buyer.type === 'b2b') {
    dane.ele('NIP').txt(requireText(buyer.nip, 'buyer.nip'));
  } else if (buyer.idType === 'pesel' && buyer.pesel) {
    dane.ele('NrPESEL').txt(buyer.pesel);
  } else if (buyer.idType === 'no_id') {
    dane.ele('BrakID').txt('1');
  } else if (buyer.idNumber) {
    dane.ele('NrInny').txt(buyer.idNumber);
  } else {
    throw new Error('FA(3): nabywca B2C — brak PESEL / BrakID / NrInny.');
  }

  dane.ele('Nazwa').txt(requireText(buyer.name, 'buyer.name'));

  const adres = podmiot2.ele('Adres');
  adres.ele('KodKraju').txt(requireText(buyer.address.countryCode, 'buyer.address.countryCode'));
  adres.ele('AdresL1').txt(requireText(buyer.address.addressLine1, 'buyer.address.addressLine1'));
  if (buyer.address.addressLine2) {
    adres.ele('AdresL2').txt(buyer.address.addressLine2);
  }

  podmiot2.ele('JST').txt('2');
  podmiot2.ele('GV').txt('2');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function appendFaWiersz(fa: any, line: InvoiceLineItem): void {
  const wiersz = fa.ele('FaWiersz');
  wiersz.ele('NrWierszaFa').txt(String(line.ordinal));

  if (line.classificationCode) {
    if (/^\d{8,14}$/.test(line.classificationCode)) {
      wiersz.ele('GTIN').txt(line.classificationCode);
    } else if (/^\d{4,10}$/.test(line.classificationCode)) {
      wiersz.ele('CN').txt(line.classificationCode);
    } else {
      wiersz.ele('PKWiU').txt(line.classificationCode);
    }
  }

  wiersz.ele('P_7').txt(requireText(line.name, `line[${line.ordinal}].name`));
  wiersz.ele('P_8A').txt(requireText(line.unit, `line[${line.ordinal}].unit`));
  wiersz.ele('P_8B').txt(formatDecimal(line.quantity, 4));
  wiersz.ele('P_9A').txt(formatDecimal(line.unitPriceNet, 4));
  wiersz.ele('P_11').txt(formatDecimal(line.netAmount));

  const mapping = FULL_VAT_RATE_MAP[line.vatRate];
  if (!mapping) {
    throw new Error(`FA(3): brak mapowania P_12 dla vatRate "${line.vatRate}".`);
  }
  wiersz.ele('P_12').txt(mapping.p12Value);
}

function toPreparedLineItems(lines: InvoiceLine[]): InvoiceLineItem[] {
  return lines.map((line, idx) => {
    const { netAmount, vatAmount, grossAmount } = calculateLineItem({
      quantity: line.quantity,
      unitPriceNet: line.unitPriceNet,
      vatRate: line.vatRate as VatRate,
    });
    return {
      ordinal: idx + 1,
      name: line.name,
      unit: line.unit,
      quantity: line.quantity,
      unitPriceNet: line.unitPriceNet,
      vatRate: line.vatRate as VatRate,
      classificationCode:
        line.pkwiuCode && /^[0-9A-Za-z]+$/.test(line.pkwiuCode)
          ? line.pkwiuCode
          : undefined,
      netAmount,
      vatAmount,
      grossAmount,
    };
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildPlatnoscFa(
  fa: any,
  data: AdvanceInvoiceData | FinalInvoiceData,
): void {
  const platnosc = fa.ele('Platnosc');
  platnosc.ele('TerminPlatnosci').ele('Termin').txt(formatDate(data.paymentDueDate));

  if (
    data.paymentMethod === 'other' ||
    data.paymentMethod === 'compensation' ||
    !(data.paymentMethod in PAYMENT_METHOD_MAP)
  ) {
    platnosc.ele('PlatnoscInna').txt('1');
    platnosc
      .ele('OpisPlatnosci')
      .txt(
        data.paymentMethod === 'compensation'
          ? 'kompensata'
          : data.paymentMethod === 'other'
            ? 'inna'
            : data.paymentMethod,
      );
  } else {
    const code = PAYMENT_METHOD_MAP[data.paymentMethod as keyof typeof PAYMENT_METHOD_MAP];
    platnosc.ele('FormaPlatnosci').txt(code);
  }

  if (data.bankAccount?.trim()) {
    const iban = data.bankAccount.replace(/\s+/g, '').toUpperCase();
    const nrRb = iban.startsWith('PL') ? iban.slice(2) : iban;
    const rachunek = platnosc.ele('RachunekBankowy');
    rachunek.ele('NrRB').txt(nrRb);
  }
}

function advanceLineItem(data: AdvanceInvoiceData): InvoiceLineItem {
  const totals = calculateAdvanceTotals(data);
  const rateCfg = ADVANCE_VAT_RATE_MAP[data.vatRate];
  return {
    ordinal: 1,
    unit: 'szt.',
    quantity: 1,
    name: `Zaliczka: ${data.description}`,
    unitPriceNet: totals.advanceNet,
    vatRate: rateCfg.canonical,
    netAmount: totals.advanceNet,
    vatAmount: totals.advanceVat,
    grossAmount: totals.advanceGross,
  };
}

/** Faktura zaliczkowa — `RodzajFaktury` = `ZAL`. */
export function generateAdvanceInvoiceXml(
  data: AdvanceInvoiceData,
  options: GenerateAdvanceXmlOptions = {},
): string {
  const {
    generatedAt = new Date(),
    prettyPrint = true,
    systemInfo = DEFAULT_SYSTEM_INFO,
  } = options;

  const advanceLine = advanceLineItem(data);
  const summaries = summarizeVatPerRate([advanceLine]);

  const root = create({ version: '1.0', encoding: 'UTF-8' }).ele('Faktura', {
    xmlns: FA3_NAMESPACE,
    'xmlns:etd': ETD_NAMESPACE,
  });

  buildHeader(root, generatedAt, systemInfo);
  buildSeller(root, data.seller);
  buildBuyer(root, data.buyer);

  const fa = root.ele('Fa');
  fa.ele('KodWaluty').txt('PLN');
  fa.ele('P_1').txt(formatDate(data.issueDate));
  fa.ele('P_2').txt(requireText(data.internalNumber, 'internalNumber'));

  emitVatSummariesFromMap(fa, summaries, FULL_VAT_RATE_MAP);
  fa.ele('P_15').txt(formatDecimal(advanceLine.grossAmount));

  buildAdnotacjeStandard(fa, [advanceLine]);

  fa.ele('RodzajFaktury').txt('ZAL');

  const contractOpis = fa.ele('DodatkowyOpis');
  contractOpis.ele('Klucz').txt('Wartość_umowy_całkowita_PLN');
  contractOpis.ele('Wartosc').txt(formatDecimal(data.totalContractAmount));

  const totals = calculateAdvanceTotals(data);
  const pozostaloOpis = fa.ele('DodatkowyOpis');
  pozostaloOpis.ele('Klucz').txt('Pozostało_do_rozliczenia_PLN');
  pozostaloOpis.ele('Wartosc').txt(formatDecimal(totals.remainingAmount));

  if (data.expectedDeliveryDate) {
    const d = fa.ele('DodatkowyOpis');
    d.ele('Klucz').txt('Planowana_data_realizacji');
    d.ele('Wartosc').txt(formatDate(data.expectedDeliveryDate));
  }

  appendFaWiersz(fa, advanceLine);

  buildPlatnoscFa(fa, data);

  if (data.notes?.trim()) {
    const stopka = root.ele('Stopka');
    stopka.ele('Informacje').ele('StopkaFaktury').txt(data.notes.trim());
  }

  return root.end({ prettyPrint, headless: false });
}

/** Faktura rozliczająca zaliczki — `RodzajFaktury` = `ROZ`. */
export function generateFinalInvoiceXml(
  data: FinalInvoiceData,
  advanceInvoices: AdvanceInvoiceSettlementRow[],
  options: GenerateAdvanceXmlOptions = {},
): string {
  if (!advanceInvoices.length) {
    throw new Error('FA(3) ROZ: przekazano pustą listę faktur zaliczkowych.');
  }

  const {
    generatedAt = new Date(),
    prettyPrint = true,
    systemInfo = DEFAULT_SYSTEM_INFO,
  } = options;

  const preparedLines = toPreparedLineItems(data.lines);
  if (preparedLines.length === 0) {
    throw new Error('FA(3) ROZ: brak pozycji faktury końcowej.');
  }

  const summaries = summarizeVatPerRate(preparedLines);
  const totals = calculateInvoiceTotals(preparedLines);
  const sumAdvancesRound = roundToCents(
    advanceInvoices.reduce((s, a) => s + roundToCents(a.advance_amount), 0),
  );

  const finalTotals = calculateFinalInvoiceTotals(data.lines, sumAdvancesRound);

  const root = create({ version: '1.0', encoding: 'UTF-8' }).ele('Faktura', {
    xmlns: FA3_NAMESPACE,
    'xmlns:etd': ETD_NAMESPACE,
  });

  buildHeader(root, generatedAt, systemInfo);
  buildSeller(root, data.seller);
  buildBuyer(root, data.buyer);

  const fa = root.ele('Fa');
  fa.ele('KodWaluty').txt('PLN');
  fa.ele('P_1').txt(formatDate(data.issueDate));
  fa.ele('P_2').txt(requireText(data.internalNumber, 'internalNumber'));

  emitVatSummariesFromMap(fa, summaries, FULL_VAT_RATE_MAP);
  fa.ele('P_15').txt(formatDecimal(totals.grossTotal));

  buildAdnotacjeStandard(fa, preparedLines);

  fa.ele('RodzajFaktury').txt('ROZ');

  for (const adv of advanceInvoices) {
    const fz = fa.ele('FakturaZaliczkowa');
    const ksef = adv.ksef_number?.trim();
    if (ksef) {
      fz.ele('NrKSeFFaZaliczkowej').txt(ksef);
    } else {
      fz.ele('NrKSeFZN').txt('1');
      fz.ele('NrFaZaliczkowej').txt(requireText(adv.internal_number, 'advance.internal_number'));
    }
  }

  for (const line of preparedLines) {
    appendFaWiersz(fa, line);
  }

  const roz = fa.ele('Rozliczenie');
  for (const adv of advanceInvoices) {
    const o = roz.ele('Odliczenia');
    o.ele('Kwota').txt(formatDecimal(roundToCents(adv.advance_amount)));
    o.ele('Powod').txt(
      `Zaliczka nr ${adv.internal_number} z dnia ${formatDate(adv.issue_date)}` +
        (adv.ksef_number?.trim() ? ` (KSeF: ${adv.ksef_number.trim()})` : ''),
    );
  }
  roz.ele('SumaOdliczen').txt(formatDecimal(sumAdvancesRound));
  roz.ele('DoZaplaty').txt(formatDecimal(finalTotals.amountDue));

  buildPlatnoscFa(fa, data);

  if (data.notes?.trim()) {
    const stopka = root.ele('Stopka');
    stopka.ele('Informacje').ele('StopkaFaktury').txt(data.notes.trim());
  }

  return root.end({ prettyPrint, headless: false });
}
