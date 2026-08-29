/**
 * T-01 — kalendarz obowiązków z kwotą (krok 36 planu).
 *
 * ⚠️ FUNKCJA ZA FLAGĄ. `tax.deadline` jest wyłączona w `lib/flo/flags.ts`
 * do czasu zatwierdzenia treści przez prawnika (bramka prawna, część VI.2),
 * a dodatkowo bramka M12 (`lib/flo/tax-profile.ts`) trzyma całą grupę
 * zamkniętą, dopóki tabela parametrów nie zostanie sprawdzona i dopóki
 * konto nie ma kompletnego profilu podatkowego.
 *
 * CO TA FUNKCJA MÓWI: „JPK_V7M do 25 sierpnia. Wychodzi mi 2 340 zł VAT-u
 * do zapłaty — na podstawie 34 dokumentów, stan na 18.08.”
 *
 * CZTERY RZECZY, KTÓRE MUSZĄ BYĆ PRAWDZIWE:
 *
 * 1. LICZBA NIGDY BEZ PODSTAWY. Każda kwota chodzi w parze ze zdaniem
 *    mówiącym, z ilu dokumentów powstała, na kiedy jest aktualna i co jeszcze
 *    czeka na decyzję człowieka. Kwota bez podstawy jest wyrocznią, a wyrocznię
 *    albo się bezkrytycznie przyjmuje, albo się jej przestaje wierzyć —
 *    i jedno, i drugie jest złe.
 *
 * 2. KWOTA Z TEGO SAMEGO KODU, CO PLIK. `summarizeJpkV7m` liczy dokładnie te
 *    pozycje, które trafiają do deklaracji. Własny wzór agenta prędzej czy
 *    później rozjechałby się ze złożonym plikiem — a wtedy klient traci
 *    zaufanie do obu liczb naraz.
 *
 * 3. NIEPRZEJRZANE DOKUMENTY = KWOTA NIEPEŁNA. Agent nie udaje, że wie.
 *    Mówi wprost, że liczba urośnie albo zmaleje, i najpierw proponuje
 *    domknięcie kosztów, a nie zapłatę czegoś policzonego z połowy danych.
 *
 * 4. NIGDY NIE PADA SŁOWO „ZAPŁAĆ”. Zawsze „wychodzi mi”. Agent liczy
 *    i pokazuje; decyzję o przelewie do urzędu podejmuje człowiek. Osobny
 *    test pilnuje, żeby tryb rozkazujący nie wszedł do treści przy okazji
 *    jakiejś późniejszej poprawki.
 */

import { fingerprintOf } from '@/lib/flo/fingerprint';
import { formatPln } from '@/lib/flo/money';
import type { CreateProposalInput } from '@/lib/flo/proposals';
import { taxDeadline, type TaxDeadline, type TaxDeadlineKind } from '@/lib/flo/tax-params';
import type { JpkV7mSummary } from '@/lib/exports/jpk-v7m-generator';

const DAY_MS = 86_400_000;

/**
 * Kiedy agent zaczyna mówić o terminie i kiedy zaczyna naciskać.
 *
 * Plan mówi „7 i 3 dni przed terminem”. Realizujemy to jako PRÓG, a nie jako
 * dwa dokładne dni: karta pojawia się przy siedmiu dniach i podnosi priorytet
 * przy trzech. Dosłowne trafianie w dzień siódmy i trzeci znaczyłoby, że
 * jeden nieudany przebieg crona zabiera klientowi jedyne ostrzeżenie — a to
 * jest awaria, o której nikt się nie dowie do momentu, w którym jest za późno.
 */
export const NOTICE_FROM_DAYS = 7;
export const URGENT_FROM_DAYS = 3;

export interface PeriodSnapshot {
  /** Rok okresu rozliczeniowego. */
  year: number;
  /** Ostatni miesiąc okresu rozliczeniowego, 1–12. */
  month: number;
  /** Rozliczenie policzone tym samym kodem, co plik JPK_V7M. */
  summary: JpkV7mSummary;
  /** Ile dokumentów kosztowych czeka na decyzję człowieka. */
  unreviewedExpenses: number;
  /** Dzień, z którego pochodzą liczby (ISO YYYY-MM-DD). */
  asOf: string;
  /** Czy plik jest już wygenerowany i da się go pobrać. */
  fileReady: boolean;
}

