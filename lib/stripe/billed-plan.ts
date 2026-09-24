import { mapPriceIdToPlan } from './event-mapping';

type BilledPlan = 'monthly' | 'annual';
type JsonRecord = Record<string, unknown>;

export interface PaidInvoicePlanInput {
  snapshot: unknown;
  stripeInvoiceId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  amountCents: number;
  currency: string;
}

const RECONCILIATION_ERROR = 'Paid Stripe invoice requires manual reconciliation';

function invalid(): never {
  // Keep errors free of invoice, customer and tenant identifiers.
  throw new Error(RECONCILIATION_ERROR);
}

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function referenceId(value: unknown): string | null {
  if (typeof value === 'string') return value || null;
  const id = record(value)?.id;
  return typeof id === 'string' && id ? id : null;
}

function checkedReference(value: unknown, expected: string): string {
  const id = referenceId(value);
  if (!id || id !== expected) invalid();
  return id;
}

function invoiceSubscriptionId(invoice: JsonRecord, expected: string): void {
  const legacy = referenceId(invoice.subscription);
  const parent = invoice.parent == null ? null : record(invoice.parent);
  if (invoice.parent != null && !parent) invalid();

  let current: string | null = null;
  if (parent) {
    if (parent.type !== 'subscription_details') invalid();
    current = referenceId(record(parent.subscription_details)?.subscription);
    if (!current) invalid();
  }

  if ((!legacy && !current) ||
      (legacy && legacy !== expected) ||
      (current && current !== expected) ||
      (legacy && current && legacy !== current)) invalid();
}

function legacyLinePriceId(line: JsonRecord, expectedSubscriptionId: string): string | null {
  const hasLegacyShape = line.type != null || line.subscription != null ||
    line.proration != null || line.price != null;
  if (!hasLegacyShape) return null;

  if (line.type !== 'subscription' || line.proration !== false) invalid();
  checkedReference(line.subscription, expectedSubscriptionId);
  const priceId = referenceId(line.price);
  if (!priceId) invalid();
  return priceId;
}

function basilLinePriceId(line: JsonRecord, expectedSubscriptionId: string): string | null {
  const hasBasilShape = line.parent != null || line.pricing != null;
  if (!hasBasilShape) return null;

  const parent = record(line.parent);
  if (!parent || parent.type !== 'subscription_item_details') invalid();
  const details = record(parent.subscription_item_details);
  if (!details || details.proration !== false) invalid();
  checkedReference(details.subscription, expectedSubscriptionId);

  const pricing = record(line.pricing);
  if (!pricing || pricing.type !== 'price_details') invalid();
  const priceId = referenceId(record(pricing.price_details)?.price);
  if (!priceId) invalid();
  return priceId;
}

/**
 * Derive the billed plan from the paid invoice snapshot, never the mutable
 * subscription mirror. Our VAT self-invoice represents exactly one fully-paid,
 * single-unit, non-prorated subscription line. Other invoice compositions need
 * manual reconciliation before we can describe them accurately.
 */
export function deriveBilledPlanFromPaidInvoice(input: PaidInvoicePlanInput): BilledPlan {
  const invoice = record(input.snapshot);
  if (!invoice ||
      !input.stripeInvoiceId || !input.stripeSubscriptionId || !input.stripeCustomerId ||
      invoice.object !== 'invoice' || invoice.id !== input.stripeInvoiceId ||
      invoice.status !== 'paid' ||
      (invoice.paid !== undefined && invoice.paid !== true) ||
      (invoice.paid_out_of_band !== undefined && invoice.paid_out_of_band !== false) ||
      !Number.isSafeInteger(input.amountCents) || input.amountCents <= 0 ||
      input.currency !== 'pln' || invoice.currency !== 'pln' ||
      invoice.amount_paid !== input.amountCents ||
      invoice.total !== invoice.amount_paid ||
      invoice.amount_remaining !== 0) invalid();

  checkedReference(invoice.customer, input.stripeCustomerId);
  invoiceSubscriptionId(invoice, input.stripeSubscriptionId);

  const lines = record(invoice.lines);
  if (!lines || lines.has_more !== false || !Array.isArray(lines.data) ||
      lines.data.length !== 1 ||
      (lines.total_count !== undefined && lines.total_count !== 1)) invalid();

  const line = record(lines.data[0]);
  if (!line || line.object !== 'line_item' || line.currency !== 'pln' ||
      line.quantity !== 1 ||
      (line.quantity_decimal != null &&
        (typeof line.quantity_decimal !== 'string' ||
         !/^1(?:\.0{1,12})?$/.test(line.quantity_decimal)))) {
    invalid();
  }
  if (line.invoice != null) checkedReference(line.invoice, input.stripeInvoiceId);

  const legacyPriceId = legacyLinePriceId(line, input.stripeSubscriptionId);
  const basilPriceId = basilLinePriceId(line, input.stripeSubscriptionId);
  const priceId = legacyPriceId ?? basilPriceId;
  if (!priceId ||
      (legacyPriceId && basilPriceId && legacyPriceId !== basilPriceId)) invalid();

  try {
    return mapPriceIdToPlan(priceId);
  } catch {
    invalid();
  }
}
