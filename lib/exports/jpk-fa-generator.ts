// lib/exports/jpk-fa-generator.ts
// Generator JPK_FA(4) — zgodny z oficjalnym XSD MF (wzór
// http://jpk.mf.gov.pl/wzor/2022/02/17/02171/, pliki w lib/exports/schemas/jpk-fa4/,
// walidacja: lib/exports/jpk-fa-validator.ts). Plik trzyma też wspólne typy
// eksportów (JpkInvoice, counterpartyOf) — importuje je siedem modułów.
//
// Do 28.09 generator nie przechodził schematu: brak obowiązkowych P_16–P_23
// i P_106E_2/3, wszystkie stawki w jednym P_13_1, elementy i atrybuty spoza
// wzoru (Adnotacje/NumerKSeF, NazwaSystemu, rola, poz, typ), zła przestrzeń
// nazw typów wspólnych, adres bez województwa/powiatu/gminy i faktury zakupu
// w pliku, który obejmuje faktury WYSTAWIONE przez podatnika.

import { create } from 'xmlbuilder2';
import type { XMLBuilder } from 'xmlbuilder2/lib/interfaces';

import { MissingIssuerAddressError, type RegisteredAddress } from '@/lib/exports/issuer-address';
import { MissingTaxOfficeError } from '@/lib/exports/tax-office';
import { isKnownTaxOffice } from '@/lib/exports/tax-offices';
import {
  settlementVatSummaries,
  type AdvanceInvoiceSettlementRow,
} from '@/lib/ksef/fa3-advance-generator';
import { roundToCents, summarizeVatPerRate } from '@/lib/xml/invoice-calculator';
import type { InvoiceLineItem, VatRate } from '@/types/invoice';

const TNS = 'http://jpk.mf.gov.pl/wzor/2022/02/17/02171/';
/** Typy wspólne, które importuje JPK_FA(4) — wersja 2018/08/24, nie nowsza. */
const ETD = 'http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2018/08/24/eD/DefinicjeTypy/';

export interface JpkFaInputData {
  // Wystawca (tenant)
  issuer: {
    nip: string;
    name: string;
    /**
     * Kod Urzędu Skarbowego (KodUrzedu w JPK_FA) — `tenants.tax_office_code`
     * (Ustawienia → Księgowa). Brak albo kod spoza słownika MF → błąd
     * `MissingTaxOfficeError` (zob. `resolveTaxOfficeCode`).
     */
    taxOfficeCode?: string;
    /** Adres z danych firmy (dwie linie) — P_3D, gdy faktura nie zapisała adresu sprzedawcy. */
    address?: {
      country?: string;
      city?: string;
      postCode?: string;
      street?: string;
      buildingNumber?: string;
      apartmentNumber?: string;
    };
    /**
     * Adres z rejestru GUS — `Podmiot1/AdresPodmiotu` (`readIssuerRegisteredAddress`).
     * Brak → `MissingIssuerAddressError`: schemat wymaga województwa, powiatu i gminy.
     */
    registeredAddress?: RegisteredAddress;
  };

  // Okres
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;

  /** Faktury WYSTAWIONE przez podatnika — tylko one wchodzą do JPK_FA. */
  issuedInvoices: JpkInvoice[];

  /** Chwila wytworzenia pliku — do testów; domyślnie teraz. */
  generatedAt?: Date;
}

export interface JpkInvoice {
  invoiceNumber: string;
  /** Waluta kwot dokumentu; brak w starych ręcznie budowanych danych oznacza PLN. */
  currency?: string | null;
  invoiceType: 'regular' | 'correction' | 'advance' | 'final';
  issueDate: string;
  saleDate?: string;
  paymentDueDate?: string;

  // Strony — OBIE. Kontrahentem sprzedaży jest nabywca, zakupu — sprzedawca
  // (`counterpartyOf`). Do 26.09 była tylko strona nabywcy, więc przy
  // zakupach „kontrahentem” wychodziła nasza firma.
  buyerNip?: string;
  buyerName: string;
  buyerAddress?: string;
  sellerNip?: string;
  /** Pusty przy sprzedaży bez `seller_data` — wtedy sprzedawcą jest wystawca pliku. */
  sellerName?: string;
  sellerAddress?: string;

  // Kwoty (sumaryczne)
  netTotal: number;
  vatTotal: number;
  grossTotal: number;

