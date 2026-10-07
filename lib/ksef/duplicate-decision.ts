/**
 * Decyzja klienta przy nierozstrzygniętym duplikacie 440 (D-A4-1b-3 PR B, plan
 * „zero zgubionych faktur”; decyzje Bartosza 04.10 i 07.10.2026). KSeF ma już
 * fakturę tej firmy o numerze naszego dokumentu (K), a automat nie rozstrzygnął,
 * czy to ta sama sprzedaż. Właściciel albo administrator firmy (albo operator
 * na jego prośbę) zapisuje: „ta sama sprzedaż” albo „inna sprzedaż”. Obie
 * decyzje wycofują nasz dokument: zostaje szkicem, którego nie wyślesz do KSeF
 * (wyzwalacze 00148), a zwykłej faktury i zaliczki nie usuniesz (decyzja 9).
 *
 * Tu: czysta polityka (lustro `ksef_duplicate_check_allows`
 * i `ksef_duplicate_decision_blocker` z 00148), widok panelu, baner szkicu
 * wycofanego każdego rodzaju i wszystkie teksty klienta. RPC sprawdza to samo
 * po stronie bazy — ta polityka jest pierwszą linią, nie jedyną.
 *
 * Teksty: przegląd prawnika przed KSeF PROD — decyzje Bartosza 07.10.2026 (A)
 * i (8); TEST bez blokady; obejmuje teksty RPC i wyzwalaczy 00148
 * (DUPLICATE_DECISION_SQL_TEXTS). Migawka do przeglądu:
 * `tests/unit/__snapshots__/ksef-duplikat-decyzja-teksty.txt`.
 *
 * CZYSTY moduł (importowany w komponentach klienckich i w workerze): bez bazy,
 * KSeF i Node. Nie importuje `duplicate-verdict.ts` (`node:crypto`).
 */

import { formatWarsawDateTime } from '@/lib/format/warsaw-date';
import {
  KSEF_SEND_MESSAGES,
  KSEF_SPECIAL_SEND_MESSAGES,
  SPECIAL_KIND_LABEL,
  specialKindOf,
} from '@/lib/invoices/ksef-send-policy';
import type { KsefEnvironment } from '@/types/ksef';

import {
  DUPLICATE_ORIGINAL_NOTES,
  type DuplicateDecisionChoice,
  type DuplicateDecisionVia,
} from './duplicate-check';
import { isCorrectionHeldForEnv } from './kind-holds';

/**
 * `<SystemInfo>` plików FaktFlow — ta sama wartość co `FAKTFLOW_SYSTEM_INFO`
 * w `duplicate-verdict.ts` (tamten moduł ciągnie `node:crypto`, więc nie do
 * komponentu); generatory przypina `ksef-duplikat-werdykt.test.ts`.
 */
const FAKTFLOW_SYSTEM_INFO = 'KSeF SaaS v1.0';

export type DuplicateChoice = DuplicateDecisionChoice;
export type DuplicateVia = DuplicateDecisionVia;
/** Powody, dla których klient decyduje w PR B (PR C dopisze `faktflow-original`). */
export type DuplicateDecisionReason = 'no-own-file' | 'known-number';

/** Kody blokady SQL (2.1.2, w tej kolejności) i odmowy aplikacji (środowisko, rola). */
export type DuplicateDecisionRefusal =
  | 'not-found'
  | 'not-pending'
  | 'in-ksef'
  | 'kind'
  | 'billing'
  | 'offline'
  | 'no-marker'
  | 'conflicting-originals'
  | 'no-check'
  | 'reason'
  | 'known-stale'
  | 'own-history'
  | 'payments'
  | 'env-unknown'
  | 'env'
  | 'role';

// ─── Fakty (kształt wierszy ładowarki `loadDuplicateDecisionFacts`) ──────────

/** Wiersz faktury — kolumny `DUPLICATE_DECISION_INVOICE_COLUMNS` (`duplicate-decision-facts.ts`). */
export interface DuplicateDecisionInvoiceRow {
  id: string;
  tenant_id: string;
  internal_number: string | null;
  direction: string | null;
  ksef_status: string | null;
  last_error_code: string | null;
  ksef_number: string | null;
  invoice_kind: string | null;
  stripe_invoice_id: string | null;
  offline_idempotency_key: string | null;
  offline_qr_offline: string | null;
  offline_qr_certyfikat: string | null;
  /** `numeric` — PostgREST zwraca liczbę, ale napis też przyjmujemy. */
  paid_amount: number | string | null;
  issue_date: string | null;
  buyer_nip: string | null;
  buyer_data: unknown;
  gross_total: number | string | null;
  currency: string | null;
}

/** Wpis `ksef_submissions` (wszystkie stany) z surowym `original_check` (jsonb). */
export interface DuplicateDecisionSubmissionRow {
  id: string;
  status: string;
  session_reference_number: string | null;
  request_payload_hash: string | null;
  response_ksef_number: string | null;
  original_ksef_number: string | null;
  original_session_reference_number: string | null;
  original_check: unknown;
  attempted_at: string | null;
  completed_at: string | null;
}

/** Faktura Y (`known-number`) odczytana przez ładowarkę. */
export interface DuplicateDecisionKnownInvoice {
  id: string;
  internalNumber: string | null;
  /** Y wychodząca, przyjęta w KSeF, z numerem KSeF oryginału i inna niż X (2.1.2 #11, uwaga 1 sprawdzenia). */
  holdsOriginal: boolean;
}

export interface DuplicateDecisionFacts {
  /** `null` — faktury nie ma w tej firmie (`not-found`). */
  invoice: DuplicateDecisionInvoiceRow | null;
  submissions: DuplicateDecisionSubmissionRow[];
  knownInvoice: DuplicateDecisionKnownInvoice | null;
}

// ─── Widoki ──────────────────────────────────────────────────────────────

export interface ComparisonRow {
  label: string;
  /** Wartość z faktury w KSeF (`original_check.summary`). */
  ksef: string | null;
  /** Wartość z tego dokumentu w FaktFlow. */
  ours: string | null;
  /** `null` — bez porównania (wartość nieznana, inna waluta, program). */
  same: boolean | null;
}

/**
 * Dane do tekstu operatora przy odmowie (2.11.D: `paid_amount {x}`, środowiska,
 * `{Y}`/`{K}` przy known-stale, `{r}` przy powodzie). Tylko w widoku operatora
 * (`actor: 'operator'`) — widok klienta ich nie niesie.
 */
export interface DuplicateRefusalDetail {
  /** K ze znacznika (`null` bez znacznika). */
  originalKsefNumber: string | null;
  /** Surowy `original_check.reason` znacznika. */
  reason: string | null;
  /** `original_check.env` znacznika. */
  checkEnv: string | null;
  /** `KSEF_ENV` aplikacji. */
  environment: KsefEnvironment | null;
  paidAmount: number | null;
  /** `{Y}` — numer dokumentu, który ma K w FaktFlow (`bez numeru`, gdy nieznany); `null` poza known-number. */
  knownInvoiceNumber: string | null;
}

