/**
 * X-04 — spokój przy awarii Ministerstwa (krok 29 planu).
 *
 * Gdy KSeF nie odpowiada, klient ma usłyszeć, że to nie jego wina i że
 * faktury są bezpieczne. Ale TYLKO WTEDY, GDY TO PRAWDA.
 *
 * ZASADA: komunikat o awarii Ministerstwa wymaga DWÓCH NIEZALEŻNYCH ŹRÓDEŁ.
 * Zrzucenie winy na cudzą infrastrukturę, gdy leży nasz worker, jest
 * spokojem opartym na kłamstwie — a prawda wyjdzie, bo koledzy klienta
 * fakturują normalnie. Wtedy traci zaufanie do wszystkiego, co agent mówi,
 * łącznie z rzeczami, w których miał rację.
 *
 * Przy jednym źródle albo przy niepewności obowiązuje formuła neutralna:
 * „wysyłka nie przechodzi, sprawdzam dlaczego". Klient dostaje informację,
 * której nie musimy potem odwoływać.
 */

import { fingerprintOf } from '@/lib/flo/fingerprint';
import type { CreateProposalInput } from '@/lib/flo/proposals';

/** Tyle kolejnych niepowodzeń przełącza w tryb offline. */
export const FAILURES_BEFORE_OFFLINE = 3;

/** Ile godzin przed terminem Offline24 agent alarmuje. */
export const DEADLINE_ALARM_HOURS = 6;

export interface OutageSignals {
  /** Monitor zdrowia KSeF (cron co 30 s) — pierwsze źródło. */
  monitorSaysDown: boolean;
  /**
   * Kod odpowiedzi z OSTATNIEJ realnej próby wysyłki — drugie źródło.
   * `null` = nie próbowaliśmy od czasu awarii monitora.
   */
  lastSubmitStatus: number | null;
  /** Ile kolejnych prób wysyłki się nie powiodło. */
  consecutiveFailures: number;
  /** Czy nasz worker w ogóle działa. */
  ourWorkerHealthy: boolean;
}

export type OutageVerdict =
  /** Potwierdzone dwoma źródłami — wolno powiedzieć, że to MF. */
  | { kind: 'ministry_outage' }
  /** Coś nie działa, ale nie wiemy co — formuła neutralna. */
  | { kind: 'unknown_problem' }
  /** Problem po naszej stronie — o Ministerstwie ani słowa. */
  | { kind: 'our_problem' }
  | { kind: 'ok' };

/**
 * Który komunikat wolno wypowiedzieć — funkcja czysta.
 *
 * Kolejność sprawdzeń jest tu regułą, nie stylem: najpierw wykluczamy własną
 * awarię, dopiero potem wolno mówić o cudzej.
 */
export function evaluateOutage(signals: OutageSignals): OutageVerdict {
  // NAJWAŻNIEJSZY WARUNEK W CAŁYM PLIKU. Padnięty worker wygląda z zewnątrz
  // identycznie jak awaria Ministerstwa: wysyłki nie przechodzą, monitor
  // milczy. Różnica jest taka, że w jednym przypadku winni jesteśmy my.
  if (!signals.ourWorkerHealthy) {
    return { kind: 'our_problem' };
  }

  const monitorConfirms = signals.monitorSaysDown;
  const submitConfirms =
    signals.lastSubmitStatus !== null && signals.lastSubmitStatus >= 500;

  if (monitorConfirms && submitConfirms) {
    return { kind: 'ministry_outage' };
  }

  if (monitorConfirms || submitConfirms || signals.consecutiveFailures > 0) {
    // Jedno źródło to za mało. Mówimy, co widzimy, bez wskazywania winnego.
    return { kind: 'unknown_problem' };
  }

  return { kind: 'ok' };
}

/**
 * Czy przełączyć się w tryb Offline24.
 *
 * Trzy kolejne niepowodzenia i potwierdzenie z dwóch ścieżek. Fałszywe
 * przełączenie kosztuje klienta rygor terminów i kody QR przy fakturach,
 * których nikt nie potrzebował.
 */
export function shouldSwitchOffline(signals: OutageSignals): boolean {
  if (!signals.ourWorkerHealthy) return false;
  if (signals.consecutiveFailures < FAILURES_BEFORE_OFFLINE) return false;
  return evaluateOutage(signals).kind === 'ministry_outage';
}

/** Powrót do trybu zwykłego po PIERWSZYM sukcesie — bez czekania na serię. */
export function shouldReturnOnline(lastSubmitSucceeded: boolean): boolean {
  return lastSubmitSucceeded;
}

// ═══════════════════════════════════════════════════════════════
// Termin Offline24
// ═══════════════════════════════════════════════════════════════

