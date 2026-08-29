/**
 * O-03 — podpowiadanie funkcji (krok 48 planu).
 *
 * Zamiast zakładki „Ustawienia”, w której nikt nie szuka — propozycja
 * W CHWILI BÓLU. Klient, który trzeci raz w miesiącu ma fakturę po terminie,
 * jest jedyną osobą, która naprawdę chce usłyszeć o gotowych treściach
 * ponagleń.
 *
 * TO JEST FUNKCJA O PROMIENIU RAŻENIA 1 — nietrafiona sugestia nie kosztuje
 * nic poza uwagą. Ale uwaga jest tu jedynym zasobem, jaki mamy, więc cztery
 * bezpieczniki pilnują, żeby jej nie przepalić:
 *
 * 1. NIGDY W TRAKCIE ROZPOCZĘTEGO PROCESU. Podpowiedź w środku wystawiania
 *    faktury nie jest pomocą, tylko przerwaniem. Wyłącznie w wątku, po
 *    zakończeniu czynności — bez okien i bez dymków.
 * 2. MAKSYMALNIE JEDNA PODPOWIEDŹ TYGODNIOWO. Agent, który co drugi dzień
 *    coś proponuje, to pasek reklamowy z lepszym tonem.
 * 3. FUNKCJA JUŻ UŻYWANA NIE JEST PODPOWIADANA. Sugerowanie komuś czegoś,
 *    co robi od miesiąca, jest dowodem, że program go nie ogląda.
 * 4. DWA ODRZUCENIA KASUJĄ TYP PODPOWIEDZI TRWALE. Nie na 90 dni jak przy
 *    zwykłym wyciszeniu — na zawsze. „Nie” powiedziane dwa razy o funkcji,
 *    której klient nie potrzebuje, jest odpowiedzią ostateczną.
 *
 * PIĄTA ZASADA, PRODUKTOWA: kanał obejmuje WYŁĄCZNIE funkcje dostępne
 * w planie klienta. Wątek FLO nie jest miejscem na sprzedaż.
 */

import { fingerprintOf } from '@/lib/flo/fingerprint';
import type { CreateProposalInput } from '@/lib/flo/proposals';

const DAY_MS = 86_400_000;

/** Odstęp między podpowiedziami. */
export const HINT_COOLDOWN_DAYS = 7;

/** Po tylu odrzuceniach typ podpowiedzi znika NA ZAWSZE. */
export const HINT_DISMISSALS_LIMIT = 2;

export type HintKey =
  | 'chase_templates'
  | 'receipt_photo'
  | 'accountant_package'
  | 'invoice_memory'
  | 'vat_limit'
  | 'foreign_mode'
  | 'expense_hunter';

export interface HintRule {
  key: HintKey;
  /** Funkcja z katalogu, do której prowadzi podpowiedź. */
  feature: string;
  title: string;
  body: string;
  href: string;
  /** Etykieta przycisku. */
  action: string;
}

/**
 * Tabela reguł z części II.10 planu.
 *
 * Kolejność ma znaczenie: gdy kilka sygnałów pali się naraz, wygrywa
 * pierwszy z listy. Na górze stoi licznik limitu VAT, bo to jedyna pozycja,
 * w której zwłoka kosztuje pieniądze, a nie wygodę.
 */
export const HINT_RULES: readonly HintRule[] = [
  {
    key: 'vat_limit',
    feature: 'T-02',
    title: 'Zbliżasz się do limitu zwolnienia z VAT',
    body: 'Mogę pilnować tego licznika i odezwać się, zanim go przekroczysz — po przekroczeniu jest już tylko rejestracja wstecz.',
    href: '/reports',
    action: 'Włącz licznik',
  },
  {
    key: 'chase_templates',
    feature: 'K-02',
    title: 'Trzecia faktura po terminie w tym miesiącu',
    body: 'Mogę przygotowywać treści ponagleń — Ty czytasz i klikasz wyślij.',
    href: '/payments/overdue',
    action: 'Pokaż, jak to działa',
  },
  {
    key: 'receipt_photo',
    feature: 'W-01',
    title: 'Piąty koszt wpisany ręcznie',
    body: 'Zdjęcie paragonu telefonem załatwia to w trzy sekundy. Aplikację da się dodać do ekranu głównego.',
    href: '/expenses',
    action: 'Pokaż jak',
  },
  {
    key: 'accountant_package',
    feature: 'B-01',
    title: 'Trzeci domknięty miesiąc bez paczki dla księgowej',
    body: 'Mogę składać paczkę pierwszego dnia miesiąca i wysyłać ją po Twoim kliknięciu.',
    href: '/settings/accountant',
    action: 'Ustaw paczkę',
  },
  {
    key: 'invoice_memory',
    feature: 'P-02',
    title: 'Druga faktura dla tego samego kontrahenta',
    body: 'Zapamiętam pozycje i kwoty — następnym razem szkic będzie czekał gotowy.',
    href: '/invoices',
    action: 'Zapamiętaj pozycje',
  },
  {
    key: 'foreign_mode',
    feature: 'P-09',
    title: 'Kontrahent z numerem VAT UE',
    body: 'Przy sprzedaży za granicę rozliczenie wygląda inaczej. Mogę pokazywać, co dana sytuacja zwykle oznacza.',
    href: '/contractors',
    action: 'Zobacz, co się zmienia',
  },
  {
    key: 'expense_hunter',
    feature: 'W-04',
    title: 'Miesiąc bez ani jednego kosztu',
    body: 'Koszt, którego nie wpiszesz, to zawyżony podatek. Mogę przypominać o dokumentach, których brakuje.',
    href: '/expenses',
    action: 'Włącz przypominanie',
  },
];

