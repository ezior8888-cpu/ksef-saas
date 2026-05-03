/**
 * Deterministyczne klucze idempotencji — zapobiegają duplikacji przy retry.
 */

import { createHash } from 'node:crypto';

/**
 * Generuje deterministyczny idempotency key na podstawie:
 * - tenantId
 * - invoiceId
 * - createdTimestamp (sekundowa precyzja UTC)
 *
 * Ten sam input = ten sam output. Retry tej samej operacji nie zduplikuje faktury.
 */
export function generateIdempotencyKey(
  tenantId: string,
  invoiceId: string,
  createdAt: Date,
): string {
  const timestampSec = Math.floor(createdAt.getTime() / 1000);
  const input = `${tenantId}:${invoiceId}:${timestampSec}`;
  return createHash('sha256').update(input).digest('hex').slice(0, 32);
}

/**
 * Oblicza deadline dla Trybu Offline24.
 * Standardowo: kolejny dzień roboczy, 23:59:59.999 czasu lokalnego.
 * Przy awarii MF: 7 dni roboczych.
 */
export function calculateOfflineDeadline(
  createdAt: Date,
  isMfOutage: boolean,
): Date {
  const result = new Date(createdAt.getTime());
  const daysToAdd = isMfOutage ? 7 : 1;

  let added = 0;
  while (added < daysToAdd) {
    result.setDate(result.getDate() + 1);
    if (result.getDay() !== 0 && result.getDay() !== 6) {
      added++;
    }
  }

  result.setHours(23, 59, 59, 999);
  return result;
}

/**
 * Exponential backoff dla retry.
 * 1: 30s, 2: 1m, 3: 2m, 4: 4m, …, max: 30m
 */
export function calculateNextRetry(attemptNumber: number): Date {
  const baseDelaySec = 30;
  const maxDelaySec = 1800;
  const delaySec = Math.min(
    baseDelaySec * Math.pow(2, Math.max(0, attemptNumber - 1)),
    maxDelaySec,
  );

  const next = new Date();
  next.setSeconds(next.getSeconds() + delaySec);
  return next;
}