export type DeadlineSilentReason =
  /** Do terminu jeszcze daleko. */
  | 'too_early'
  /** Termin minął — przypominanie po fakcie to inna funkcja i inna rozmowa. */
  | 'passed'
  /** Nie znamy parametrów dla tej daty. */
  | 'no_params';

export type DeadlineVerdict =
  | { kind: 'silent'; reason: DeadlineSilentReason }
  | {
      kind: 'notice';
      deadline: TaxDeadline;
      daysLeft: number;
      urgent: boolean;
      /** false = są nieprzejrzane dokumenty, kwota może się jeszcze zmienić */
      complete: boolean;
    };

export interface DeadlineDecisionInput {
  kind: TaxDeadlineKind;
  snapshot: PeriodSnapshot;
  today: Date;
}

export function decideDeadlineNotice(
  input: DeadlineDecisionInput,
): DeadlineVerdict {
  const deadline = taxDeadline({
    kind: input.kind,
    year: input.snapshot.year,
    month: input.snapshot.month,
  });
  if (!deadline) return { kind: 'silent', reason: 'no_params' };

  const due = Date.parse(`${deadline.due}T00:00:00.000Z`);
  const daysLeft = Math.ceil((due - input.today.getTime()) / DAY_MS);

  if (daysLeft < 0) return { kind: 'silent', reason: 'passed' };
  if (daysLeft > NOTICE_FROM_DAYS) return { kind: 'silent', reason: 'too_early' };

  return {
    kind: 'notice',
    deadline,
    daysLeft,
    urgent: daysLeft <= URGENT_FROM_DAYS,
    complete: input.snapshot.unreviewedExpenses === 0,
  };
}

// ═══════════════════════════════════════════════════════════════
// Treść
// ═══════════════════════════════════════════════════════════════

/**
 * Podstawa liczby — zdanie, bez którego kwota nie ma prawa się pokazać.
 *
 * „na podstawie 34 dokumentów, stan na 18.08, 3 koszty czekają na Twoją
 * decyzję”. Klient ma z tego zdania wiedzieć trzy rzeczy: skąd liczba,
 * jak świeża i czy jest pełna.
 */
export function describeBasis(snapshot: PeriodSnapshot): string {
  const documents = snapshot.summary.salesCount + snapshot.summary.purchaseCount;
  const parts = [
    `na podstawie ${documents} ${documentWord(documents)}`,
    `stan na ${formatDayMonth(snapshot.asOf)}`,
  ];

  if (snapshot.unreviewedExpenses > 0) {
    parts.push(
      `${snapshot.unreviewedExpenses} ${describePendingCosts(snapshot.unreviewedExpenses)} na Twoją decyzję`,
    );
  }

  return parts.join(', ');
}

/**
 * Zdanie z kwotą. NIGDY W TRYBIE ROZKAZUJĄCYM.
 *
 * Trzy przypadki, bo rozliczenie VAT-u kończy się na trzy sposoby i tylko
 * jeden z nich to „do zapłaty”. Powiedzenie klientowi z nadwyżką, że coś
 * mu wychodzi do zapłaty, jest po prostu nieprawdą.
 */
export function describeAmount(summary: JpkV7mSummary): string {
  if (summary.balance > 0) {
    return `Wychodzi mi ${formatPln(summary.balance)} VAT-u do zapłaty.`;
  }
  if (summary.balance < 0) {
    return `Wychodzi mi ${formatPln(Math.abs(summary.balance))} nadwyżki do przeniesienia na następny okres.`;
  }
  return 'Wychodzi mi zero — nie ma czego dopłacać.';
}

// ═══════════════════════════════════════════════════════════════
// Propozycja
// ═══════════════════════════════════════════════════════════════

export interface DeadlineProposalInput extends DeadlineDecisionInput {
  tenantId: string;
}

