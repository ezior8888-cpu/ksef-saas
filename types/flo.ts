/**
 * Kontrakt danych agenta FLO — JEDYNE uzgodnienie między torem silnika
 * (Bartosz) a torem interfejsu (Masło).
 *
 * ZASADA ZAMROŻENIA: kształt tych typów jest niezmienny. Zmiany wyłącznie
 * przez DODANIE pola albo wariantu — nigdy przez zmianę lub usunięcie
 * istniejącego. Dzięki temu kod drugiej osoby nigdy nie przestaje się
 * kompilować i nie trzeba niczego uzgadniać.
 *
 * Pełny opis zachowania agenta: `FLO-PLAN-BARTOSZ.md` / `FLO-PLAN-MASLO.md`,
 * część II. Schemat tabel: część III.1.
 *
 * DWIE REGUŁY, KTÓRE WYNIKAJĄ Z TEGO PLIKU:
 *
 * 1. Interfejs NIGDY nie liczy ani nie formatuje liczb. Serwer przysyła
 *    gotowe napisy w `title`, `body`, `amount` i `total`. To jest ta sama
 *    zasada, która chroni przed halucynacją modelu (liczby liczy kod,
 *    nie model) — i przy okazji chroni przed dublowaniem pracy.
 *
 * 2. Interfejs nie wie, że istnieje funkcja P-04 czy T-02. Zna wyłącznie
 *    `FloProposalView` i sześć wariantów karty. Dzięki temu 33 funkcje
 *    agenta nie oznaczają 33 ekranów.
 */

// ═══════════════════════════════════════════════════════════════
// Rodzaje propozycji
// ═══════════════════════════════════════════════════════════════

/**
 * Wszystkie rodzaje propozycji. Nowe dopisujemy NA KOŃCU, nigdy nie zmieniamy
 * istniejących. Komentarz przy każdej pozycji wskazuje funkcję z katalogu
 * (część II.10 planu).
 *
 * Lista jest tablicą, a nie samym typem, bo potrzebujemy jej też w czasie
 * wykonania: do walidacji tego, co przyszło z bazy (kolumna `kind` jest
 * TEXT-em), i do testu kontraktowego sprawdzającego, że każdy rodzaj ma
 * przypisany wariant karty. Typ pozostaje identyczny dla wszystkich, którzy
 * go importują.
 */
export const FLO_PROPOSAL_KINDS = [
  'invoice.draft', // P-02 pojedynczy szkic, P-03
  'invoice.batch', // P-02 paczka
  'invoice.final', // P-07 faktura końcowa po zaliczce
  'invoice.raise', // P-04 podwyżka stawki
  'contractor.check', // P-08 ostrzeżenie o kontrahencie
  'contractor.foreign', // P-09 transakcja zagraniczna
  'payment.confirm', // K-01 „zapłacił?”
  'payment.chase', // K-02 ponaglenie
  'payment.score', // K-03 ocena kontrahenta
  'payment.interest', // K-05 odsetki
  'expense.review', // W-01, W-02 koszt do decyzji
  'expense.rule', // W-03 nauka reguły
  'expense.missing', // W-04 zgubiony dokument
  'ksef.status', // X-01 informacja o wysyłce
  'ksef.fix', // X-02 poprawka po odrzuceniu
  'ksef.cert', // X-03 certyfikat
  'ksef.outage', // X-04 awaria MF
  'ksef.audit', // X-05 audyt porządku
  'tax.deadline', // T-01
  'tax.limit', // T-02
  'tax.relief', // T-03
  'tax.simulate', // T-04 (zablokowane do opinii prawnej)
  'tax.setaside', // T-05
  'accountant.package', // B-01
  'accountant.format', // B-02
  'onboarding.step', // O-01
  'import.done', // O-02
  'feature.hint', // O-03
  'chat.draft', // O-04 szkic z rozmowy
  'wrapped.ready', // S-03
  'milestone.money', // S-04
] as const;

export type FloProposalKind = (typeof FLO_PROPOSAL_KINDS)[number];

/** Strażnik dla wartości przychodzących z bazy i z kolejki. */
export function isFloProposalKind(value: string): value is FloProposalKind {
  return (FLO_PROPOSAL_KINDS as readonly string[]).includes(value);
}

// ═══════════════════════════════════════════════════════════════
// Warianty karty
// ═══════════════════════════════════════════════════════════════

