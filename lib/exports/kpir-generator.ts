// lib/exports/kpir-generator.ts
// Generator KPiR Excel zgodny z rozporządzeniem MF (17 kolumn)

import ExcelJS from 'exceljs';
import type { JpkInvoice } from './jpk-fa-generator';

export interface KpirInputData {
  issuer: { nip: string; name: string };
  periodStart: string;
  periodEnd: string;
  /** Faktury wystawione (przychód) */
  issuedInvoices: JpkInvoice[];
  /** Faktury otrzymane (wydatek) */
  receivedInvoices: JpkInvoice[];
}

// ============================================================================
// MAIN: generuje plik XLSX
// ============================================================================

export async function generateKpirXlsx(data: KpirInputData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  workbook.creator = 'KSeF SaaS';
  workbook.created = new Date();
  workbook.modified = new Date();

  buildInfoSheet(workbook, data);
  buildKpirSheet(workbook, data);

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

// ============================================================================
// ARKUSZ: Informacje
// ============================================================================

function buildInfoSheet(workbook: ExcelJS.Workbook, data: KpirInputData): void {
  const sheet = workbook.addWorksheet('Informacje', {
    properties: { defaultColWidth: 25 },
  });

  sheet.getCell('A1').value = 'Książka Przychodów i Rozchodów';
  sheet.getCell('A1').font = { size: 16, bold: true };
  sheet.mergeCells('A1:E1');

  sheet.getCell('A3').value = 'Podatnik:';
  sheet.getCell('B3').value = data.issuer.name;
  sheet.getCell('A4').value = 'NIP:';
  sheet.getCell('B4').value = data.issuer.nip;
  sheet.getCell('A5').value = 'Okres:';
  sheet.getCell('B5').value = `${formatPlDate(data.periodStart)} — ${formatPlDate(data.periodEnd)}`;

  const total = data.issuedInvoices.length + data.receivedInvoices.length;
  sheet.getCell('A7').value = 'Liczba operacji:';
  sheet.getCell('B7').value = total;

  sheet.getCell('A8').value = 'Przychody (faktury wystawione):';
  sheet.getCell('B8').value = data.issuedInvoices.length;
  sheet.getCell('A9').value = 'Wydatki (faktury otrzymane):';
  sheet.getCell('B9').value = data.receivedInvoices.length;
}

// ============================================================================
// ARKUSZ: KPiR (17 kolumn)
// ============================================================================

type KpirEntry = JpkInvoice & { direction: 'issued' | 'received' };

function buildKpirSheet(workbook: ExcelJS.Workbook, data: KpirInputData): void {
  const sheet = workbook.addWorksheet('KPiR', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
  });

  const headers = [
    'L.p.',                         // 1
    'Data zdarzenia',               // 2
    'Numer dowodu',                 // 3
    'Kontrahent',                   // 4
    'Adres kontrahenta',            // 5
    'Opis zdarzenia',               // 6
    'Sprzedaż towarów (7)',         // 7
    'Pozostałe przychody (8)',      // 8
    'Razem przychód (9)',           // 9
    'Zakup towarów (10)',           // 10
    'Koszty uboczne (11)',          // 11
    'Wynagrodzenia (12)',           // 12
    'Pozostałe wydatki (13)',       // 13
    'Razem wydatki (14)',           // 14
    'Wartość spisu z natury (15)', // 15
    'Uwagi (16)',                   // 16
    'Numer KSeF',                   // 17
  ];

  const headerRow = sheet.addRow(headers);
  headerRow.font = { bold: true, size: 10 };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  headerRow.height = 40;
  applyBorderToRow(headerRow, 'thin');

  const widths = [5, 12, 18, 35, 35, 30, 16, 16, 16, 16, 16, 16, 16, 16, 16, 20, 20];
  widths.forEach((w, i) => { sheet.getColumn(i + 1).width = w; });

  const entries: KpirEntry[] = [
    ...data.issuedInvoices.map((inv) => ({ ...inv, direction: 'issued' as const })),
    ...data.receivedInvoices.map((inv) => ({ ...inv, direction: 'received' as const })),
  ].sort((a, b) => a.issueDate.localeCompare(b.issueDate));

  let lp = 1;
  let totalIncome = 0;
  let totalCost = 0;
  const AMOUNT_COLS = [7, 8, 9, 10, 11, 12, 13, 14, 15];

  for (const inv of entries) {
    const isSale = inv.direction === 'issued';
    const net = inv.netTotal;

    const rowValues = [
      lp,
      formatPlDate(inv.issueDate),
      inv.invoiceNumber,
      inv.buyerName,
      inv.buyerAddress ?? '',
      describeInvoice(inv),
      isSale ? net : null,    // 7: sprzedaż towarów/usług
      null,                    // 8: pozostałe przychody
      isSale ? net : null,    // 9: razem przychód
      null,                    // 10: zakup towarów
      null,                    // 11: koszty uboczne
      null,                    // 12: wynagrodzenia
      !isSale ? net : null,   // 13: pozostałe wydatki
      !isSale ? net : null,   // 14: razem wydatki
      null,                    // 15: spis z natury
      inv.invoiceType === 'correction'
        ? `Korekta do ${inv.correctedInvoiceNumber ?? '—'}`
        : '',                  // 16: uwagi
      inv.ksefNumber ?? '',   // 17: numer KSeF
    ];

    const dataRow = sheet.addRow(rowValues);

    AMOUNT_COLS.forEach((col) => {
      const cell = dataRow.getCell(col);
      if (cell.value !== null) {
        cell.numFmt = '#,##0.00 "zł"';
      }
    });

    applyBorderToRow(dataRow, 'hair', 'FFCCCCCC');

    if (isSale) totalIncome += net;
    else totalCost += net;

    lp++;
  }

  const summaryRow = sheet.addRow([
    null, null, null, null, null,
    'PODSUMOWANIE OKRESU',
    totalIncome,   // 7
    null,
    totalIncome,   // 9
    null, null, null,
    totalCost,     // 13
    totalCost,     // 14
    null, null, null,
  ]);

  summaryRow.font = { bold: true };
  summaryRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFF0E0' },
  };

  [7, 9, 13, 14].forEach((col) => {
    summaryRow.getCell(col).numFmt = '#,##0.00 "zł"';
  });

  applyBorderToRow(summaryRow, 'thin');
}

// ============================================================================
// HELPERS
// ============================================================================

function applyBorderToRow(
  row: ExcelJS.Row,
  style: ExcelJS.BorderStyle,
  argb = 'FF000000',
): void {
  const border: Partial<ExcelJS.Border> = { style, color: { argb } };
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.border = { top: border, bottom: border, left: border, right: border };
  });
}

function formatPlDate(iso: string): string {
  if (!iso) return '';
  const day = iso.trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function describeInvoice(inv: JpkInvoice): string {
  switch (inv.invoiceType) {
    case 'correction':
      return 'Korekta faktury';
    case 'advance':
      return 'Faktura zaliczkowa';
    case 'final':
      return 'Faktura rozliczająca';
    default: {
      const first = inv.lines[0];
      if (first?.name) {
        return first.name.length > 40
          ? first.name.slice(0, 37) + '...'
          : first.name;
      }
      return 'Faktura VAT';
    }
  }
}
