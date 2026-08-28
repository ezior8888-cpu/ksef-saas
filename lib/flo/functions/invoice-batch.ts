/**
 * P-02 — paczka szkiców na start miesiąca (krok 32 planu).
 * P-03 — alarm o brakującej fakturze (krok 33 planu).
 *
 * P-02 MA NAJWIĘKSZY PROMIEŃ RAŻENIA W CAŁEJ GRUPIE PRZYCHODOWEJ.
 * Hurtowa wysyłka faktur do rejestru państwowego jest nieodwracalna: zła
 * kwota oznacza korektę, telefon do kontrahenta i tłumaczenie się. Dlatego
 * ta funkcja jest celowo NIEWYGODNA w kilku miejscach.
 *
 * TRZY AWARIE P-02:
 *
 * 1. HURTOWA WYSYŁKA ZŁEJ KWOTY. Stawka wzrosła w połowie miesiąca albo
 *    zakres prac był mniejszy. Klient zaznacza wszystko i wysyła. Obrona:
 *    pozycja odbiegająca od mediany o więcej niż 15% jest DOMYŚLNIE
 *    ODZNACZONA i wymaga otwarcia podglądu; limit dziesięciu faktur
 *    w paczce; każda pozycja re-walidowana osobno przy kliknięciu.
 *
 * 2. PODWÓJNA FAKTURA ZA TEN SAM OKRES. Klient wystawił ją ręcznie trzeciego,
 *    a szkic czeka od pierwszego. Obrona: sprawdzenie istnienia faktury dla
 *    tego kontrahenta w tym okresie — przy budowaniu paczki I przy kliknięciu.
 *
 * 3. LUKI W NUMERACJI. Szkice utworzone z wyprzedzeniem rezerwowałyby numery,
 *    a część z nich nigdy nie zostanie wysłana. Obrona: SZKIC NIE DOSTAJE
 *    NUMERU. Numer nadaje się atomowo w chwili wysyłki. To jest ta awaria,
 *    której klient nie zauważy przez rok — do pierwszego pytania księgowej,
 *    dlaczego brakuje faktury numer 14.
 */

import { fingerprintOf } from '@/lib/flo/fingerprint';
import { formatPlnPlain } from '@/lib/flo/money';
import type { CreateProposalInput } from '@/lib/flo/proposals';
import type { FloListItem } from '@/types/flo';

// ═══════════════════════════════════════════════════════════════
// P-02
// ═══════════════════════════════════════════════════════════════

/** Więcej pozycji naraz to już nie przegląd, tylko klikanie w ciemno. */
export const MAX_BATCH = 10;

/** O ile kwota może odbiegać od typowej, zanim wymusimy podgląd. */
export const OUTLIER_THRESHOLD = 0.15;

export interface DraftCandidate {
  /** Identyfikator profilu rytmu, nie faktury — faktury jeszcze nie ma. */
  profileId: string;
  contractorId: string;
  contractorName: string;
  /** Kwota z ostatniej faktury dla tego kontrahenta. */
  amount: number;
  /** Mediana kwot z historii — punkt odniesienia dla odstępstwa. */
  typicalAmount: number;
  paymentTermDays: number;
  /** Czy dla tego kontrahenta istnieje już faktura w tym okresie. */
  alreadyInvoicedThisPeriod: boolean;
}

export interface BatchItemDecision extends FloListItem {
  contractorId: string;
  /** Powód odznaczenia — do podpisu pod pozycją. */
  outlierReason?: string;
}

/**
 * Zamienia kandydatów w pozycje paczki — funkcja czysta.
 *
 * Kolejność decyzji ma znaczenie: najpierw odsiewamy to, czego w paczce
 * być nie powinno (duplikat okresu), potem oznaczamy to, co wymaga uwagi.
 */
