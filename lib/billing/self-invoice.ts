/**
 * Self-invoicing: budowanie + zapis faktury VAT za subskrypcję klienta
 * (Faza 25 Krok 4).
 *
 * Meta-rekursja: nasza apka wystawia fakturę VAT własnym pipeline'em KSeF.
 * Operator (FaktFlow Sp. z o.o.) jest sprzedawcą, klient płacący Stripe'a
 * jest nabywcą.
 *
 * Założenia rozliczeniowe:
 *   - Stripe `amount_paid` = kwota brutto w groszach (PLN). Bez Stripe Tax
 *     przyjmujemy że Stripe Price zawiera już VAT (gross).
 *   - VAT 23% (standard PL). `net = round(gross / 1.23, 2)`, `vat = gross - net`.
 *   - Currency hard-coded PLN (Stripe Price w EUR/USD = TODO Faza 41+).
 *   - Issue date = paid_at, sale date = ten sam dzień.
 *   - Termin płatności = paid_at (faktura wystawiana PO już dokonanej zapłacie,
 *     bo Stripe robi capture przed naszą reakcją).
 *
 * Numerowanie: format `FF/YYYY/MM/<seq>` gdzie `seq` = ostatnie 8 znaków
 * Stripe Invoice ID (UPPER). Daje unique per (year, month) + przyjazne czytaniu.
 */

import type { Invoice, InvoiceLineItem } from '@/types/invoice';
import { createAdminClient } from '@/lib/supabase/admin';

import { getOperatorTenant, type OperatorTenantInfo } from './operator-config';

export interface BuildSelfInvoiceInput {
  /** Brutto w groszach (PLN). */
  grossCents: number;
  /** ISO datetime płatności (z `stripe_payments.paid_at`). */
  paidAt: string;
  /** Stripe Invoice ID `in_*` — używany do `internalNumber`. */
  stripeInvoiceId: string;
  /** Plan subskrypcji — wpływa na nazwę pozycji. */
  plan: 'monthly' | 'annual';
}

export interface BuildSelfInvoiceOutput {
  invoice: Invoice;
  operator: OperatorTenantInfo;
  customerTenantId: string;
}

const VAT_RATE_PCT = 23;

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function centsToPln(cents: number): number {
  return roundMoney(cents / 100);
}

function buildInternalNumber(stripeInvoiceId: string, paidAt: Date): string {
  const yyyy = paidAt.getUTCFullYear();
  const mm = String(paidAt.getUTCMonth() + 1).padStart(2, '0');
  // Strip `in_` prefix i bierzemy końcówkę dla krótkiego, deterministic ID.
  const seq = stripeInvoiceId.replace(/^in_/, '').slice(-8).toUpperCase();
  return `FF/${yyyy}/${mm}/${seq}`;
}

function planLineName(plan: 'monthly' | 'annual', issueDate: string): string {
  const dateLabel = new Date(issueDate).toLocaleDateString('pl-PL', {
    year: 'numeric',
    month: 'long',
  });
  return plan === 'annual'
    ? `FaktFlow — subskrypcja roczna (${dateLabel})`
    : `FaktFlow — subskrypcja miesięczna (${dateLabel})`;
}

/**
 * Buduje obiekt `Invoice` (zgodny z FA(3) generatorem) z danych payment'u.
 * Pure function — żaden DB hit poza `getOperatorTenant`. Łatwo testowalna.
 */
