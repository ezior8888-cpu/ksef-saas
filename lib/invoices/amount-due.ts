/**
 * Kwota do zapłaty i kwota zaległa — liczone z `payment_data`, nie z samego
 * `gross_total` (C-16).
 *
 * Faktura rozliczeniowa (ROZ, `invoice_kind = 'final'`) ma w `gross_total`
 * PEŁNE zamówienie (#82) — nabywca płaci tylko resztę po zaliczkach, zapisaną
 * przy wystawieniu w `payment_data.amountDue` (art. 106f ust. 3; patrz
 * `components/invoices/final-actions.ts`, `lib/pdf/invoice-renderer.ts`,
 * które już liczą „Do zapłaty” tą samą drogą). Każdy inny rodzaj faktury
 * płaci całe brutto — do zapłaty = `gross_total`.
 *
 * FAIL-SAFE: gdy `amountDue` jest nieliczbowe, ujemne albo pochodzi
 * z zepsutego/legacy wiersza, liczymy od pełnego brutto. Bezpieczniej zbyt
 * długo gonić już opłaconą fakturę niż przestać gonić zaległą.
 *
 * Ta sama reguła po stronie bazy: wyzwalacz `update_invoice_payment_status`
 * i widok `invoices_overdue` w migracji `supabase/migrations/00130_roz_amount_due.sql`.
 */

import { roundToCents } from '@/lib/xml/invoice-calculator';

/**
 * Pola przyjmujemy jako `unknown` celowo: wołający to wiersz z Supabase
 * (typy wygenerowane), fakty FLO (`FloFacts`/stan czytany z bazy przez
 * ręcznie typowany klient) albo wiersz testowy — każdy ma inny, węższy typ
 * tych samych kolumn. Walidacja jest tu, nie u wołającego.
 */
export interface AmountDueRow {
  invoice_kind?: unknown;
  gross_total: unknown;
  payment_data?: unknown;
}

export interface OutstandingRow extends AmountDueRow {
  paid_amount: unknown;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function amountDueFromPaymentData(paymentData: unknown): number | null {
  if (typeof paymentData !== 'object' || paymentData === null || Array.isArray(paymentData)) {
    return null;
  }
  return toFiniteNumber((paymentData as Record<string, unknown>).amountDue);
}

/**
 * Do zapłaty na TEJ fakturze.
 *
 * ROZ: `min(payment_data.amountDue, gross_total)`, gdy `amountDue` jest
 * liczbą ≥ 0 — inaczej (i dla każdego innego rodzaju faktury) całe
 * `gross_total`. `min()` pilnuje, żeby zepsuty wiersz z `amountDue` większym
 * od zamówienia nigdy nie zażądał więcej niż cała faktura.
 */
export function amountDueOf(row: AmountDueRow): number {
  const gross = toFiniteNumber(row.gross_total) ?? 0;
  if (row.invoice_kind !== 'final') return gross;

  const amountDue = amountDueFromPaymentData(row.payment_data);
  if (amountDue === null || amountDue < 0) return gross;

  return Math.min(amountDue, gross);
}

/** Zaległość na TEJ fakturze: do zapłaty minus już wpłacone, nigdy poniżej zera. */
export function outstandingOf(row: OutstandingRow): number {
  const due = amountDueOf(row);
  const paid = toFiniteNumber(row.paid_amount) ?? 0;
  return Math.max(0, roundToCents(due - paid));
}
