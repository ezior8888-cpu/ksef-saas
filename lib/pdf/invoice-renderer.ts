import path from 'node:path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

import type { Invoice, InvoiceLineItem, VatRate } from '@/types/invoice';

/**
 * Renderer PDF faktury FA(3) (Faza 33 Krok 1-2).
 *
 * Silnik: `pdfkit` (w deps od Fazy 9; stack niezmienny — nie wprowadzamy
 * react-pdf). Czysta funkcja: `Invoice` → `Buffer`. Mapowanie z DB do
 * `Invoice` robi warstwa wyżej (Krok 4).
 *
 * Fonty: Roboto Regular + Bold z `lib/pdf/fonts/` — standardowe fonty
 * pdfkit (Helvetica/Times) nie mają polskich znaków. Vercel: ścieżki
 * fontów muszą być w `outputFileTracingIncludes` (next.config.ts).
 */

const FONT_DIR = path.join(process.cwd(), 'lib/pdf/fonts');
const PAGE_MARGIN = 42;

export interface RenderInvoiceOptions {
  /** Numer KSeF — drukowany w stopce gdy faktura zaakceptowana. */
  ksefNumber?: string | null;
  /** Treść do zakodowania w QR (numer KSeF lub kod offline). Brak = bez QR. */
  qrPayload?: string | null;
  /** Nadrukuj watermark „WERSJA TESTOWA" (środowisko KSeF test). */
  testWatermark?: boolean;
}

const INVOICE_TYPE_LABEL: Record<string, string> = {
  VAT: 'Faktura VAT',
  KOR: 'Faktura korygująca',
  ZAL: 'Faktura zaliczkowa',
  ROZ: 'Faktura rozliczeniowa',
  UPR: 'Faktura uproszczona',
  KOR_ZAL: 'Korekta faktury zaliczkowej',
  KOR_ROZ: 'Korekta faktury rozliczeniowej',
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  transfer: 'Przelew',
  cash: 'Gotówka',
  card: 'Karta',
  other: 'Inna',
};

const VAT_RATE_LABEL: Record<VatRate, string> = {
  '23': '23%',
  '8': '8%',
  '5': '5%',
  '0': '0%',
  zw: 'zw.',
  oo: 'o.o.',
  np: 'np.',
};

/** Format kwoty w konwencji PL: `1 234,56`. */
function money(n: number): string {
  return n.toLocaleString('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDate(iso: string): string {
  return iso; // już ISO YYYY-MM-DD — czytelne i jednoznaczne
}

/**
 * Renderuje fakturę do bufora PDF. Asynchroniczna z powodu QR (qrcode)
 * i strumieniowego API pdfkit.
 */
export async function renderInvoicePdf(
  invoice: Invoice,
  opts: RenderInvoiceOptions = {},
): Promise<Buffer> {
  // QR generujemy PRZED otwarciem dokumentu — `doc.image` jest synchroniczne.
  let qrBuffer: Buffer | null = null;
  if (opts.qrPayload) {
    qrBuffer = await QRCode.toBuffer(opts.qrPayload, {
      type: 'png',
      margin: 0,
      width: 110,
    });
  }

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('body', path.join(FONT_DIR, 'Roboto-Regular.ttf'));
    doc.registerFont('bold', path.join(FONT_DIR, 'Roboto-Bold.ttf'));

    const pageWidth =
      doc.page.width - PAGE_MARGIN * 2;
    const left = PAGE_MARGIN;

    drawHeader(doc, invoice, qrBuffer, left, pageWidth);
    drawParties(doc, invoice, left, pageWidth);
    drawLineItems(doc, invoice, left, pageWidth);
    drawVatSummary(doc, invoice, left, pageWidth);
    drawPayment(doc, invoice, left, pageWidth);
    drawFooter(doc, invoice, opts, left, pageWidth);

    if (opts.testWatermark) {
      drawWatermark(doc);
    }

    doc.end();
  });
}

type Doc = InstanceType<typeof PDFDocument>;