/**
 * Sześć wariantów karty. Interfejs implementuje SZEŚĆ komponentów, nie 33.
 *
 * - `info`    — sama informacja, brak akcji (X-01, X-04, potwierdzenia)
 * - `single`  — jedna akcja bez podglądu (W-01, O-03, X-03)
 * - `preview` — akcja wymagająca podglądu; wszystkie funkcje promienia 4
 * - `choice`  — wybór wariantu: tak / nie / trzecia opcja (K-01, W-03, P-03)
 * - `list`    — lista z zaznaczaniem (P-02 paczka, X-05 audyt)
 * - `input`   — pytanie o dane (B-01 mail księgowej, K-02 adres kontrahenta)
 */
export const FLO_CARD_VARIANTS = [
  'info',
  'single',
  'preview',
  'choice',
  'list',
  'input',
] as const;

export type FloCardVariant = (typeof FLO_CARD_VARIANTS)[number];

// ═══════════════════════════════════════════════════════════════
// Podglądy
// ═══════════════════════════════════════════════════════════════

/** Pozycja faktury w podglądzie — wszystkie kwoty jako gotowe napisy. */
export interface FloPreviewLine {
  name: string;
  qty: string;
  net: string;
  vat: string;
  gross: string;
}

/**
 * Cztery rodzaje podglądu. `message` jest edytowalny — treść po edycji
 * wraca do akcji zatwierdzającej i to ONA idzie do kontrahenta.
 */
export type FloPreview =
  | {
      type: 'invoice';
      invoiceId: string;
      lines: FloPreviewLine[];
      total: string;
      due: string;
    }
  | {
      type: 'message';
      to: string;
      subject: string;
      bodyText: string;
      editable: true;
    }
  | {
      type: 'diff';
      rows: { field: string; before: string; after: string }[];
    }
  | {
      type: 'file';
      label: string;
      href: string;
      sizeLabel: string;
    };

// ═══════════════════════════════════════════════════════════════
// Dowody i akcje
// ═══════════════════════════════════════════════════════════════

/**
 * „Dlaczego to widzę” — odnośnik do rekordu, z którego powstała propozycja.
 * Wymóg produktowy (zaufanie) i jednocześnie realizacja prawa do wyjaśnienia
 * przy profilowaniu.
 */
export interface FloEvidence {
  label: string;
  href: string;
}

export interface FloAction {
  label: string;
  /**
   * `correct` (dodane w kroku 37) — człowiek poprawia FAKT, na którym agent
   * oparł wniosek, a nie decyduje o działaniu. T-02 ma przycisk „to był
   * jednorazowy kontrakt”: nie odrzuca karty i nie wycisza rodzaju, tylko
   * mówi agentowi, żeby nie wyciągał trendu z tej jednej faktury. Bez
   * osobnego zamiaru trzeba by to wcisnąć w `dismiss`, a dwa odrzucenia
   * wyciszają rodzaj na 90 dni — czyli poprawienie agenta kończyłoby się
   * jego zamilknięciem.
   *
   * Interfejs rysuje `correct` jak zwykły przycisk drugorzędny i woła
   * `dismissProposal(id, 'not_now')` wraz z `payload.correction`.
   */
  intent: 'approve' | 'dismiss' | 'snooze' | 'mute' | 'input' | 'open' | 'correct';
  /**
   * true = wykonanie wymaga wcześniejszego otwarcia podglądu (promień 4).
   * Interfejs trzyma przycisk zablokowany, dopóki człowiek nie zobaczy,
   * co dokładnie poleci.
   */
  requiresPreview?: boolean;
  /** dla intent:'input' — o co pytamy */
  inputLabel?: string;
  inputKind?: 'email' | 'text' | 'amount';
}

// ═══════════════════════════════════════════════════════════════
// Propozycja — jedyny typ, który zna interfejs
// ═══════════════════════════════════════════════════════════════

/** Pozycja listy w wariancie `list` (paczka faktur, audyt porządku). */
export interface FloListItem {
  id: string;
  label: string;
  sublabel: string;
  /** Gotowy napis z kwotą, np. „22 140,00 zł”. Interfejs go nie przelicza. */
  amount: string;
  /** false = pozycja odstająca; odznaczona i wymaga obejrzenia podglądu */
  preselected: boolean;
  needsPreview: boolean;
}

/**
 * JEDYNY typ, który zna interfejs. Silnik gwarantuje, że to zawsze wystarczy
 * do wyrenderowania karty — niezależnie od tego, która z 33 funkcji ją
 * wyprodukowała.
 */
