/**
 * Kody błędów przekazywane w query `?error=` po redirectzie z billing actions.
 * Osobny moduł (bez `'use server'`), bo Next wymaga by z pliku actions
 * eksportowane były wyłącznie async Server Actions.
 */

export type BillingActionError =
  | 'not-configured'
  | 'forbidden'
  | 'unexpected'
  | 'tenant-not-found';

export function isBillingActionError(value: string): value is BillingActionError {
  return (
    value === 'not-configured' ||
    value === 'forbidden' ||
    value === 'unexpected' ||
    value === 'tenant-not-found'
  );
}