export type DuplicateDecisionView =
  | {
      kind: 'decidable';
      reason: DuplicateDecisionReason;
      invoiceNumber: string | null;
      originalKsefNumber: string;
      originalSha256: string;
      comparison: ComparisonRow[];
      /** Treść pozycji zgodna z oryginałem poza nagłówkiem; `null` — nie porównano (brak naszego pliku). */
      sameContent: boolean | null;
      /** Wybór wymaga pola „Rozumiem skutki” (decyzje 7 i 12; sprawdza też serwer). */
      needsConfirmation: Record<DuplicateChoice, boolean>;
      /** `FaktFlow`, nazwa programu z `SystemInfo` albo `null` (nieznany). */
      program: string | null;
      knownInvoice: { id: string; internalNumber: string | null } | null;
      /** Korekty do KSeF wstrzymane w tym środowisku (zdanie w dialogu „inna sprzedaż”). */
      heldCorrections: boolean;
    }
  | {
      kind: 'refused';
      refusal: DuplicateDecisionRefusal;
      /** Tekst 2.11.A dla dokumentu; `null` (powód `reason`) = notatka PR A z karty. */
      message: string | null;
      detail?: DuplicateRefusalDetail;
    }
  | { kind: 'decided'; choice: DuplicateChoice; via: DuplicateVia; at: string; originalKsefNumber: string | null };

export interface RetiredDraftView {
  title: string;
  body: string;
  /** Jedyny przycisk banera; `null` — zwykła „ta sama sprzedaż”, korekta, faktura rozliczeniowa. */
  cta: { href: string; label: string } | null;
  /** Dokument Y przy decyzji „ta sama sprzedaż” z powodem known-number. */
  knownInvoice: { id: string; internalNumber: string | null } | null;
  /** Odmowa wysyłki — ten sam tekst co wyzwalacz `c_guard_ksef_retired_draft`. */
  sendRefusal: string | null;
  /** Korekta i faktura rozliczeniowa (decyzja 9) — jak `WHEN` wyzwalacza usuwania. */
  deletable: boolean;
  /** Odmowa usunięcia (zwykła, zaliczka) — tekst wyzwalacza `c_guard_ksef_retired_draft_delete`. */
  deleteRefusal: string | null;
}

// ─── Teksty SQL (00148, 2.11.A) ──────────────────────────────────────────────

export type DuplicateDecisionSqlTextKey =
  | 'NOTE'
  | 'ROLE'
  | 'ALREADY'
  | 'IN_FLIGHT'
  | 'not-pending'
  | 'in-ksef'
  | 'kind'
  | 'billing'
  | 'offline'
  | 'no-marker'
  | 'conflicting-originals'
  | 'no-check'
  | 'reason'
  | 'known-stale'
  | 'own-history'
  | 'payments'
  | 'STALE'
  | 'ENV'
  | 'EVIDENCE'
  | 'TRIGGER_SAME'
  | 'TRIGGER_OTHER'
  | 'TRIGGER_AUTO'
  | 'TRIGGER_DELETE'
  | 'TRIGGER_RENUMBER'
  | 'CATALOG_NUMBER_TAKEN';

export interface DuplicateDecisionSqlText {
  /** Wzorzec `RAISE EXCEPTION '<wzorzec>', args…` — `%` to znacznik RAISE (C1). */
  template: string;
  /** Liczba `%` = liczba argumentów RAISE. */
  arity: number;
}

/**
 * Lustro komunikatów 00148 słowo w słowo (`RAISE EXCEPTION '<template>', … USING
 * ERRCODE`; CATALOG to literał UPDATE katalogu `ksef_error_codes`). Żaden wzorzec
 * nie ma dosłownego `%` ani apostrofu. Kolejność argumentów — sekcja 2.11.A
 * specyfikacji: known-stale i own-history (K, nr); ENV (K, etykieta środowiska
 * sprawdzenia, etykieta środowiska aplikacji, nr); ALREADY (nr, zapisany wybór);
 * TRIGGER_AUTO (nr, „fakturę {K}” / „inną fakturę Twojej firmy”); TRIGGER_DELETE
 * i TRIGGER_RENUMBER (nr, „faktura {K}” / „inna faktura Twojej firmy”).
 * Test U16e sprawdza, że każdy wzorzec stoi w 00148 zaraz po `RAISE EXCEPTION '`.
 */
export const DUPLICATE_DECISION_SQL_TEXTS: Readonly<Record<DuplicateDecisionSqlTextKey, DuplicateDecisionSqlText>> = {
  NOTE: { template: 'Zapisując decyzję klienta, opisz w notatce kanał, datę i osobę (co najmniej 10 znaków).', arity: 0 },
  ROLE: { template: 'Decyzję w sprawie dokumentu, którego numer jest zajęty w KSeF, zapisuje właściciel albo administrator firmy.', arity: 0 },
  ALREADY: { template: 'Decyzja dla dokumentu % jest już zapisana („%”). Jeśli była błędna, napisz do nas: pomoc@faktflow.pl, podając numer dokumentu.', arity: 2 },
  IN_FLIGHT: { template: 'Sprawdzamy dokument % w KSeF — odśwież stronę za kilka minut.', arity: 1 },
  'not-pending': { template: 'Dokument % nie czeka już na Twoją decyzję — odśwież stronę.', arity: 1 },
  'in-ksef': { template: 'Dokument % ma już numer KSeF — decyzja nie jest potrzebna. Odśwież stronę; jeśli komunikat wraca, napisz do nas: pomoc@faktflow.pl.', arity: 1 },
  kind: { template: 'Dokument % to korekta, faktura zaliczkowa albo rozliczeniowa — tej decyzji nie zapiszesz jeszcze w FaktFlow. Nie wystawiaj go ponownie i napisz do nas: pomoc@faktflow.pl, podając numer dokumentu.', arity: 1 },
  billing: { template: 'Dokument % to faktura abonamentu FaktFlow — decyzję zapisuje pomoc FaktFlow.', arity: 1 },
  offline: { template: 'Dokument % był wystawiony w trybie offline i mógł już trafić do nabywcy — tej decyzji nie zapiszesz w FaktFlow. Nie wystawiaj go ponownie i napisz do nas: pomoc@faktflow.pl, podając numer dokumentu.', arity: 1 },
  'no-marker': { template: 'Dla dokumentu % nie mamy zapisanej odpowiedzi KSeF o fakturze z tym numerem — tej decyzji nie zapiszesz w FaktFlow. Nie wystawiaj go ponownie i napisz do nas: pomoc@faktflow.pl, podając numer dokumentu.', arity: 1 },
  'conflicting-originals': { template: 'W historii dokumentu % są odpowiedzi KSeF o dwóch różnych fakturach — tej decyzji nie zapiszesz w FaktFlow. Nie wystawiaj go ponownie i napisz do nas: pomoc@faktflow.pl, podając numer dokumentu.', arity: 1 },
  'no-check': { template: 'Dla dokumentu % nie mamy jeszcze danych faktury z KSeF — sprawdzimy ją ponownie automatycznie (zwykle w ciągu 2 dni). Nie wystawiaj go ponownie.', arity: 1 },
  reason: { template: 'Dla dokumentu % ta decyzja nie jest dostępna w panelu. Nie wystawiaj go ponownie; szczegóły są na karcie faktury, a pytania: pomoc@faktflow.pl.', arity: 1 },
  'known-stale': { template: 'Dokument w FaktFlow, który ma albo miał numer KSeF %, nie zgadza się już z naszym zapisem — sprawdzimy fakturę w KSeF ponownie automatycznie (zwykle w ciągu 2 dni). Jeśli ten komunikat zostanie dłużej, napisz do nas: pomoc@faktflow.pl. Nie wystawiaj dokumentu % ponownie.', arity: 2 },
  'own-history': { template: 'Faktura % w KSeF może być wcześniejszą wersją dokumentu % wysłaną z FaktFlow — tej decyzji nie zapiszesz w panelu. Nie wystawiaj go ponownie i napisz do nas: pomoc@faktflow.pl, podając numer dokumentu.', arity: 2 },
  payments: { template: 'Na dokumencie % są zapisane wpłaty — decyzji nie zapiszemy, dopóki wpłaty są przy tym dokumencie. W FaktFlow nie zmienisz ich sam: napisz do nas: pomoc@faktflow.pl, podając numer dokumentu — ustalimy, przy której fakturze je zapisać. Nie wystawiaj go ponownie.', arity: 1 },
  STALE: { template: 'Dane faktury w KSeF dla dokumentu % zmieniły się od otwarcia strony — odśwież stronę i zdecyduj jeszcze raz.', arity: 1 },
  ENV: { template: 'Dane faktury % sprawdziliśmy w środowisku KSeF „%”, a FaktFlow pracuje teraz w środowisku „%” — tej decyzji nie zapiszesz. Nie wystawiaj dokumentu % ponownie i napisz do nas: pomoc@faktflow.pl.', arity: 4 },
  EVIDENCE: { template: 'Dokument % mógł dotrzeć do KSeF w innej próbie — decyzji nie zapiszemy. Nie wystawiaj go ponownie i napisz do nas: pomoc@faktflow.pl.', arity: 1 },
  TRIGGER_SAME: { template: 'Dokument % jest wycofany: to ta sama sprzedaż co faktura % w KSeF. Tego dokumentu nie wyślesz do KSeF.', arity: 2 },
  TRIGGER_OTHER: { template: 'Dokument % jest wycofany: numer jest zajęty w KSeF przez fakturę %. Tego dokumentu nie wyślesz do KSeF — tę sprzedaż wystaw jako nową fakturę z nowym numerem.', arity: 2 },
  TRIGGER_AUTO: { template: 'Numer % jest zajęty w KSeF przez % wystawioną poza FaktFlow — tego dokumentu nie wyślesz do KSeF (KSeF odrzuciłby go jako duplikat). Jeśli to inna sprzedaż, wystaw ją jako nową fakturę z nowym numerem.', arity: 2 },
  TRIGGER_DELETE: { template: 'Wycofanego dokumentu % nie usuniesz: zajmuje numer, który w KSeF ma już %, i zostaje w FaktFlow, żeby ten numer nie został podpowiedziany ponownie. Jeśli musisz go usunąć, napisz do nas: pomoc@faktflow.pl.', arity: 2 },
  TRIGGER_RENUMBER: { template: 'Numeru wycofanego dokumentu % nie zmienisz: ten numer ma w KSeF już %, a dokument zostaje z nim w FaktFlow, żeby numer nie został podpowiedziany ponownie. Inną sprzedaż wystaw jako nową fakturę z nowym numerem.', arity: 2 },
  CATALOG_NUMBER_TAKEN: { template: 'W KSeF jest już faktura Twojej firmy o tym numerze, wystawiona w innym programie. Tego dokumentu nie wyślesz do KSeF. Jeśli to ta sama sprzedaż — nie wystawiaj jej ponownie. Jeśli inna — wystaw ją jako nową fakturę z nowym numerem.', arity: 0 },
};