export function findHintRule(key: HintKey): HintRule | null {
  return HINT_RULES.find((rule) => rule.key === key) ?? null;
}

// ═══════════════════════════════════════════════════════════════
// Wybór podpowiedzi
// ═══════════════════════════════════════════════════════════════

export interface HintState {
  /** Funkcje, z których klient już korzysta (klucze z katalogu, np. „K-02”). */
  usedFeatures: readonly string[];
  /** Ile razy klient odrzucił każdą podpowiedź. */
  dismissals: Readonly<Partial<Record<HintKey, number>>>;
  /** Kiedy padła ostatnia podpowiedź; ISO. */
  lastHintAt: string | null;
  /** Funkcje dostępne w planie klienta. */
  availableFeatures: readonly string[];
  /** Czy klient jest w środku rozpoczętej czynności. */
  processInProgress: boolean;
}

export type HintSkip =
  | 'process_in_progress'
  | 'cooldown'
  | 'no_signal'
  | 'all_filtered';

export type HintVerdict =
  | { kind: 'hint'; rule: HintRule }
  | { kind: 'silent'; reason: HintSkip };

/**
 * Która podpowiedź (jeśli którakolwiek) — funkcja czysta.
 *
 * Kolejność sprawdzeń nie jest przypadkowa: najpierw odpadają powody, dla
 * których nie wolno odezwać się W OGÓLE (trwający proces, odstęp), potem
 * dopiero filtrujemy sygnały. Odwrotna kolejność zużywałaby tydzień limitu
 * na podpowiedź, której i tak nie wolno pokazać.
 */
export function pickHint(
  firingSignals: readonly HintKey[],
  state: HintState,
  today: Date,
): HintVerdict {
  // Podpowiedź w środku wystawiania faktury nie jest pomocą, tylko
  // przerwaniem.
  if (state.processInProgress) {
    return { kind: 'silent', reason: 'process_in_progress' };
  }

  if (state.lastHintAt) {
    const since = today.getTime() - Date.parse(state.lastHintAt);
    if (!Number.isNaN(since) && since < HINT_COOLDOWN_DAYS * DAY_MS) {
      return { kind: 'silent', reason: 'cooldown' };
    }
  }

  if (firingSignals.length === 0) return { kind: 'silent', reason: 'no_signal' };

  const firing = new Set(firingSignals);

  for (const rule of HINT_RULES) {
    if (!firing.has(rule.key)) continue;
    if (!isHintAllowed(rule, state)) continue;
    return { kind: 'hint', rule };
  }

  return { kind: 'silent', reason: 'all_filtered' };
}

/** Trzy filtry, każdy z innego powodu. */
export function isHintAllowed(rule: HintRule, state: HintState): boolean {
  // Sugerowanie komuś czegoś, co robi od miesiąca, jest dowodem, że program
  // go nie ogląda.
  if (state.usedFeatures.includes(rule.feature)) return false;

  // Dwa „nie" o tej samej funkcji to odpowiedź ostateczna — nie 90 dni
  // ciszy jak przy zwykłym wyciszeniu, tylko koniec.
  if ((state.dismissals[rule.key] ?? 0) >= HINT_DISMISSALS_LIMIT) return false;

  // Wątek FLO nie jest miejscem na sprzedaż.
  if (!state.availableFeatures.includes(rule.feature)) return false;

  return true;
}

// ═══════════════════════════════════════════════════════════════
// Propozycja
// ═══════════════════════════════════════════════════════════════

export function buildHintProposal(input: {
  tenantId: string;
  signals: readonly HintKey[];
  state: HintState;
  today: Date;
}): CreateProposalInput | null {
  const verdict = pickHint(input.signals, input.state, input.today);
  if (verdict.kind !== 'hint') return null;

  const { rule } = verdict;

  return {
    tenantId: input.tenantId,
    kind: 'feature.hint',
    // Klucz po rodzaju podpowiedzi, bez okresu: ta sama podpowiedź nie ma
    // wracać co miesiąc.
    topicKey: `feature.hint:${rule.key}`,
    title: rule.title,
    body: rule.body,
    fingerprint: fingerprintOf({ hint: rule.key }),
    // Podpowiedź żyje dwa tygodnie. Dłużej to już nie jest „w chwili bólu”.
    expiresAt: new Date(input.today.getTime() + 14 * DAY_MS),
    // NAJNIŻSZY PRIORYTET W WĄTKU. Gdy tego dnia jest cokolwiek pilnego,
    // podpowiedź czeka pod spodem.
    priority: 90,
    payload: {
      hintKey: rule.key,
      feature: rule.feature,
      // Podpowiedź niczego nie wykonuje — prowadzi do miejsca, w którym
      // klient zobaczy funkcję.
      primaryIntent: 'open',
      primaryLabel: rule.action,
      // Bez okien, bez dymków, bez powiadomień. Wyłącznie w wątku.
      noPush: true,
    },
    evidence: [{ label: 'Zobacz', href: rule.href }],
  };
}