export function buildBatchItems(
  candidates: readonly DraftCandidate[],
): BatchItemDecision[] {
  return candidates
    // Duplikat okresu nie trafia do paczki w ogóle. Pokazanie go jako
    // odznaczonej pozycji kusiłoby do zaznaczenia „skoro tu jest, to pewnie
    // trzeba" — a to kończy się dwiema fakturami za tę samą usługę.
    .filter((candidate) => !candidate.alreadyInvoicedThisPeriod)
    .slice(0, MAX_BATCH)
    .map((candidate) => {
      const deviation =
        candidate.typicalAmount > 0
          ? Math.abs(candidate.amount - candidate.typicalAmount) /
            candidate.typicalAmount
          : 0;

      const outlier = deviation > OUTLIER_THRESHOLD;

      return {
        id: candidate.profileId,
        contractorId: candidate.contractorId,
        label: candidate.contractorName,
        sublabel: outlier
          ? `Kwota odbiega od zwykłej o ${Math.round(deviation * 100)}% — otwórz i sprawdź`
          : `Termin ${candidate.paymentTermDays} dni`,
        amount: formatPlnPlain(candidate.amount),
        // SEDNO OBRONY: pozycja odstająca jest odznaczona i nie da się jej
        // zaznaczyć bez obejrzenia podglądu.
        preselected: !outlier,
        needsPreview: outlier,
        outlierReason: outlier
          ? `zwykle ${formatPlnPlain(candidate.typicalAmount)}`
          : undefined,
      };
    });
}

export function buildBatchProposal(input: {
  tenantId: string;
  items: readonly BatchItemDecision[];
  periodKey: string;
  now?: Date;
}): CreateProposalInput | null {
  const now = input.now ?? new Date();
  if (input.items.length === 0) return null;

  const flagged = input.items.filter((item) => item.needsPreview).length;

  return {
    tenantId: input.tenantId,
    kind: 'invoice.batch',
    topicKey: `invoice.batch:${input.periodKey}`,
    title:
      input.items.length === 1
        ? `Faktura dla ${input.items[0]!.label} gotowa`
        : `Przygotowałem ${input.items.length} faktur na nowy miesiąc`,
    body:
      flagged > 0
        ? `${flagged} z nich odbiega od tego, co zwykle wystawiasz — te są odznaczone, zaznaczysz je po obejrzeniu. Numery nadam dopiero przy wysyłce.`
        : 'Te same pozycje i kwoty co poprzednio. Numery nadam dopiero przy wysyłce.',
    fingerprint: fingerprintOf({
      period: input.periodKey,
      items: input.items.map((i) => `${i.id}:${i.amount}`).join('|'),
    }),
    // Szkice na nowy miesiąc tracą sens po tygodniu — wtedy klient i tak
    // wystawił je sam albo świadomie odpuścił.
    expiresAt: new Date(now.getTime() + 7 * 86_400_000),
    priority: 15,
    payload: {
      periodKey: input.periodKey,
      items: input.items,
      // Numer NIE jest tu przypisany i nie będzie. Nadaje go atomowo
      // wykonawca, w chwili wysyłki — inaczej odrzucone szkice zostawiałyby
      // dziury w numeracji, których nikt nie zauważy przez rok.
      numbersAssignedAtSend: true,
      primaryLabel: 'Wyślij zaznaczone',
    },
    evidence: [
      { label: 'Twoje faktury', href: '/invoices' },
      { label: 'Kontrahenci', href: '/contractors' },
    ],
  };
}

/**
 * Sprawdzenie tuż przed wysyłką — druga warstwa obrony przed duplikatem.
 *
 * Pierwsza jest przy budowaniu paczki, ta przy kliknięciu. Między jednym
 * a drugim mija zwykle kilka godzin, w których klient mógł wystawić fakturę
 * ręcznie — i wtedy pozycja z paczki jest już drugą fakturą za tę samą
 * usługę, w rejestrze państwowym.
 */
export function filterStillNeeded(
  items: readonly BatchItemDecision[],
  invoicedContractorIds: ReadonlySet<string>,
): { send: BatchItemDecision[]; skipped: BatchItemDecision[] } {
  const send: BatchItemDecision[] = [];
  const skipped: BatchItemDecision[] = [];

  for (const item of items) {
    if (invoicedContractorIds.has(item.contractorId)) {
      skipped.push(item);
    } else {
      send.push(item);
    }
  }

  return { send, skipped };
}

// ═══════════════════════════════════════════════════════════════
// P-03
// ═══════════════════════════════════════════════════════════════

