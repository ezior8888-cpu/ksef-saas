/**
 * X-02 — tłumacz odrzuceń KSeF (krok 27 planu).
 *
 * Ministerstwo odrzuca fakturę kodem błędu. Agent ma powiedzieć po ludzku,
 * co jest nie tak, i — gdy to jednoznaczne — pokazać gotową poprawkę.
 *
 * DWIE ZASADY, KTÓRE TU DECYDUJĄ O WSZYSTKIM:
 *
 * 1. ZAMKNIĘTA LISTA POPRAWEK. Automatycznie poprawiamy WYŁĄCZNIE rzeczy
 *    o jednym możliwym rozwiązaniu: format pola, brakujący kod kraju,
 *    kolejność elementów. NIGDY tożsamości podmiotu, kwot ani stawek.
 *    „Poprawienie" NIP-u przez dobranie z rejestru firmy o podobnej nazwie
 *    wystawiłoby fakturę na obcy podmiot — w rejestrze państwowym, bez
 *    możliwości cofnięcia.
 *
 * 2. NIEZNANY KOD = BRAK INTERPRETACJI. Ministerstwo dokłada kody i zmienia
 *    komunikaty. Model poproszony o wytłumaczenie nieznanego kodu wymyśli
 *    coś sensownie brzmiącego — a to jest porada w sprawie, w której stawką
 *    jest zgodność z prawem. Mówimy wtedy wprost: „nie znam tego kodu,
 *    zgłosiłem to zespołowi".
 */

import { fingerprintOf } from '@/lib/flo/fingerprint';
import type { CreateProposalInput } from '@/lib/flo/proposals';
import type { FloPreview } from '@/types/flo';

/** Po tylu nieudanych próbach agent przestaje proponować wysyłkę. */
export const MAX_RETRY_SUGGESTIONS = 2;

/**
 * Pola, których automatyczna poprawka NIGDY nie dotyka.
 *
 * Lista jest zakazem, nie sugestią: nawet gdyby kiedyś pojawił się kod
 * o jednoznacznym rozwiązaniu dotyczącym kwoty, poprawiać ma człowiek.
 * Zła kwota w rejestrze państwowym to korekta i tłumaczenie się przed
 * kontrahentem; zły format pola to literówka.
 */
const NEVER_AUTOFIX = new Set([
  'buyer_nip',
  'seller_nip',
  'buyer_name',
  'seller_name',
  'gross_total',
  'net_total',
  'vat_amount',
  'vat_rate',
]);

export type FixKind =
  /** Format pola — np. NIP ze spacjami, data w złym układzie. */
  | 'format'
  /** Brakujący kod kraju przy identyfikatorze podatkowym. */
  | 'country_code'
  /** Zła kolejność elementów w XML wobec schematu. */
  | 'element_order';

export interface AutoFix {
  field: string;
  before: string;
  after: string;
  kind: FixKind;
}

/** Zamknięta lista kodów, przy których wolno cokolwiek poprawić. */
const KNOWN_FIXES: Record<string, { field: string; kind: FixKind; hint: string }> = {
  // Kody przykładowe — rozszerzane wraz z tym, co realnie wraca z KSeF.
  // Każda nowa pozycja to świadoma decyzja, że rozwiązanie jest JEDNO.
  '21001': { field: 'issue_date', kind: 'format', hint: 'format daty' },
  '21002': { field: 'buyer_country', kind: 'country_code', hint: 'kod kraju' },
  '21003': { field: 'element_order', kind: 'element_order', hint: 'kolejność pól' },
};

export type FixVerdict =
  | { kind: 'auto'; fix: AutoFix }
  | { kind: 'manual'; message: string }
  | { kind: 'unknown'; code: string; message: string }
  | { kind: 'give_up'; message: string };

// ═══════════════════════════════════════════════════════════════
// Decyzja — funkcja czysta
// ═══════════════════════════════════════════════════════════════

export interface RejectionContext {
  code: string;
  /** Komunikat z KSeF — pokazujemy go, ale go nie interpretujemy. */
  rawMessage: string;
  /** Polskie tłumaczenie ze słownika, jeśli kod jest znany. */
  translated?: string;
  /** Ile razy już próbowaliśmy wysłać tę fakturę. */
  attempts: number;
  /** Proponowana poprawka wyliczona przez kod, nie przez model. */
  candidate?: AutoFix;
}

