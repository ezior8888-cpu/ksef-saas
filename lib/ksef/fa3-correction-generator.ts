/**
 * Generator XML FA(3) dla faktur korygujących.
 * Struktura i kolejność sekcji dostosowane do `lib/xml/schemas/fa3/schemat.xsd`
 * (m.in. `DaneFaKorygowanej` z numerem lub znacznikiem KSeF).
 */

import { create } from 'xmlbuilder2';
import type { XMLBuilder } from 'xmlbuilder2/lib/interfaces';

import type { InvoiceLineItem, VatRate } from '@/types/invoice';
import {
  calculateInvoiceTotals,
  calculateLineItem,
  roundToCents,
  summarizeVatPerRate,
} from '@/lib/xml/invoice-calculator';
import type { CorrectionInvoiceData, InvoiceLine } from '@/types/invoice-types';

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

const VAT_RATE_MAP: Record<VatRate, VatRateMapping> = {
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

export interface GenerateCorrectionXmlOptions {
  generatedAt?: Date;
  /** Domyślnie `true` (spójnie z pierwszym szkicem integracyjnym). */
  prettyPrint?: boolean;
  systemInfo?: string;
}

function formatDecimal(value: number, decimals = 2): string {
  return value.toFixed(decimals);
}

function formatDate(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    throw new Error(`FA(3) KOR: nieprawidłowy format daty "${isoDate}" (oczekiwano YYYY-MM-DD).`);
  }
  return isoDate;
}

function formatTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function requireText(value: string | undefined | null, field: string): string {
  if (value === undefined || value === null || value === '') {
    throw new Error(`FA(3) KOR: wymagane pole "${field}" jest puste.`);
  }
  return value;
}

function guessVatRateForAmountChange(netDelta: number, vatDelta: number): VatRate {
  const net = Math.abs(netDelta);
  if (net < Number.EPSILON) return '23';
  const pct = Math.round((vatDelta / net) * 100);
  if (pct === 8) return '8';
  if (pct === 5) return '5';
  if (pct === 0) return '0';
  return '23';
}

function domainLinesForCorrection(data: CorrectionInvoiceData): InvoiceLine[] {
  if (data.correctionType === 'cancellation') {
    return (data.linesBefore ?? []).map((l) => ({
      ...l,
      quantity: -l.quantity,
    }));
  }
  return [];
}

/** Wiersz FaWiersz; `stanPrzed` = wiersz wg stanu przed korektą (XSD `StanPrzed`). */
type CorrectionRow = InvoiceLineItem & { stanPrzed?: true };

function sameLine(a: InvoiceLine, b: InvoiceLine): boolean {
  return (
    a.name === b.name &&
    a.unit === b.unit &&
    a.quantity === b.quantity &&
    a.unitPriceNet === b.unitPriceNet &&
    a.vatRate === b.vatRate &&
    (a.pkwiuCode ?? '') === (b.pkwiuCode ?? '')
  );
}

/**
 * Korekta „przed/po” (AUD-03). XSD FaWiersz: „dane pozycji korygowanych wg
 * stanu przed korektą i po korekcie jako osobne wiersze”, wiersz „przed”
 * ze znacznikiem `StanPrzed`, odrębna numeracja. Pozycja bez zmian nie jest
 * korygowana, więc do XML nie trafia; pozycja dopisana ma tylko wiersz „po”,
 * usunięta — tylko „przed”.
 *
 * Parowanie (F-019): najpierw pozycje identyczne w obu stanach (niezależnie
 * od kolejności — przesunięcie to nie korekta), potem zmienione po nazwie,
 * a reszta po kolejności (np. zmieniona nazwa). Samo parowanie po indeksie
 * po usunięciu środkowej pozycji opisywało inną zmianę („B przed → C po”).
 */
