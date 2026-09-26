// lib/exports/jpk-fa-generator.ts
// Generator JPK_FA(4) - Jednolity Plik Kontrolny: Faktury VAT
// Schema MF: wariant 4, obowiązuje od 2022-04-01

import { create } from 'xmlbuilder2';

export interface JpkFaInputData {
  // Wystawca (tenant)
  issuer: {
    nip: string;
    name: string;
    /**
     * Kod Urzędu Skarbowego (4 cyfry, KodUrzedu w JPK_FA). Pochodzi z profilu
     * tenanta (właściwy US wg miejsca zamieszkania/siedziby). Gdy brak/niepoprawny
     * — używamy domyślnego (zob. `resolveTaxOfficeCode`). Po dodaniu kolumny
     * `tenants.tax_office_code` caller przekazuje ją tutaj.
     */
    taxOfficeCode?: string;
    address?: {
      country?: string;
      city?: string;
      postCode?: string;
      street?: string;
      buildingNumber?: string;
      apartmentNumber?: string;
    };
  };

  // Okres
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;

  // Faktury wystawione
  issuedInvoices: JpkInvoice[];

  // Faktury otrzymane (zakupowe)
  receivedInvoices?: JpkInvoice[];

  // Metadata
  systemInfo?: string; // np. "KSeF SaaS v1.0"
  goal?: '1' | '2' | '3'; // 1=złożenie pliku, 2=korekta, 3=na żądanie organu
}

export interface JpkInvoice {
  invoiceNumber: string;
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
}

// ============================================================================
// MAIN: generuje XML JPK_FA(4)
// ============================================================================

export function generateJpkFa(data: JpkFaInputData): string {
  const root = create({ version: '1.0', encoding: 'UTF-8' }).ele('JPK', {
    xmlns: 'http://jpk.mf.gov.pl/wzor/2022/02/17/02171/',
    'xmlns:etd':
      'http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2022/01/05/eD/DefinicjeTypy/',
    'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
  });

  buildHeader(root, data);
  buildIssuer(root, data.issuer);

  data.issuedInvoices.forEach((inv) => {
    buildFaktura(root, inv, 'sale', data.issuer);
  });

  data.issuedInvoices.forEach((inv) => {
    inv.lines.forEach((line) => {
      buildFakturaWiersz(root, inv.invoiceNumber, line);
    });
  });

  if (data.receivedInvoices && data.receivedInvoices.length > 0) {
    data.receivedInvoices.forEach((inv) => {
      buildFaktura(root, inv, 'purchase', data.issuer);
    });

    data.receivedInvoices.forEach((inv) => {
      inv.lines.forEach((line) => {
        buildFakturaWiersz(root, inv.invoiceNumber, line);
      });
    });
  }

  buildFakturaCtrl(root, data.issuedInvoices);
  buildFakturaWierszCtrl(root, data.issuedInvoices);

  return root.end({ prettyPrint: true });
}

// ============================================================================
// HEADER (Naglowek)
// ============================================================================

function buildHeader(
  root: ReturnType<typeof create>,
  data: JpkFaInputData,
): void {
  const naglowek = root.ele('Naglowek');

  naglowek
    .ele('KodFormularza', {
      kodSystemowy: 'JPK_FA (4)',
      wersjaSchemy: '1-0',
    })
    .txt('JPK_FA');

  naglowek.ele('WariantFormularza').txt('4');
  naglowek.ele('CelZlozenia', { poz: 'P_7' }).txt(data.goal ?? '1');
  naglowek.ele('DataWytworzeniaJPK').txt(new Date().toISOString());
  naglowek.ele('DataOd').txt(data.periodStart);
  naglowek.ele('DataDo').txt(data.periodEnd);
  naglowek.ele('NazwaSystemu').txt(data.systemInfo ?? 'KSeF SaaS');
  naglowek.ele('KodUrzedu').txt(resolveTaxOfficeCode(data.issuer.taxOfficeCode));
}

// ============================================================================
// PODMIOT1 (wystawca)
// ============================================================================

