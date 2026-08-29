import { describe, expect, it } from 'vitest';

import {
  ACCOUNTANT_FORMATS,
  buildFormatQuestion,
  buildImportFailureReport,
  buildPackageManifest,
  FALLBACK_FORMAT,
  formatChangeAction,
  GENERATOR_VERSION,
  importFailureAction,
  isAccountantFormat,
  packageFormats,
  versionedFilename,
} from '@/lib/flo/functions/accountant-format';
import { buildDeliveryProposal, buildMonthClosePackageProposal } from '@/lib/flo/functions/month-close';
import { generateUniversalCsv, type CsvExportInput } from '@/lib/exports/csv-generators';
import type { JpkInvoice } from '@/lib/exports/jpk-fa-generator';
import { generateComarchOptimaXml } from '@/lib/exports/comarch-optima-generator';
import { packageZip } from '@/lib/exports/zip-packager';

/**
 * B-02 — format pod program księgowej (krok 42).
 *
 * Definicja gotowości z planu: PACZKA TESTOWA ZAWIERA OBA PLIKI.
 */

const d = (iso: string) => new Date(`${iso}T09:00:00.000Z`);

// ═══════════════════════════════════════════════════════════════
// Skład paczki
// ═══════════════════════════════════════════════════════════════

describe('pierwsza paczka niesie zapas', () => {
  it('wybrany format PLUS uniwersalny CSV', () => {
    // Klient zgaduje, w czym pracuje jego księgowa, i ma prawo zgadnąć źle.
    // Z jednym plikiem zła odpowiedź kosztuje tydzień telefonów.
    expect(packageFormats({ chosen: 'comarch_optima', isFirstPackage: true })).toEqual([
      'comarch_optima',
      'csv_universal',
    ]);
  });

  it('kolejne paczki już bez zapasu', () => {
    // Skoro poprzednia weszła, drugi plik jest tylko zaśmiecaniem skrzynki.
    expect(packageFormats({ chosen: 'comarch_optima', isFirstPackage: false })).toEqual([
      'comarch_optima',
    ]);
  });

  it('wybór uniwersalnego CSV nie dubluje pliku', () => {
    expect(packageFormats({ chosen: 'csv_universal', isFirstPackage: true })).toEqual([
      'csv_universal',
    ]);
  });

  it('zapasowym formatem jest uniwersalny CSV', () => {
    expect(FALLBACK_FORMAT).toBe('csv_universal');
  });
});

// ═══════════════════════════════════════════════════════════════
// PACZKA TESTOWA — definicja gotowości kroku 42
// ═══════════════════════════════════════════════════════════════

