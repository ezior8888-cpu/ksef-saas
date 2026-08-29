/**
 * P-07 — pilnowanie zaliczki i faktury końcowej (krok 34 planu).
 *
 * Sytuacja: klient wystawił fakturę zaliczkową, dostał pieniądze i zabrał się
 * do roboty. Faktura końcowa, która rozlicza zaliczkę, jest obowiązkiem
 * ustawowym — i jednocześnie dokumentem, o którym najłatwiej zapomnieć, bo
 * pieniądze już są na koncie. Agent pilnuje tego terminu za człowieka.
 *
 * TRZY AWARIE:
 *
 * 1. PODWÓJNE ROZLICZENIE ZALICZKI. Klient wystawił fakturę końcową ręcznie
 *    albo w innym programie, a agent proponuje drugą. W rejestrze państwowym
 *    stoją wtedy dwa dokumenty rozliczające tę samą zaliczkę i trzeba je
 *    korygować. Obrona dwuwarstwowa: sprawdzenie łańcucha `parent_invoice_id`
 *    ORAZ osobno faktury o zbliżonej kwocie w oknie 30 dni — bo końcową
 *    wystawioną ręcznie klient zwykle wystawia jako zwykłą, bez wpięcia
 *    w łańcuch, i pierwsza warstwa jej nie widzi.
 *
 * 2. ZŁA KWOTA DO ZAPŁATY. Zaliczek bywa kilka, jedna bywa anulowana albo
 *    skorygowana. Kwotę liczy `lib/invoices/calculator` — ten sam kod, który
 *    liczy prawdziwe faktury — a nie osobny rachunek napisany na potrzeby
 *    agenta. Gdy suma zaliczek przekracza wartość zamówienia, łańcuch jest
 *    niespójny: agent MILCZY wobec klienta i zgłasza sprawę operatorowi.
 *    Pokazanie klientowi ujemnej kwoty do zapłaty byłoby przerzuceniem na
 *    niego naszego błędu w danych.
 *
 * 3. ZACZEPIANIE W TRAKCIE PROJEKTU. Remont trwa pół roku, zaliczka poszła
 *    w styczniu. Agent pytający co tydzień o fakturę końcową jest gorszy niż
 *    brak agenta. Obrona: start dopiero po dacie realizacji z faktury
 *    zaliczkowej, a przycisk „Projekt trwa" przesuwa sprawę o 30 dni
 *    BEZ OGRANICZENIA LICZBY UŻYĆ. To odsunięcie, nie odrzucenie — dwa
 *    odrzucenia wyciszają rodzaj na 90 dni (`decisions.ts`), a długi projekt
 *    nie jest powodem, żeby agent zamilkł o obowiązku ustawowym.
 *
 * PODZIAŁ: ten moduł jest czysty — same reguły, żadnego odczytu z bazy.
 * Odczyt łańcucha i walidację schematu robi warstwa wpięcia i podaje wynik
 * na wejściu. Dzięki temu reguły dają się przetestować bez Postgresa.
 */

import { fingerprintOf } from '@/lib/flo/fingerprint';
import { formatPlnPlain } from '@/lib/flo/money';
import type { CreateProposalInput } from '@/lib/flo/proposals';
import {
  calculateFinalInvoiceTotals,
  calculateInvoiceTotals,
} from '@/lib/invoices/calculator';
import type { FloPreviewLine } from '@/types/flo';
import type { InvoiceLine } from '@/types/invoice-types';

// ═══════════════════════════════════════════════════════════════
// Stałe
// ═══════════════════════════════════════════════════════════════

/** O ile dni „Projekt trwa" odsuwa sprawę. Bez limitu użyć. */
export const PROJECT_ONGOING_DAYS = 30;

/** Okno, w którym szukamy faktury wystawionej ręcznie zamiast naszej. */
export const SIMILAR_WINDOW_DAYS = 30;

/**
 * Jak bardzo kwota może się różnić, żeby uznać cudzą fakturę za tę samą sprawę.
 *
 * Próg jest ŚWIADOMIE SZEROKI. Pomyłka w jedną stronę oznacza, że agent
 * przemilczy fakturę, którą klient i tak wystawi sam. Pomyłka w drugą stronę
 * oznacza drugi dokument rozliczający tę samą zaliczkę w rejestrze państwowym.
 * Te dwa błędy nie kosztują tyle samo.
 */
