// lib/exports/comarch-optima-generator.ts
// Generator importu dla Comarch ERP Optima (XML)
// Format: Comarch Optima Faktury

import { create } from 'xmlbuilder2';
import type { JpkFaInputData, JpkInvoice, JpkInvoiceLine } from './jpk-fa-generator';

export interface OptimaExportInput {
  issuer: JpkFaInputData['issuer'];
  periodStart: string;
  periodEnd: string;
  issuedInvoices: JpkInvoice[];
  receivedInvoices: JpkInvoice[];
}

// ============================================================================
// MAIN
// ============================================================================

export function generateComarchOptimaXml(data: OptimaExportInput): string {
  const root = create({ version: '1.0', encoding: 'UTF-8' }).ele('Faktury', {
    xmlns: 'http://www.comarch.pl/cdn/optima/faktury',
    'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
  });

  let ordinal = 1;

  for (const inv of data.issuedInvoices) {
    buildFaktura(root, inv, 'FASP', data.issuer.name, ordinal++);
  }

  for (const inv of data.receivedInvoices) {
    buildFaktura(root, inv, 'FZSP', data.issuer.name, ordinal++);
  }

  return root.end({ prettyPrint: true });
}

// ============================================================================
// FAKTURA
// ============================================================================

/**
 * Typy dokumentów Optima:
 *   FASP — Faktura sprzedaży
 *   FZSP — Faktura zakupu
 *   KFSP — Korekta FS
 *   KFZS — Korekta FZ
 */
function buildFaktura(
  root: ReturnType<typeof create>,
  inv: JpkInvoice,
  docType: string,
  issuerName: string,
  lp: number,
): void {
  const isCorrection = inv.invoiceType === 'correction';
  const effectiveDocType =
    isCorrection
      ? docType === 'FASP'
        ? 'KFSP'
        : 'KFZS'
      : docType;

  const faktura = root.ele('Faktura', { Lp: String(lp) });
  const naglowek = faktura.ele('Naglowek');

  naglowek.ele('RodzajDokumentu').txt(effectiveDocType);
  naglowek.ele('NumerObcy').txt(inv.invoiceNumber);
  naglowek.ele('DataWystawienia').txt(inv.issueDate);
  naglowek.ele('DataSprzedazy').txt(inv.saleDate ?? inv.issueDate);

  if (isCorrection && inv.correctedInvoiceNumber) {
    naglowek.ele('NumerKorygowanego').txt(inv.correctedInvoiceNumber);
    if (inv.correctionReason) {
      naglowek.ele('PrzyczynaKorekty').txt(inv.correctionReason);
    }
  }

  if (inv.ksefNumber) {
    naglowek.ele('NumerKSeF').txt(inv.ksefNumber);
  }

  // Kontrahent
  const kontrahent = naglowek.ele('Kontrahent');
  if (inv.buyerNip) kontrahent.ele('NIP').txt(inv.buyerNip);
  kontrahent.ele('Nazwa1').txt(inv.buyerName);
  if (inv.buyerAddress) kontrahent.ele('Adres').txt(inv.buyerAddress);

  // Wystawca
  naglowek.ele('Wystawca').txt(issuerName);

  // Płatność
  if (inv.paymentDueDate) {
    const platnosc = naglowek.ele('Platnosc');
    platnosc.ele('TerminPlatnosci').txt(inv.paymentDueDate);
    platnosc.ele('FormaPlatnosci').txt('Przelew');
  }

  // Podsumowanie
  const podsumowanie = naglowek.ele('Podsumowanie');
  podsumowanie.ele('WartoscNetto').txt(inv.netTotal.toFixed(2));
  podsumowanie.ele('WartoscVAT').txt(inv.vatTotal.toFixed(2));
  podsumowanie.ele('WartoscBrutto').txt(inv.grossTotal.toFixed(2));
  podsumowanie.ele('Waluta').txt('PLN');

  // Pozycje
  const pozycje = faktura.ele('Pozycje');
  inv.lines.forEach((line, idx) => {
    buildPozycja(pozycje, line, idx + 1);
  });
}

function buildPozycja(
  pozycje: ReturnType<typeof create>,
  line: JpkInvoiceLine,
  lp: number,
): void {
  const poz = pozycje.ele('Pozycja', { Lp: String(lp) });

  poz.ele('NazwaTowaru').txt(line.name);
  poz.ele('Jednostka').txt(line.unit);
  poz.ele('Ilosc').txt(line.quantity.toFixed(4));
  poz.ele('CenaNetto').txt(line.unitPriceNet.toFixed(4));
  poz.ele('WartoscNetto').txt(line.netAmount.toFixed(2));
  poz.ele('StawkaVAT').txt(normalizeVatRateOptima(line.vatRate));

  const vatAmount = calculateVatAmount(line);
  poz.ele('WartoscVAT').txt(vatAmount.toFixed(2));
  poz.ele('WartoscBrutto').txt((line.netAmount + vatAmount).toFixed(2));
}

// ============================================================================
// Helpers
// ============================================================================

function normalizeVatRateOptima(rate: string): string {
  const r = rate.trim().toLowerCase();
  const map: Record<string, string> = {
    '23': '23%',
    '8': '8%',
    '5': '5%',
    '0': '0%',
    zw: 'zw',
    oo: 'oo',
    np: 'np',
  };
  return map[r] ?? '23%';
}

function calculateVatAmount(line: JpkInvoiceLine): number {
  const r = line.vatRate.trim().toLowerCase();
  const rateMap: Record<string, number> = { '23': 0.23, '8': 0.08, '5': 0.05, '0': 0 };
  const rate = rateMap[r] ?? 0;
  return Math.round(line.netAmount * rate * 100) / 100;
}