/** Ile dni po typowym terminie agent pyta o brakującą fakturę. */
export const MISSING_AFTER_DAYS = 7;

export interface MissingInvoiceInput {
  profileId: string;
  contractorName: string;
  typicalDayOfMonth: number;
  typicalAmount: number;
  /** Czy pytanie o zakończenie współpracy już padło w życiu tego profilu. */
  endedAskedBefore: boolean;
  /** Ile cykli z rzędu klient odpowiedział „wystawiłem gdzie indziej". */
  elsewhereStreak: number;
}

export type MissingVerdict =
  | { kind: 'ask' }
  | { kind: 'ask_ended' }
  | { kind: 'silent'; reason: 'too_early' | 'already_asked' | 'invoices_elsewhere' };

/**
 * Czy pytać o brakującą fakturę — funkcja czysta.
 *
 * Trzy powody milczenia, każdy z innej awarii:
 * - za wcześnie: faktura bywa wystawiana z poślizgiem,
 * - pytanie o koniec współpracy już padło: agent przypominający co miesiąc
 *   o straconym kliencie to najgorszy możliwy sposób na zaczynanie dnia,
 * - klient fakturuje tę firmę gdzie indziej: dwa razy z rzędu to odpowiedź,
 *   nie zbieg okoliczności.
 */
export function shouldAskAboutMissing(
  input: MissingInvoiceInput,
  daysAfterTypical: number,
): MissingVerdict {
  if (input.elsewhereStreak >= 2) {
    return { kind: 'silent', reason: 'invoices_elsewhere' };
  }

  if (daysAfterTypical < MISSING_AFTER_DAYS) {
    return { kind: 'silent', reason: 'too_early' };
  }

  if (input.endedAskedBefore) {
    return { kind: 'silent', reason: 'already_asked' };
  }

  // Pytanie o zakończenie współpracy zadajemy RAZ W ŻYCIU PROFILU.
  return { kind: 'ask_ended' };
}

export function buildMissingInvoiceProposal(input: {
  tenantId: string;
  missing: MissingInvoiceInput;
  daysAfterTypical: number;
  now?: Date;
}): CreateProposalInput | null {
  const now = input.now ?? new Date();
  const verdict = shouldAskAboutMissing(input.missing, input.daysAfterTypical);
  if (verdict.kind === 'silent') return null;

  return {
    tenantId: input.tenantId,
    kind: 'invoice.draft',
    // Klucz BEZ okresu: pytanie o zakończenie współpracy ma paść raz
    // w życiu profilu, a nie co miesiąc.
    topicKey: `invoice.missing:${input.missing.profileId}`,
    title: `${input.missing.contractorName} — brak faktury w tym miesiącu`,
    // NIGDY „zapomniałeś". Klient mógł wystawić ją w innym programie, na
    // papierze albo przez biuro — a posądzanie go o niekompetencję przez
    // program, który po prostu nie wie wszystkiego, jest szczególnie
    // drażliwe u kogoś, kto dopiero zaczyna.
    body: `Zwykle fakturujesz ich około ${input.missing.typicalDayOfMonth}. dnia, na ${formatPlnPlain(input.missing.typicalAmount)}. Wystawiłeś ją gdzie indziej?`,
    fingerprint: fingerprintOf({
      profile: input.missing.profileId,
      days: input.daysAfterTypical,
    }),
    expiresAt: new Date(now.getTime() + 21 * 86_400_000),
    priority: 55,
    payload: {
      profileId: input.missing.profileId,
      // Trzeci przycisk. Bez niego klient musi wybrać między „wystaw"
      // a „nie teraz", z których żaden nie jest prawdą.
      secondary: [
        { label: 'Wystawiona poza FaktFlow', intent: 'dismiss' },
        { label: 'Skończyliśmy współpracę', intent: 'mute' },
      ],
      primaryLabel: 'Wystaw fakturę',
      // Ta karta NIE MA PRAWA do powiadomienia push ani do maila.
      // Przypomnienie o cudzej decyzji biznesowej, które dzwoni w telefonie
      // podczas urlopu, to nie pomoc, tylko natręctwo.
      noPush: true,
    },
    evidence: [
      { label: 'Historia faktur', href: '/invoices' },
    ],
  };
}