function drawHeader(
  doc: Doc,
  invoice: Invoice,
  qr: Buffer | null,
  left: number,
  width: number,
): void {
  const title = INVOICE_TYPE_LABEL[invoice.type] ?? 'Faktura';
  doc.font('bold').fontSize(20).fillColor('#111111');
  doc.text(title, left, PAGE_MARGIN);
  doc.font('body').fontSize(11).fillColor('#444444');
  doc.text(`Nr ${invoice.internalNumber}`, left, PAGE_MARGIN + 26);

  doc.fontSize(9).fillColor('#666666');
  doc.text(
    `Data wystawienia: ${fmtDate(invoice.issueDate)}`,
    left,
    PAGE_MARGIN + 44,
  );
  if (invoice.saleDate && invoice.saleDate !== invoice.issueDate) {
    doc.text(
      `Data sprzedaży: ${fmtDate(invoice.saleDate)}`,
      left,
      PAGE_MARGIN + 56,
    );
  }

  // QR w prawym górnym rogu.
  if (qr) {
    doc.image(qr, left + width - 90, PAGE_MARGIN, { width: 90 });
  }

  doc
    .moveTo(left, PAGE_MARGIN + 78)
    .lineTo(left + width, PAGE_MARGIN + 78)
    .strokeColor('#dddddd')
    .stroke();
  doc.y = PAGE_MARGIN + 92;
}

function drawParties(
  doc: Doc,
  invoice: Invoice,
  left: number,
  width: number,
): void {
  const colWidth = (width - 20) / 2;
  const top = doc.y;

  const block = (
    x: number,
    heading: string,
    name: string,
    nip: string | null,
    addr1: string,
    addr2: string,
  ) => {
    doc.font('bold').fontSize(8).fillColor('#888888');
    doc.text(heading.toUpperCase(), x, top, { width: colWidth });
    doc.font('bold').fontSize(11).fillColor('#111111');
    doc.text(name, x, top + 12, { width: colWidth });
    doc.font('body').fontSize(9).fillColor('#444444');
    let y = doc.y + 1;
    if (nip) {
      doc.text(`NIP: ${nip}`, x, y, { width: colWidth });
      y = doc.y;
    }
    doc.text(addr1, x, y, { width: colWidth });
    doc.text(addr2, x, doc.y, { width: colWidth });
  };

  block(
    left,
    'Sprzedawca',
    invoice.seller.name,
    invoice.seller.nip,
    invoice.seller.address.addressLine1,
    invoice.seller.address.addressLine2,
  );
  const sellerBottom = doc.y;

  block(
    left + colWidth + 20,
    'Nabywca',
    invoice.buyer.name,
    invoice.buyer.nip ?? invoice.buyer.vatUeNumber ?? null,
    invoice.buyer.address.addressLine1,
    invoice.buyer.address.addressLine2,
  );

  doc.y = Math.max(sellerBottom, doc.y) + 18;
}

// Kolumny tabeli pozycji — proporcje sumują się do 1.
const COLS = [
  { key: 'lp', label: 'Lp', w: 0.05, align: 'left' as const },
  { key: 'name', label: 'Nazwa towaru / usługi', w: 0.34, align: 'left' as const },
  { key: 'qty', label: 'Ilość', w: 0.09, align: 'right' as const },
  { key: 'unit', label: 'j.m.', w: 0.07, align: 'left' as const },
  { key: 'price', label: 'Cena netto', w: 0.12, align: 'right' as const },
  { key: 'net', label: 'Wartość netto', w: 0.12, align: 'right' as const },
  { key: 'vat', label: 'VAT', w: 0.07, align: 'right' as const },
  { key: 'gross', label: 'Brutto', w: 0.14, align: 'right' as const },
];

function drawLineItems(
  doc: Doc,
  invoice: Invoice,
  left: number,
  width: number,
): void {
  const cellPad = 4;
  const rowHeight = 20;

  const colX: number[] = [];
  let acc = left;
  for (const c of COLS) {
    colX.push(acc);
    acc += c.w * width;
  }

  // Nagłówek tabeli.
  doc.rect(left, doc.y, width, rowHeight).fill('#f3f3f3');
  doc.font('bold').fontSize(8).fillColor('#333333');
  COLS.forEach((c, i) => {
    doc.text(c.label, colX[i]! + cellPad, doc.y + 6, {
      width: c.w * width - cellPad * 2,
      align: c.align,
    });
  });
  doc.y += rowHeight;

  // Wiersze pozycji.
  doc.font('body').fontSize(8).fillColor('#222222');
  invoice.lines.forEach((line: InvoiceLineItem, idx: number) => {
    const rowTop = doc.y;
    const values: Record<string, string> = {
      lp: String(line.ordinal),
      name: line.name,
      qty: money(line.quantity),
      unit: line.unit,
      price: money(line.unitPriceNet),
      net: money(line.netAmount),
      vat: VAT_RATE_LABEL[line.vatRate],
      gross: money(line.grossAmount),
    };
    // Zebra dla czytelności.
    if (idx % 2 === 1) {
      doc.rect(left, rowTop, width, rowHeight).fill('#fafafa');
      doc.fillColor('#222222');
    }
    COLS.forEach((c, i) => {
      doc.text(values[c.key] ?? '', colX[i]! + cellPad, rowTop + 6, {
        width: c.w * width - cellPad * 2,
        align: c.align,
        lineBreak: false,
        ellipsis: true,
      });
    });
    doc.y = rowTop + rowHeight;
  });

  doc
    .moveTo(left, doc.y)
    .lineTo(left + width, doc.y)
    .strokeColor('#dddddd')
    .stroke();
  doc.y += 14;
}