export function decideFix(context: RejectionContext): FixVerdict {
  // Pętla odrzuceń: po dwóch próbach klient klikający „wyślij ponownie"
  // dostaje to samo. Zamiast trzeciej próby — droga do człowieka.
  if (context.attempts >= MAX_RETRY_SUGGESTIONS) {
    return {
      kind: 'give_up',
      message:
        'Dwa razy nie przeszło, więc nie proponuję trzeciej próby. Przygotowałem opis sprawy — wystarczy go wysłać do nas.',
    };
  }

  const known = KNOWN_FIXES[context.code];

  if (!known) {
    // Bez interpretacji. Model nie dostaje zadania „wytłumacz ten kod",
    // bo wymyśli coś sensownie brzmiącego, a stawką jest zgodność z prawem.
    return {
      kind: 'unknown',
      code: context.code,
      message: `KSeF odrzucił fakturę z kodem ${context.code}. Nie znam tego kodu — zgłosiłem to naszemu zespołowi i odezwiemy się.`,
    };
  }

  const fix = context.candidate;

  if (!fix || fix.field !== known.field || fix.kind !== known.kind) {
    return {
      kind: 'manual',
      message:
        context.translated ??
        `KSeF zgłasza problem z polem: ${known.hint}. Popraw je i wyślij ponownie.`,
    };
  }

  if (NEVER_AUTOFIX.has(fix.field)) {
    // Zabezpieczenie na wypadek, gdyby ktoś kiedyś dopisał do listy kodów
    // pozycję dotyczącą kwoty albo podmiotu.
    return {
      kind: 'manual',
      message:
        'To pole zmienia sens dokumentu — nie ruszam go sam. Popraw je i wyślij ponownie.',
    };
  }

  return { kind: 'auto', fix };
}

// ═══════════════════════════════════════════════════════════════
// Karta
// ═══════════════════════════════════════════════════════════════

export function buildKsefFixProposal(input: {
  tenantId: string;
  invoiceId: string;
  invoiceNumber: string;
  context: RejectionContext;
  now?: Date;
}): CreateProposalInput {
  const now = input.now ?? new Date();
  const verdict = decideFix(input.context);

  const base = {
    tenantId: input.tenantId,
    kind: 'ksef.fix' as const,
    topicKey: `ksef.fix:${input.invoiceId}`,
    fingerprint: fingerprintOf({
      invoice: input.invoiceId,
      code: input.context.code,
      attempts: input.context.attempts,
    }),
    expiresAt: new Date(now.getTime() + 14 * 86_400_000),
    evidence: [
      {
        label: `Faktura ${input.invoiceNumber}`,
        href: `/invoices/${input.invoiceId}`,
      },
    ],
  };

  if (verdict.kind === 'auto') {
    const preview: FloPreview = {
      type: 'diff',
      rows: [
        {
          field: verdict.fix.field,
          before: verdict.fix.before,
          after: verdict.fix.after,
        },
      ],
    };

    return {
      ...base,
      title: `KSeF odrzucił fakturę ${input.invoiceNumber}`,
      body: 'Poprawiłem to, co dało się poprawić jednoznacznie. Zobacz różnicę i zdecyduj, czy wysłać ponownie.',
      priority: 10,
      payload: {
        invoiceId: input.invoiceId,
        code: input.context.code,
        fix: verdict.fix,
        // Podgląd różnicy jest obowiązkowy: zmiana w dokumencie, której
        // klient nie zobaczył, jest zmianą zrobioną za jego plecami.
        preview,
        primaryLabel: 'Wyślij poprawioną',
      },
    };
  }

  if (verdict.kind === 'give_up') {
    return {
      ...base,
      title: `Faktura ${input.invoiceNumber} nadal nie przechodzi`,
      body: verdict.message,
      priority: 5,
      payload: {
        invoiceId: input.invoiceId,
        code: input.context.code,
        attempts: input.context.attempts,
        // Gotowy opis sprawy: klient nie ma tłumaczyć nam, co się stało.
        supportSummary: `Faktura ${input.invoiceNumber}, kod ${input.context.code}, prób: ${input.context.attempts}. Komunikat KSeF: ${input.context.rawMessage}`,
        primaryIntent: 'open',
        primaryLabel: 'Napisz do nas',
      },
    };
  }

  return {
    ...base,
    title: `KSeF odrzucił fakturę ${input.invoiceNumber}`,
    body: verdict.message,
    priority: 10,
    payload: {
      invoiceId: input.invoiceId,
      code: input.context.code,
      // Nieznany kod idzie do operatora, nie do modelu.
      needsOperator: verdict.kind === 'unknown',
      primaryIntent: 'open',
      primaryLabel: 'Popraw fakturę',
    },
  };
}

/** Czy sprawa wymaga uwagi operatora — do alertów, nie do klienta. */
export function needsOperatorAttention(verdict: FixVerdict): boolean {
  return verdict.kind === 'unknown' || verdict.kind === 'give_up';
}
