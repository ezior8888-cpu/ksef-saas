/**
 * K-02 — ponaglenia z gotowymi tekstami (krok 23 planu).
 *
 * TO JEST FUNKCJA O NAJWIĘKSZYM PROMIENIU RAŻENIA W CAŁYM AGENCIE.
 * Wiadomość wychodzi w imieniu klienta do OBCEJ FIRMY. Nie da się jej cofnąć,
 * a pomyłka kompromituje klienta przed jego własnym kontrahentem — i winą
 * obciąży narzędzie, nie siebie.
 *
 * POTRÓJNA OBRONA przed najgorszym scenariuszem (ponaglenie do kogoś, kto
 * właśnie zapłacił):
 *
 *   1. RE-WALIDACJA przy kliknięciu — wykonawca liczy odcisk danych na nowo
 *      i blokuje wykonanie, gdy status faktury albo wpłaty się zmieniły.
 *   2. OKNO BEZPIECZEŃSTWA — jakakolwiek wpłata od tego kontrahenta
 *      w ostatnich 48 godzinach blokuje wysyłkę, NAWET jeśli nie została
 *      dopasowana do tej faktury. Księgowanie bywa wolniejsze niż przelew.
 *   3. ZDANIE W TREŚCI — „jeśli płatność już wyszła, potraktuj tę wiadomość
 *      jako nieaktualną". Zamienia potencjalną wpadkę w uprzejmość.
 *
 * Trzy warstwy, bo każda z osobna ma dziurę: re-walidacja nie widzi wpłaty
 * jeszcze niezaksięgowanej, okno nie widzi gotówki, a zdanie nie chroni
 * przed wysłaniem — tylko łagodzi skutek.
 */

import { renderCopy } from '@/lib/flo/copy';
import { fingerprintOf } from '@/lib/flo/fingerprint';
import { formatDays, formatPlnPlain } from '@/lib/flo/money';
import type { CreateProposalInput } from '@/lib/flo/proposals';

/** Wpłata w tym oknie blokuje wysyłkę, choćby nie była jeszcze dopasowana. */
export const SAFETY_WINDOW_MS = 48 * 60 * 60 * 1000;

/** Powyżej tego udziału w przychodzie agent proponuje najpierw telefon. */
const KEY_CONTRACTOR_SHARE = 0.3;

/** Obowiązkowe zdanie na końcu każdej wiadomości. Bez wyjątków. */
export const DISCLAIMER =
  'Jeśli płatność już wyszła, proszę potraktować tę wiadomość jako nieaktualną.';

// ═══════════════════════════════════════════════════════════════
// Okno bezpieczeństwa — funkcja czysta
// ═══════════════════════════════════════════════════════════════

export interface ChaseSafetyInput {
  outstanding: number;
  /** Ostatnia wpłata od TEGO kontrahenta, niezależnie od faktury. */
  lastPaymentFromContractorAt: string | null;
  remindersPaused: boolean;
  now: Date;
}

export type ChaseSafety =
  | { ok: true }
  | {
      ok: false;
      reason: 'already_paid' | 'recent_payment' | 'paused';
      message: string;
    };