function drawVatSummary(
  doc: Doc,
  invoice: Invoice,
  left: number,
  width: number,
): void {
  // Grupowanie pozycji po stawce VAT.
  const byRate = new Map<
    VatRate,
    { net: number; vat: number; gross: number }
  >();
  for (const line of invoice.lines) {
    const cur = byRate.get(line.vatRate) ?? { net: 0, vat: 0, gross: 0 };
    cur.net += line.netAmount;
    cur.vat += line.vatAmount;
    cur.gross += line.grossAmount;
    byRate.set(line.vatRate, cur);
  }

  const boxW = 250;
  const boxX = left + width - boxW;
  let y = doc.y;

  doc.font('bold').fontSize(8).fillColor('#888888');
  doc.text('PODSUMOWANIE VAT', boxX, y);
  y += 13;

  doc.font('body').fontSize(8).fillColor('#333333');
  for (const [rate, sums] of byRate) {
    doc.text(
      `${VAT_RATE_LABEL[rate]}  netto ${money(sums.net)}  VAT ${money(sums.vat)}`,
      boxX,
      y,
      { width: boxW, align: 'right' },
    );
    y += 12;
  }

  y += 4;
  doc.font('bold').fontSize(11).fillColor('#111111');
  doc.text(`Do zapłaty: ${money(invoice.grossTotal)} PLN`, boxX, y, {
    width: boxW,
    align: 'right',
  });
  doc.y = y + 22;
}

function drawPayment(
  doc: Doc,
  invoice: Invoice,
  left: number,
  width: number,
): void {
  const p = invoice.payment;
  doc.font('bold').fontSize(8).fillColor('#888888');
  doc.text('PŁATNOŚĆ', left, doc.y);
  doc.font('body').fontSize(9).fillColor('#444444');
  doc.text(
    `Sposób: ${PAYMENT_METHOD_LABEL[p.method] ?? p.method}   ·   Termin: ${fmtDate(p.dueDate)}`,
    left,
    doc.y + 2,
    { width },
  );
  if (p.bankAccount) {
    doc.text(
      `Nr rachunku: ${p.bankAccount}${p.bankName ? `  (${p.bankName})` : ''}`,
      left,
      doc.y,
      { width },
    );
  }
  doc.y += 14;
}

function drawFooter(
  doc: Doc,
  invoice: Invoice,
  opts: RenderInvoiceOptions,
  left: number,
  width: number,
): void {
  if (invoice.notes) {
    doc.font('body').fontSize(8).fillColor('#666666');
    doc.text(`Uwagi: ${invoice.notes}`, left, doc.y, { width });
    doc.y += 4;
  }
  if (opts.ksefNumber) {
    doc.font('body').fontSize(8).fillColor('#888888');
    doc.text(`Numer KSeF: ${opts.ksefNumber}`, left, doc.y, { width });
  }

  // Linia + stopka u dołu strony.
  const footY = doc.page.height - PAGE_MARGIN - 14;
  doc
    .moveTo(left, footY)
    .lineTo(left + width, footY)
    .strokeColor('#eeeeee')
    .stroke();
  doc.font('body').fontSize(7).fillColor('#aaaaaa');
  doc.text(
    'Wygenerowano w FaktFlow — faktury KSeF dla mikrofirm.',
    left,
    footY + 4,
    { width, align: 'center' },
  );
}

/** Półprzezroczysty napis po przekątnej — dla środowiska testowego KSeF. */
function drawWatermark(doc: Doc): void {
  doc.save();
  doc.rotate(-45, { origin: [doc.page.width / 2, doc.page.height / 2] });
  doc
    .font('bold')
    .fontSize(64)
    .fillColor('#ff0000')
    .opacity(0.12)
    .text('WERSJA TESTOWA', 0, doc.page.height / 2 - 40, {
      width: doc.page.width,
      align: 'center',
    });
  doc.opacity(1).restore();
}
