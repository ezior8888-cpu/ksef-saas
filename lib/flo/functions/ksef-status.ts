/**
 * X-01 — strażnik wysyłki do KSeF (krok 26 planu).
 *
 * Agent prowadzi fakturę do skutku na istniejącej kolejce i melduje po
 * ludzku. Cała rzecz w tym, ŻEBY MELDOWAĆ PRAWDĘ.
 *
 * ROZDZIELONE STANY „PRZYJĘTA" I „MAM POŚWIADCZENIE".
 * KSeF potwierdza przyjęcie od razu, a urzędowe poświadczenie odbioru
 * potrafi przyjść po godzinach. Zlanie tych dwóch stanów w jedno „wszystko
 * gotowe" jest kłamstwem w sprawie, w której klient ma dowód albo go nie ma.
 * Przy kontroli różnica między „wysłałem" a „mam UPO" jest całą różnicą.
 *
 * TRZY AWARIE:
 * 1. Przyjęta, ale bez poświadczenia — mówimy wprost, że czekamy, i pokazujemy
 *    od kiedy. Po dobie sprawa idzie do operatora, a klient dostaje informację,
 *    że się tym zajmujemy.
 * 2. Podwójna wysyłka — klucz idempotencji z `lib/ksef/idempotency.ts` plus
 *    atomowe przejęcie propozycji w wykonawcy. Pięćdziesiąt kliknięć daje
 *    jedną fakturę w rejestrze.
 * 3. Wysyłka utknęła — po piętnastu minutach w stanie pośrednim agent sam
 *    się odzywa. Cisza jest stanem zabronionym: klient przekonany, że wysłał,
 *    dowiaduje się prawdy przy rozliczeniu albo nie dowiaduje się wcale.
 */

import { renderCopy } from '@/lib/flo/copy';
import { fingerprintOf } from '@/lib/flo/fingerprint';
import type { CreateProposalInput } from '@/lib/flo/proposals';

/** Po tylu minutach w stanie pośrednim agent przestaje milczeć. */
export const STUCK_AFTER_MS = 15 * 60_000;

/** Po tylu godzinach bez poświadczenia sprawa idzie do operatora. */
export const UPO_ESCALATE_AFTER_MS = 24 * 60 * 60_000;

export type SubmissionState =
  | 'queued'
  | 'sending'
  | 'accepted'
  | 'rejected'
  | 'offline_queued';

export interface SubmissionSnapshot {
  invoiceId: string;
  invoiceNumber: string;
  state: SubmissionState;
  hasUpo: boolean;
  /** Od kiedy faktura jest w obecnym stanie (ISO). */
  since: string;
  /** Ile razy próbowaliśmy wysłać. */
  attempts: number;
}

export type StatusVerdict =
  | { kind: 'silent' }
  | { kind: 'done' }
  | { kind: 'waiting_upo'; waitingMs: number }
  | { kind: 'upo_escalated'; waitingMs: number }
  | { kind: 'stuck_retrying'; stuckMs: number }
  | { kind: 'stuck_escalated'; stuckMs: number };

/**
 * Co agent ma powiedzieć o tej fakturze — funkcja czysta.
 *
 * `silent` jest pełnoprawną odpowiedzią: faktura w drodze od dwóch minut nie
 * jest sprawą, tylko normalnym stanem. Meldowanie o niej byłoby hałasem.
 */
export function evaluateSubmission(
  snapshot: SubmissionSnapshot,
  now: Date,
): StatusVerdict {
  const elapsed = now.getTime() - Date.parse(snapshot.since);
  const age = Number.isNaN(elapsed) ? 0 : elapsed;

  if (snapshot.state === 'accepted') {
    if (snapshot.hasUpo) return { kind: 'done' };
    return age >= UPO_ESCALATE_AFTER_MS
      ? { kind: 'upo_escalated', waitingMs: age }
      : { kind: 'waiting_upo', waitingMs: age };
  }

  // Odrzucenie i kolejka offline mają własne funkcje (X-02, X-04) — tutaj
  // milczymy, żeby dwie karty nie mówiły o tym samym.
  if (snapshot.state === 'rejected' || snapshot.state === 'offline_queued') {
    return { kind: 'silent' };
  }

  if (age < STUCK_AFTER_MS) return { kind: 'silent' };

  return snapshot.attempts >= 2
    ? { kind: 'stuck_escalated', stuckMs: age }
    : { kind: 'stuck_retrying', stuckMs: age };
}