export const SIMILAR_TOLERANCE = 0.05;

/** Grosz — poniżej tego kwoty uznajemy za równe. */
const CENT = 0.005;

const DAY_MS = 86_400_000;

// ═══════════════════════════════════════════════════════════════
// Łańcuch dokumentów
// ═══════════════════════════════════════════════════════════════

/** Pojedyncza faktura zaliczkowa w łańcuchu jednego zamówienia. */
export interface AdvanceLink {
  id: string;
  number: string;
  /** kwota zaliczki brutto */
  gross: number;
  /** ISO YYYY-MM-DD */
  issueDate: string;
  /** `invoices.parent_invoice_id` — wskazanie na korzeń łańcucha */
  parentInvoiceId: string | null;
  /** anulowana albo skorygowana do zera — nie liczy się do sumy */
  voided: boolean;
}

export interface AdvanceChain {
  /** pierwsza faktura zaliczkowa zamówienia — korzeń łańcucha */
  rootInvoiceId: string;
  contractorId: string;
  contractorName: string;
  /**
   * Pozycje CAŁEGO zamówienia. Z nich liczy się wartość końcowa — nie
   * z sumy zaliczek pomnożonej przez zgadywany procent.
   */
  orderLines: InvoiceLine[];
  advances: AdvanceLink[];
  /** data realizacji z faktury zaliczkowej, ISO YYYY-MM-DD; null = nie wiadomo */
  deliveryDate: string | null;
  /** faktura końcowa wpięta w łańcuch, jeżeli już istnieje */
  finalInvoiceId: string | null;
}

export type ChainProblem =
  /** zaliczka wskazuje na inny łańcuch albo na nic */
  | 'broken_parent'
  /** brak pozycji zamówienia — nie ma z czego policzyć kwoty końcowej */
  | 'no_order_lines'
  /** suma zaliczek przekracza wartość zamówienia */
  | 'advances_exceed_order'
  /** szkic nie przechodzi walidacji schematu FA(3) */
  | 'xsd_invalid';

/**
 * Sprawdzenie spójności łańcucha — funkcja czysta.
 *
 * Wołana DWA RAZY: przy tworzeniu propozycji i ponownie przy wykonaniu.
 * Między jednym a drugim klient mógł anulować zaliczkę albo wystawić
 * korektę, a wtedy kwota, na którą się zgodził, przestaje być prawdziwa.
 */
export function inspectChain(chain: AdvanceChain): ChainProblem | null {
  if (chain.orderLines.length === 0) return 'no_order_lines';

  for (const advance of chain.advances) {
    if (advance.voided) continue;
    // Korzeń wskazuje na nic albo sam na siebie; każda kolejna zaliczka
    // musi wskazywać na korzeń. Cokolwiek innego znaczy, że zszywamy
    // w jedno rozliczenie dokumenty z dwóch różnych zamówień.
    const ownParent =
      advance.id === chain.rootInvoiceId
        ? advance.parentInvoiceId === null ||
          advance.parentInvoiceId === chain.rootInvoiceId
        : advance.parentInvoiceId === chain.rootInvoiceId;

    if (!ownParent) return 'broken_parent';
  }

  if (advancesTotal(chain) > orderGross(chain) + CENT) {
    return 'advances_exceed_order';
  }

  return null;
}

/** Suma żywych zaliczek. Anulowane nie liczą się do rozliczenia. */
export function advancesTotal(chain: AdvanceChain): number {
  return chain.advances
    .filter((advance) => !advance.voided)
    .reduce((sum, advance) => sum + advance.gross, 0);
}

/** Wartość całego zamówienia brutto — z kalkulatora faktur, nie z osobnego wzoru. */
export function orderGross(chain: AdvanceChain): number {
  return calculateInvoiceTotals(chain.orderLines).grossTotal;
}

// ═══════════════════════════════════════════════════════════════
// Czy w ogóle się odzywać
// ═══════════════════════════════════════════════════════════════