  // Pozycje
  lines: JpkInvoiceLine[];

  // Korekty
  correctedInvoiceNumber?: string;
  correctionReason?: string;

  // Numer KSeF (informacyjnie)
  ksefNumber?: string;

  /** ROZ: suma netto rozliczonych zaliczek, które KPiR już liczy (`kpirRevenueNet`). */
  settledAdvancesNet?: number;

  /** Adnotacje z `fa3_data.annotations` — P_16 (metoda kasowa), P_18A (MPP), P_19A (podstawa zwolnienia). */
  annotations?: JpkInvoiceAnnotations;

  /** ROZ: zaliczki ze stawką i rozbiciem — P_13/P_14/P_15 po ich odjęciu i NrFaZaliczkowej. */
  advanceSettlement?: AdvanceInvoiceSettlementRow[];
}

export class JpkFaForeignCurrencyNotSupportedError extends Error {
  constructor() {
    super('JPK_FA wstrzymany: faktura walutowa wymaga poprawnego wykazania waluty dokumentu i VAT w PLN. Przekaż ją księgowej do uzgodnienia.');
    this.name = 'JpkFaForeignCurrencyNotSupportedError';
  }
}

export interface JpkInvoiceAnnotations {
  splitPayment?: boolean;
  cashMethod?: boolean;
  vatExemptionBasis?: string;
}

export interface ExportParty {
  name: string;
  nip?: string;
  address?: string;
}

/**
 * Druga strona dokumentu z perspektywy podatnika: przy sprzedaży nabywca,
 * przy zakupie sprzedawca. Wszystkie eksporty „z kontrahentem” (CSV, Optima)
 * idą przez tę funkcję.
 */
export function counterpartyOf(inv: JpkInvoice, direction: 'issued' | 'received'): ExportParty {
  if (direction === 'received') {
    return { name: inv.sellerName ?? '', nip: inv.sellerNip, address: inv.sellerAddress };
  }
  return { name: inv.buyerName, nip: inv.buyerNip, address: inv.buyerAddress };
}

export interface JpkInvoiceLine {
  position: number;
  name: string;
  unit: string;
  quantity: number;
  unitPriceNet: number;
  netAmount: number;
  vatRate: string; // '23', '8', '5', '0', 'zw', 'oo', 'np'
  /** VAT pozycji z faktury — P_14_x musi się zgadzać z fakturą co do grosza. */
  vatAmount?: number;
}

/**
 * Korekta w JPK_FA to „kwota różnicy” (P_13_x/P_14_x/P_15), a korekta w bazie
 * zapisuje wartość PO korekcie, nie różnicę (C-01 w
 * `docs/koordynacja/CLAUDE-DO-CODEXA.md`). Zamiast pliku ze złymi kwotami —
 * odmowa, dopóki konwencja kwot korekty nie jest ustalona.
 */
export class JpkFaCorrectionNotSupportedError extends Error {
  constructor() {
    super(
      'W okresie jest faktura korygująca — JPK_FA z korektami jeszcze nie działa (kwoty korekty w bazie nie pozwalają policzyć różnicy wymaganej w pliku). Wygeneruj KPiR albo CSV, a korekty przekaż księgowej osobno.',
    );
    this.name = 'JpkFaCorrectionNotSupportedError';
  }
}

// ============================================================================
// MAIN: generuje XML JPK_FA(4)
// ============================================================================