function buildIssuer(
  root: ReturnType<typeof create>,
  issuer: JpkFaInputData['issuer'],
): void {
  const podmiot = root.ele('Podmiot1', { rola: 'Wystawca' });

  const idPodmiotu = podmiot.ele('IdentyfikatorPodmiotu');
  idPodmiotu.ele('etd:NIP').txt(issuer.nip);
  idPodmiotu.ele('etd:PelnaNazwa').txt(issuer.name);

  if (issuer.address) {
    const adres = podmiot.ele('AdresPodmiotu');
    adres.ele('etd:KodKraju').txt(issuer.address.country ?? 'PL');

    if (issuer.address.street) adres.ele('etd:Ulica').txt(issuer.address.street);
    if (issuer.address.buildingNumber)
      adres.ele('etd:NrDomu').txt(issuer.address.buildingNumber);
    if (issuer.address.apartmentNumber)
      adres.ele('etd:NrLokalu').txt(issuer.address.apartmentNumber);
    if (issuer.address.city)
      adres.ele('etd:Miejscowosc').txt(issuer.address.city);
    if (issuer.address.postCode)
      adres.ele('etd:KodPocztowy').txt(issuer.address.postCode);
  }
}

// ============================================================================
// FAKTURA (header)
// ============================================================================

function buildFaktura(
  root: ReturnType<typeof create>,
  inv: JpkInvoice,
  direction: 'sale' | 'purchase',
  issuer: JpkFaInputData['issuer'],
): void {
  const faktura = root.ele('Faktura', {
    typ: direction === 'sale' ? 'G' : 'Z',
  });

  faktura.ele('KodWaluty').txt('PLN');
  faktura.ele('P_1').txt(inv.issueDate);
  faktura.ele('P_2A').txt(inv.invoiceNumber);
  // Strony wg broszury MF do JPK_FA(4): P_3A/P_3B nabywca, P_3C/P_3D
  // sprzedawca, P_4B NIP sprzedawcy, P_5B NIP nabywcy. Do 26.09 w P_4B szedł
  // NIP NABYWCY, P_5B był pusty, a sprzedawcy nie było wcale. Strona, której
  // dokument nie zapisał, to wystawca pliku (sprzedaż: sprzedawca; zakup
  // ze skrzynki: nabywca).
  const us: ExportParty = { name: issuer.name, nip: issuer.nip, address: formatIssuerAddress(issuer.address) };
  const seller: ExportParty =
    direction === 'sale'
      ? { name: inv.sellerName || us.name, nip: inv.sellerNip || us.nip, address: inv.sellerAddress || us.address }
      : { name: inv.sellerName ?? '', nip: inv.sellerNip, address: inv.sellerAddress };
  const buyer: ExportParty =
    direction === 'purchase'
      ? { name: inv.buyerName || us.name, nip: inv.buyerNip || us.nip, address: inv.buyerAddress || us.address }
      : { name: inv.buyerName, nip: inv.buyerNip, address: inv.buyerAddress };

  faktura.ele('P_3A').txt(buyer.name);
  if (buyer.address) faktura.ele('P_3B').txt(buyer.address);
  faktura.ele('P_3C').txt(seller.name);
  if (seller.address) faktura.ele('P_3D').txt(seller.address);
  if (seller.nip) faktura.ele('P_4B').txt(seller.nip);
  faktura.ele('P_5B').txt(buyer.nip ?? '');

  if (inv.saleDate && inv.saleDate !== inv.issueDate) {
    faktura.ele('P_6').txt(inv.saleDate);
  }

  faktura.ele('P_13_1').txt(inv.netTotal.toFixed(2));
  faktura.ele('P_14_1').txt(inv.vatTotal.toFixed(2));
  faktura.ele('P_15').txt(inv.grossTotal.toFixed(2));

  const rodzaj =
    inv.invoiceType === 'correction'
      ? 'KOREKTA'
      : inv.invoiceType === 'advance'
        ? 'ZAL'
        : 'VAT';
  faktura.ele('RodzajFaktury').txt(rodzaj);

  if (inv.invoiceType === 'correction' && inv.correctedInvoiceNumber) {
    faktura.ele('NrFaKorygowanej').txt(inv.correctedInvoiceNumber);
    if (inv.correctionReason) {
      faktura.ele('PrzyczynaKorekty').txt(inv.correctionReason);
    }
  }

  if (inv.ksefNumber) {
    faktura.ele('Adnotacje').ele('NumerKSeF').txt(inv.ksefNumber);
  }
}