export type SilentReason =
  /** faktura końcowa już istnieje w łańcuchu */
  | 'already_final'
  /** zaliczki pokryły całość — nie ma czego dopłacać */
  | 'fully_settled'
  /** faktura zaliczkowa nie ma daty realizacji */
  | 'no_delivery_date'
  /** realizacja jeszcze przed nami */
  | 'not_delivered_yet'
  /** klient kliknął „Projekt trwa" */
  | 'postponed'
  /** klient wystawił fakturę o zbliżonej kwocie poza łańcuchem */
  | 'similar_invoice_nearby';

export type FinalVerdict =
  | {
      kind: 'propose';
      amountDue: number;
      advancesTotal: number;
      orderGross: number;
    }
  | { kind: 'silent'; reason: SilentReason }
  | { kind: 'operator'; problem: ChainProblem; detail: string };

export interface FinalDecisionInput {
  chain: AdvanceChain;
  today: Date;
  /** do kiedy sprawa jest odsunięta przyciskiem „Projekt trwa"; ISO */
  postponedUntil?: string | null;
  /** czy w oknie 30 dni jest faktura o zbliżonej kwocie dla tego kontrahenta */
  similarInvoiceNearby: boolean;
  /** czy szkic faktury końcowej przechodzi walidację schematu FA(3) */
  xsdValid: boolean;
}

/**
 * Jedyna decyzja tej funkcji: odezwać się, zamilknąć czy zawołać operatora.
 *
 * Kolejność sprawdzeń nie jest przypadkowa. Najpierw odpada to, po czym nie
 * ma już nic do zrobienia (faktura końcowa istnieje), potem to, co jest
 * naszym błędem (niespójny łańcuch), a dopiero na końcu to, co jest kwestią
 * czasu. Odwrotna kolejność wołałaby operatora do spraw, których i tak nikt
 * by nie zobaczył.
 */
export function decideFinalInvoice(input: FinalDecisionInput): FinalVerdict {
  const { chain } = input;

  if (chain.finalInvoiceId) return { kind: 'silent', reason: 'already_final' };

  const problem = inspectChain(chain);
  if (problem) {
    return {
      kind: 'operator',
      problem,
      detail: describeProblem(problem, chain),
    };
  }

  const advances = advancesTotal(chain);
  const totals = calculateFinalInvoiceTotals(chain.orderLines, advances);

  // Zaliczki pokryły całość. Czy faktura końcowa jest wtedy potrzebna, jest
  // pytaniem do księgowej, nie do programu — a agent nie wchodzi w spory
  // interpretacyjne. Milczy.
  if (totals.amountDue <= CENT) return { kind: 'silent', reason: 'fully_settled' };

  // Brak pewnej daty realizacji = milczenie. Zgadywanie jej z daty
  // wystawienia zaliczki zamieniłoby agenta w budzik dzwoniący w środku
  // trwającego projektu.
  if (!chain.deliveryDate) return { kind: 'silent', reason: 'no_delivery_date' };

  const delivery = Date.parse(`${chain.deliveryDate}T00:00:00.000Z`);
  if (Number.isNaN(delivery)) {
    return { kind: 'silent', reason: 'no_delivery_date' };
  }
  if (input.today.getTime() < delivery) {
    return { kind: 'silent', reason: 'not_delivered_yet' };
  }

  if (input.postponedUntil) {
    const until = Date.parse(input.postponedUntil);
    if (!Number.isNaN(until) && input.today.getTime() < until) {
      return { kind: 'silent', reason: 'postponed' };
    }
  }

  if (input.similarInvoiceNearby) {
    return { kind: 'silent', reason: 'similar_invoice_nearby' };
  }

  // Walidacja schematu na końcu: dokument, którego i tak nie zamierzaliśmy
  // pokazać, nie ma po co budzić operatora. Odwrotnie natomiast — szkic,
  // który nie przeszedłby przez bramkę Ministerstwa, jest naszym błędem
  // i klient nie ma prawa go zobaczyć.
  if (!input.xsdValid) {
    return {
      kind: 'operator',
      problem: 'xsd_invalid',
      detail: `Szkic faktury końcowej dla ${chain.contractorName} nie przechodzi walidacji FA(3).`,
    };
  }

  return {
    kind: 'propose',
    amountDue: totals.amountDue,
    advancesTotal: totals.totalAdvances,
    orderGross: totals.totalGross,
  };
}