export function generateJpkFa(data: JpkFaInputData): string {
  // Najpierw to, co ustawia człowiek (urząd w ustawieniach), potem adres z GUS.
  const taxOffice = resolveTaxOfficeCode(data.issuer.taxOfficeCode);
  const address = data.issuer.registeredAddress;
  if (!address) throw new MissingIssuerAddressError();
  if (data.issuedInvoices.some((inv) => inv.invoiceType === 'correction')) {
    throw new JpkFaCorrectionNotSupportedError();
  }
  // Generator zapisuje KodWaluty=PLN i nie emituje P_14_*W dla VAT w PLN
  // na obcowalutowej fakturze. Do czasu pełnego mapowania odmawia pliku.
  if (data.issuedInvoices.some((inv) => inv.currency?.trim().toUpperCase() !== 'PLN')) {
    throw new JpkFaForeignCurrencyNotSupportedError();
  }
  if (data.issuedInvoices.length === 0) {
    // Schemat wymaga co najmniej jednej faktury — pusty okres job oznacza
    // jako „brak faktur”, zanim dojdzie tutaj.
    throw new Error('JPK_FA: brak faktur wystawionych w okresie.');
  }

  const root = create({ version: '1.0', encoding: 'UTF-8' }).ele('JPK', {
    xmlns: TNS,
    'xmlns:etd': ETD,
  });

  buildHeader(root, data, taxOffice);
  buildIssuer(root, data.issuer.nip, data.issuer.name, address);

  const invoices = data.issuedInvoices.map((inv) => ({ inv, amounts: amountsOf(inv) }));
  for (const { inv, amounts } of invoices) buildFaktura(root, inv, amounts, data.issuer);

  const ctrl = root.ele('FakturaCtrl');
  ctrl.ele('LiczbaFaktur').txt(String(invoices.length));
  ctrl.ele('WartoscFaktur').txt(kwota(invoices.reduce((s, { amounts }) => s + amounts.p15, 0)));

  let lineCount = 0;
  let lineValue = 0;
  for (const inv of data.issuedInvoices) {
    for (const line of inv.lines) {
      buildFakturaWiersz(root, inv.invoiceNumber, line);
      lineCount += 1;
      lineValue += line.netAmount;
    }
  }

  const wCtrl = root.ele('FakturaWierszCtrl');
  wCtrl.ele('LiczbaWierszyFaktur').txt(String(lineCount));
  wCtrl.ele('WartoscWierszyFaktur').txt(kwota(lineValue));

  return root.end({ prettyPrint: true });
}

// ============================================================================
// Nagłówek i podmiot
// ============================================================================

function buildHeader(root: XMLBuilder, data: JpkFaInputData, taxOffice: string): void {
  const n = root.ele('Naglowek');
  n.ele('KodFormularza', { kodSystemowy: 'JPK_FA (4)', wersjaSchemy: '1-0' }).txt('JPK_FA');
  n.ele('WariantFormularza').txt('4');
  // Schemat zna tylko cel „1” (złożenie na żądanie organu).
  n.ele('CelZlozenia').txt('1');
  n.ele('DataWytworzeniaJPK').txt((data.generatedAt ?? new Date()).toISOString());
  n.ele('DataOd').txt(data.periodStart);
  n.ele('DataDo').txt(data.periodEnd);
  n.ele('KodUrzedu').txt(taxOffice);
}

function buildIssuer(root: XMLBuilder, nip: string, name: string, a: RegisteredAddress): void {
  const p = root.ele('Podmiot1');
  const id = p.ele('IdentyfikatorPodmiotu');
  id.ele('NIP').txt(nip);
  id.ele('PelnaNazwa').txt(znaki(name));

  // Typ z typów wspólnych MF — elementy w przestrzeni `etd`.
  const adres = p.ele('AdresPodmiotu');
  adres.ele('etd:KodKraju').txt('PL');
  adres.ele('etd:Wojewodztwo').txt(a.voivodeship);
  adres.ele('etd:Powiat').txt(a.county);
  adres.ele('etd:Gmina').txt(a.commune);
  if (a.street) adres.ele('etd:Ulica').txt(a.street);
  adres.ele('etd:NrDomu').txt(a.buildingNumber);
  if (a.apartmentNumber) adres.ele('etd:NrLokalu').txt(a.apartmentNumber);
  adres.ele('etd:Miejscowosc').txt(a.city);
  adres.ele('etd:KodPocztowy').txt(a.postCode);
}

// ============================================================================
// Kwoty faktury
// ============================================================================

interface RateAmount {
  rate: string;
  net: number;
  vat: number;
}

interface InvoiceAmounts {
  rates: RateAmount[];
  p15: number;
}

const RATE_FIELDS: Record<string, { net: string; vat?: string }> = {
  '23': { net: 'P_13_1', vat: 'P_14_1' },
  '8': { net: 'P_13_2', vat: 'P_14_2' },
  '5': { net: 'P_13_3', vat: 'P_14_3' },
  // Odwrotne obciążenie (art. 17 ust. 1 pkt 7 i 8) — P_14_4 jest w sekwencji
  // obowiązkowe, podatek rozlicza nabywca, więc 0.
  oo: { net: 'P_13_4', vat: 'P_14_4' },
  // Dostawa/usługa poza terytorium kraju — P_14_5 opcjonalne.
  np: { net: 'P_13_5' },
  '0': { net: 'P_13_6' },
  zw: { net: 'P_13_7' },
};
const RATE_ORDER = ['23', '8', '5', 'oo', 'np', '0', 'zw'];

