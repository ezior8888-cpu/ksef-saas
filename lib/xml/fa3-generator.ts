import { create } from 'xmlbuilder2';
import type { XMLBuilder } from 'xmlbuilder2/lib/interfaces';

import type { Invoice, InvoiceLineItem, VatRate, BuyerParty } from '@/types/invoice';
import {
  calculateInvoiceTotals,
  summarizeVatPerRate,
  validateInvoice,
} from './invoice-calculator';

// ═══════════════════════════════════════════════════════════════
// STAŁE SCHEMATU FA(3)
// ═══════════════════════════════════════════════════════════════

/**
 * Namespace FA(3) – publikacja 2025-06-25, obowiązuje od 2026-02-01.
 * Źródło: https://crd.gov.pl/wzor/2025/06/25/13775/
 */
const FA3_NAMESPACE = 'http://crd.gov.pl/wzor/2025/06/25/13775/';
const ETD_NAMESPACE =
  'http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2022/01/05/eD/DefinicjeTypy/';

const FORM_SYSTEM_CODE = 'FA (3)';
const FORM_VERSION = '1-0E';
const FORM_VALUE = 'FA';

// Domyślny System Info wstawiany do <Naglowek>.
const DEFAULT_SYSTEM_INFO = 'KSeF SaaS v1.0';

// ═══════════════════════════════════════════════════════════════
// Formatery
// ═══════════════════════════════════════════════════════════════

function formatDecimal(value: number, decimals = 2): string {
  return value.toFixed(decimals);
}

function formatDate(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    throw new Error(`Invalid date format: "${isoDate}". Expected YYYY-MM-DD.`);
  }
  return isoDate;
}

function formatTimestamp(date: Date = new Date()): string {
  // TDataCzas wymaga sekundowej precyzji bez milisekund, z literałem Z.
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// ═══════════════════════════════════════════════════════════════
// Mapy enum-ów: VatRate → element P_13_x (sumy)
// ═══════════════════════════════════════════════════════════════

/**
 * Mapa VatRate domenowej → triplet (elementy XSD dla netSum/vatSum, etykieta P_12).
 *
 * MVP krajowe B2B: zawsze interpretujemy:
 *  - '0'  → 0% krajowa (P_13_6_1, P_12='0 KR')
 *  - 'np' → 'np I' (dostawy poza krajem, P_13_8)
 *
 * Obsługa WDT ('0 WDT' → P_13_6_2), eksportu ('0 EX' → P_13_6_3),
 * 'np II' (usługi art. 100 → P_13_9) itd. będzie wymagała rozszerzenia
 * VatRate o rozróżnianie wariantów.
 */
interface VatRateMapping {
  /** Element XSD dla sumy netto tej stawki (np. 'P_13_1', 'P_13_6_1'). */
  netElement: string;
  /** Element XSD dla sumy VAT, jeśli stawka ma VAT > 0 (np. 'P_14_1'). */
  vatElement?: string;
  /** Wartość enum TStawkaPodatku wstawiana w <P_12>. */
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

/**
 * Kolejność elementów P_13_* w sekwencji XSD (patrz schemat.xsd linie 2500-2630).
 * Używana do emitowania sum w poprawnym porządku.
 */
const P_13_ORDER: readonly string[] = [
  'P_13_1',
  'P_13_2',
  'P_13_3',
  'P_13_4', // ryczałt taksówkowy – nieużywane w MVP
  'P_13_5', // procedura szczególna OSS – nieużywane w MVP
  'P_13_6_1',
  'P_13_6_2',
  'P_13_6_3',
  'P_13_7',
  'P_13_8',
  'P_13_9',
  'P_13_10',
  'P_13_11',
];

// Mapa FormaPlatnosci → enum TFormaPlatnosci (xsd linie 1324-1365).
// UWAGA: XSD wartości to 1..7, nie 1..10. 'other' nie ma reprezentacji
// w enum-ie – emitujemy alternatywnie <PlatnoscInna>1</PlatnoscInna>.
const PAYMENT_METHOD_MAP: Record<'transfer' | 'cash' | 'card', string> = {
  cash: '1', // gotówka
  card: '2', // karta
  transfer: '6', // przelew
};

// ═══════════════════════════════════════════════════════════════
// Interfejsy i błędy eksportowane
// ═══════════════════════════════════════════════════════════════

export interface GenerateXmlOptions {
  /** Data wytworzenia faktury – default: now() */
  generatedAt?: Date;
  /** Czy uruchomić validateInvoice() przed generowaniem – default: true */
  validate?: boolean;
  /** Czy sformatować XML z wcięciami – default: false */
  prettyPrint?: boolean;
  /** Nadpisywane <SystemInfo> – default: 'KSeF SaaS v1.0' */
  systemInfo?: string;
}

export class InvoiceValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(
      `Faktura zawiera ${errors.length} ${
        errors.length === 1 ? 'błąd' : 'błędów'
      } walidacji:\n${errors.join('\n')}`,
    );
    this.name = 'InvoiceValidationError';
  }
}