/**
 * Wypełnia wzorzec RAISE jak Postgres: każdy `%` po kolei, od lewej. Rzuca, gdy
 * liczba `%` różni się od liczby argumentów — straż przed rozjazdem z 00148 (C1).
 * Znaki `%` w argumentach nie są podstawiane.
 */
export function fillSqlText(template: string, ...args: string[]): string {
  const parts = template.split('%');
  if (parts.length - 1 !== args.length) {
    throw new Error(`fillSqlText: wzorzec ma ${parts.length - 1} znaczników %, podano ${args.length} argumentów`);
  }
  return parts.reduce((out, part, i) => out + part + (i < args.length ? args[i] : ''), '');
}

const sqlText = (key: DuplicateDecisionSqlTextKey, ...args: string[]): string =>
  fillSqlText(DUPLICATE_DECISION_SQL_TEXTS[key].template, ...args);

/** `v_num` w SQL: numer dokumentu albo „(bez numeru)”. */
const documentNumber = (invoiceNumber: string | null | undefined): string => invoiceNumber ?? '(bez numeru)';

/** Etykieta środowiska w tekście ENV (jak w RPC). */
export function duplicateEnvLabel(env: unknown): string {
  switch (env) {
    case 'test':
      return 'testowe';
    case 'production':
      return 'produkcyjne';
    case 'demo':
      return 'demo';
    default:
      return 'nieznane';
  }
}

// ─── Teksty klienta (2.11.B–C) ───────────────────────────────────────────────

/** `{program}` w bierniku (2.11): FaktFlow, inny znany program albo nieznany (każdy plik FaktFlow ma SystemInfo). */
export function programAccusative(program: string | null): string {
  if (program === 'FaktFlow') return DUPLICATE_DECISION_TEXTS.PROGRAM_ACCUSATIVE.FAKTFLOW;
  return program ? DUPLICATE_DECISION_TEXTS.PROGRAM_ACCUSATIVE.OTHER(program) : DUPLICATE_DECISION_TEXTS.PROGRAM_ACCUSATIVE.UNKNOWN;
}

/** `{programN}` w mianowniku. */
export function programNominative(program: string | null): string {
  if (program === 'FaktFlow') return DUPLICATE_DECISION_TEXTS.PROGRAM_NOMINATIVE.FAKTFLOW;
  return program ? DUPLICATE_DECISION_TEXTS.PROGRAM_NOMINATIVE.OTHER(program) : DUPLICATE_DECISION_TEXTS.PROGRAM_NOMINATIVE.UNKNOWN;
}

/** ` (numer KSeF {K})` — pomijane, gdy wpisy nie niosą numeru oryginału. */
const ksefNumberPart = (k: string | null): string => (k ? ` (numer KSeF ${k})` : '');

const S = KSEF_SPECIAL_SEND_MESSAGES;

/**
 * Wszystkie teksty klienta decyzji przy 440 i szkicu wycofanego (2.11.B–C).
 * Argumenty pozycyjne (napisy), żeby migawka dla prawnika pokazała całe zdania
 * ze znacznikami: `{nr}` numer dokumentu, `{K}` numer KSeF oryginału, `{nrK}`
 * numer faktury z KSeF (`summary.number ?? {nr}`), `{Y}` numer dokumentu, który
 * ma K w FaktFlow, `{X}` program. Odmowy z bazy (P0001) są w
 * `DUPLICATE_DECISION_SQL_TEXTS`. Teksty operatora (2.11.D) — poza przeglądem,
 * w `lib/admin/ksef-operator-policy.ts`.
 */