function beforeAfterRows(before: InvoiceLine[], after: InvoiceLine[]): CorrectionRow[] {
  const pairOf = new Map<number, number | null>(); // indeks „przed” → indeks „po” albo null (usunięta)
  const usedAfter = new Set<number>();
  const unchanged = new Set<number>();

  const claim = (bi: number, match: (a: InvoiceLine) => boolean): boolean => {
    const ai = after.findIndex((a, i) => !usedAfter.has(i) && match(a));
    if (ai === -1) return false;
    usedAfter.add(ai);
    pairOf.set(bi, ai);
    return true;
  };

  before.forEach((b, bi) => {
    if (claim(bi, (a) => sameLine(b, a))) unchanged.add(bi);
  });
  before.forEach((b, bi) => {
    if (!pairOf.has(bi)) claim(bi, (a) => a.name === b.name);
  });
  before.forEach((_b, bi) => {
    if (!pairOf.has(bi) && !claim(bi, () => true)) pairOf.set(bi, null);
  });

  const rows: CorrectionRow[] = [];
  before.forEach((b, bi) => {
    if (unchanged.has(bi)) return;
    rows.push({ ...toPreparedLineItems([b])[0]!, stanPrzed: true });
    const ai = pairOf.get(bi);
    if (ai != null) rows.push(toPreparedLineItems([after[ai]!])[0]!);
  });
  after.forEach((a, ai) => {
    if (!usedAfter.has(ai)) rows.push(toPreparedLineItems([a])[0]!);
  });
  return rows.map((row, idx) => ({ ...row, ordinal: idx + 1 }));
}

type VatSummary = ReturnType<typeof summarizeVatPerRate>[number];

/**
 * P_13_x / P_14_x faktury korygującej = różnica między stanem po i przed
 * korektą (XSD: „kwota różnicy, o której mowa w art. 106j ust. 2 pkt 5”).
 * Liczona z PEŁNYCH stanów obu dokumentów, żeby zaokrąglenia VAT były te same
 * co na fakturze pierwotnej i na fakturze po korekcie. Stawki bez różnicy
 * nie są wykazywane.
 */