// ═══════════════════════════════════════════════════════════════
// Helpery buildera
// ═══════════════════════════════════════════════════════════════

/**
 * xmlbuilder2 wymaga niepustego stringa – rzucamy wcześniej
 * komunikatem diagnostycznym niż generować pustą treść elementu.
 */
function requireText(value: string | undefined | null, field: string): string {
  if (value === undefined || value === null || value === '') {
    throw new Error(`FA(3): wymagane pole "${field}" jest puste.`);
  }
  return value;
}

/**
 * Rozbija numer VAT UE w formacie "DE123456789" na parę (KodUE, NrVatUE).
 * XSD TPodmiot2/choice wymaga rozdzielenia prefiksu od numeru.
 */
function splitVatUe(vatUeNumber: string): { kodUE: string; numer: string } {
  const trimmed = vatUeNumber.replace(/\s+/g, '').toUpperCase();
  const match = trimmed.match(/^([A-Z]{2})(.+)$/);
  if (!match) {
    throw new Error(
      `FA(3): vatUeNumber "${vatUeNumber}" nie zawiera prefiksu kraju UE (oczekiwano np. "DE123456789").`,
    );
  }
  return { kodUE: match[1], numer: match[2] };
}

// ═══════════════════════════════════════════════════════════════
// Główna funkcja
// ═══════════════════════════════════════════════════════════════

export function generateFA3Xml(
  invoice: Invoice,
  options: GenerateXmlOptions = {},
): string {
  const {
    generatedAt = new Date(),
    validate = true,
    prettyPrint = false,
    systemInfo = DEFAULT_SYSTEM_INFO,
  } = options;

  if (validate) {
    const errors = validateInvoice(invoice);
    if (errors.length > 0) {
      throw new InvoiceValidationError(errors);
    }
  }

  const root = create({ version: '1.0', encoding: 'UTF-8' }).ele('Faktura', {
    xmlns: FA3_NAMESPACE,
    'xmlns:etd': ETD_NAMESPACE,
  });

  buildNaglowek(root, generatedAt, systemInfo);
  buildPodmiot1(root, invoice);
  buildPodmiot2(root, invoice);
  buildFa(root, invoice);
  buildStopka(root, invoice);

  return root.end({ prettyPrint, headless: false });
}

// ═══════════════════════════════════════════════════════════════
// <Naglowek>
// ═══════════════════════════════════════════════════════════════

function buildNaglowek(
  root: XMLBuilder,
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
  if (systemInfo) {
    naglowek.ele('SystemInfo').txt(systemInfo);
  }
}

// ═══════════════════════════════════════════════════════════════
// <Podmiot1> – sprzedawca
// ═══════════════════════════════════════════════════════════════

function buildPodmiot1(
  root: XMLBuilder,
  invoice: Invoice,
): void {
  const podmiot1 = root.ele('Podmiot1');

  const daneId = podmiot1.ele('DaneIdentyfikacyjne');
  daneId.ele('NIP').txt(requireText(invoice.seller.nip, 'seller.nip'));
  daneId.ele('Nazwa').txt(requireText(invoice.seller.name, 'seller.name'));

  const adres = podmiot1.ele('Adres');
  adres.ele('KodKraju').txt(requireText(invoice.seller.address.countryCode, 'seller.address.countryCode'));
  adres.ele('AdresL1').txt(requireText(invoice.seller.address.addressLine1, 'seller.address.addressLine1'));
  if (invoice.seller.address.addressLine2) {
    adres.ele('AdresL2').txt(invoice.seller.address.addressLine2);
  }
  if (invoice.seller.address.gln) {
    adres.ele('GLN').txt(invoice.seller.address.gln);
  }

  if (invoice.seller.email || invoice.seller.phone) {
    const kontakt = podmiot1.ele('DaneKontaktowe');
    if (invoice.seller.email) kontakt.ele('Email').txt(invoice.seller.email);
    if (invoice.seller.phone) kontakt.ele('Telefon').txt(invoice.seller.phone);
  }
}