export const DUPLICATE_DECISION_TEXTS = {
  // Panel decyzji na karcie faktury.
  INTRO: (nr: string, k: string, program: string | null) =>
    `KSeF nie przyjął dokumentu ${nr}, bo ma już fakturę Twojej firmy o tym numerze (numer KSeF ${k}), ${programAccusative(program)}. Faktura w KSeF jest wiążąca — nie da się jej usunąć ani zastąpić. Porównaj dane i zdecyduj, czym jest ten dokument.`,
  PROGRAM_ACCUSATIVE: {
    FAKTFLOW: 'wystawioną w FaktFlow',
    OTHER: (x: string) => `wystawioną w programie „${x}”`,
    UNKNOWN: 'wystawioną poza FaktFlow',
  },
  PROGRAM_NOMINATIVE: {
    FAKTFLOW: 'wystawiona w FaktFlow',
    OTHER: (x: string) => `wystawiona w programie „${x}”`,
    UNKNOWN: 'wystawiona poza FaktFlow',
  },
  /** Linia treści: `sameContent` null / true / false. */
  NO_OWN_FILE: 'Treści pozycji nie porównaliśmy — FaktFlow nie ma pliku tej próby wysyłki.',
  CONTENT_SAME: 'Treść pozycji jest taka sama jak w fakturze w KSeF — różni się tylko nagłówek pliku.',
  CONTENT_DIFFERENT: 'Treść pozycji różni się od faktury w KSeF.',
  KNOWN_NUMBER_LINE: (k: string, y: string, nr: string) =>
    `W FaktFlow numer KSeF ${k} ma już dokument ${y}. Twoja decyzja dotyczy tylko dokumentu ${nr}; jeśli dane dokumentu ${y} nie zgadzają się z fakturą w KSeF, napisz do nas: pomoc@faktflow.pl, podając oba numery.`,
  /** Odnośnik do dokumentu Y (`/invoices/{Y.id}`) — panel, baner, notatka. */
  KNOWN_LINK: DUPLICATE_ORIGINAL_NOTES.KNOWN_LINK,
  COLUMN_KSEF: 'W KSeF',
  COLUMN_OURS: 'Ten dokument',
  DIFFERS: 'różni się',
  ROW_LABELS: {
    number: 'Numer faktury',
    issueDate: 'Data wystawienia',
    buyer: 'Nabywca',
    buyerNip: 'NIP nabywcy',
    gross: 'Kwota brutto',
    program: 'Program',
  },
  BUTTON_SAME: 'To ta sama sprzedaż',
  BUTTON_OTHER: 'To inna sprzedaż',
  SUPPORT: (nr: string) =>
    `Nie wiesz, co wybrać? Napisz do nas: pomoc@faktflow.pl, podając numer ${nr}. Do tego czasu nie wystawiaj tej faktury ponownie.`,

  DIALOG_SAME: {
    TITLE: 'To ta sama sprzedaż?',
    LINE_1: (nrK: string, k: string, program: string | null) =>
      `Fakturą tej sprzedaży zostaje faktura ${nrK} z KSeF (numer KSeF ${k}), ${programNominative(program)} — tam ją rozliczasz i korygujesz.`,
    LINE_1_KNOWN: (nrK: string, k: string, y: string) =>
      `Fakturą tej sprzedaży zostaje faktura ${nrK} z KSeF (numer KSeF ${k}) — w FaktFlow ma ją dokument ${y}.`,
    LINE_2: (nr: string) =>
      `Dokument ${nr} w FaktFlow zostanie wycofany: zostanie jako szkic, którego nie wyślesz do KSeF ani nie usuniesz.`,
    LINE_3: (k: string) =>
      `FaktFlow nie ujmie faktury ${k} w JPK ani w KPiR — jeśli składasz je z FaktFlow, uwzględnij ją osobno.`,
    LINE_3_KNOWN: (nr: string, k: string, y: string) =>
      `Dokument ${nr} nie trafi do JPK ani do KPiR w FaktFlow. Fakturę ${k} FaktFlow zna jako dokument ${y} — sprawdź, czy jego dane zgadzają się z danymi z KSeF w tabeli; jeśli nie, napisz do nas: pomoc@faktflow.pl, podając oba numery.`,
    LINE_4: 'Jeśli to jednak inna sprzedaż, zostanie bez faktury — wystaw ją wtedy jako nową fakturę z nowym numerem.',
    /** Pole wymagane, gdy `needsConfirmation.same_sale` (C5). */
    CHECKBOX: (k: string, nr: string) =>
      `Rozumiem skutki: faktura ${k} w KSeF dokumentuje tę samą sprzedaż co dokument ${nr}, mimo różnic zaznaczonych w tabeli.`,
    CONFIRM_BUTTON: 'Zapisz: ta sama sprzedaż',
  },
  DIALOG_OTHER: {
    TITLE: 'To inna sprzedaż?',
    LINE_1: (nr: string, k: string) =>
      `Numer ${nr} jest zajęty w KSeF przez fakturę ${k}. Dokument ${nr} w FaktFlow zostanie wycofany: zostanie jako szkic, którego nie wyślesz do KSeF ani nie usuniesz.`,
    LINE_2: 'Tę sprzedaż wystawisz jako nową fakturę — z nowym numerem i dzisiejszą datą.',
    LINE_3: 'Jeśli to jednak ta sama sprzedaż, powstaną dwie faktury, a VAT z obu trzeba będzie wykazać, dopóki jednej z nich nie skorygujesz do zera.',
    /** Dopisek do LINE_3 tylko przy `heldCorrections` (KSeF produkcyjny). */
    LINE_3_HELD: ' Korekty do produkcyjnego KSeF są teraz wstrzymane przez FaktFlow.',
    /** Program znany (`{X}`). */
    LINE_4: (k: string, x: string) => `FaktFlow nie ujmuje faktury ${k} w JPK ani w KPiR — rozliczasz ją w programie „${x}”.`,
    /** Program nieznany (`program` null). */
    LINE_4_UNKNOWN_PROGRAM: (k: string) =>
      `FaktFlow nie ujmuje faktury ${k} w JPK ani w KPiR — rozliczasz ją tam, gdzie ją wystawiono.`,
    LINE_4_KNOWN: (k: string, y: string) =>
      `Fakturę ${k} FaktFlow zna jako dokument ${y} — sprawdź, czy jego dane zgadzają się z danymi z KSeF w tabeli; jeśli nie, napisz do nas: pomoc@faktflow.pl, podając oba numery.`,
    /** Pole wymagane, gdy `needsConfirmation.other_sale` (C5). */
    CHECKBOX: (k: string, nr: string) => `Rozumiem skutki: faktura ${k} w KSeF dokumentuje inną sprzedaż niż dokument ${nr}.`,
    CONFIRM_BUTTON: 'Zapisz: inna sprzedaż',
  },

  TOAST_SAME: (nr: string) => `Zapisano: ta sama sprzedaż. Dokument ${nr} jest wycofany.`,
  TOAST_OTHER: 'Zapisano: inna sprzedaż. Wystaw ją jako nową fakturę z nowym numerem.',

  // Odmowy w panelu i w akcji klienta (pozostałe — teksty SQL wypełnione numerem).
  ROLE: 'Decyzję, czym jest ten dokument, zapisuje właściciel lub administrator firmy — poproś go o to. Nie wystawiaj tej faktury ponownie.',
  ENV_UNKNOWN: KSEF_SEND_MESSAGES.envUnknown,
  STALE: 'Dane faktury w KSeF zmieniły się od otwarcia strony — odśwież stronę i zdecyduj jeszcze raz.',
  CONFIRM: 'Zaznacz „Rozumiem skutki” i zapisz decyzję jeszcze raz.',
  GENERIC: 'Nie udało się zapisać decyzji. Spróbuj ponownie za chwilę; jeśli błąd się powtarza, napisz do nas: pomoc@faktflow.pl.',

  /** Notatki karty (`describeDuplicateOriginal`, `duplicate-check.ts`). */
  NOTES: DUPLICATE_ORIGINAL_NOTES,

  /** Pasek pod kartą przy `KSEF_DUPLICATE_RECONCILE` (`ksef-send-policy.ts`). */
  BAR_DUPLICATE_PANEL: KSEF_SEND_MESSAGES.duplicatePanel,
  BAR_DUPLICATE: KSEF_SEND_MESSAGES.duplicate,

  /** „Numer zajęty” (`KSEF_NUMBER_TAKEN`): pasek i toasty po „Wróć do szkicu” (`ksef-send-policy.ts`, C4). */
  NUMBER_TAKEN: {
    BAR: KSEF_SEND_MESSAGES.numberTaken,
    RESET_DONE_REGULAR: KSEF_SEND_MESSAGES.numberTakenResetDone,
    RESET_DONE_ADVANCE: S.numberTakenResetDone('advance'),
    RESET_DONE_CORRECTION: S.numberTakenResetDoneDeletable('correction'),
    RESET_DONE_CORRECTION_HELD: S.numberTakenResetDoneDeletableHeld('correction'),
    RESET_DONE_FINAL: S.numberTakenResetDoneDeletable('final'),
    RESET_DONE_FINAL_HELD: S.numberTakenResetDoneDeletableHeld('final'),
  },
  /** `last_error` „numer zajęty” (`numberTakenMessage`); `{opis}` — numer KSeF, data, nabywca, kwota oryginału. */
  NUMBER_TAKEN_LAST_ERROR: (nr: string, opis: string, x: string) =>
    `W KSeF jest już faktura Twojej firmy o numerze ${nr} (${opis}), wystawiona w programie „${x}”. Tego dokumentu nie wyślesz do KSeF. Jeśli to ta sama sprzedaż — nie wystawiaj jej ponownie (zmiany: korekta tamtej faktury). Jeśli to inna sprzedaż — wystaw ją jako nową fakturę z nowym numerem.`,
  NUMBER_TAKEN_LAST_ERROR_UNKNOWN_PROGRAM: (nr: string, opis: string) =>
    `W KSeF jest już faktura Twojej firmy o numerze ${nr} (${opis}), wystawiona poza FaktFlow. Tego dokumentu nie wyślesz do KSeF. Jeśli to ta sama sprzedaż — nie wystawiaj jej ponownie (zmiany: korekta tamtej faktury). Jeśli to inna sprzedaż — wystaw ją jako nową fakturę z nowym numerem.`,
  /** `last_error` werdyktu `known-number` (`knownNumberVerdictMessage`, C16): oryginał nie może być naszą wysyłką. */
  KNOWN_NUMBER_LAST_ERROR: (k: string, y: string) =>
    `KSeF ma już fakturę o tym numerze (numer KSeF ${k}), a w FaktFlow ten numer KSeF ma dokument ${y} — do rozstrzygnięcia na karcie faktury (ta sama czy inna sprzedaż); nie wystawiaj jej ponownie.`,
  /** To samo, gdy oryginał może być wcześniejszą wysyłką tego dokumentu (`ownHistory`) — klient nie decyduje. */
  KNOWN_NUMBER_LAST_ERROR_OWN: (k: string, y: string) =>
    `KSeF ma już fakturę o tym numerze (numer KSeF ${k}), a w FaktFlow ten numer KSeF ma dokument ${y}; faktura w KSeF może być wcześniejszą wysyłką tego dokumentu z FaktFlow — wyjaśnia to pomoc FaktFlow; nie wystawiaj jej ponownie.`,

  // Baner szkicu wycofanego — każdy rodzaj (decyzja 9). `{data}` = formatWarsawDateTime(decision.at).
  BANNER_TITLE: (nr: string) => `Dokument wycofany — numer ${nr} jest zajęty w KSeF`,
  /** `{via}` przy decyzji zapisanej przez operatora. */
  BANNER_VIA_OPERATOR: ' (zapisała pomoc FaktFlow na Twoją prośbę)',
  BANNER_SAME: (data: string, via: string, nrK: string, k: string, program: string | null) =>
    `Zapisano ${data}${via}: to ta sama sprzedaż co faktura ${nrK} w KSeF (numer KSeF ${k}), ${programNominative(program)}. Tam ją rozliczasz i korygujesz; FaktFlow nie ujmuje jej w JPK ani w KPiR. Tego dokumentu nie wyślesz do KSeF. Jeśli to jednak inna sprzedaż, wystaw ją jako nową fakturę z nowym numerem.`,
  BANNER_SAME_KNOWN: (data: string, via: string, nrK: string, k: string, y: string) =>
    `Zapisano ${data}${via}: to ta sama sprzedaż co faktura ${nrK} w KSeF (numer KSeF ${k}), którą w FaktFlow ma dokument ${y}. Tego dokumentu nie wyślesz do KSeF. Jeśli to jednak inna sprzedaż, wystaw ją jako nową fakturę z nowym numerem.`,
  BANNER_OTHER: (data: string, via: string, k: string, nr: string) =>
    `Zapisano ${data}${via}: to inna sprzedaż niż faktura ${k} w KSeF. Wystaw ją jako nową fakturę — z nowym numerem i dzisiejszą datą. Tego dokumentu nie wyślesz do KSeF ani nie usuniesz; numer ${nr} zostaje przy nim, żeby FaktFlow nie podpowiedział go ponownie.`,
  /** Automatyczny „numer zajęty”, zwykła faktura; `k` null — bez „(numer KSeF …)”. */
  BANNER_AUTO: (nr: string, k: string | null) =>
    `KSeF ma już fakturę Twojej firmy o numerze ${nr}${ksefNumberPart(k)}, wystawioną poza FaktFlow — tego dokumentu nie wyślesz do KSeF ani nie usuniesz; numer zostaje przy nim, żeby FaktFlow nie podpowiedział go ponownie. Jeśli to ta sama sprzedaż — nie wystawiaj jej ponownie (zmiany: korekta tamtej faktury w programie, w którym ją wystawiono). Jeśli inna — wystaw ją jako nową fakturę z nowym numerem.`,
  BANNER_AUTO_ADVANCE: (nr: string, k: string | null) =>
    `KSeF ma już dokument Twojej firmy o numerze ${nr}${ksefNumberPart(k)}, wystawiony poza FaktFlow — tej faktury zaliczkowej nie wyślesz do KSeF ani nie usuniesz; numer zostaje przy niej, żeby FaktFlow nie podpowiedział go ponownie. Jeśli to ta sama sprzedaż — nie wystawiaj jej ponownie. Jeśli inna — wystaw nową fakturę zaliczkową z nowym numerem.`,
  /** Korekta i faktura rozliczeniowa: `{G}`/`{A}` — dopełniacz i biernik z `SPECIAL_KIND_LABEL`. */
  BANNER_AUTO_DELETABLE: (nr: string, k: string | null, g: string, a: string) =>
    `KSeF ma już dokument Twojej firmy o numerze ${nr}${ksefNumberPart(k)}, wystawiony poza FaktFlow — tego szkicu ${g} nie wyślesz do KSeF. Jeśli w KSeF jest ten sam dokument — nie wystawiaj go ponownie. Jeśli inny — usuń ten szkic („Usuń szkic”) i wystaw ${a} od nowa z nowym numerem.`,
  BANNER_AUTO_DELETABLE_HELD: (nr: string, k: string | null, g: string, a: string) =>
    `KSeF ma już dokument Twojej firmy o numerze ${nr}${ksefNumberPart(k)}, wystawiony poza FaktFlow — tego szkicu ${g} nie wyślesz do KSeF. Jeśli w KSeF jest ten sam dokument — nie wystawiaj go ponownie. Jeśli inny — usuń ten szkic („Usuń szkic”), a po zdjęciu blokady wysyłki wystaw ${a} od nowa z nowym numerem.`,
  CTA_REGULAR: { href: '/invoices/new/regular', label: 'Wystaw nową fakturę' },
  CTA_ADVANCE: { href: '/invoices/new/advance', label: 'Wystaw nową fakturę zaliczkową' },

  /** `window.confirm` przy „Usuń szkic” wycofanej korekty albo faktury rozliczeniowej. */
  RETIRED_DELETE_CONFIRM: 'Usunąć wycofany szkic? Numer tego dokumentu jest zajęty w KSeF — nowy dokument wystaw z nowym numerem.',
  /** Odmowa e-maila do nabywcy (decyzja 10). */
  RETIRED_EMAIL_REFUSAL: (nr: string) =>
    `Dokumentu ${nr} nie wyślesz e-mailem: jest wycofany, bo jego numer jest zajęty w KSeF przez inną fakturę, więc nie jest fakturą dla nabywcy. Jeśli to inna sprzedaż, wystaw nową fakturę z nowym numerem i wyślij ją.`,
  /** Odczyt wpisów `number_taken` nieudany (wysyłka, usunięcie, e-mail — fail-closed). */
  HISTORY_READ_FAILED: 'Nie udało się sprawdzić historii wysyłki tej faktury — spróbuj ponownie za chwilę.',

  // Powiadomienie „czeka na Twoją decyzję” (2.11.C): e-mail raz na (faktura, K) i przypomnienie operatora.
  NOTICE: {
    SUBJECT: (nr: string) => `Faktura ${nr} czeka na Twoją decyzję`,
    REMINDER_SUBJECT: (nr: string) => `Przypomnienie: faktura ${nr} czeka na Twoją decyzję`,
    BODY: (nr: string, k: string) =>
      `KSeF nie przyjął faktury ${nr}, bo ma już fakturę Twojej firmy o tym numerze (numer KSeF ${k}). Otwórz fakturę w FaktFlow, porównaj dane i zdecyduj, czy to ta sama sprzedaż, czy inna. Do tego czasu nie wystawiaj jej ponownie. Pytania: pomoc@faktflow.pl.`,
    BUTTON: 'Otwórz fakturę',
    PUSH_TITLE: (nr: string) => `Faktura ${nr} czeka na Twoją decyzję`,
    PUSH_BODY: 'KSeF ma już fakturę o tym numerze — porównaj dane i zdecyduj.',
  },
} as const;