/** Kwoty w stawkach i P_15 — jak na fakturze w KSeF (ROZ po odjęciu zaliczek). */
export function amountsOf(inv: JpkInvoice): InvoiceAmounts {
  const items = inv.lines.map(toLineItem);
  const byRate =
    inv.invoiceType === 'final'
      ? settlementVatSummaries(items, inv.advanceSettlement ?? [])
      : summarizeVatPerRate(items);

  const rates = byRate
    .map((s) => ({ rate: String(s.rate), net: s.netSum, vat: s.vatSum }))
    .sort((a, b) => RATE_ORDER.indexOf(a.rate) - RATE_ORDER.indexOf(b.rate));

  const advancesGross = (inv.advanceSettlement ?? []).reduce((s, a) => s + roundToCents(a.advance_amount), 0);
  const p15 =
    inv.invoiceType === 'final'
      ? roundToCents(inv.grossTotal - advancesGross) // art. 106f ust. 3: kwota pozostała do zapłaty
      : roundToCents(inv.grossTotal);
  return { rates, p15 };
}

function toLineItem(line: JpkInvoiceLine): InvoiceLineItem {
  const rate = line.vatRate.trim().toLowerCase();
  if (!RATE_FIELDS[rate]) {
    throw new Error(`JPK_FA: stawka "${line.vatRate}" nie ma pola w JPK_FA(4).`);
  }
  const pct = rate === '23' || rate === '8' || rate === '5' ? Number(rate) / 100 : 0;
  const vat = line.vatAmount ?? roundToCents(line.netAmount * pct);
  return {
    ordinal: line.position,
    name: line.name,
    unit: line.unit,
    quantity: line.quantity,
    unitPriceNet: line.unitPriceNet,
    netAmount: line.netAmount,
    vatRate: rate as VatRate,
    vatAmount: vat,
    grossAmount: roundToCents(line.netAmount + vat),
  };
}

// ============================================================================
// Faktura
// ============================================================================

function buildFaktura(
  root: XMLBuilder,
  inv: JpkInvoice,
  amounts: InvoiceAmounts,
  issuer: JpkFaInputData['issuer'],
): void {
  const f = root.ele('Faktura');
  f.ele('KodWaluty').txt('PLN');
  f.ele('P_1').txt(inv.issueDate);
  f.ele('P_2A').txt(znaki(inv.invoiceNumber));

  // Strony wg broszury MF do JPK_FA(4): P_3A/P_3B nabywca, P_3C/P_3D
  // sprzedawca, P_4B NIP sprzedawcy, P_5B NIP nabywcy. Sprzedawcą faktury
  // wystawionej jest podatnik — gdy faktura nie zapisała jego danych,
  // bierzemy je z firmy (adres: dane firmy, a gdy ich brak — rejestr GUS).
  const sellerAddress =
    inv.sellerAddress || formatIssuerAddress(issuer.address) || formatRegistered(issuer.registeredAddress);
  if (inv.buyerName?.trim()) f.ele('P_3A').txt(znaki(inv.buyerName));
  if (inv.buyerAddress?.trim()) f.ele('P_3B').txt(znaki(inv.buyerAddress));
  f.ele('P_3C').txt(znaki(inv.sellerName || issuer.name));
  f.ele('P_3D').txt(znaki(sellerAddress ?? ''));
  f.ele('P_4B').txt(inv.sellerNip || issuer.nip);
  if (inv.buyerNip?.trim()) f.ele('P_5B').txt(inv.buyerNip.trim());

  if (inv.saleDate && inv.saleDate !== inv.issueDate) f.ele('P_6').txt(inv.saleDate);

  for (const a of amounts.rates) {
    const fields = RATE_FIELDS[a.rate];
    f.ele(fields.net).txt(kwota(a.net));
    if (fields.vat) f.ele(fields.vat).txt(kwota(a.vat));
  }
  f.ele('P_15').txt(kwota(amounts.p15));

  const rates = new Set(amounts.rates.map((a) => a.rate));
  const exempt = rates.has('zw');
  const basis = inv.annotations?.vatExemptionBasis?.trim();
  f.ele('P_16').txt(bool(inv.annotations?.cashMethod === true));
  f.ele('P_17').txt('false'); // samofakturowanie — nie wystawiamy
  f.ele('P_18').txt(bool(rates.has('oo')));
  f.ele('P_18A').txt(bool(inv.annotations?.splitPayment === true));
  f.ele('P_19').txt(bool(exempt));
  if (exempt && basis) f.ele('P_19A').txt(znaki(basis));
  f.ele('P_20').txt('false'); // egzekucja
  f.ele('P_21').txt('false'); // przedstawiciel podatkowy
  f.ele('P_22').txt('false'); // nowe środki transportu
  f.ele('P_23').txt('false'); // procedura trójstronna
  f.ele('P_106E_2').txt('false'); // marża biur podróży
  f.ele('P_106E_3').txt('false'); // marża — towary używane

  // ROZ (art. 106f ust. 3) to w JPK_FA(4) „VAT” z numerami zaliczek.
  f.ele('RodzajFaktury').txt(inv.invoiceType === 'advance' ? 'ZAL' : 'VAT');
  if (inv.invoiceType === 'final') {
    const numbers = (inv.advanceSettlement ?? []).map((a) => a.internal_number).filter(Boolean);
    if (numbers.length > 0) f.ele('NrFaZaliczkowej').txt(znaki(numbers.join(', ')));
  }
}