// ═══════════════════════════════════════════════════════════════
// <Podmiot2> – nabywca
// ═══════════════════════════════════════════════════════════════

function buildPodmiot2(
  root: XMLBuilder,
  invoice: Invoice,
): void {
  const podmiot2 = root.ele('Podmiot2');

  const daneId = podmiot2.ele('DaneIdentyfikacyjne');
  buildBuyerChoice(daneId, invoice.buyer);
  // Nazwa jest obowiązkowa dla B2B; dla faktur "uproszczonych" (art. 106e ust. 5 pkt 3)
  // można ją pominąć, ale MVP wymaga jej zawsze – validateInvoice to egzekwuje.
  daneId.ele('Nazwa').txt(requireText(invoice.buyer.name, 'buyer.name'));

  const adres = podmiot2.ele('Adres');
  adres.ele('KodKraju').txt(requireText(invoice.buyer.address.countryCode, 'buyer.address.countryCode'));
  adres.ele('AdresL1').txt(requireText(invoice.buyer.address.addressLine1, 'buyer.address.addressLine1'));
  if (invoice.buyer.address.addressLine2) {
    adres.ele('AdresL2').txt(invoice.buyer.address.addressLine2);
  }
  if (invoice.buyer.address.gln) {
    adres.ele('GLN').txt(invoice.buyer.address.gln);
  }

  if (invoice.buyer.email) {
    podmiot2.ele('DaneKontaktowe').ele('Email').txt(invoice.buyer.email);
  }

  // JST i GV są OBLIGATORYJNE w XSD Podmiot2 (brak minOccurs=0) – domyślnie 2.
  podmiot2.ele('JST').txt(String(invoice.buyer.jst ?? 2));
  podmiot2.ele('GV').txt(String(invoice.buyer.gv ?? 2));
}