export interface FloProposalView {
  id: string;
  kind: FloProposalKind;
  variant: FloCardVariant;
  /** Liczby JUŻ podstawione przez serwer. */
  title: string;
  body: string;
  evidence: FloEvidence[];
  primary: FloAction;
  secondary: FloAction[];
  preview?: FloPreview;
  /** dla variant:'list' */
  items?: FloListItem[];
  /** ISO 8601 */
  expiresAt: string;
  /** 0 = najpilniejsze */
  priority: number;
  /** ISO 8601 */
  createdAt: string;
  /**
   * Ustawione, gdy FLO zrobił coś sam (czynność odwracalna wewnątrz konta).
   * Do tego momentu karta pokazuje pasek „cofnij”. ISO 8601, zwykle +10 min.
   */
  undoableUntil?: string;
}

// ═══════════════════════════════════════════════════════════════
// Panel „Zatwierdzone — czeka na wykonanie”
// ═══════════════════════════════════════════════════════════════

/**
 * Wpis w panelu zatwierdzonych.
 *
 * INWARIANT: do tego panelu trafia WYŁĄCZNIE to, co człowiek już zatwierdził
 * kliknięciem. `approvedAtLabel` jest obowiązkowe — przy reklamacji „ja tego
 * nie wysyłałem” klient musi widzieć ślad swojej zgody. Pozycja bez tego
 * pola oznacza błąd silnika.
 *
 * „Wstrzymaj” jest hamulcem bezpieczeństwa na coś, na co klient już się
 * zgodził — nigdy mechanizmem zgody.
 */
export interface FloScheduledView {
  id: string;
  /** np. „Faktura ACME → KSeF” */
  label: string;
  /** np. „jutro, 08:00” */
  whenLabel: string;
  /** np. „zatwierdzone dziś 11:42” */
  approvedAtLabel: string;
  /** np. „Wstrzymaj” */
  cancelLabel: string;
}

// ═══════════════════════════════════════════════════════════════
// Preferencje
// ═══════════════════════════════════════════════════════════════

/**
 * Profil podatkowy — warunek konieczny całej grupy T (terminy i podatki).
 * Bez niego funkcje podatkowe MILCZĄ, zamiast zgadywać.
 */
export interface FloTaxProfile {
  /** forma opodatkowania */
  form: 'skala' | 'liniowy' | 'ryczalt' | 'nieznana';
  /** czy podatnik VAT czynny */
  vat: boolean;
  /** okres rozliczeniowy: miesięczny / kwartalny */
  period: 'M' | 'K';
  /** data rozpoczęcia działalności, ISO (YYYY-MM-DD) */
  startedOn: string | null;
}

/**
 * Ustawienia agenta.
 *
 * UWAGA: NIE MA TU I NIE BĘDZIE POZIOMU AUTONOMII, TRYBU ANI SUWAKA
 * „JAK BARDZO SAMODZIELNY”. Zachowanie agenta jest identyczne u każdego
 * klienta (część II.3 planu): czynności odwracalne wewnątrz konta FLO robi
 * sam z możliwością cofnięcia, wszystko nieodwracalne i wychodzące na
 * zewnątrz wymaga kliknięcia — zawsze, bez wyjątku i bez możliwości
 * wyłączenia.
 */
export interface FloPrefs {
  pushEnabled: boolean;
  emailEnabled: boolean;
  /** „21:00” */
  quietFrom: string;
  /** „07:30” */
  quietTo: string;
  /** wyciszone rodzaje spraw — po dwóch odrzuceniach dopisywane automatycznie */
  mutedKinds: FloProposalKind[];
  taxProfile: FloTaxProfile | null;
}

// ═══════════════════════════════════════════════════════════════
// Wynik zatwierdzenia
// ═══════════════════════════════════════════════════════════════

/**
 * Odmowa wykonania NIE JEST AWARIĄ — to normalna, oczekiwana sytuacja:
 *
 * - `stale`   — dane zmieniły się między propozycją a kliknięciem
 *               (np. kontrahent zapłacił). Mechanizm re-walidacji.
 * - `expired` — propozycja przekroczyła termin ważności.
 * - `blocked` — warunek techniczny niespełniony (np. brak certyfikatu KSeF).
 *
 * Interfejs pokazuje `message` spokojnym tonem i odświeża listę.
 * NIGDY czerwonym komunikatem o błędzie.
 */
export type FloApproveResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'stale' | 'expired' | 'blocked';
      message: string;
    };

/** Dane wejściowe zatwierdzenia — dla wariantów `input` i `list`. */
export interface FloApproveInput {
  /** wariant `input`: wpisana wartość (np. adres e-mail księgowej) */
  value?: string;
  /** wariant `list`: identyfikatory zaznaczonych pozycji */
  selectedIds?: string[];
  /** wariant `preview` typu `message`: treść po edycji przez człowieka */
  editedBody?: string;
}

/** Sposób odrzucenia propozycji. */
export type FloDismissMode = 'not_now' | 'never';
