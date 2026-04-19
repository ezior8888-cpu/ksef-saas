/**
 * Seed testowej faktury do `public.invoices`.
 *
 * Co robi:
 *   1. Czyta tenant_id z `/tmp/ksef-test-tenant-id.txt` (produkowane przez seed-tenant.ts)
 *   2. Buduje obiekt Invoice (ten sam kształt co test-submit-full.ts)
 *   3. INSERT do `public.invoices` z:
 *       - fa3_data = pełny Invoice jako JSONB (source-of-truth dla Inngest job)
 *       - direction='outgoing', ksef_status='draft', kolumny denormalizowane
 *   4. Drukuje invoice_id i zapisuje do `/tmp/ksef-test-invoice-id.txt`
 *
 * Uruchom:  pnpm seed:invoice
 */

import { readFileSync, writeFileSync } from 'node:fs';

import { config } from 'dotenv';

import type { Invoice } from '../types/invoice';

import { createScriptAdminClient } from './_supabase';

config({ path: '.env.local' });

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

const ok = (m: string) => console.log(`${GREEN}✔${RESET} ${m}`);
const step = (m: string) => console.log(`${YELLOW}→${RESET} ${m}`);
const fail = (m: string) => console.error(`${RED}✘${RESET} ${m}`);
const info = (m: string) => console.log(`${DIM}${m}${RESET}`);

const TENANT_ID_FILE = '/tmp/ksef-test-tenant-id.txt';
const INVOICE_ID_FILE = '/tmp/ksef-test-invoice-id.txt';

function buildInvoice(sellerNip: string): Invoice {
  // Numer globalnie unikalny (KSeF odrzuca duplikaty)
  const stamp = Date.now().toString(36).toUpperCase();
  const today = new Date().toISOString().slice(0, 10);

  return {
    internalNumber: `SEED/${stamp}`,
    type: 'VAT',
    issueDate: today,
    saleDate: today,
    seller: {
      nip: sellerNip,
      name: 'KSeF SaaS Test Seller',
      address: {
        countryCode: 'PL',
        addressLine1: 'ul. Testowa 1',
        addressLine2: '00-001 Warszawa',
      },
      email: 'seed@ksef-saas.test',
    },
    buyer: {
      nip: '2222222222',
      name: 'Seed Test Buyer Sp. z o.o.',
      address: {
        countryCode: 'PL',
        addressLine1: 'ul. Nabywcy 5',
        addressLine2: '00-002 Warszawa',
      },
    },
    lines: [
      {
        ordinal: 1,
        name: 'Usługa seed-testowa',
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
    notes: `Seed test wygenerowany ${new Date().toISOString()}.`,
  };
}

async function main() {
  console.log(`${DIM}=== Seed test invoice ===${RESET}\n`);

  // ─── Odczyt tenant_id z pliku ────────────────────────────
  let tenantId: string;
  try {
    tenantId = readFileSync(TENANT_ID_FILE, 'utf8').trim();
  } catch {
    fail(`brak ${TENANT_ID_FILE} - uruchom najpierw: pnpm seed:tenant`);
    process.exit(1);
  }

  if (!/^[0-9a-f-]{36}$/i.test(tenantId)) {
    fail(`niepoprawny UUID w ${TENANT_ID_FILE}: ${tenantId}`);
    process.exit(1);
  }

  info(`tenant_id: ${tenantId}`);

  const supabase = createScriptAdminClient();

  // ─── Pobierz NIP sprzedawcy (tenant.nip) ─────────────────
  const { data: tenant, error: tErr } = await supabase
    .from('tenants')
    .select('nip')
    .eq('id', tenantId)
    .single();

  if (tErr || !tenant) {
    fail(`tenant ${tenantId} nie istnieje: ${tErr?.message ?? 'null'}`);
    process.exit(1);
  }

  const invoice = buildInvoice(tenant.nip);
  info(`internalNumber: ${invoice.internalNumber}`);

  // ─── INSERT do invoices ──────────────────────────────────
  step('INSERT do public.invoices…');

  const { data: inserted, error: insErr } = await supabase
    .from('invoices')
    .insert({
      tenant_id: tenantId,
      direction: 'outgoing',
      internal_number: invoice.internalNumber,
      ksef_status: 'draft',
      invoice_type: invoice.type,
      issue_date: invoice.issueDate,
      seller_nip: invoice.seller.nip,
      buyer_nip: invoice.buyer.nip,
      currency: invoice.payment.currency,
      net_total: invoice.netTotal,
      vat_total: invoice.vatTotal,
      gross_total: invoice.grossTotal,
      payment_due_date: invoice.payment.dueDate,
      // fa3_data = source-of-truth dla Inngest job. submit-invoice odczytuje
      // stąd przez getInvoiceForSubmit() i generuje XML.
      fa3_data: invoice,
    })
    .select('id')
    .single();

  if (insErr) {
    fail(`INSERT invoices FAIL: ${insErr.message}`);
    process.exit(1);
  }

  const invoiceId = inserted.id;
  ok(`faktura utworzona: ${invoiceId}`);

  writeFileSync(INVOICE_ID_FILE, invoiceId, 'utf8');
  info(`invoice_id zapisany w ${INVOICE_ID_FILE}`);

  console.log(`\n${GREEN}=== SEED INVOICE OK ===${RESET}`);
  console.log(`${DIM}invoice_id:${RESET}      ${GREEN}${invoiceId}${RESET}`);
  console.log(`${DIM}internalNumber:${RESET}  ${invoice.internalNumber}`);
  console.log(`${DIM}ksef_status:${RESET}     draft`);
  console.log(`${DIM}Teraz uruchom:${RESET}   pnpm trigger:submit`);
}

main().catch((err) => {
  console.error(`\n${RED}unhandled:${RESET}`, err);
  process.exit(1);
});