function differenceSummaries(before: InvoiceLineItem[], after: InvoiceLineItem[]): VatSummary[] {
  const byRate = new Map<VatRate, VatSummary>();
  for (const s of summarizeVatPerRate(after)) byRate.set(s.rate, { ...s });
  for (const s of summarizeVatPerRate(before)) {
    const cur = byRate.get(s.rate);
    byRate.set(s.rate, {
      rate: s.rate,
      netSum: (cur?.netSum ?? 0) - s.netSum,
      vatSum: (cur?.vatSum ?? 0) - s.vatSum,
    });
  }
  return [...byRate.values()]
    .map((s) => ({ rate: s.rate, netSum: roundToCents(s.netSum), vatSum: roundToCents(s.vatSum) }))
    .filter((s) => s.netSum !== 0 || s.vatSum !== 0);
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

/**
 * MF `TTypKorekty`: 1 pierwotny okres VAT / 2 data korekty / 3 inna.
 * Wartość podawana z formularza (`CorrectionInvoiceData.typKorekty`).
 */
function typKorektyFromData(data: CorrectionInvoiceData): '1' | '2' | '3' {
  const t = data.typKorekty;
  return t === '1' || t === '2' || t === '3' ? t : '2';
}

function emitVatSummaries(fa: XMLBuilder, summaries: ReturnType<typeof summarizeVatPerRate>): void {
  const emissions = new Map<
    string,
    { netElement: string; vatElement?: string; netSum: number; vatSum: number }
  >();

  for (const s of summaries) {
    const mapping = VAT_RATE_MAP[s.rate];
    if (!mapping) {
      throw new Error(`FA(3) KOR: brak mapowania XSD dla stawki VAT "${String(s.rate)}".`);
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

function buildAdnotacjeMinimal(
  fa: XMLBuilder,
  lines: InvoiceLineItem[],
  annotations: CorrectionInvoiceData['annotations'] = {},
): void {
  const adn = fa.ele('Adnotacje');
  const hasOoLine = lines.some((l) => l.vatRate === 'oo');
  const p18 = hasOoLine ? 1 : 2;
  const hasZwLine = lines.some((l) => l.vatRate === 'zw');
  if (hasZwLine) {
    throw new Error(
      'FA(3) KOR: stawka "zw" wymaga bloków Zwolnienia (P_19*) — MVP nieobsługiwane w generatorze korekt.',
    );
  }

  // P_16 i P_18A z faktury pierwotnej (AUD-23) — do 02.10 zawsze 2.
  adn.ele('P_16').txt(String(annotations.cashMethod === 1 ? 1 : 2));
  adn.ele('P_17').txt('2');
  adn.ele('P_18').txt(String(p18));
  adn.ele('P_18A').txt(String(annotations.splitPayment === 1 ? 1 : 2));
  const zwolnienie = adn.ele('Zwolnienie');
  zwolnienie.ele('P_19N').txt('1');
  adn.ele('NoweSrodkiTransportu').ele('P_22N').txt('1');
  adn.ele('P_23').txt('2');
  adn.ele('PMarzy').ele('P_PMarzyN').txt('1');
}

function appendFaWiersze(fa: XMLBuilder, lines: CorrectionRow[]): void {
  for (const line of lines) {
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

    const mapping = VAT_RATE_MAP[line.vatRate];
    if (!mapping) {
      throw new Error(`FA(3) KOR: brak mapowania P_12 dla vatRate "${line.vatRate}".`);
    }
    wiersz.ele('P_12').txt(mapping.p12Value);
    if (line.stanPrzed) wiersz.ele('StanPrzed').txt('1');
  }
}

function buildPlatnosc(
  fa: XMLBuilder,
  data: CorrectionInvoiceData,
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

/** Wiersze FaWiersz i kwoty różnicy (P_13_x/P_14_x, P_15) wg typu korekty. */
function correctionAmounts(
  data: CorrectionInvoiceData,
  domainLines: InvoiceLine[],
): { preparedLines: CorrectionRow[]; summaries: VatSummary[]; grossTotal: number } {
  if (data.correctionType === 'before_after') {
    const before = toPreparedLineItems(data.linesBefore ?? []);
    const after = toPreparedLineItems(data.linesAfter ?? []);
    if (before.length === 0 && after.length === 0) {
      throw new Error('FA(3) KOR: brak pozycji — uzupełnij linie wg typu korekty.');
    }
    const preparedLines = beforeAfterRows(data.linesBefore ?? [], data.linesAfter ?? []);
    if (preparedLines.length === 0) {
      throw new Error('FA(3) KOR: korekta przed/po nie zmienia żadnej pozycji — nie ma czego korygować.');
    }
    return {
      preparedLines,
      summaries: differenceSummaries(before, after),
      grossTotal: roundToCents(
        calculateInvoiceTotals(after).grossTotal - calculateInvoiceTotals(before).grossTotal,
      ),
    };
  }

  let preparedLines: CorrectionRow[];
  if (data.correctionType === 'amount_change' && data.amountChange) {
    const ac = data.amountChange;
    const rate = guessVatRateForAmountChange(roundToCents(ac.netDelta), roundToCents(ac.vatDelta));
    preparedLines = [
      {
        ordinal: 1,
        name: ac.description,
        unit: 'szt.',
        quantity: 1,
        unitPriceNet: roundToCents(ac.netDelta),
        vatRate: rate,
        netAmount: roundToCents(ac.netDelta),
        vatAmount: roundToCents(ac.vatDelta),
        grossAmount: roundToCents(ac.grossDelta),
      },
    ];
  } else {
    preparedLines = toPreparedLineItems(domainLines);
  }
  return {
    preparedLines,
    summaries: summarizeVatPerRate(preparedLines),
    grossTotal: calculateInvoiceTotals(preparedLines).grossTotal,
  };
}

/** XML FA(3) faktury korygującej (`RodzajFaktury` = `KOR`). */
export function generateCorrectionInvoiceXml(
  data: CorrectionInvoiceData,
  options: GenerateCorrectionXmlOptions = {},
): string {
  const {
    generatedAt = new Date(),
    prettyPrint = true,
    systemInfo = DEFAULT_SYSTEM_INFO,
  } = options;

  if (data.correctionType === 'amount_change' && !data.amountChange) {
    throw new Error('FA(3) KOR: typ amount_change wymaga pola amountChange.');
  }

  const parentIssue =
    data.parentInvoiceIssueDate != null && data.parentInvoiceIssueDate !== ''
      ? formatDate(data.parentInvoiceIssueDate)
      : null;
  if (parentIssue == null) {
    throw new Error(
      'FA(3) KOR: ustaw CorrectionInvoiceData.parentInvoiceIssueDate (DataWystFaKorygowanej).',
    );
  }

  const domainLines = domainLinesForCorrection(data);
  if (
    domainLines.length === 0 &&
    data.correctionType !== 'amount_change' &&
    data.correctionType !== 'before_after'
  ) {
    throw new Error('FA(3) KOR: brak pozycji — uzupełnij linie wg typu korekty.');
  }

  const { preparedLines, summaries, grossTotal } = correctionAmounts(data, domainLines);

  const root = create({ version: '1.0', encoding: 'UTF-8' }).ele('Faktura', {
    xmlns: FA3_NAMESPACE,
    'xmlns:etd': ETD_NAMESPACE,
  });

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

  const podmiot1 = root.ele('Podmiot1');
  const dane1 = podmiot1.ele('DaneIdentyfikacyjne');
  dane1.ele('NIP').txt(requireText(data.seller.nip, 'seller.nip'));
  dane1.ele('Nazwa').txt(requireText(data.seller.name, 'seller.name'));

  const adres1 = podmiot1.ele('Adres');
  adres1
    .ele('KodKraju')
    .txt(requireText(data.seller.address.countryCode || 'PL', 'seller.address.countryCode'));
  adres1.ele('AdresL1').txt(requireText(data.seller.address.addressLine1, 'seller.address.addressLine1'));
  if (data.seller.address.addressLine2) {
    adres1.ele('AdresL2').txt(data.seller.address.addressLine2);
  }

  const podmiot2 = root.ele('Podmiot2');
  const dane2 = podmiot2.ele('DaneIdentyfikacyjne');

  if (data.buyer.type === 'b2b') {
    dane2.ele('NIP').txt(requireText(data.buyer.nip, 'buyer.nip'));
  } else if (data.buyer.idType === 'pesel' && data.buyer.pesel) {
    // FA(3) Podmiot2 nie ma NrPESEL — PESEL idzie do KodKraju+NrID (bug fix).
    dane2.ele('KodKraju').txt(data.buyer.address.countryCode || 'PL');
    dane2.ele('NrID').txt(data.buyer.pesel);
  } else if (data.buyer.idType === 'no_id') {
    dane2.ele('BrakID').txt('1');
  } else if (data.buyer.idNumber) {
    // Nr dokumentu / zagraniczny ID → KodKraju+NrID (zamiast nieistniejącego NrInny).
    dane2.ele('KodKraju').txt(data.buyer.address.countryCode || 'PL');
    dane2.ele('NrID').txt(data.buyer.idNumber);
  } else {
    throw new Error('FA(3) KOR: nabywca B2C wymaga PESEL / BrakID / NrInny.');
  }

  dane2.ele('Nazwa').txt(requireText(data.buyer.name, 'buyer.name'));

  const adres2 = podmiot2.ele('Adres');
  adres2.ele('KodKraju').txt(requireText(data.buyer.address.countryCode, 'buyer.address.countryCode'));
  adres2.ele('AdresL1').txt(requireText(data.buyer.address.addressLine1, 'buyer.address.addressLine1'));
  if (data.buyer.address.addressLine2) {
    adres2.ele('AdresL2').txt(data.buyer.address.addressLine2);
  }

  podmiot2.ele('JST').txt('2');
  podmiot2.ele('GV').txt('2');

  const fa = root.ele('Fa');

  fa.ele('KodWaluty').txt('PLN');
  fa.ele('P_1').txt(formatDate(data.issueDate));
  fa.ele('P_2').txt(requireText(data.internalNumber, 'internalNumber'));

  emitVatSummaries(fa, summaries);

  // P_15: „korekta kwoty wynikającej z faktury korygowanej” — różnica.
  fa.ele('P_15').txt(formatDecimal(grossTotal));
  buildAdnotacjeMinimal(fa, preparedLines, data.annotations);

  fa.ele('RodzajFaktury').txt('KOR');

  fa.ele('PrzyczynaKorekty').txt(requireText(data.correctionReason, 'correctionReason'));
  fa.ele('TypKorekty').txt(typKorektyFromData(data));

  const daneKor = fa.ele('DaneFaKorygowanej');
  daneKor.ele('DataWystFaKorygowanej').txt(parentIssue);
  daneKor.ele('NrFaKorygowanej').txt(requireText(data.parentInvoiceNumber, 'parentInvoiceNumber'));

  if (data.parentKsefNumber?.trim()) {
    daneKor.ele('NrKSeF').txt('1');
    // XSD FA(3): `NrKSeFFaKorygowanej` (nie „Numer…”) — inaczej każda korekta
    // faktury przyjętej w KSeF odpada na lokalnej walidacji (F-049).
    daneKor.ele('NrKSeFFaKorygowanej').txt(data.parentKsefNumber.trim());
  } else {
    daneKor.ele('NrKSeFN').txt('1');
  }

  appendFaWiersze(fa, preparedLines);

  buildPlatnosc(fa, data);

  if (data.notes?.trim()) {
    const stopka = root.ele('Stopka');
    stopka.ele('Informacje').ele('StopkaFaktury').txt(data.notes.trim());
  }

  return root.end({ prettyPrint, headless: false });
}