function describeProblem(problem: ChainProblem, chain: AdvanceChain): string {
  switch (problem) {
    case 'no_order_lines':
      return `Zamówienie ${chain.rootInvoiceId} nie ma pozycji — nie ma z czego policzyć faktury końcowej.`;
    case 'broken_parent':
      return `Łańcuch zaliczek ${chain.rootInvoiceId} jest rozspojony: zaliczka wskazuje na inne zamówienie.`;
    case 'advances_exceed_order':
      return `Zaliczki (${formatPlnPlain(advancesTotal(chain))}) przekraczają wartość zamówienia (${formatPlnPlain(orderGross(chain))}).`;
    case 'xsd_invalid':
      return `Szkic faktury końcowej dla ${chain.contractorName} nie przechodzi walidacji FA(3).`;
  }
}

/** Czy sprawa wymaga uwagi operatora — do alertów, nie do klienta. */
export function needsOperatorAttention(verdict: FinalVerdict): boolean {
  return verdict.kind === 'operator';
}

/**
 * Czy istnieje faktura, która najpewniej rozlicza tę zaliczkę poza łańcuchem.
 *
 * Druga warstwa obrony przed podwójnym rozliczeniem. Klient wystawiający
 * fakturę końcową ręcznie prawie nigdy nie wpina jej w łańcuch — dla niego
 * to po prostu „faktura za resztę". Dlatego szukamy po kwocie i po czasie.
 */
export function hasSimilarInvoice(
  candidates: readonly { grossTotal: number; issueDate: string }[],
  amountDue: number,
  today: Date,
): boolean {
  if (amountDue <= CENT) return false;
  const windowStart = today.getTime() - SIMILAR_WINDOW_DAYS * DAY_MS;

  return candidates.some((candidate) => {
    const issued = Date.parse(`${candidate.issueDate}T00:00:00.000Z`);
    if (Number.isNaN(issued) || issued < windowStart) return false;

    const deviation = Math.abs(candidate.grossTotal - amountDue) / amountDue;
    return deviation <= SIMILAR_TOLERANCE;
  });
}

/** Nowy termin po kliknięciu „Projekt trwa". Bez limitu użyć. */
export function postponeUntil(from: Date): Date {
  return new Date(from.getTime() + PROJECT_ONGOING_DAYS * DAY_MS);
}

// ═══════════════════════════════════════════════════════════════
// Propozycja
// ═══════════════════════════════════════════════════════════════

export interface FinalProposalInput {
  tenantId: string;
  chain: AdvanceChain;
  verdict: Extract<FinalVerdict, { kind: 'propose' }>;
  /**
   * Szkic faktury końcowej — BEZ NUMERU, tak samo jak w paczce P-02.
   * Numer nadaje się atomowo przy wysyłce, inaczej nigdy niewysłany szkic
   * zostawia dziurę w numeracji, której nikt nie zauważy do pierwszego
   * pytania księgowej.
   */
  draftInvoiceId: string;
  /** pozycje do podglądu — gotowe napisy, interfejs niczego nie przelicza */
  previewLines: FloPreviewLine[];
  /** termin płatności faktury końcowej, np. „14 dni” */
  dueLabel: string;
  now?: Date;
}

