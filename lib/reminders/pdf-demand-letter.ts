// lib/reminders/pdf-demand-letter.ts
// Generator PDF przedsądowego wezwania do zapłaty (Etap 3)

import PDFDocument from 'pdfkit';

export interface DemandLetterData {
  // Wystawca (Twoja firma)
  sellerName: string;
  sellerNip: string;
  sellerAddress: string;

  // Dłużnik
  buyerName: string;
  buyerNip?: string;
  buyerAddress: string;

  // Faktura
  invoiceNumber: string;
  issueDate: string; // ISO
  dueDate: string;
  grossAmount: number;
  paidAmount: number;
  amountDue: number;
  bankAccount: string;
  daysOverdue: number;

  // Sender info
  senderName: string;
  senderEmail: string;

  // Place + date
  placeOfIssue: string; // np. "Warszawa"
  letterDate: string; // ISO dzisiaj
}

type PdfKitDoc = InstanceType<typeof PDFDocument>;

export async function generateDemandLetterPdf(
  data: DemandLetterData,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 60,
        info: {
          Title: `Przedsądowe wezwanie - ${data.invoiceNumber}`,
          Author: data.sellerName,
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ============== HEADER (sprzedawca po lewej) ==============
      doc.fontSize(10).font('Helvetica-Bold').text(data.sellerName, 60, 60);

      doc
        .font('Helvetica')
        .fontSize(9)
        .text(data.sellerAddress)
        .text(`NIP: ${data.sellerNip}`);

      // Place + data po prawej
      doc
        .fontSize(10)
        .text(`${data.placeOfIssue}, ${formatDate(data.letterDate)}`, 350, 60, {
          align: 'right',
        });

      // ============== ADRESAT (po prawej, lower) ==============
      doc.moveDown(3);
      doc
        .fontSize(11)
        .font('Helvetica-Bold')
        .text(data.buyerName, 350, doc.y, { align: 'right' });

      doc
        .font('Helvetica')
        .fontSize(10)
        .text(data.buyerAddress, { align: 'right' });

      if (data.buyerNip) {
        doc.text(`NIP: ${data.buyerNip}`, { align: 'right' });
      }

      // ============== TYTUŁ ==============
      doc.moveDown(4);
      doc
        .fontSize(16)
        .font('Helvetica-Bold')
        .fillColor('#000')
        .text('PRZEDSĄDOWE WEZWANIE DO ZAPŁATY', { align: 'center' });

      doc.moveDown(0.3).fontSize(10).font('Helvetica-Oblique').fillColor('#666').text(
        `dotyczy faktury VAT nr ${data.invoiceNumber} z dnia ${formatDate(data.issueDate)}`,
        { align: 'center' },
      );

      // ============== TREŚĆ ==============
      doc.moveDown(2);
      doc.fillColor('#000').font('Helvetica').fontSize(11);

      const paragraph1 = `Niniejszym, na podstawie art. 187 § 1 pkt 3 Kodeksu postępowania cywilnego, wzywam Państwa do zapłaty zaległej kwoty wynikającej z faktury VAT nr ${data.invoiceNumber}.`;

      doc.text(paragraph1, { lineGap: 4 });

      doc.moveDown(1);

      // ============== TABELA: szczegóły zadłużenia ==============
      const tableTop = doc.y;
      doc
        .strokeColor('#cccccc')
        .lineWidth(0.5)
        .moveTo(60, tableTop)
        .lineTo(535, tableTop)
        .stroke();

      doc.moveDown(0.5);

      drawTableRow(doc, 'Numer faktury:', data.invoiceNumber);
      drawTableRow(doc, 'Data wystawienia:', formatDate(data.issueDate));
      drawTableRow(doc, 'Termin płatności:', formatDate(data.dueDate));
      drawTableRow(doc, 'Dni opóźnienia:', `${data.daysOverdue} dni`);
      drawTableRow(
        doc,
        'Kwota brutto faktury:',
        `${data.grossAmount.toFixed(2)} PLN`,
      );

      if (data.paidAmount > 0) {
        drawTableRow(doc, 'Wpłacono:', `${data.paidAmount.toFixed(2)} PLN`);
      }

      doc.moveDown(0.3);
      doc.strokeColor('#666666').lineWidth(1).moveTo(60, doc.y).lineTo(535, doc.y).stroke();

      doc.moveDown(0.3);
      doc.fontSize(13).font('Helvetica-Bold').text(
        `POZOSTAŁA KWOTA DO ZAPŁATY: ${data.amountDue.toFixed(2)} PLN`,
        { align: 'right' },
      );

      doc
        .strokeColor('#cccccc')
        .lineWidth(0.5)
        .moveTo(60, doc.y + 5)
        .lineTo(535, doc.y + 5)
        .stroke();

      // ============== WEZWANIE ==============
      doc.moveDown(2);
      doc.fontSize(11).font('Helvetica');

      doc.text('Wzywam do zapłaty powyższej kwoty w nieprzekraczalnym terminie:', {
        lineGap: 4,
      });

      doc.moveDown(0.5);

      doc
        .fontSize(13)
        .font('Helvetica-Bold')
        .fillColor('#cc0000')
        .text('7 dni od daty otrzymania niniejszego wezwania', {
          align: 'center',
        });

      doc.fillColor('#000').font('Helvetica').fontSize(11);

      doc.moveDown(1);
      doc.text('na rachunek bankowy:', { lineGap: 4 });

      doc.moveDown(0.3).fontSize(11).font('Courier-Bold').text(formatBankAccount(data.bankAccount), {
        align: 'center',
      });

      doc.font('Helvetica').fontSize(10).fillColor('#666');
      doc.moveDown(0.3);
      doc.text(`Tytuł przelewu: ${data.invoiceNumber}`, { align: 'center' });

      // ============== KONSEKWENCJE ==============
      doc.moveDown(2);
      doc.fillColor('#000').fontSize(11);

      const consequences = `W przypadku braku wpłaty w wyznaczonym terminie, sprawa zostanie skierowana na drogę postępowania sądowego, co wiązać się będzie z poniesieniem przez Państwa dodatkowych kosztów, w tym:

- kosztów postępowania sądowego
- odsetek ustawowych za opóźnienie w transakcjach handlowych
- kosztów zastępstwa procesowego (zgodnie z art. 98 KPC)
- kosztów rekompensaty za odzyskiwanie należności (40 EUR zgodnie z art. 10 ustawy o terminach zapłaty)

Mam nadzieję, że niniejsze wezwanie pozwoli polubownie zakończyć sprawę.`;

      doc.text(consequences, { lineGap: 4 });

      // ============== PODPIS ==============
      doc.moveDown(3);
      doc.fontSize(11).text('Z poważaniem,');

      doc.moveDown(2);
      doc.font('Helvetica-Bold').fontSize(11).text(data.senderName);
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#666')
        .text(data.senderEmail);

      // ============== FOOTER ==============
      doc
        .fontSize(8)
        .fillColor('#999')
        .text(
          `Dokument wygenerowany elektronicznie. ${formatDate(data.letterDate)}`,
          60,
          780,
          { align: 'center', width: 475 },
        );

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

// ============================================================================
// Helpers
// ============================================================================

function drawTableRow(doc: PdfKitDoc, label: string, value: string) {
  const y = doc.y;
  doc
    .fontSize(10)
    .fillColor('#666')
    .font('Helvetica')
    .text(label, 60, y, { width: 200 });

  doc
    .fillColor('#000')
    .font('Helvetica-Bold')
    .text(value, 280, y, { width: 250 });

  doc.moveDown(0.4);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pl-PL');
}

function formatBankAccount(account: string): string {
  // 26 cyfr → "00 0000 0000 0000 0000 0000 0000"
  const cleaned = account.replace(/\s/g, '');
  return cleaned.replace(/(.{2})(?=.)/g, '$1 ').trim();
}
