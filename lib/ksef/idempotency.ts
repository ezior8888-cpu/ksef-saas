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

/** Data kalendarzowa `YYYY-MM-DD` przesunięta o `days` dni. */
function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Niedziela Wielkanocna (algorytm Meeusa/Jonesa/Butchera). */
function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Dni wolne od pracy (ustawa z 18.01.1951; Wigilia od 2025). */
function polishHolidays(year: number): Set<string> {
  const easter = easterSunday(year);
  const fixed = ['01-01', '01-06', '05-01', '05-03', '08-15', '11-01', '11-11', '12-25', '12-26'];
  if (year >= 2025) fixed.push('12-24');
  return new Set([
    ...fixed.map((md) => `${year}-${md}`),
    easter,
    addDays(easter, 1), // Poniedziałek Wielkanocny
    addDays(easter, 49), // Zielone Świątki
    addDays(easter, 60), // Boże Ciało
  ]);
}

/** Dzień roboczy: nie sobota, nie niedziela, nie dzień wolny od pracy. */
export function isPolishBusinessDay(isoDate: string): boolean {
  const weekday = new Date(`${isoDate}T12:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !polishHolidays(Number(isoDate.slice(0, 4))).has(isoDate);
}

/** Koniec dnia (23:59:59.999) w czasie Europe/Warsaw jako chwila UTC. */
function endOfWarsawDay(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d, 23, 59, 59, 999);
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Warsaw', timeZoneName: 'shortOffset' })
    .formatToParts(new Date(guess - 2 * 60 * 60 * 1000))
    .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+1';
  const hours = Number(/GMT([+-]\d+)/.exec(offset)?.[1] ?? '1');
  return new Date(guess - hours * 60 * 60 * 1000);
}

/**
 * Termin doesłania faktury z trybu offline do KSeF (AUD-15, decyzja P1
 * z 02.10.2026): następny dzień roboczy po dniu wystawienia (P_1), a przy
 * awarii MF — 7 dni roboczych, do końca dnia w czasie polskim.
 *
 * Liczymy od daty wystawienia, nie od chwili parkowania: faktura zaparkowana
 * dzień później miałaby termin o dzień za późno. Przy awarii MF ustawa liczy
 * 7 dni od końca awarii, którego tu nie znamy — termin od daty wystawienia
 * jest wcześniejszy, więc alarm nigdy nie przyjdzie za późno.
 * [DO WERYFIKACJI z prawnikiem: definicja dnia roboczego w trybie offline]
 */
export function calculateOfflineDeadline(issueDate: string, isMfOutage: boolean): Date {
  if (!/^\d{4}-\d{2}-\d{2}/.test(issueDate)) {
    throw new Error(`Offline24: nieprawidłowa data wystawienia "${issueDate}"`);
  }
  let day = issueDate.slice(0, 10);
  let added = 0;
  const businessDays = isMfOutage ? 7 : 1;
  while (added < businessDays) {
    day = addDays(day, 1);
    if (isPolishBusinessDay(day)) added += 1;
  }
  return endOfWarsawDay(day);
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