function buildBuyerChoice(daneId: XMLBuilder, buyer: BuyerParty): void {
  if (buyer.nip) {
    daneId.ele('NIP').txt(buyer.nip);
  } else if (buyer.vatUeNumber) {
    const { kodUE, numer } = splitVatUe(buyer.vatUeNumber);
    daneId.ele('KodUE').txt(kodUE);
    daneId.ele('NrVatUE').txt(numer);
  } else if (buyer.pesel?.trim()) {
    // FA(3) Podmiot2 NIE ma elementu NrPESEL (bug naprawiony w audycie
    // przedlaunchowym). Schemat dopuszcza tylko: NIP / KodUE+NrVatUE /
    // KodKraju+NrID / BrakID. PESEL jest poprawnym identyfikatorem podatkowym,
    // który wstawiamy do <NrID> z <KodKraju>PL.
    daneId.ele('KodKraju').txt(buyer.address?.countryCode || 'PL');
    daneId.ele('NrID').txt(buyer.pesel.trim());
  } else if (buyer.nrInny?.trim()) {
    // „Inny" identyfikator (nr dokumentu / zagraniczny ID) → KodKraju + NrID.
    daneId.ele('KodKraju').txt(buyer.address?.countryCode || 'PL');
    daneId.ele('NrID').txt(buyer.nrInny.trim());
  } else if (buyer.noIdMarker) {
    daneId.ele('BrakID').txt('1');
  } else {
    // validateInvoice powinno to złapać wcześniej, ale to safety-net.
    throw new Error(
      'FA(3): nabywca musi mieć dokładnie jeden identyfikator (nip / vatUeNumber / PESEL / NrInny / noIdMarker).',
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// <Fa> – właściwa treść faktury
// ═══════════════════════════════════════════════════════════════

function buildFa(
  root: XMLBuilder,
  invoice: Invoice,
): void {
  const fa = root.ele('Fa');

  fa.ele('KodWaluty').txt(invoice.payment.currency);
  fa.ele('P_1').txt(formatDate(invoice.issueDate));
  // P_1M (miejsce wystawienia) – pomijamy w MVP.
  fa.ele('P_2').txt(requireText(invoice.internalNumber, 'internalNumber'));

  // P_6 jest w XSD <choice> z OkresFa – wrzucamy P_6 tylko jeśli podane.
  if (invoice.saleDate) {
    fa.ele('P_6').txt(formatDate(invoice.saleDate));
  }

  // Sumy per stawka w kolejności XSD-sequence.
  buildVatSummaries(fa, invoice.lines);

  // Suma brutto faktury (P_15 jest obowiązkowe).
  const totals = calculateInvoiceTotals(invoice.lines);
  fa.ele('P_15').txt(formatDecimal(totals.grossTotal));

  // Adnotacje są obowiązkowe w XSD <Fa> (brak minOccurs=0).
  buildAdnotacje(fa, invoice);

  fa.ele('RodzajFaktury').txt(invoice.type);

  for (const line of invoice.lines) {
    buildFaWiersz(fa, line);
  }

  buildPlatnosc(fa, invoice);
}

function buildVatSummaries(fa: XMLBuilder, lines: InvoiceLineItem[]): void {
  const summaries = summarizeVatPerRate(lines);

  // Zbieramy wszystkie emisje, a potem iterujemy w kolejności XSD.
  const emissions = new Map<string, { netElement: string; vatElement?: string; netSum: number; vatSum: number }>();

  for (const s of summaries) {
    const mapping = VAT_RATE_MAP[s.rate];
    if (!mapping) {
      throw new Error(`FA(3): brak mapowania XSD dla stawki VAT "${s.rate}".`);
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

// ═══════════════════════════════════════════════════════════════
// <Adnotacje>
// ═══════════════════════════════════════════════════════════════

function buildAdnotacje(
  fa: XMLBuilder,
  invoice: Invoice,
): void {
  const adn = fa.ele('Adnotacje');
  const a = invoice.annotations ?? {};

  // P_16 - metoda kasowa
  adn.ele('P_16').txt(String(a.cashMethod ?? 2));
  // P_17 - samofakturowanie
  adn.ele('P_17').txt(String(a.selfInvoicing ?? 2));

  // P_18 - odwrotne obciążenie. Jeśli którakolwiek pozycja ma vatRate='oo',
  // wymuszamy 1 niezależnie od tego co user podał (spójność z liniami faktury).
  const hasOoLine = invoice.lines.some((l) => l.vatRate === 'oo');
  const p18 = hasOoLine ? 1 : (a.reverseCharge ?? 2);
  adn.ele('P_18').txt(String(p18));

  // P_18A - MPP
  adn.ele('P_18A').txt(String(a.splitPayment ?? 2));

  // Zwolnienie – choice: (P_19 + P_19A|B|C) LUB P_19N
  // MVP wymusza P_19N=1 (brak stawki zw). Jeśli ktoś doda linię zw bez
  // podstawy prawnej, validateInvoice powinno to odrzucić – na dziś
  // zachowujemy prostotę: zw w MVP nie jest wspierane.
  const hasZwLine = invoice.lines.some((l) => l.vatRate === 'zw');
  const zwolnienie = adn.ele('Zwolnienie');
  if (hasZwLine) {
    // P_19 wymaga jednej z P_19A/B/C – MVP nie zna tych danych, rzucamy.
    throw new Error(
      'FA(3): linia ze stawką "zw" wymaga podstawy prawnej (P_19A/B/C), która nie jest obsługiwana w MVP.',
    );
  }
  zwolnienie.ele('P_19N').txt('1');

  // NoweSrodkiTransportu – choice: (P_22 + P_42_5 + NowySrodekTransportu) LUB P_22N
  // MVP zawsze P_22N=1.
  adn.ele('NoweSrodkiTransportu').ele('P_22N').txt('1');

  // P_23 - procedura uproszczona
  adn.ele('P_23').txt(String(a.simplifiedProcedure ?? 2));

  // PMarzy – choice: (P_PMarzy + P_PMarzy_*) LUB P_PMarzyN
  adn.ele('PMarzy').ele('P_PMarzyN').txt('1');
}

// ═══════════════════════════════════════════════════════════════
// <FaWiersz>
// ═══════════════════════════════════════════════════════════════

function buildFaWiersz(
  fa: XMLBuilder,
  line: InvoiceLineItem,
): void {
  const wiersz = fa.ele('FaWiersz');

  wiersz.ele('NrWierszaFa').txt(String(line.ordinal));

  // Klasyfikacja – GTIN dla 8-14 cyfr, CN dla 8-10 cyfr z literami,
  // PKWiU dla innych. MVP: ograniczamy do GTIN vs PKWiU (fallback).
  if (line.classificationCode) {
    if (/^\d{8,14}$/.test(line.classificationCode)) {
      wiersz.ele('GTIN').txt(line.classificationCode);
    } else if (/^\d{4,10}$/.test(line.classificationCode)) {
      // CN jest numeryczny, 8 cyfr – ale XSD akceptuje tns:TZnakowy50.
      wiersz.ele('CN').txt(line.classificationCode);
    } else {
      wiersz.ele('PKWiU').txt(line.classificationCode);
    }
  }

  wiersz.ele('P_7').txt(requireText(line.name, `line[${line.ordinal}].name`));

  // P_8A (jednostka) i P_8B (ilość) muszą być po klasyfikacji.
  wiersz.ele('P_8A').txt(requireText(line.unit, `line[${line.ordinal}].unit`));
  wiersz.ele('P_8B').txt(formatDecimal(line.quantity, 4));

  wiersz.ele('P_9A').txt(formatDecimal(line.unitPriceNet, 4));
  wiersz.ele('P_11').txt(formatDecimal(line.netAmount));

  const mapping = VAT_RATE_MAP[line.vatRate];
  if (!mapping) {
    throw new Error(
      `FA(3): brak mapowania P_12 dla vatRate "${line.vatRate}" w linii ${line.ordinal}.`,
    );
  }
  wiersz.ele('P_12').txt(mapping.p12Value);
}

// ═══════════════════════════════════════════════════════════════
// <Platnosc>
// ═══════════════════════════════════════════════════════════════

function buildPlatnosc(
  fa: XMLBuilder,
  invoice: Invoice,
): void {
  const platnosc = fa.ele('Platnosc');

  // XSD sequence: (Zaplacono|ZaplataCzesciowa)? → TerminPlatnosci* → FormaPlatnosci? → RachunekBankowy*
  // MVP: TerminPlatnosci zawsze, FormaPlatnosci według payment.method, RachunekBankowy dla transfer.

  platnosc.ele('TerminPlatnosci').ele('Termin').txt(formatDate(invoice.payment.dueDate));

  if (invoice.payment.method === 'other') {
    platnosc.ele('PlatnoscInna').txt('1');
    platnosc.ele('OpisPlatnosci').txt('inna');
  } else {
    const code = PAYMENT_METHOD_MAP[invoice.payment.method];
    platnosc.ele('FormaPlatnosci').txt(code);
  }

  if (invoice.payment.bankAccount) {
    // XSD TRachunekBankowy zawiera m.in. NrRB (wymagane) i opcjonalne inne pola;
    // MVP emituje tylko NrRB i NazwaBanku.
    // NrRB jest typu tns:TNrRB – KSeF oczekuje 26 cyfr (IBAN bez prefiksu PL),
    // ale akceptuje też format IBAN. Normalizujemy spacje.
    const iban = invoice.payment.bankAccount.replace(/\s+/g, '').toUpperCase();
    const nrRb = iban.startsWith('PL') ? iban.slice(2) : iban;
    const rachunek = platnosc.ele('RachunekBankowy');
    rachunek.ele('NrRB').txt(nrRb);
    if (invoice.payment.bankName) {
      rachunek.ele('NazwaBanku').txt(invoice.payment.bankName);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// <Stopka>
// ═══════════════════════════════════════════════════════════════

function buildStopka(
  root: XMLBuilder,
  invoice: Invoice,
): void {
  if (!invoice.notes) return;
  const stopka = root.ele('Stopka');
  stopka.ele('Informacje').ele('StopkaFaktury').txt(invoice.notes);
}