function buildFakturaWiersz(root: XMLBuilder, invoiceNumber: string, line: JpkInvoiceLine): void {
  const w = root.ele('FakturaWiersz');
  w.ele('P_2B').txt(znaki(invoiceNumber));
  if (line.name.trim()) w.ele('P_7').txt(znaki(line.name));
  if (line.unit.trim()) w.ele('P_8A').txt(znaki(line.unit));
  w.ele('P_8B').txt(ilosc(line.quantity));
  w.ele('P_9A').txt(kwota(line.unitPriceNet));
  w.ele('P_11').txt(kwota(line.netAmount));
  w.ele('P_12').txt(line.vatRate.trim().toLowerCase());
}

// ============================================================================
// HELPERS
// ============================================================================

/** TKwotowy: dwa miejsca po przecinku. */
function kwota(n: number): string {
  return roundToCents(n).toFixed(2);
}

/** TIlosciJPK: do sześciu miejsc po przecinku. */
function ilosc(n: number): string {
  return String(Math.round(n * 1e6) / 1e6);
}

function bool(b: boolean): string {
  return b ? 'true' : 'false';
}

/** TZnakowyJPK: 1–256 znaków, bez zbędnych spacji. */
function znaki(s: string): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, 256);
}

/**
 * Kod Urzędu Skarbowego do KodUrzedu — tylko ze słownika MF.
 *
 * Do 27.09 brak kodu zamieniał się w „1408”, opisany jako Warszawa-Mokotów,
 * a według słownika MF to Urząd Skarbowy w KOZIENICACH — każdy plik wskazywał
 * ten urząd. Plik przechodził walidację, więc nikt tego nie widział. Teraz
 * brak urzędu to błąd z komunikatem, nie cichy zamiennik.
 */
export function resolveTaxOfficeCode(code: string | null | undefined): string {
  const trimmed = (code ?? '').trim();
  if (!isKnownTaxOffice(trimmed)) throw new MissingTaxOfficeError();
  return trimmed;
}

/** Adres wystawcy z pól tenanta — do P_3D, gdy dokument go nie zapisał. */
function formatIssuerAddress(address: JpkFaInputData['issuer']['address']): string | undefined {
  if (!address) return undefined;
  const street = [address.street, address.buildingNumber].filter(Boolean).join(' ');
  const streetFull = address.apartmentNumber ? `${street}/${address.apartmentNumber}` : street;
  const city = [address.postCode, address.city].filter(Boolean).join(' ');
  return [streetFull, city].filter(Boolean).join(', ') || undefined;
}

function formatRegistered(a: RegisteredAddress | undefined): string | undefined {
  if (!a) return undefined;
  const house = a.apartmentNumber ? `${a.buildingNumber}/${a.apartmentNumber}` : a.buildingNumber;
  const street = a.street ? `${a.street} ${house}` : `${a.city} ${house}`;
  return `${street}, ${a.postCode} ${a.city}`;
}