// ─── Polityka jsonb (lustro `ksef_duplicate_check_allows`, 2.1.1) ────────────

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const hasKey = (v: Record<string, unknown>, key: string): boolean => Object.prototype.hasOwnProperty.call(v, key);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/**
 * Czy zapis sprawdzenia oryginału pozwala na decyzję klienta — na SUROWYM jsonb,
 * tak jak SQL (typy sprawdzane jawnie: `v:"1"`, liczbowe `knownInvoice.id`
 * odmawiają). `choice` null = dowolny wybór. `recheck` nie blokuje: dane
 * z wcześniejszego udanego sprawdzenia są ważne (faktura w KSeF się nie zmienia).
 */
export function duplicateCheckAllows(raw: unknown, choice: DuplicateChoice | null): boolean {
  if (!isRecord(raw) || raw.v !== 1) return false;
  if (hasKey(raw, 'decision')) return false;
  if (choice !== null && choice !== 'same_sale' && choice !== 'other_sale') return false;
  if (raw.reason !== 'no-own-file' && raw.reason !== 'known-number') return false;
  if (typeof raw.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(raw.sha256)) return false;
  if (!isRecord(raw.summary)) return false;
  // NULL (nie wiadomo) odmawia; true = oryginał może być nasz.
  if (raw.ownHistory !== false) return false;
  if (raw.reason === 'known-number') {
    return isRecord(raw.knownInvoice) && typeof raw.knownInvoice.id === 'string' && raw.knownInvoice.id !== '';
  }
  return true;
}