// ═══════════════════════════════════════════════════════════════
// Karty
// ═══════════════════════════════════════════════════════════════

function minutes(ms: number): number {
  return Math.max(1, Math.round(ms / 60_000));
}

function hours(ms: number): number {
  return Math.max(1, Math.round(ms / 3_600_000));
}

export function buildKsefStatusProposal(input: {
  tenantId: string;
  snapshot: SubmissionSnapshot;
  verdict: StatusVerdict;
  now?: Date;
}): CreateProposalInput | null {
  const now = input.now ?? new Date();
  const { snapshot, verdict } = input;
  if (verdict.kind === 'silent') return null;

  const base = {
    tenantId: input.tenantId,
    kind: 'ksef.status' as const,
    // Jedna karta na fakturę. Kolejne stany aktualizują ją w miejscu, zamiast
    // budować kronikę wysyłki w wątku klienta.
    topicKey: `ksef.status:${snapshot.invoiceId}`,
    fingerprint: fingerprintOf({
      invoice: snapshot.invoiceId,
      state: snapshot.state,
      hasUpo: snapshot.hasUpo ? 1 : 0,
      attempts: snapshot.attempts,
    }),
    expiresAt: new Date(now.getTime() + 30 * 86_400_000),
    payload: {
      invoiceId: snapshot.invoiceId,
      state: snapshot.state,
      hasUpo: snapshot.hasUpo,
      primaryIntent: 'open',
      primaryLabel: 'Pokaż fakturę',
    },
    evidence: [
      {
        label: `Faktura ${snapshot.invoiceNumber}`,
        href: `/invoices/${snapshot.invoiceId}`,
      },
    ],
  };

  switch (verdict.kind) {
    case 'done': {
      const copy = renderCopy('ksef.status', { numer: snapshot.invoiceNumber });
      return { ...base, title: copy.title, body: copy.body, priority: 70 };
    }

    case 'waiting_upo':
      // Nie mówimy „gotowe". Klient ma wiedzieć, że dowodu jeszcze nie ma.
      return {
        ...base,
        title: `Faktura ${snapshot.invoiceNumber} przyjęta — czekam na poświadczenie`,
        body: `KSeF przyjął dokument. Urzędowe poświadczenie odbioru jeszcze nie przyszło, czekam ${minutes(verdict.waitingMs)} min. Dam znać, jak będzie.`,
        priority: 65,
      };

    case 'upo_escalated':
      return {
        ...base,
        title: `Brak poświadczenia do faktury ${snapshot.invoiceNumber}`,
        body: `Faktura jest przyjęta przez KSeF, ale poświadczenie nie przyszło od ${hours(verdict.waitingMs)} godzin. Zgłosiłem to naszemu zespołowi — zajmujemy się tym.`,
        priority: 30,
      };

    case 'stuck_retrying':
      return {
        ...base,
        title: `Wysyłka faktury ${snapshot.invoiceNumber} się przeciąga`,
        body: `Trwa ${minutes(verdict.stuckMs)} min zamiast kilkunastu sekund. Ponawiam — nic nie musisz robić.`,
        priority: 35,
      };

    case 'stuck_escalated':
      // Zdanie o archiwum jest tu najważniejsze: klient musi wiedzieć, że
      // dokument nie przepadł, zanim zacznie go wystawiać drugi raz.
      return {
        ...base,
        title: `Nie udało mi się wysłać faktury ${snapshot.invoiceNumber}`,
        body: 'Zajmujemy się tym. Twoja faktura jest bezpieczna w archiwum — nie wystawiaj jej drugi raz.',
        priority: 15,
      };

    default:
      return null;
  }
}

/**
 * Faktury wiszące w stanie pośrednim dłużej niż doba.
 *
 * Kontrola dobowa jest osobna od piętnastominutowej, bo łapie inny przypadek:
 * tamta reaguje na pojedynczą wysyłkę, ta wyłapuje dokumenty, o których
 * wszyscy zapomnieli — łącznie z agentem.
 */
export function isAbandoned(snapshot: SubmissionSnapshot, now: Date): boolean {
  if (snapshot.state !== 'queued' && snapshot.state !== 'sending') return false;
  const age = now.getTime() - Date.parse(snapshot.since);
  return !Number.isNaN(age) && age >= 24 * 60 * 60_000;
}