export async function buildSelfInvoiceDraft(
  customerTenantId: string,
  input: BuildSelfInvoiceInput,
): Promise<BuildSelfInvoiceOutput | null> {
  const operator = await getOperatorTenant();
  if (!operator) return null;

  const supabase = createAdminClient();
  const { data: customer, error } = await supabase
    .from('tenants')
    .select('nip, name, address_json')
    .eq('id', customerTenantId)
    .maybeSingle();

  if (error || !customer) return null;

  const customerAddr =
    typeof customer.address_json === 'object' && customer.address_json !== null
      ? (customer.address_json as {
          countryCode?: string;
          addressLine1?: string;
          addressLine2?: string;
        })
      : null;

  // Money math: Stripe daje brutto. VAT 23% mieści się w cenie:
  //   gross = 100, net = gross / 1.23, vat = gross - net.
  const gross = centsToPln(input.grossCents);
  const net = roundMoney(gross / (1 + VAT_RATE_PCT / 100));
  const vat = roundMoney(gross - net);

  const issueDate = input.paidAt.slice(0, 10); // YYYY-MM-DD
  const internalNumber = buildInternalNumber(
    input.stripeInvoiceId,
    new Date(input.paidAt),
  );

  const line: InvoiceLineItem = {
    ordinal: 1,
    name: planLineName(input.plan, issueDate),
    unit: 'usł.',
    quantity: 1,
    unitPriceNet: net,
    netAmount: net,
    vatRate: '23',
    vatAmount: vat,
    grossAmount: gross,
  };

  const invoice: Invoice = {
    internalNumber,
    type: 'VAT',
    issueDate,
    saleDate: issueDate,
    seller: {
      nip: operator.nip,
      name: operator.name,
      address: {
        countryCode: operator.address.countryCode,
        addressLine1: operator.address.addressLine1,
        addressLine2: operator.address.addressLine2,
      },
    },
    buyer: {
      nip: customer.nip,
      name: customer.name,
      address: customerAddr
        ? {
            countryCode: customerAddr.countryCode ?? 'PL',
            addressLine1: customerAddr.addressLine1 ?? '',
            addressLine2: customerAddr.addressLine2 ?? '',
          }
        : {
            countryCode: 'PL',
            addressLine1: '',
            addressLine2: '',
          },
    },
    lines: [line],
    netTotal: net,
    vatTotal: vat,
    grossTotal: gross,
    payment: {
      amountDue: gross,
      currency: 'PLN',
      dueDate: issueDate, // Już opłacone (Stripe), termin = data wystawienia.
      method: 'card',
      bankAccount: operator.bankAccount ?? undefined,
    },
    notes: `Faktura za subskrypcję FaktFlow. Płatność Stripe: ${input.stripeInvoiceId}.`,
  };

  return { invoice, operator, customerTenantId };
}

// ─── Persistence ──────────────────────────────────────────────────

export interface InsertResult {
  invoiceId: string;
  internalNumber: string;
  created: boolean;
}

/**
 * Tworzy fakturę, jej pozycję i powiązanie z płatnością w jednej transakcji
 * SQL. RPC blokuje wiersz płatności także dla równoległego zwrotu.
 */
export async function insertSelfInvoice(
  invoice: Invoice,
  operatorTenantId: string,
  stripeInvoiceId: string,
  paymentId: string,
  customerTenantId: string,
): Promise<InsertResult> {
  if (!stripeInvoiceId.startsWith('in_') || invoice.lines.length !== 1) {
    throw new Error('Self-invoice identity requires reconciliation');
  }

  const supabase = createAdminClient() as unknown as {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{
      data: Array<{
        invoice_id: string;
        internal_number: string;
        created: boolean;
      }> | null;
      error: { message: string } | null;
    }>;
  };
  const { data, error } = await supabase.rpc('create_billing_vat_invoice', {
    p_payment_id: paymentId,
    p_customer_tenant_id: customerTenantId,
    p_operator_tenant_id: operatorTenantId,
    p_stripe_invoice_id: stripeInvoiceId,
    p_invoice: invoice,
  });

  if (error) {
    throw new Error('Self-invoice transaction failed: ' + error.message);
  }
  if (!Array.isArray(data) || data.length !== 1 ||
      typeof data[0].invoice_id !== 'string' ||
      data[0].internal_number !== invoice.internalNumber ||
      typeof data[0].created !== 'boolean') {
    throw new Error('Self-invoice transaction returned an invalid result');
  }

  return {
    invoiceId: data[0].invoice_id,
    internalNumber: data[0].internal_number,
    created: data[0].created,
  };
}