export function buildFinalInvoiceProposal(
  input: FinalProposalInput,
): CreateProposalInput {
  const now = input.now ?? new Date();
  const { chain, verdict } = input;

  return {
    tenantId: input.tenantId,
    kind: 'invoice.final',
    // Klucz po korzeniu łańcucha, nie po okresie: jedno zamówienie ma
    // dokładnie jedną fakturę końcową, niezależnie od tego, ile miesięcy
    // trwało i ile razy klient kliknął „Projekt trwa".
    topicKey: `invoice.final:${chain.rootInvoiceId}`,
    title: `${chain.contractorName} — czas na fakturę końcową`,
    body:
      `Zaliczki na ${formatPlnPlain(verdict.advancesTotal)} przy zamówieniu ` +
      `na ${formatPlnPlain(verdict.orderGross)}. Do rozliczenia zostaje ` +
      `${formatPlnPlain(verdict.amountDue)}. Numer nadam przy wysyłce.`,
    fingerprint: fingerprintOf({
      root: chain.rootInvoiceId,
      due: verdict.amountDue,
      advances: verdict.advancesTotal,
      // Anulowanie jednej z zaliczek zmienia odcisk i unieważnia zgodę
      // wydaną na poprzednią kwotę.
      links: chain.advances
        .filter((advance) => !advance.voided)
        .map((advance) => advance.id)
        .join('|'),
    }),
    // Obowiązek ustawowy nie znika po tygodniu. Kartę trzymamy kwartał,
    // a nie do najbliższego sprzątania wątku.
    expiresAt: new Date(now.getTime() + 90 * DAY_MS),
    priority: 20,
    payload: {
      rootInvoiceId: chain.rootInvoiceId,
      draftInvoiceId: input.draftInvoiceId,
      contractorId: chain.contractorId,
      amountDue: verdict.amountDue,
      advancesTotal: verdict.advancesTotal,
      primaryLabel: 'Wystaw fakturę końcową',
      // „Projekt trwa" JEST ODSUNIĘCIEM, NIE ODRZUCENIEM. Gdyby siedziało
      // na `dismiss`, dwa kliknięcia wyciszyłyby rodzaj na 90 dni
      // (`MUTE_AFTER_DISMISSALS`) — i agent zamilkłby o obowiązku ustawowym
      // dokładnie u tych klientów, którzy prowadzą najdłuższe projekty.
      secondary: [{ label: 'Projekt trwa', intent: 'snooze' }],
      snoozeDays: PROJECT_ONGOING_DAYS,
      preview: {
        type: 'invoice',
        invoiceId: input.draftInvoiceId,
        lines: input.previewLines,
        total: formatPlnPlain(verdict.amountDue),
        due: input.dueLabel,
      },
    },
    evidence: [
      { label: 'Faktura zaliczkowa', href: `/invoices/${chain.rootInvoiceId}` },
      { label: 'Kontrahent', href: `/contractors/${chain.contractorId}` },
    ],
  };
}

// ═══════════════════════════════════════════════════════════════
// Ponowne sprawdzenie przy wykonaniu
// ═══════════════════════════════════════════════════════════════

export type RecheckResult =
  | { ok: true; amountDue: number }
  | { ok: false; reason: 'stale' | 'blocked'; message: string };

/**
 * Druga kontrola — tuż przed wystawieniem dokumentu.
 *
 * Między pokazaniem karty a kliknięciem mijają zwykle dni: klient mógł
 * wystawić fakturę końcową ręcznie, anulować zaliczkę albo dostać korektę.
 * Zgoda dotyczyła KONKRETNEJ KWOTY — jeśli kwota się zmieniła, zgoda
 * przestała obowiązywać i trzeba pokazać nową kartę, a nie wystawić
 * dokument na liczbę, której człowiek nie widział.
 */
export function recheckBeforeIssue(
  input: FinalDecisionInput,
  approvedAmountDue: number,
): RecheckResult {
  const verdict = decideFinalInvoice(input);

  if (verdict.kind === 'operator') {
    return {
      ok: false,
      reason: 'blocked',
      message: 'Dokumenty tego zamówienia wymagają sprawdzenia. Zajmujemy się tym.',
    };
  }

  if (verdict.kind === 'silent') {
    return {
      ok: false,
      reason: 'stale',
      message:
        verdict.reason === 'already_final'
          ? 'Faktura końcowa dla tego zamówienia już istnieje.'
          : 'To zamówienie zostało w międzyczasie rozliczone.',
    };
  }

  if (Math.abs(verdict.amountDue - approvedAmountDue) > CENT) {
    return {
      ok: false,
      reason: 'stale',
      message: `Kwota do rozliczenia zmieniła się na ${formatPlnPlain(verdict.amountDue)}. Pokazuję nową propozycję.`,
    };
  }

  return { ok: true, amountDue: verdict.amountDue };
}