export function evaluateChaseSafety(input: ChaseSafetyInput): ChaseSafety {
  if (input.outstanding <= 0) {
    return {
      ok: false,
      reason: 'already_paid',
      message: 'Ta faktura jest już opłacona — nie wysyłam.',
    };
  }

  if (input.remindersPaused) {
    return {
      ok: false,
      reason: 'paused',
      message: 'Przypomnienia dla tej faktury są wstrzymane.',
    };
  }

  if (input.lastPaymentFromContractorAt) {
    const paidAt = Date.parse(input.lastPaymentFromContractorAt);
    if (
      !Number.isNaN(paidAt) &&
      input.now.getTime() - paidAt < SAFETY_WINDOW_MS
    ) {
      return {
        ok: false,
        reason: 'recent_payment',
        message:
          'Ten kontrahent wpłacił coś w ciągu ostatnich dwóch dni. Nie wysyłam — sprawdź, czy to nie ta faktura.',
      };
    }
  }

  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════
// Adresat — funkcja czysta
// ═══════════════════════════════════════════════════════════════

export type RecipientVerdict =
  | { ok: true; email: string }
  | { ok: false; reason: 'missing' | 'invalid' | 'bounced'; message: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Agent NIGDY nie zgaduje adresu.
 *
 * KSeF nie przesyła adresów e-mail kontrahentów, więc jedyne źródło to
 * historia albo wpis człowieka. Adres wzięty „z podobnej firmy" wysłałby
 * dane finansowe klienta obcej osobie.
 */
export function validateRecipient(
  email: string | null | undefined,
  hardBounced: ReadonlySet<string>,
): RecipientVerdict {
  if (!email || email.trim().length === 0) {
    return {
      ok: false,
      reason: 'missing',
      message: 'Nie mam adresu tego kontrahenta. Podaj go, a przygotuję wysyłkę.',
    };
  }

  const normalized = email.trim().toLowerCase();

  if (!EMAIL_RE.test(normalized)) {
    return {
      ok: false,
      reason: 'invalid',
      message: 'Ten adres wygląda na niepoprawny — sprawdź go, zanim wyślę.',
    };
  }

  if (hardBounced.has(normalized)) {
    return {
      ok: false,
      reason: 'bounced',
      message:
        'Poprzednia wiadomość na ten adres wróciła jako niedostarczona. Potrzebuję innego.',
    };
  }

  return { ok: true, email: normalized };
}

// ═══════════════════════════════════════════════════════════════
// Karta
// ═══════════════════════════════════════════════════════════════

export interface BuildChaseInput {
  tenantId: string;
  invoiceId: string;
  invoiceNumber: string;
  contractorName: string;
  outstanding: number;
  daysOverdue: number;
  stage: string;
  /** Udział kontrahenta w przychodzie — do zdania o telefonie. */
  revenueShare?: number;
  /** Znacznik „traktuj delikatnie" ustawiony przez klienta. */
  gentle?: boolean;
  recipientEmail?: string | null;
  facts: Record<string, string | number | null>;
  now?: Date;
}

export function buildChaseProposal(input: BuildChaseInput): CreateProposalInput {
  const now = input.now ?? new Date();

  const copy = renderCopy('payment.chase', {
    kontrahent: input.contractorName,
    kwota: formatPlnPlain(input.outstanding),
    dni: formatDays(input.daysOverdue),
    numer: input.invoiceNumber,
  });

  // Największy klient to nie jest ktoś, do kogo pisze się pismo. Agent, który
  // popycha do zerwania relacji żywiącej firmę, ma formalnie rację i realnie
  // szkodzi.
  const keyClient =
    (input.revenueShare ?? 0) >= KEY_CONTRACTOR_SHARE
      ? ' To Twój największy klient — może najpierw telefon?'
      : '';

  const needsEmail = !input.recipientEmail;

  return {
    tenantId: input.tenantId,
    kind: 'payment.chase',
    topicKey: `payment.chase:${input.invoiceId}:${input.stage}`,
    title: copy.title,
    body: `${copy.body}${keyClient}`,
    fingerprint: fingerprintOf(input.facts),
    // Ponaglenie starzeje się szybko — po dwóch dobach sytuacja jest inna.
    expiresAt: new Date(now.getTime() + 48 * 60 * 60 * 1000),
    priority: 10,
    payload: {
      invoiceId: input.invoiceId,
      stage: input.stage,
      facts: input.facts,
      contractorName: input.contractorName,
      recipientEmail: input.recipientEmail ?? null,
      // Ton łagodny to nie sugestia, tylko trwała decyzja klienta o relacji.
      gentle: input.gentle === true,
      // Brak adresu zamienia kartę w pytanie o dane, zamiast blokować sprawę.
      ...(needsEmail
        ? {
            inputLabel: 'Adres e-mail kontrahenta',
            inputKind: 'email',
            primaryLabel: 'Podaj adres i wyślij',
          }
        : { primaryLabel: 'Pokaż treść' }),
    },
    evidence: [
      { label: `Faktura ${input.invoiceNumber}`, href: `/invoices/${input.invoiceId}` },
      { label: 'Przeterminowane', href: '/payments/overdue' },
    ],
  };
}

/**
 * WYKONAWCA MIESZKA OSOBNO — `payment-chase-handler.ts`.
 *
 * Powód nie jest kosmetyczny: ten plik importuje cron budujący propozycje,
 * a wykonawca emituje zdarzenie wysyłki. Trzymane razem dawałyby ścieżkę
 * z crona do wysyłki na zewnątrz — statycznie, w grafie zależności. Test
 * architektoniczny słusznie to zgłosił, więc rozdzieliliśmy moduły zamiast
 * dopisywać wyjątek do listy długu.
 */
