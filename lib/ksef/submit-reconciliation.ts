/** A 440 status means another invoice with the same legal identity is in KSeF.
 * It does not prove that its XML matches our locally archived document.
 */
export const KSEF_DUPLICATE_RECONCILIATION_CODE = 'KSEF_DUPLICATE_440';

const LEGACY_DUPLICATE_MESSAGE = 'KSeF ma już fakturę o tym numerze';

export function isKsefDuplicateFailure(message: string): boolean {
  return message.includes(KSEF_DUPLICATE_RECONCILIATION_CODE) ||
    message.includes(LEGACY_DUPLICATE_MESSAGE);
}

export function hasKsefDuplicateMarker(row: {
  last_error_code?: unknown;
  last_error?: unknown;
}): boolean {
  return row.last_error_code === KSEF_DUPLICATE_RECONCILIATION_CODE ||
    (typeof row.last_error === 'string' && isKsefDuplicateFailure(row.last_error));
}

export function requiresKsefReconciliation(row: {
  submitted_to_ksef_at?: unknown;
  last_error_code?: unknown;
  last_error?: unknown;
}): boolean {
  return Boolean(row.submitted_to_ksef_at) || hasKsefDuplicateMarker(row);
}
