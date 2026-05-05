// lib/exports/csv-generators.ts
// Generatory CSV dla: Insert Subiekt (Win-1250), Symfonia (UTF-8), Wapro Mag (UTF-8)

import Papa from 'papaparse';
import iconv from 'iconv-lite';
import type { JpkInvoice } from './jpk-fa-generator';

export interface CsvExportInput {
  issuer: { nip: string; name: string };
  periodStart: string;
  periodEnd: string;
  issuedInvoices: JpkInvoice[];
  receivedInvoices: JpkInvoice[];
}

// ============================================================================
// Insert Subiekt GT
// Separator: ;   Encoding: Windows-1250   Bez BOM
// Kolumny: Numer;Data;Klient;NIP;Netto;VAT;Brutto;Typ
// ============================================================================

export function generateInsertSubiektCsv(data: CsvExportInput): Buffer {
  const invoices = allInvoices(data);

  const rows = invoices.map((inv) => ({
    Numer: inv.invoiceNumber,
    Data: formatPlDate(inv.issueDate),
    Klient: inv.buyerName,
    NIP: inv.buyerNip ?? '',
    Netto: inv.netTotal.toFixed(2).replace('.', ','),
    VAT: inv.vatTotal.toFixed(2).replace('.', ','),
    Brutto: inv.grossTotal.toFixed(2).replace('.', ','),
    Typ: mapInvoiceTypeSubiekt(inv.invoiceType),
    ...(inv.ksefNumber ? { KSeF: inv.ksefNumber } : {}),
  }));

  const csv = Papa.unparse(rows, { delimiter: ';', newline: '\r\n' });

  // Insert Subiekt wymaga Windows-1250 dla polskich znaków
  return iconv.encode(csv, 'win1250');
}

// ============================================================================
// Symfonia Handel / Faktura
// Separator: ;   Encoding: UTF-8 + BOM   Linia nagłówkowa po polsku
// ============================================================================

export function generateSymfoniaCsv(data: CsvExportInput): Buffer {
  const invoices = allInvoices(data);

  const rows = invoices.map((inv, idx) => ({
    'Lp.': idx + 1,
    NumerDokumentu: inv.invoiceNumber,
    DataWystawienia: formatPlDate(inv.issueDate),
    DataSprzedazy: formatPlDate(inv.saleDate ?? inv.issueDate),
    Kontrahent: inv.buyerName,
    NIP: inv.buyerNip ?? '',
    Adres: inv.buyerAddress ?? '',
    WartoscNetto: inv.netTotal.toFixed(2).replace('.', ','),
    WartoscVAT: inv.vatTotal.toFixed(2).replace('.', ','),
    WartoscBrutto: inv.grossTotal.toFixed(2).replace('.', ','),
    Waluta: 'PLN',
    TerminPlatnosci: inv.paymentDueDate
      ? formatPlDate(inv.paymentDueDate)
      : '',
    RodzajDokumentu: mapInvoiceTypeSymfonia(inv.invoiceType),
    NumerKSeF: inv.ksefNumber ?? '',
    FakturaKorygowana: inv.correctedInvoiceNumber ?? '',
  }));

  const csv = Papa.unparse(rows, { delimiter: ';', newline: '\r\n' });

  // UTF-8 BOM (Symfonia rozpoznaje BOM jako marker UTF-8)
  const bom = Buffer.from('\ufeff', 'utf8');
  return Buffer.concat([bom, Buffer.from(csv, 'utf8')]);
}

// ============================================================================
// Wapro Mag / Fakturowanie
// Separator: \t   Encoding: UTF-8 + BOM
// ============================================================================

export function generateWaproCsv(data: CsvExportInput): Buffer {
  const invoices = allInvoices(data);

  const rows = invoices.map((inv, idx) => ({
    lp: idx + 1,
    numer: inv.invoiceNumber,
    data: formatPlDate(inv.issueDate),
    data_sprzedazy: formatPlDate(inv.saleDate ?? inv.issueDate),
    nabywca: inv.buyerName,
    nip: inv.buyerNip ?? '',
    adres: inv.buyerAddress ?? '',
    netto: inv.netTotal.toFixed(2).replace('.', ','),
    vat: inv.vatTotal.toFixed(2).replace('.', ','),
    brutto: inv.grossTotal.toFixed(2).replace('.', ','),
    waluta: 'PLN',
    termin_platnosci: inv.paymentDueDate
      ? formatPlDate(inv.paymentDueDate)
      : '',
    rodzaj: mapInvoiceTypeWapro(inv.invoiceType),
    ksef: inv.ksefNumber ?? '',
  }));

  const csv = Papa.unparse(rows, { delimiter: '\t', newline: '\r\n' });

  const bom = Buffer.from('\ufeff', 'utf8');
  return Buffer.concat([bom, Buffer.from(csv, 'utf8')]);
}

// ============================================================================
// CSV uniwersalny (rozdzielnik `;`, UTF-8 z BOM)

export function generateUniversalCsv(data: CsvExportInput): Buffer {
  const invoices = allInvoices(data);

  const rows = invoices.map((inv, idx) => ({
    Lp: idx + 1,
    Numer: inv.invoiceNumber,
    DataWystawienia: formatPlDate(inv.issueDate),
    Kontrahent: inv.buyerName,
    NIP: inv.buyerNip ?? '',
    Netto: inv.netTotal.toFixed(2).replace('.', ','),
    VAT: inv.vatTotal.toFixed(2).replace('.', ','),
    Brutto: inv.grossTotal.toFixed(2).replace('.', ','),
    Waluta: 'PLN',
    Rodzaj: mapInvoiceTypeSubiekt(inv.invoiceType),
    KSeF: inv.ksefNumber ?? '',
  }));

  const csv = Papa.unparse(rows, { delimiter: ';', newline: '\r\n' });
  const bom = Buffer.from('\ufeff', 'utf8');
  return Buffer.concat([bom, Buffer.from(csv, 'utf8')]);
}

// ============================================================================
// Helpers
// ============================================================================

function allInvoices(data: CsvExportInput): JpkInvoice[] {
  return [...data.issuedInvoices, ...data.receivedInvoices].sort((a, b) =>
    a.issueDate.localeCompare(b.issueDate),
  );
}

function formatPlDate(iso: string): string {
  if (!iso) return '';
  const day = iso.trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function mapInvoiceTypeSubiekt(type: JpkInvoice['invoiceType']): string {
  switch (type) {
    case 'correction':
      return 'KOREKTA';
    case 'advance':
      return 'ZALICZKOWA';
    case 'final':
      return 'ROZLICZENIOWA';
    default:
      return 'FAKTURA';
  }
}

function mapInvoiceTypeSymfonia(type: JpkInvoice['invoiceType']): string {
  switch (type) {
    case 'correction':
      return 'FK';
    case 'advance':
      return 'FZ';
    case 'final':
      return 'FR';
    default:
      return 'FS';
  }
}

function mapInvoiceTypeWapro(type: JpkInvoice['invoiceType']): string {
  switch (type) {
    case 'correction':
      return 'korekta';
    case 'advance':
      return 'zaliczka';
    case 'final':
      return 'rozliczenie';
    default:
      return 'faktura';
  }
}
