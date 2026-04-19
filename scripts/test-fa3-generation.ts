/**
 * E2E test: Invoice domain → FA(3) XML → XSD validation → R2 upload.
 *
 * Pełny pipeline produkcyjny wysyłki faktury (minus sam KSeF API):
 *   1. Invoice (TS) → generateFA3Xml()  [+ walidacja biznesowa NIP/IBAN/arytmetyka]
 *   2. Wygenerowany XML → validateInvoiceXml() [XSD via xmllint-wasm, offline]
 *   3. Upload do R2 → uploadInvoiceXml()  [+ SHA-256 audit trail]
 *
 * NIP-y testowe (1111111111 / 2222222222) są oczywiście fikcyjne ale
 * zdają checksum mod-11, więc walidacja biznesowa ich nie odrzuci.
 *
 * Uruchom:  pnpm fa3:test
 */

import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

import { config } from 'dotenv';

import { generateFA3Xml } from '../lib/xml/fa3-generator';
import { validateInvoiceXml } from '../lib/xml/validator';
import { deleteInvoiceXml, uploadInvoiceXml } from '../lib/storage/r2';
import type { Invoice } from '../types/invoice';

config({ path: '.env.local' });

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const ok = (m: string) => console.log(`${GREEN}✔${RESET} ${m}`);
const info = (m: string) => console.log(`${DIM}${m}${RESET}`);
const fail = (m: string): never => {
  console.error(`${RED}✘${RESET} ${m}`);
  process.exit(1);
};

async function main() {
  console.log(`${DIM}=== KSeF FA(3) E2E test ===${RESET}\n`);

  // ─── Dane faktury ─────────────────────────────────────────────
  const invoice: Invoice = {
    internalNumber: 'FV/2026/04/001',
    type: 'VAT',
    issueDate: '2026-04-19',
    saleDate: '2026-04-19',

    seller: {
      nip: '1111111111', // fikcyjny ale zdaje mod-11
      name: 'Moja Firma Test Sp. z o.o.',
      address: {
        countryCode: 'PL',
        addressLine1: 'ul. Testowa 1',
        addressLine2: '61-001 Poznań',
      },
      email: 'biuro@firma-test.pl',
    },

    buyer: {
      nip: '2222222222', // fikcyjny ale zdaje mod-11
      name: 'Kontrahent Test S.A.',
      address: {
        countryCode: 'PL',
        addressLine1: 'ul. Nabywcy 5',
        addressLine2: '00-001 Warszawa',
      },
    },

    lines: [
      {
        ordinal: 1,
        name: 'Usługa doradztwa informatycznego',
        unit: 'godz',
        quantity: 10,
        unitPriceNet: 250.0,
        netAmount: 2500.0,
        vatRate: '23',
        vatAmount: 575.0,
        grossAmount: 3075.0,
      },
    ],

    netTotal: 2500.0,
    vatTotal: 575.0,
    grossTotal: 3075.0,

    payment: {
      amountDue: 3075.0,
      currency: 'PLN',
      dueDate: '2026-05-03',
      method: 'transfer',
      // Publiczny testowy IBAN PL przechodzący mod-97 (PKO BP test account)
      bankAccount: 'PL61109010140000071219812874',
      bankName: 'Bank Testowy S.A.',
    },

    notes: 'Termin płatności: 14 dni od daty wystawienia.',
  };

  // ─── 1. Generowanie XML ───────────────────────────────────────
  let xml: string;
  try {
    xml = generateFA3Xml(invoice, { prettyPrint: true });
  } catch (err) {
    fail(`generateFA3Xml: ${err instanceof Error ? err.message : String(err)}`);
  }
  const xmlPath = '/tmp/test-invoice.xml';
  writeFileSync(xmlPath, xml, 'utf8');
  ok(`generateFA3Xml: ${xml.length} B → ${xmlPath}`);

  // ─── 2. Walidacja XSD (xmllint-wasm, offline) ────────────────
  const validation = await validateInvoiceXml(xml);
  if (!validation.valid) {
    console.error(`${RED}✘ XSD validation FAIL — ${validation.errors.length} błędów:${RESET}`);
    for (const err of validation.errors.slice(0, 10)) {
      console.error(`    ${DIM}linia ${err.line}:${RESET} ${err.message.trim()}`);
    }
    if (validation.errors.length > 10) {
      console.error(`    ${DIM}... i ${validation.errors.length - 10} więcej${RESET}`);
    }
    info(`\nPełny XML do debugowania: ${xmlPath}`);
    process.exit(1);
  }
  ok('validateInvoiceXml: zgodne z schemat.xsd FA(3)');

  // ─── 3. Upload do R2 + cleanup ───────────────────────────────
  const tenantId = randomUUID();
  const invoiceId = randomUUID();
  let uploadedPath: string | null = null;

  try {
    const r = await uploadInvoiceXml(tenantId, invoiceId, invoice.issueDate, xml);
    uploadedPath = r.storagePath;
    ok(
      `uploadInvoiceXml: ${r.storagePath} ` +
        `(${r.sizeBytes} B, sha256=${r.sha256Hash.slice(0, 12)}…)`,
    );
  } catch (err) {
    const e = err as { name?: string; message?: string };
    if (e.name === 'Error' && e.message?.includes('R2 credentials missing')) {
      info(
        '⚠ pominięto upload do R2 — brak konfiguracji (to OK, reszta pipelinu zielona)',
      );
    } else {
      fail(`uploadInvoiceXml: ${e.name ?? 'Unknown'} ${e.message ?? err}`);
    }
  } finally {
    if (uploadedPath) {
      try {
        await deleteInvoiceXml(uploadedPath);
        ok(`cleanup: deleteInvoiceXml ${uploadedPath}`);
      } catch (err) {
        console.warn(`${RED}cleanup FAIL (usuń ręcznie ${uploadedPath}):${RESET}`, err);
      }
    }
  }

  console.log(`\n${GREEN}FA(3) E2E test PASS${RESET}`);
}

main().catch((err) => {
  console.error(`\n${RED}FA(3) E2E test FAIL${RESET}`);
  console.error(err);
  process.exit(1);
});
