/**
 * E2E smoke test: prawdziwa wysyłka faktury FA(3) do KSeF test env.
 *
 * Wykonuje pełny pipeline `submitInvoiceFullFlow`:
 *   Invoice TS → generateFA3Xml → validateInvoiceXml → uploadInvoiceXml (R2)
 *     → submitInvoice (otwarcie sesji online KSeF, enkrypcja, POST, polling)
 *     → ksefNumber + acquisitionTimestamp
 *
 * Wymaga w .env.local:
 *   KSEF_TEST_TOKEN       - token z ap-test.ksef.mf.gov.pl
 *   KSEF_TEST_NIP         - NIP kontekstu tokena (sprzedawca w fakturze)
 *   R2_* (pełen set)      - Cloudflare R2 archive
 *
 * Uruchom:  pnpm ksef:submit-full
 */

import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

import { config } from 'dotenv';

import { submitInvoiceFullFlow } from '../lib/ksef/submit-invoice-full';
import { deleteInvoiceXml } from '../lib/storage/r2';
import type { Invoice } from '../types/invoice';

config({ path: '.env.local' });

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

const ok = (m: string) => console.log(`${GREEN}✔${RESET} ${m}`);
const step = (m: string) => console.log(`${YELLOW}→${RESET} ${m}`);
const info = (m: string) => console.log(`${DIM}${m}${RESET}`);

function assertEnv(
  value: string | undefined,
  name: string,
): asserts value is string {
  if (!value) {
    console.error(`${RED}✘${RESET} brakuje ${name} w .env.local`);
    process.exit(1);
  }
}

function buildInvoice(sellerNip: string): Invoice {
  // Numer faktury musi być globalnie unikalny w KSeF per sprzedawca -
  // duplikat w test env też jest odrzucany, więc stempeluj timestampem.
  const stamp = Date.now().toString(36).toUpperCase();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  return {
    internalNumber: `SMOKE/${stamp}`,
    type: 'VAT',
    issueDate: today,
    saleDate: today,

    seller: {
      nip: sellerNip,
      name: 'KSeF SaaS Smoke Test Seller',
      address: {
        countryCode: 'PL',
        addressLine1: 'ul. Testowa 1',
        addressLine2: '00-001 Warszawa',
      },
      email: 'smoke@ksef-saas.test',
    },

    buyer: {
      nip: '2222222222', // fikcyjny, zdaje mod-11
      name: 'Smoke Test Buyer Sp. z o.o.',
      address: {
        countryCode: 'PL',
        addressLine1: 'ul. Nabywcy 5',
        addressLine2: '00-002 Warszawa',
      },
    },

    lines: [
      {
        ordinal: 1,
        name: 'Usługa smoke-testowa',
        unit: 'szt',
        quantity: 1,
        unitPriceNet: 100.0,
        netAmount: 100.0,
        vatRate: '23',
        vatAmount: 23.0,
        grossAmount: 123.0,
      },
    ],

    netTotal: 100.0,
    vatTotal: 23.0,
    grossTotal: 123.0,

    payment: {
      amountDue: 123.0,
      currency: 'PLN',
      dueDate: new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10),
      method: 'transfer',
      bankAccount: 'PL61109010140000071219812874',
      bankName: 'Bank Testowy',
    },

    notes: `Smoke test wygenerowany ${new Date().toISOString()}.`,
  };
}

async function main() {
  const token = process.env.KSEF_TEST_TOKEN;
  const nip = process.env.KSEF_TEST_NIP;

  assertEnv(token, 'KSEF_TEST_TOKEN');
  assertEnv(nip, 'KSEF_TEST_NIP');

  console.log(`${DIM}=== KSeF submitInvoiceFullFlow E2E ===${RESET}\n`);
  info(`env:   test (${process.env.KSEF_TEST_URL})`);
  info(`NIP:   ${nip}`);
  info(`token: ${token.slice(0, 24)}... (${token.length} znaków)\n`);

  const tenantId = randomUUID();
  const invoiceId = randomUUID();
  const invoice = buildInvoice(nip);

  info(`numer faktury: ${invoice.internalNumber}`);
  info(`tenantId:      ${tenantId}`);
  info(`invoiceId:     ${invoiceId}\n`);

  let xmlStoragePath: string | null = null;

  try {
    step('submitInvoiceFullFlow (może potrwać kilkadziesiąt sekund)…');
    const t0 = Date.now();

    const result = await submitInvoiceFullFlow(
      tenantId,
      invoiceId,
      invoice,
      { type: 'token', nip, token },
      'test',
    );

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    xmlStoragePath = result.xmlStoragePath;

    ok(`SUKCES (${elapsed}s)`);
    console.log(`  ${DIM}ksefNumber:${RESET}            ${GREEN}${result.ksefNumber}${RESET}`);
    console.log(`  ${DIM}acquisitionTimestamp:${RESET}  ${result.acquisitionTimestamp}`);
    console.log(`  ${DIM}xmlStoragePath:${RESET}        ${result.xmlStoragePath}`);
    console.log(`  ${DIM}xmlSha256Hash:${RESET}         ${result.xmlSha256Hash}`);

    // Zapisz JSON z wynikiem, żeby było co podejrzeć / załączyć do issue.
    const snapshotPath = '/tmp/ksef-submit-full-result.json';
    writeFileSync(
      snapshotPath,
      JSON.stringify({ invoice: invoice.internalNumber, ...result }, null, 2),
    );
    info(`\nsnapshot:  ${snapshotPath}`);
  } catch (err) {
    const e = err as { name?: string; message?: string; body?: unknown };
    console.error(`\n${RED}✘ submitInvoiceFullFlow FAIL${RESET}`);
    console.error(`  name:    ${e.name ?? 'Unknown'}`);
    console.error(`  message: ${e.message ?? String(err)}`);
    if (e.body) {
      console.error(`  body:    ${JSON.stringify(e.body, null, 2).slice(0, 2000)}`);
    }
    process.exitCode = 1;
  } finally {
    if (xmlStoragePath) {
      try {
        await deleteInvoiceXml(xmlStoragePath);
        info(`\ncleanup:   deleteInvoiceXml ${xmlStoragePath}`);
      } catch (e) {
        console.warn(
          `${RED}cleanup FAIL (usuń ręcznie ${xmlStoragePath}):${RESET}`,
          e,
        );
      }
    }
  }
}

main().catch((err) => {
  console.error(`\n${RED}unhandled:${RESET}`, err);
  process.exit(1);
});