// ─── Wybór wpisów (te same porządki co SQL) ──────────────────────────────────

/** Znacznik czasu do sortowania; `null` dla braku albo wartości nie do odczytu. */
function timeOf(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

/** Mikrosekundy ponad milisekundy (`timestamptz` z PostgREST ma 6 cyfr ułamka; `Date` czyta 3). */
function microsOf(value: string | null | undefined): number {
  const m = value ? /:\d{2}\.\d{3}(\d{1,3})/.exec(value) : null;
  return m ? Number(m[1]!.padEnd(3, '0')) : 0;
}

/** `ORDER BY <czas> DESC NULLS LAST, id` — jak w 00148 (z dokładnością do mikrosekundy). */
function compareDescNullsLastThenId(
  a: { id: string },
  rawA: string | null | undefined,
  b: { id: string },
  rawB: string | null | undefined,
): number {
  const ta = timeOf(rawA);
  const tb = timeOf(rawB);
  if (ta !== tb) {
    if (ta === null) return 1;
    if (tb === null) return -1;
    return tb - ta;
  }
  if (ta !== null) {
    const micro = microsOf(rawB) - microsOf(rawA);
    if (micro !== 0) return micro;
  }
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/**
 * Znacznik 440: najnowszy wpis `intent`/`sent` z numerem oryginału
 * (`ORDER BY attempted_at DESC NULLS LAST, id`, 2.1.2 #7). Tego samego wyboru
 * używa ładowarka faktów.
 */
export function duplicateMarker<T extends Pick<DuplicateDecisionSubmissionRow, 'id' | 'status' | 'original_ksef_number' | 'attempted_at'>>(
  submissions: readonly T[],
): T | null {
  return [...submissions]
    .filter((s) => (s.status === 'intent' || s.status === 'sent') && s.original_ksef_number != null)
    .sort((a, b) => compareDescNullsLastThenId(a, a.attempted_at, b, b.attempted_at))[0] ?? null;
}

type TakenRowFields = Pick<DuplicateDecisionSubmissionRow, 'id' | 'status' | 'original_ksef_number' | 'original_check' | 'completed_at'>;

const hasDecisionKey = (row: Pick<DuplicateDecisionSubmissionRow, 'original_check'>): boolean =>
  isRecord(row.original_check) && hasKey(row.original_check, 'decision');

/**
 * Wpis `number_taken`, który opisuje szkic wycofany — porządek wyzwalacza
 * (2.1.4 krok 2): najpierw z decyzją, potem z numerem oryginału, potem
 * `completed_at` malejąco (brak na końcu), potem `id`.
 */
function retiredRow<T extends TakenRowFields>(submissions: readonly T[]): T | null {
  return [...submissions]
    .filter((s) => s.status === 'number_taken')
    .sort((a, b) => {
      const decided = Number(hasDecisionKey(b)) - Number(hasDecisionKey(a));
      if (decided !== 0) return decided;
      const withK = Number(b.original_ksef_number != null) - Number(a.original_ksef_number != null);
      if (withK !== 0) return withK;
      return compareDescNullsLastThenId(a, a.completed_at, b, b.completed_at);
    })[0] ?? null;
}

/** `original_check->'decision'` z poprawnym wyborem (jak `->>'choice'` w wyzwalaczu); inaczej `null`. */
function decisionOf(row: Pick<DuplicateDecisionSubmissionRow, 'original_check'>): { choice: DuplicateChoice; via: DuplicateVia; at: string } | null {
  if (!isRecord(row.original_check)) return null;
  const d = row.original_check.decision;
  if (!isRecord(d) || (d.choice !== 'same_sale' && d.choice !== 'other_sale')) return null;
  return { choice: d.choice, via: d.via === 'operator' ? 'operator' : 'client', at: typeof d.at === 'string' ? d.at : '' };
}

// ─── Polityka decyzji (lustro `ksef_duplicate_decision_blocker`, 2.1.2) ──────

export interface DuplicateDecisionOptionsInput {
  facts: DuplicateDecisionFacts;
  /** Klient w panelu albo operator (`/admin/ksef`, decyzja przekazana przez klienta). */
  actor: 'client' | 'operator';
  /** Rola zalogowanej osoby: właściciel albo administrator (`canManageKsefSend`). Operator jej nie potrzebuje. */
  canManage: boolean;
  /** `configuredKsefEnvironment()` serwera; `null` — nieznane. */
  environment: KsefEnvironment | null;
  /** Chwila odczytu (podpis wspólny z polityką operatora; widok od niej dziś nie zależy). */
  now: Date;
}

const toNumber = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const digitsOf = (v: string | null): string | null => {
  const d = v ? v.replace(/\D/g, '') : '';
  return d.length > 0 ? d : null;
};

const trimmed = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length > 0 ? s : null;
};

const sameText = (a: string | null, b: string | null): boolean | null => (a !== null && b !== null ? a === b : null);

/** `FaktFlow` dla pliku FaktFlow, inaczej nazwa z `SystemInfo`; `null` — nieznany. */
function programOf(summary: Record<string, unknown>): string | null {
  const systemInfo = str(summary.systemInfo);
  return systemInfo === FAKTFLOW_SYSTEM_INFO ? 'FaktFlow' : systemInfo;
}

/**
 * Co klient (albo operator) może zrobić z fakturą przy nierozstrzygniętym 440.
 * Kolejność odmów = blokada SQL (2.1.2), potem nieznane środowisko, inne
 * środowisko sprawdzenia oryginału i — na końcu, tylko klient — rola: członek
 * firmy widzi prawdziwą blokadę. Szkic z zapisaną decyzją daje widok `decided`
 * (ponowienie po zgubionej odpowiedzi; RPC odpowiada wtedy `already_decided`).
 */
export function duplicateDecisionOptions(input: DuplicateDecisionOptionsInput): DuplicateDecisionView {
  const { facts, actor, environment } = input;
  const inv = facts.invoice;
  const subs = facts.submissions;
  const marker = duplicateMarker(subs);
  const markerCheck = marker && isRecord(marker.original_check) ? marker.original_check : null;
  const knownFromCheck = markerCheck && isRecord(markerCheck.knownInvoice) ? markerCheck.knownInvoice : null;

  const refused = (refusal: DuplicateDecisionRefusal, message: string | null): DuplicateDecisionView => {
    if (actor !== 'operator') return { kind: 'refused', refusal, message };
    const knownNumber = markerCheck?.reason === 'known-number'
      ? facts.knownInvoice?.internalNumber ?? str(knownFromCheck?.internalNumber) ?? 'bez numeru'
      : null;
    return {
      kind: 'refused',
      refusal,
      message,
      detail: {
        originalKsefNumber: marker?.original_ksef_number ?? null,
        reason: typeof markerCheck?.reason === 'string' ? markerCheck.reason : null,
        checkEnv: typeof markerCheck?.env === 'string' ? markerCheck.env : null,
        environment,
        paidAmount: inv ? toNumber(inv.paid_amount) : null,
        knownInvoiceNumber: knownNumber,
      },
    };
  };

  // 1. not-found (RPC: P0002 przed wszystkim innym).
  if (!inv || inv.direction !== 'outgoing') return refused('not-found', KSEF_SEND_MESSAGES.notFound);

  // Idempotencja (RPC krok 2): zapisana decyzja — nie odmowa, tylko jej widok.
  const taken = retiredRow(subs);
  const decided = taken ? decisionOf(taken) : null;
  if (taken && decided) {
    return { kind: 'decided', choice: decided.choice, via: decided.via, at: decided.at, originalKsefNumber: taken.original_ksef_number };
  }

  const nr = documentNumber(inv.internal_number);
  // 2. not-pending
  if (inv.ksef_status !== 'failed' || inv.last_error_code !== 'KSEF_DUPLICATE_RECONCILE') {
    return refused('not-pending', sqlText('not-pending', nr));
  }
  // 3. in-ksef
  if (inv.ksef_number != null || subs.some((s) => s.status === 'accepted' || s.response_ksef_number != null)) {
    return refused('in-ksef', sqlText('in-ksef', nr));
  }
  // 4. kind
  if ((inv.invoice_kind ?? 'regular') !== 'regular') return refused('kind', sqlText('kind', nr));
  // 5. billing
  if (inv.stripe_invoice_id != null) return refused('billing', sqlText('billing', nr));
  // 6. offline (reset ich nie czyści, 00132 je mrozi)
  if (inv.offline_idempotency_key != null || inv.offline_qr_offline != null || inv.offline_qr_certyfikat != null) {
    return refused('offline', sqlText('offline', nr));
  }
  // 7. no-marker
  if (!marker || marker.original_ksef_number == null) return refused('no-marker', sqlText('no-marker', nr));
  const k = marker.original_ksef_number;
  // 8. conflicting-originals: wpis w dowolnym stanie z innym numerem oryginału.
  if (subs.some((s) => s.original_ksef_number != null && s.original_ksef_number !== k)) {
    return refused('conflicting-originals', sqlText('conflicting-originals', nr));
  }
  // 9. no-check (znacznik sprzed 00144)
  if (marker.original_check === null || marker.original_check === undefined) return refused('no-check', sqlText('no-check', nr));
  // 10. reason: dane oryginału, powód i własna historia w JSON — zostaje notatka PR A.
  if (!markerCheck || !duplicateCheckAllows(markerCheck, null)) return refused('reason', null);
  const check = markerCheck;
  const reason = check.reason as DuplicateDecisionReason;
  // 11. known-stale — tylko przy powodzie known-number (C2): Y musi nadal mieć K i być przyjęta.
  if (reason === 'known-number') {
    const known = facts.knownInvoice;
    const expectedId = knownFromCheck ? knownFromCheck.id : null;
    if (!known || !known.holdsOriginal || known.id !== expectedId) {
      return refused('known-stale', sqlText('known-stale', k, nr));
    }
  }
  const sha256 = check.sha256 as string;
  // 12. own-history — sprawdzane na wpisach faktury, nie z JSON.
  const originalSession = marker.original_session_reference_number;
  if (subs.some((s) =>
    (originalSession != null && s.session_reference_number === originalSession)
    || (s.request_payload_hash != null && s.request_payload_hash.toLowerCase() === sha256))) {
    return refused('own-history', sqlText('own-history', k, nr));
  }
  // 13. payments — sesja klienta widzi tylko `paid_amount`; wiersze `payments` sprawdza RPC.
  const paid = toNumber(inv.paid_amount);
  if (inv.paid_amount != null && paid !== 0) return refused('payments', sqlText('payments', nr));
  // Środowisko aplikacji, potem środowisko sprawdzenia oryginału, potem rola klienta.
  if (environment === null) return refused('env-unknown', KSEF_SEND_MESSAGES.envUnknown);
  if (check.env !== environment) {
    return refused('env', sqlText('ENV', k, duplicateEnvLabel(check.env), duplicateEnvLabel(environment), nr));
  }
  if (actor === 'client' && !input.canManage) return refused('role', DUPLICATE_DECISION_TEXTS.ROLE);

  const summary = check.summary as Record<string, unknown>;
  const L = DUPLICATE_DECISION_TEXTS.ROW_LABELS;
  const buyerData = isRecord(inv.buyer_data) ? inv.buyer_data : null;

  const ksefNumberText = trimmed(summary.number);
  const oursNumber = trimmed(inv.internal_number);
  const ksefDate = trimmed(summary.issueDate);
  const oursDate = trimmed(inv.issue_date);
  const ksefBuyer = trimmed(summary.buyerName);
  const oursBuyer = trimmed(buyerData?.name);
  const ksefNip = trimmed(summary.buyerNip);
  const oursNip = trimmed(inv.buyer_nip);
  const nipK = digitsOf(ksefNip);
  const nipO = digitsOf(oursNip);
  const nipSame = sameText(nipK, nipO);

  const ksefGross = toNumber(summary.gross);
  const oursGross = toNumber(inv.gross_total);
  const ksefCurrency = trimmed(summary.currency);
  const oursCurrency = trimmed(inv.currency);
  // Kwota porównywana tylko w tej samej, znanej walucie; inaczej „bez porównania” (decyzja 12: to „kwota się różni”).
  const grossSame = ksefGross !== null && oursGross !== null && ksefCurrency !== null && ksefCurrency === oursCurrency
    ? ksefGross.toFixed(2) === oursGross.toFixed(2)
    : null;
  const money = (value: number | null, currency: string | null): string | null =>
    value === null ? null : currency ? `${value.toFixed(2)} ${currency}` : value.toFixed(2);

  const program = programOf(summary);
  const comparison: ComparisonRow[] = [
    { label: L.number, ksef: ksefNumberText, ours: oursNumber, same: sameText(ksefNumberText, oursNumber) },
    { label: L.issueDate, ksef: ksefDate, ours: oursDate, same: sameText(ksefDate, oursDate) },
    { label: L.buyer, ksef: ksefBuyer, ours: oursBuyer, same: sameText(ksefBuyer, oursBuyer) },
    { label: L.buyerNip, ksef: ksefNip, ours: oursNip, same: nipSame },
    { label: L.gross, ksef: money(ksefGross, ksefCurrency), ours: money(oursGross, oursCurrency), same: grossSame },
    { label: L.program, ksef: program, ours: 'FaktFlow', same: null },
  ];

  const known = reason === 'known-number' && facts.knownInvoice
    ? { id: facts.knownInvoice.id, internalNumber: facts.knownInvoice.internalNumber }
    : null;
  return {
    kind: 'decidable',
    reason,
    invoiceNumber: inv.internal_number,
    originalKsefNumber: k,
    originalSha256: sha256,
    comparison,
    // no-own-file: FaktFlow nie ma pliku próby — treści nie porównano.
    sameContent: reason === 'known-number' && typeof check.sameContentExceptHeader === 'boolean' ? check.sameContentExceptHeader : null,
    needsConfirmation: {
      // „Inna sprzedaż” przy tym samym albo nieznanym NIP nabywcy.
      other_sale: nipSame !== false,
      // „Ta sama sprzedaż” przy innym albo nieznanym NIP albo kwocie, która się różni (także waluta, wartość nieznana).
      same_sale: nipSame !== true || grossSame !== true,
    },
    program,
    knownInvoice: known,
    heldCorrections: isCorrectionHeldForEnv(environment),
  };
}

// ─── Szkic wycofany (wpis `number_taken`, decyzje 2, 3, 9, 11) ───────────────

/**
 * Odmowa wysyłki szkicu z wpisem `number_taken` — dowolny rodzaj, decyzja
 * albo automatyczny „numer zajęty”. Ten sam tekst co wyzwalacz
 * `c_guard_ksef_retired_draft` (2.1.4 krok 7). `null` — brak wpisu.
 */
export function retiredDraftSendRefusal(invoiceNumber: string | null, submissions: readonly TakenRowFields[]): string | null {
  const row = retiredRow(submissions);
  if (!row) return null;
  const nr = documentNumber(invoiceNumber);
  const k = row.original_ksef_number;
  const decision = decisionOf(row);
  if (decision && k != null) {
    return sqlText(decision.choice === 'same_sale' ? 'TRIGGER_SAME' : 'TRIGGER_OTHER', nr, k);
  }
  return sqlText('TRIGGER_AUTO', nr, k != null ? `fakturę ${k}` : 'inną fakturę Twojej firmy');
}

export interface RetiredDraftViewInput {
  invoiceNumber: string | null;
  /** `invoices.invoice_kind`: regular | correction | advance | final. */
  invoiceKind: string | null;
  /** Wszystkie wpisy faktury (filtr `number_taken` jest tutaj). */
  submissions: readonly TakenRowFields[];
  /** Rodzaj wstrzymany w środowisku (`ksef_resend_facts.kindHeld`). */
  kindHeld: boolean;
}

/**
 * Baner szkicu wycofanego — każdy rodzaj (decyzja 9); `null` bez wpisu
 * `number_taken`. Zwykła faktura: decyzja „ta sama” / „ta sama” przy
 * known-number / „inna” albo automatyczny „numer zajęty”; zaliczka
 * i dokumenty usuwalne (korekta, faktura rozliczeniowa) — tylko automat
 * (decyzja jest wyłącznie dla zwykłej faktury; wpis z decyzją przy innym
 * rodzaju to uszkodzone dane — tekst automatyczny rodzaju).
 */
export function retiredDraftView(input: RetiredDraftViewInput): RetiredDraftView | null {
  const row = retiredRow(input.submissions);
  if (!row) return null;
  const T = DUPLICATE_DECISION_TEXTS;
  const nr = documentNumber(input.invoiceNumber);
  const k = row.original_ksef_number;
  const special = specialKindOf(input.invoiceKind);
  // Jak `WHEN` wyzwalacza usuwania: zwykła i zaliczka — nie; korekta i faktura rozliczeniowa — tak.
  const deletable = special === 'correction' || special === 'final';
  const base = {
    title: T.BANNER_TITLE(nr),
    sendRefusal: retiredDraftSendRefusal(input.invoiceNumber, input.submissions),
    deletable,
    deleteRefusal: deletable
      ? null
      : sqlText('TRIGGER_DELETE', nr, k != null ? `faktura ${k}` : 'inna faktura Twojej firmy'),
  };

  if (special === 'advance') {
    return { ...base, body: T.BANNER_AUTO_ADVANCE(nr, k), cta: { ...T.CTA_ADVANCE }, knownInvoice: null };
  }
  if (special === 'correction' || special === 'final') {
    const label = SPECIAL_KIND_LABEL[special];
    const body = input.kindHeld
      ? T.BANNER_AUTO_DELETABLE_HELD(nr, k, label.G, label.A)
      : T.BANNER_AUTO_DELETABLE(nr, k, label.G, label.A);
    return { ...base, body, cta: null, knownInvoice: null };
  }

  const decision = k != null ? decisionOf(row) : null;
  if (decision && k != null) {
    const check = row.original_check as Record<string, unknown>;
    const data = decision.at ? formatWarsawDateTime(decision.at) : '';
    const via = decision.via === 'operator' ? T.BANNER_VIA_OPERATOR : '';
    const summary = isRecord(check.summary) ? check.summary : {};
    const nrK = trimmed(summary.number) ?? nr;
    if (decision.choice === 'other_sale') {
      return { ...base, body: T.BANNER_OTHER(data, via, k, nr), cta: { ...T.CTA_REGULAR }, knownInvoice: null };
    }
    const knownRaw = check.reason === 'known-number' && isRecord(check.knownInvoice) ? check.knownInvoice : null;
    const knownId = knownRaw ? str(knownRaw.id) : null;
    if (knownRaw && knownId) {
      const internalNumber = str(knownRaw.internalNumber);
      return {
        ...base,
        body: T.BANNER_SAME_KNOWN(data, via, nrK, k, internalNumber ?? 'bez numeru'),
        cta: null,
        knownInvoice: { id: knownId, internalNumber },
      };
    }
    return { ...base, body: T.BANNER_SAME(data, via, nrK, k, programOf(summary)), cta: null, knownInvoice: null };
  }
  return { ...base, body: T.BANNER_AUTO(nr, k), cta: { ...T.CTA_REGULAR }, knownInvoice: null };
}
