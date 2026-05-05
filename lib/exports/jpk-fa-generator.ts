// lib/exports/jpk-fa-generator.ts
// Generator JPK_FA(4) - Jednolity Plik Kontrolny: Faktury VAT
// Schema MF: wariant 4, obowiązuje od 2022-04-01

import { create } from 'xmlbuilder2';

export interface JpkFaInputData {
  // Wystawca (tenant)
  issuer: {
    nip: string;
    name: string;
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

  // Strony
  buyerNip?: string;
  buyerName: string;
  buyerAddress?: string;

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
    buildFaktura(root, inv, 'sale');
  });

  data.issuedInvoices.forEach((inv) => {
    inv.lines.forEach((line) => {
      buildFakturaWiersz(root, inv.invoiceNumber, line);
    });
  });

  if (data.receivedInvoices && data.receivedInvoices.length > 0) {
    data.receivedInvoices.forEach((inv) => {
      buildFaktura(root, inv, 'purchase');
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
  naglowek.ele('KodUrzedu').txt(extractTaxOfficeCode(data.issuer.nip));
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
): void {
  const faktura = root.ele('Faktura', {
    typ: direction === 'sale' ? 'G' : 'Z',
  });

  faktura.ele('KodWaluty').txt('PLN');
  faktura.ele('P_1').txt(inv.issueDate);
  faktura.ele('P_2A').txt(inv.invoiceNumber);
  faktura.ele('P_3A').txt(inv.buyerName);

  if (inv.buyerAddress) faktura.ele('P_3B').txt(inv.buyerAddress);
  if (inv.buyerNip) faktura.ele('P_4B').txt(inv.buyerNip);

  faktura.ele('P_5B').txt('');

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

function extractTaxOfficeCode(_nip: string): string {
  // Domyślny kod US (1408 = Pierwszy Mazowiecki US Warszawa-Mokotów).
  // TODO: dodać kolumnę tax_office_code do tenants i pobierać z profilu tenanta.
  return '1408';
}