export function buildDeadlineProposal(
  input: DeadlineProposalInput,
): CreateProposalInput | null {
  const verdict = decideDeadlineNotice(input);
  if (verdict.kind !== 'notice') return null;

  const { snapshot } = input;
  const periodKey = `${snapshot.year}-${String(snapshot.month).padStart(2, '0')}`;
  const formName = FORM_NAME[input.kind];

  const amount = describeAmount(snapshot.summary);
  const basis = describeBasis(snapshot);

  // Kwota niepełna dostaje własne zdanie ZARAZ ZA LICZBĄ, a nie na końcu
  // karty. Zastrzeżenie, które trzeba doczytać, nie jest zastrzeżeniem.
  const incomplete = verdict.complete
    ? ''
    : ' Kwota jest niepełna — najpierw domknijmy koszty.';

  return {
    tenantId: input.tenantId,
    kind: 'tax.deadline',
    topicKey: `tax.deadline:${input.kind}:${periodKey}`,
    title: `${formName} do ${formatDayMonth(verdict.deadline.due)}`,
    body: `${amount}${incomplete} — ${basis}.${describeShift(verdict.deadline)}`,
    fingerprint: fingerprintOf({
      period: periodKey,
      balance: snapshot.summary.balance,
      documents: snapshot.summary.salesCount + snapshot.summary.purchaseCount,
      unreviewed: snapshot.unreviewedExpenses,
    }),
    // Po terminie karta traci sens; wygasa z końcem dnia, w którym termin upływa.
    expiresAt: new Date(Date.parse(`${verdict.deadline.due}T23:59:59.000Z`)),
    priority: verdict.urgent ? 10 : 40,
    payload: {
      periodKey,
      deadlineKind: input.kind,
      due: verdict.deadline.due,
      nominalDue: verdict.deadline.nominal,
      complete: verdict.complete,
      // Agent nic tu nie wykonuje. Prowadzi człowieka do pliku albo do
      // kosztów — przelew do urzędu robi człowiek, w swoim banku.
      primaryIntent: 'open',
      primaryLabel: verdict.complete
        ? snapshot.fileReady
          ? 'Pobierz plik'
          : 'Przygotuj plik'
        : 'Przejrzyj koszty',
    },
    evidence: buildEvidence(snapshot, verdict.complete),
  };
}

const FORM_NAME: Record<TaxDeadlineKind, string> = {
  vat: 'JPK_V7M',
  pit: 'Zaliczka na PIT',
  zus: 'Składki ZUS',
};

function buildEvidence(snapshot: PeriodSnapshot, complete: boolean) {
  const evidence = [
    {
      label: `Dokumenty okresu (${snapshot.summary.salesCount} sprzedaż, ${snapshot.summary.purchaseCount} zakupy)`,
      href: '/invoices',
    },
    { label: 'Pliki do urzędu', href: '/reports/exports' },
  ];

  if (!complete) {
    evidence.unshift({
      label: `Koszty czekające na decyzję (${snapshot.unreviewedExpenses})`,
      href: '/expenses',
    });
  }

  return evidence;
}

/**
 * „Termin wypada w sobotę, więc masz czas do poniedziałku”.
 *
 * Bez tego zdania klient widzi datę inną niż ta, którą zna z ustawy, i nie
 * wie, czy program się myli, czy on źle pamięta.
 */
function describeShift(deadline: TaxDeadline): string {
  if (!deadline.shifted) return '';
  return ` Ustawowy termin to ${formatDayMonth(deadline.nominal)}, ale wypada w dzień wolny — liczy się ${formatDayMonth(deadline.due)}.`;
}

function formatDayMonth(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${Number(day)}.${month}`;
}

function documentWord(count: number): string {
  return count === 1 ? 'dokumentu' : 'dokumentów';
}

/**
 * „1 koszt czeka”, „3 koszty czekają”, „12 kosztów czeka”.
 *
 * Polska liczba mnoga ma trzy formy i rządzi też czasownikiem. Zwykle
 * odmianą zajmuje się tor interfejsu, ale to zdanie powstaje na serwerze —
 * kontrakt niesie gotowe napisy — więc odmiana musi być tutaj. „5 koszty
 * czekają” w komunikacie o podatkach brzmi jak automat, a to jest dokładnie
 * ten moment, w którym klient ma uwierzyć liczbie.
 */
function describePendingCosts(count: number): string {
  const lastDigit = count % 10;
  const lastTwo = count % 100;

  if (count === 1) return 'koszt czeka';
  if (lastDigit >= 2 && lastDigit <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) {
    return 'koszty czekają';
  }
  return 'kosztów czeka';
}