export type DeadlineAlert =
  | { kind: 'none' }
  | { kind: 'approaching'; hoursLeft: number }
  | { kind: 'weekend_early'; hoursLeft: number };

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Kiedy ostrzec o zbliżającym się terminie.
 *
 * Termin wypadający w sobotę wymaga ostrzeżenia w PIĄTEK PO POŁUDNIU, a nie
 * sześć godzin wcześniej: klient nie zagląda do aplikacji w weekend, a po
 * terminie zostaje mu przekroczony obowiązek ustawowy z powodu narzędzia,
 * które miało go przed tym chronić.
 */
export function evaluateDeadline(deadline: Date, now: Date): DeadlineAlert {
  const hoursLeft = (deadline.getTime() - now.getTime()) / 3_600_000;
  if (hoursLeft <= 0) return { kind: 'none' };

  if (isWeekend(deadline) && hoursLeft <= 72 && !isWeekend(now)) {
    return { kind: 'weekend_early', hoursLeft: Math.round(hoursLeft) };
  }

  if (hoursLeft <= DEADLINE_ALARM_HOURS) {
    return { kind: 'approaching', hoursLeft: Math.round(hoursLeft) };
  }

  return { kind: 'none' };
}

// ═══════════════════════════════════════════════════════════════
// Karta
// ═══════════════════════════════════════════════════════════════

export function buildOutageProposal(input: {
  tenantId: string;
  verdict: OutageVerdict;
  queuedCount: number;
  now?: Date;
}): CreateProposalInput | null {
  const now = input.now ?? new Date();
  const { verdict } = input;

  if (verdict.kind === 'ok') return null;

  // O własnej awarii nie zawiadamiamy klienta kartą — to sprawa dla
  // operatora. Klient dowie się z komunikatu o utkniętej wysyłce (X-01),
  // który mówi prawdę bez wskazywania winnego.
  if (verdict.kind === 'our_problem') return null;

  const base = {
    tenantId: input.tenantId,
    kind: 'ksef.outage' as const,
    topicKey: 'ksef.outage',
    fingerprint: fingerprintOf({
      kind: verdict.kind,
      queued: input.queuedCount,
    }),
    expiresAt: new Date(now.getTime() + 3 * 86_400_000),
    payload: {
      state: verdict.kind,
      queuedCount: input.queuedCount,
      primaryIntent: 'open',
      primaryLabel: 'Pokaż kolejkę',
    },
    evidence: [{ label: 'Faktury oczekujące', href: '/invoices?status=queued' }],
  };

  if (verdict.kind === 'ministry_outage') {
    return {
      ...base,
      title: 'KSeF nie odpowiada — to nie Twoja wina',
      body: `Ministerstwo ma awarię. ${input.queuedCount > 0 ? `Twoje faktury (${input.queuedCount}) czekają w kolejce i wyślę je automatycznie, gdy system wróci.` : 'Wyślę wszystko automatycznie, gdy system wróci.'}`,
      priority: 30,
    };
  }

  return {
    ...base,
    title: 'Wysyłka do KSeF nie przechodzi',
    // Formuła neutralna: mówimy, co widzimy, bez wskazywania winnego.
    body: 'Sprawdzam, dlaczego. Faktury czekają w kolejce i nic nie przepadło — dam znać, gdy będę wiedział więcej.',
    priority: 25,
  };
}

export function buildDeadlineProposal(input: {
  tenantId: string;
  alert: DeadlineAlert;
  invoiceCount: number;
  now?: Date;
}): CreateProposalInput | null {
  const now = input.now ?? new Date();
  if (input.alert.kind === 'none') return null;

  const weekend = input.alert.kind === 'weekend_early';

  return {
    tenantId: input.tenantId,
    kind: 'ksef.outage',
    topicKey: 'ksef.outage:deadline',
    title: weekend
      ? 'Termin wysyłki wypada w weekend'
      : `Termin wysyłki za ${input.alert.hoursLeft} h`,
    body: weekend
      ? `${input.invoiceCount} faktur czeka w trybie offline, a termin wypada w weekend. Lepiej dokończyć to dziś niż w sobotę.`
      : `${input.invoiceCount} faktur czeka w trybie offline. Po terminie zostaje tylko droga papierowa.`,
    fingerprint: fingerprintOf({
      kind: input.alert.kind,
      hours: input.alert.hoursLeft,
    }),
    expiresAt: new Date(now.getTime() + 3 * 86_400_000),
    priority: 5,
    payload: {
      hoursLeft: input.alert.hoursLeft,
      // To jeden z czterech przypadków alarmowych: wolno wyjść poza budżet
      // zaczepień i poza ciszę nocną.
      alarm: true,
      primaryIntent: 'open',
      primaryLabel: 'Pokaż faktury',
    },
    evidence: [{ label: 'Kolejka offline', href: '/invoices?status=offline' }],
  };
}