describe('paczka testowa zawiera oba pliki', () => {
  const invoice: JpkInvoice = {
    invoiceNumber: 'FV/2026/08/1',
    invoiceType: 'regular',
    issueDate: '2026-08-10',
    saleDate: '2026-08-10',
    buyerName: 'Klient',
    buyerNip: '9876543210',
    netTotal: 10_000,
    vatTotal: 2_300,
    grossTotal: 12_300,
    lines: [
      {
        position: 1,
        name: 'Usługa programistyczna',
        unit: 'usł.',
        quantity: 1,
        unitPriceNet: 10_000,
        netAmount: 10_000,
        vatRate: '23',
      },
    ],
  };

  const data: CsvExportInput = {
    issuer: { nip: '1234567890', name: 'Firma Testowa' },
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    issuedInvoices: [invoice],
    receivedInvoices: [],
  };

  it('ZIP niesie wybrany format i uniwersalny CSV, oba z wersją w nazwie', async () => {
    const formats = packageFormats({ chosen: 'comarch_optima', isFirstPackage: true });

    const files = [
      {
        filename: versionedFilename({
          format: 'comarch_optima',
          nip: '1234567890',
          periodKey: '2026-08',
        }),
        content: Buffer.from(generateComarchOptimaXml(data), 'utf8'),
      },
      {
        filename: versionedFilename({
          format: 'csv_universal',
          nip: '1234567890',
          periodKey: '2026-08',
        }),
        content: generateUniversalCsv(data),
      },
      {
        filename: 'MANIFEST.txt',
        content: Buffer.from(
          buildPackageManifest({
            periodKey: '2026-08',
            companyName: 'Firma Testowa',
            nip: '1234567890',
            formats,
            documentCount: 1,
            generatedAt: d('2026-09-02'),
          }),
          'utf8',
        ),
      },
    ];

    const zip = await packageZip(files);
    // Nazwy plików leżą w katalogu centralnym ZIP-a nieskompresowane.
    const listing = zip.toString('latin1');

    expect(listing).toContain('comarch_optima_1234567890_2026-08_v1-0.xml');
    expect(listing).toContain('csv_universal_1234567890_2026-08_v1-0.csv');
    expect(listing).toContain('MANIFEST.txt');
    expect(files).toHaveLength(3);
    expect(files.every((file) => file.content.length > 0)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// Wersja generatora
// ═══════════════════════════════════════════════════════════════

describe('wersja generatora', () => {
  it('siedzi w nazwie pliku', () => {
    expect(
      versionedFilename({ format: 'symfonia', nip: '123-456-78-90', periodKey: '2026-08' }),
    ).toBe('symfonia_1234567890_2026-08_v1-0.csv');
  });

  it('NIE siedzi w treści plików CSV', async () => {
    // Dopisanie wiersza nagłówka do CSV-a pod Subiekta zepsułoby import,
    // czyli zrobiłoby dokładnie to, przed czym ten mechanizm chroni.
    const csv = generateUniversalCsv({
      issuer: { nip: '1234567890', name: 'Firma' },
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      issuedInvoices: [],
      receivedInvoices: [],
    });
    expect(csv.toString('utf8')).not.toContain(GENERATOR_VERSION);
  });

  it('siedzi w manifeście, który czyta człowiek', () => {
    const manifest = buildPackageManifest({
      periodKey: '2026-08',
      companyName: 'Firma Testowa',
      nip: '1234567890',
      formats: ['comarch_optima', 'csv_universal'],
      documentCount: 34,
      generatedAt: d('2026-09-02'),
    });

    expect(manifest).toContain(`Wersja generatora: ${GENERATOR_VERSION}`);
    expect(manifest).toContain('Comarch Optima');
    expect(manifest).toContain('uniwersalny CSV');
    expect(manifest).toContain('Dokumentów: 34');
  });

  it('zgłoszenie nieudanego importu ZAWSZE niesie wersję', () => {
    // Bez wersji za miesiąc nie odtworzymy pliku, który nie wszedł.
    const report = buildImportFailureReport({ format: 'symfonia', periodKey: '2026-08' });
    expect(report.version).toBe(GENERATOR_VERSION);
    expect(report.format).toBe('symfonia');
  });
});

// ═══════════════════════════════════════════════════════════════
// Pytanie i zmiana formatu
// ═══════════════════════════════════════════════════════════════

describe('pytanie o format', () => {
  const question = buildFormatQuestion({
    tenantId: 't1',
    periodKey: '2026-08',
    now: d('2026-09-02'),
  });

  it('podaje wszystkie osiem formatów', () => {
    const options = question.payload?.options as { value: string }[];
    expect(options).toHaveLength(8);
    expect(options.every((option) => isAccountantFormat(option.value))).toBe(true);
  });

  it('mówi, co zrobić, gdy klient nie wie', () => {
    expect(question.body).toContain('uniwersalny CSV');
    expect(question.body).toContain('nie wiesz');
  });

  it('każdy format ma etykietę i rozszerzenie', () => {
    for (const descriptor of Object.values(ACCOUNTANT_FORMATS)) {
      expect(descriptor.label.length).toBeGreaterThan(0);
      expect(['xml', 'csv', 'xlsx']).toContain(descriptor.extension);
    }
  });
});

describe('zmiana formatu i zgłoszenie importu', () => {
  it('zmiana formatu wisi NA KARCIE DOMKNIĘCIA, nie w ustawieniach', () => {
    // Moment, w którym klient myśli o księgowej, to moment wysyłania paczki.
    const proposal = buildMonthClosePackageProposal({
      tenantId: 't1',
      close: {
        periodKey: '2026-08',
        readiness: {
          inboxFullyFetched: true,
          unreviewedDocuments: 0,
          ksefInvoiceCount: 34,
          localInvoiceCount: 34,
        },
        receiptPairs: 0,
        paidWithoutPayment: 0,
        alreadySent: false,
        today: d('2026-09-02'),
      },
      address: { kind: 'known', email: 'anna@biuro.pl' },
      documentCount: 34,
      currentFormat: 'comarch_optima',
    });

    const secondary = proposal?.payload?.secondary as { label: string; intent: string }[];
    expect(secondary[0]?.label).toContain('Comarch Optima');
    expect(secondary[0]?.intent).toBe('correct');
    expect(proposal?.payload?.correction).toBe('change_accountant_format');
  });

  it('zgłoszenie nieudanego importu wisi na karcie DORĘCZENIA', () => {
    // Doręczenie nie znaczy, że plik wszedł do programu księgowej.
    const proposal = buildDeliveryProposal({
      tenantId: 't1',
      periodKey: '2026-08',
      outcome: { delivered: true, email: 'anna@biuro.pl' },
      format: 'symfonia',
      now: d('2026-09-02'),
    });

    const secondary = proposal.payload?.secondary as { label: string; intent: string }[];
    expect(secondary[0]).toEqual(importFailureAction());
    expect(proposal.payload?.correction).toBe('format_import_failed');
  });

  it('odbita paczka nie proponuje zgłaszania importu', () => {
    // Nie weszła do skrzynki, więc nie ma czego importować.
    const bounced = buildDeliveryProposal({
      tenantId: 't1',
      periodKey: '2026-08',
      outcome: { delivered: false, email: 'anna@biruo.pl' },
      format: 'symfonia',
      now: d('2026-09-02'),
    });
    expect(bounced.payload?.secondary).toBeUndefined();
  });

  it('obie akcje to POPRAWIENIE FAKTU, nie odrzucenie karty', () => {
    expect(formatChangeAction('wapro').intent).toBe('correct');
    expect(importFailureAction().intent).toBe('correct');
  });
});