// ============================================================================
// FAKTURA WIERSZ (pozycja faktury)
// ============================================================================

function buildFakturaWiersz(
  root: ReturnType<typeof create>,
  invoiceNumber: string,
  line: JpkInvoiceLine,
): void {
  const wiersz = root.ele('FakturaWiersz', { typ: 'G' });

  wiersz.ele('P_2B').txt(invoiceNumber);
  wiersz.ele('P_7').txt(line.name);
  wiersz.ele('P_8A').txt(line.unit);
  wiersz.ele('P_8B').txt(line.quantity.toFixed(4));
  wiersz.ele('P_9A').txt(line.unitPriceNet.toFixed(2));
  wiersz.ele('P_11').txt(line.netAmount.toFixed(2));
  wiersz.ele('P_12').txt(normalizeVatRate(line.vatRate));
}

// ============================================================================
// CTRL: kontrola sum
// ============================================================================

function buildFakturaCtrl(
  root: ReturnType<typeof create>,
  invoices: JpkInvoice[],
): void {
  const ctrl = root.ele('FakturaCtrl');

  ctrl.ele('LiczbaFaktur').txt(String(invoices.length));

  const wartoscFaktur = invoices.reduce((sum, inv) => sum + inv.grossTotal, 0);
  ctrl.ele('WartoscFaktur').txt(wartoscFaktur.toFixed(2));
}

function buildFakturaWierszCtrl(
  root: ReturnType<typeof create>,
  invoices: JpkInvoice[],
): void {
  const ctrl = root.ele('FakturaWierszCtrl');

  const totalLines = invoices.reduce((sum, inv) => sum + inv.lines.length, 0);
  ctrl.ele('LiczbaWierszyFaktur').txt(String(totalLines));

  const wartoscWierszy = invoices.reduce(
    (sum, inv) => sum + inv.lines.reduce((s, l) => s + l.netAmount, 0),
    0,
  );
  ctrl.ele('WartoscWierszyFaktur').txt(wartoscWierszy.toFixed(2));
}

// ============================================================================
// HELPERS
// ============================================================================

function normalizeVatRate(rate: string): string {
  const r = String(rate).trim().toLowerCase();
  const map: Record<string, string> = {
    '23': '23',
    '8': '8',
    '5': '5',
    '0': '0',
    zw: 'zw',
    oo: 'oo',
    np: 'np',
  };
  return map[r] ?? '23';
}

/** Domyślny kod US, gdy tenant nie ma jeszcze ustawionego własnego. */
export const DEFAULT_TAX_OFFICE_CODE = '1408'; // Pierwszy Mazowiecki US Warszawa-Mokotów

/**
 * Zwraca kod Urzędu Skarbowego do KodUrzedu. Kod US to dokładnie 4 cyfry.
 * Gdy tenant przekazał poprawny kod (z profilu) — używamy go; w przeciwnym
 * razie fallback do domyślnego, żeby JPK_FA pozostał walidowalny przez schemę MF
 * (pusty/niepoprawny KodUrzedu = odrzucenie pliku przez bramkę).
 */
export function resolveTaxOfficeCode(code: string | null | undefined): string {
  const trimmed = (code ?? '').trim();
  return /^\d{4}$/.test(trimmed) ? trimmed : DEFAULT_TAX_OFFICE_CODE;
}

/** Adres wystawcy z pól tenanta — do P_3B/P_3D, gdy dokument go nie zapisał. */
function formatIssuerAddress(address: JpkFaInputData['issuer']['address']): string | undefined {
  if (!address) return undefined;
  const street = [address.street, address.buildingNumber].filter(Boolean).join(' ');
  const streetFull = address.apartmentNumber ? `${street}/${address.apartmentNumber}` : street;
  const city = [address.postCode, address.city].filter(Boolean).join(' ');
  return [streetFull, city].filter(Boolean).join(', ') || undefined;
}
