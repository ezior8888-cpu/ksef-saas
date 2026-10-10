/**
 * Dane oryginału przy nierozstrzygniętym duplikacie 440 (D-A4-1b-3, PR A —
 * plan „zero zgubionych faktur”). Runner zapisuje je na otwartym wpisie
 * próby ze znacznikiem 440 (`ksef_submissions.original_check`, 00144), zanim
 * zostawi fakturę w `KSEF_DUPLICATE_RECONCILE`. Klient i operator widzą, co
 * KSeF ma pod tym numerem: numer KSeF, datę, nabywcę, kwotę, program — na
 * tych danych klient podejmuje decyzję („ta sama sprzedaż” / „inna”,
 * D-A4-1b-3 PR B: `lib/ksef/duplicate-decision.ts`, RPC `decide_ksef_duplicate`
 * z 00148, który dopisuje do znacznika klucz `decision`).
 *
 * CZYSTY moduł (importowany w komponencie): bez KSeF, bazy i Node.
 */

import type { OriginalInvoiceSummary } from './duplicate-verdict';

/** Dlaczego automat nie rozstrzygnął duplikatu — to samo słowo w danych, alarmie i runbooku. */
export const DUPLICATE_CHECK_REASONS = [
  /** Numer KSeF oryginału ma już inna faktura sprzedaży tej firmy w FaktFlow — anomalia, operator. */
  'known-number',
  /** KSeF odmówił pobrania oryginału (403 — token bez InvoiceRead, inne 4xx). */
  'download-refused',
  /** Pobranie oryginału chwilowo nieudane (5xx, 429, 401, 21164, 21165) — ponowienie. */
  'download-pending',
  /** Nie udało się odczytać naszego pliku z magazynu — ponowienie. */
  'storage-pending',
  /** Oryginał pobrany, ale zapis jego bajtów w archiwum chwilowo nieudany — ponowienie. */
  'archive-pending',
  /** Oryginał wygenerował FaktFlow, treść inna niż nasza. */
  'faktflow-original',
  /** Inny program, ta sama treść co nasza (poza nagłówkiem). */
  'same-content-other-program',
  /** Oryginał spoza FaktFlow, a historia nie ma naszego pliku do porównania. */
  'no-own-file',
  /** W archiwum jest już inny plik pod tym numerem KSeF — wymaga wyjaśnienia. */
  'archive-conflict',
] as const;

export type DuplicateCheckReason = (typeof DUPLICATE_CHECK_REASONS)[number];

/** Wybór klienta przy nierozstrzygniętym 440 (D-A4-1b-3 PR B). */
export type DuplicateDecisionChoice = 'same_sale' | 'other_sale';
/** Kto zapisał decyzję: klient w panelu albo operator na jego prośbę. */
export type DuplicateDecisionVia = 'client' | 'operator';

// ─── D-A4-1b-3 PR C (00149): brama pochodzenia, oferta, zapis oryginału ──────
//
// Kontrakt PR C (spec v3, 5.2–5.5, 9.3) — wspólny dla polityki (grupa B),
// bramy, projekcji i runnera (C), klienta (D) i operatora (E). Typy są
// serializowalne: runner zapisuje bramę w `original_check.importGate`, SQL
// z 00149 czyta ją w ofercie i blokadzie.

/** Wersja reguł bramy w chwili oceny (`importGate.rules`) — informacyjnie: zmiana bramy to inny `kind` albo inne `problems` (5.3 krok 4). */
export const ORIGINAL_GATE_RULES = 1;

/**
 * Problemy bramy pochodzenia w kolejności reguł 5.2 (1 `currency` i 2 `parse`
 * kończą ocenę; 3–16 zbierane naraz). `importGate.problems` w tej kolejności,
 * bez powtórzeń.
 */
export const ORIGINAL_GATE_PROBLEMS = [
  'currency',
  'parse',
  'form',
  'kind',
  'number',
  'seller',
  'buyer-id',
  'no-lines',
  'gross-prices',
  'line-fields',
  'rates',
  'amounts',
  'totals',
  'annotations',
  'markers',
  'sale-date',
] as const;
export type OriginalGateProblem = (typeof ORIGINAL_GATE_PROBLEMS)[number];

/** Problemy, przy których oryginału nie zapisze nawet operator (tabela 1.1: `not-buildable:<problem>`). */
export const ORIGINAL_GATE_UNBUILDABLE_PROBLEMS = [
  'parse',
  'currency',
  'kind',
  'number',
  'seller',
  'no-lines',
] as const satisfies readonly OriginalGateProblem[];

/** Rodzaj trwałego znacznika „sprawdź ponownie” (`recheckNeeded.kind`, `flag_ksef_original_recheck.p_kind`, 4.7b). */
export const ORIGINAL_RECHECK_KINDS = [
  'archive-missing',
  'archive-mismatch',
  'gate-drift',
  'import-mismatch',
  'not-buildable',
  'import-projection',
] as const;
export type OriginalRecheckKind = (typeof ORIGINAL_RECHECK_KINDS)[number];

/** Rodzaj identyfikatora nabywcy w pliku (`nip` → `vat-ue` → `pesel` → `nr-inny` → `brak-id` → `none`). */
export type OriginalBuyerIdKind = 'nip' | 'vat-ue' | 'pesel' | 'nr-inny' | 'brak-id' | 'none';

/** Korekta faktury istnieje w FaktFlow tylko dla tych nabywców (F44; inaczej `FAKTFLOW.CORRECTION_PERSON`). */
export const ORIGINAL_CORRECTABLE_BUYER_ID_KINDS = ['nip', 'vat-ue'] as const satisfies readonly OriginalBuyerIdKind[];

export type OriginalPreviewAnnotation = 'cashMethod' | 'splitPayment' | 'reverseCharge' | 'exemption';

/** Pozycja podglądu oryginału (kwoty jako tekst z pliku — bez rzutu). */
export interface OriginalPreviewLine {
  ordinal: number;
  /** Najwyżej 120 znaków. */
  name: string;
  quantity: string;
  unit: string;
  unitPriceNet: string | null;
  vatRate: string;
  gross: string;
}

/** Podgląd oryginału na znaczniku — strona klienta nie czyta archiwum (INV-13). */
export interface OriginalPreview {
  /** P_1 */
  issueDate: string;
  /** `fa3ImportContent(parsed).saleDate`; `null` = jak data wystawienia. */
  saleDate: string | null;
  /** MM.RRRR z P_1. */
  period: string;
  /** Rodzaj identyfikatora nabywcy — korekta istnieje tylko dla `nip` i `vat-ue` (F44, 6.2 CORRECTION_PERSON). */
  buyerIdKind: OriginalBuyerIdKind;
  annotations: OriginalPreviewAnnotation[];
  exemptionBasis: string | null;
  lineCount: number;
  /** Najwyżej 20 pierwszych pozycji; nazwa ≤ 120 znaków. */
  lines: OriginalPreviewLine[];
  totals: { net: string; vat: string; gross: string };
}

/** Oddanie decyzji klientowi przez operatora — zapisuje tylko `release_ksef_original_review` (4.7); ten sam kształt co SQL (dowód T6). */
export interface KsefOriginalRelease {
  at: string;
  via: 'operator';
  actorUserId: string | null;
  note: string | null;
}

/** `original_check.importGate` — ocena pliku oryginału przy `faktflow-original` (runner, 5.1). */
export interface KsefOriginalImportGate {
  v: 1;
  /** `ORIGINAL_GATE_RULES` w chwili oceny. */
  rules: number;
  /** `review` ⇔ `problems` niepuste (lustro `ksef_duplicate_gate_ok`, 4.4a). */
  kind: 'importable' | 'review';
  problems: OriginalGateProblem[];
  /** `null`, gdy plik nie dał się odczytać (`parse`, `currency`). */
  preview: OriginalPreview | null;
  /** Tylko `release_ksef_original_review` (4.7). */
  release?: KsefOriginalRelease;
}

/** `original_check.recheckNeeded` — odmowa w chwili zapisu; faktura czeka na nowy werdykt (4.7b, INV-25). */
export interface KsefOriginalRecheckNeeded {
  kind: OriginalRecheckKind;
  at: string;
}

/**
 * Oferta dla `faktflow-original` (`ksef_duplicate_original_offer`, 4.4):
 * `pair` — dwa przyciski, oba zapisują oryginał; `record` — jeden przycisk
 * (własna historia albo ta sama treść); `released` — operator oddał decyzję,
 * semantyka PR B bez zapisu; `review-pair` / `review-record` — przegląd operatora.
 */
export const DUPLICATE_ORIGINAL_OFFERS = ['pair', 'record', 'released', 'review-pair', 'review-record'] as const;
export type DuplicateOriginalOffer = (typeof DUPLICATE_ORIGINAL_OFFERS)[number];

/** Oferty trybu `import` (4.6 krok 0); `released` idzie trybem `no-import`. */
export const DUPLICATE_ORIGINAL_IMPORT_OFFERS = [
  'pair',
  'record',
  'review-pair',
  'review-record',
] as const satisfies readonly DuplicateOriginalOffer[];
export type DuplicateOriginalImportOffer = (typeof DUPLICATE_ORIGINAL_IMPORT_OFFERS)[number];

/**
 * Tryb decyzji `decide_ksef_duplicate_original`: `import` zapisuje oryginał
 * jako fakturę sprzedaży K, `no-import` — po oddaniu przez operatora, jak PR B.
 */
export const DUPLICATE_DECISION_MODES = ['import', 'no-import'] as const;
export type DuplicateDecisionMode = (typeof DUPLICATE_DECISION_MODES)[number];
/** Tryby `ksef_duplicate_decide_core` (4.6): `retire` = 9-argumentowe `decide_ksef_duplicate` z 00148. */
export type DuplicateDecisionCoreMode = 'retire' | DuplicateDecisionMode;

/** `decision.original` — co klient albo operator widział (4.6 krok 7, T6). */
export interface KsefDuplicateDecisionOriginal {
  sha256: string;
  archivePath: string;
  sizeBytes: number;
  acquiredAt: string | null;
  /** `original_session_reference_number` znacznika. */
  session: string | null;
  gateRules: number | null;
  gateProblems: OriginalGateProblem[];
  /** Z `importGate.preview`; `null` bez podglądu. */
  buyerIdKind: OriginalBuyerIdKind | null;
}

/** `decision.retired.lines[]` — pozycja X przed wycofaniem (kolumny `invoice_line_items`). */
export interface KsefDuplicateDecisionRetiredLine {
  ordinal: number;
  name: string;
  unit: string;
  quantity: number;
  unitPriceNet: number | null;
  netAmount: number;
  vatRate: string;
  vatAmount: number;
  grossAmount: number;
}

/** `decision.retired` — kopia treści X przed wycofaniem (D-A4-1b-3-XEDIT, T6). */
export interface KsefDuplicateDecisionRetired {
  internalNumber: string | null;
  issueDate: string | null;
  saleDate: string | null;
  buyerNip: string | null;
  buyerName: string | null;
  netTotal: number | null;
  vatTotal: number | null;
  grossTotal: number | null;
  currency: string | null;
  lineCount: number;
  lines: KsefDuplicateDecisionRetiredLine[];
}

/** Zapis decyzji w `original_check.decision` (00148) — tylko pola, które czyta aplikacja. */
export interface KsefDuplicateDecisionRecord {
  choice: DuplicateDecisionChoice;
  via: DuplicateDecisionVia;
  /** Moment decyzji (ISO z bazy, `now()` w RPC). */
  at: string;
  // PR C (00149) — tylko decyzje `faktflow-original`; decyzje PR B tych kluczy nie mają.
  mode?: DuplicateDecisionMode;
  offer?: DuplicateOriginalOffer;
  actorUserId?: string | null;
  /** Notatka operatora (`via = 'operator'`); klient — `null`. */
  note?: string | null;
  original?: KsefDuplicateDecisionOriginal;
  retired?: KsefDuplicateDecisionRetired;
  /** Tylko `mode = 'import'`: id faktury K zapisanej z KSeF. */
  importedInvoiceId?: string;
  /** Tylko `mode = 'import'`: numer, który przeszedł z X na K. */
  retiredInternalNumber?: string;
  /** Tylko `mode = 'no-import'`: `importGate.release` w chwili decyzji, w całości. */
  release?: KsefOriginalRelease;
}

/**
 * `tags.kind` alarmów Sentry PR C (5.11; `tags.area = 'ksef.duplicate-decision'`,
 * odcisk `[kind, invoiceId]`). Jedno słowo w kodzie, testach i runbooku.
 */
export const KSEF_ORIGINAL_ALARM_KINDS = {
  provenanceReview: 'ksef-duplicate-provenance-review',
  recheck: 'ksef-duplicate-recheck',
  recheckFlag: 'ksef-duplicate-recheck-flag',
  importRefused: 'ksef-duplicate-import-refused',
  releaseFailed: 'ksef-duplicate-release-failed',
  importNoDate: 'ksef-duplicate-import-no-date',
  importNoSession: 'ksef-duplicate-import-no-session',
} as const;

/** `fa3_data.import.source` faktury K zapisanej decyzją (4.8 `fa3`, I3K, kontrola sekcja 10). */
export const ORIGINAL_IMPORT_SOURCE = 'ksef_duplicate_decision';

export interface KsefDuplicateCheck {
  v: 1;
  /** Środowisko KSeF, w którym sprawdzono oryginał. */
  env: string;
  checkedAt: string;
  reason: DuplicateCheckReason;
  /** SHA-256 (hex) pobranych bajtów oryginału; `null`, gdy nie pobrano. */
  sha256: string | null;
  /** Klucz archiwum bajtów oryginału (`<firma>/ksef-import/<numer KSeF>.xml`). */
  archivePath: string | null;
  sizeBytes: number | null;
  summary: OriginalInvoiceSummary | null;
  /** Treść zgodna z naszą poza nagłówkiem; `null`, gdy nie było czego porównać. */
  sameContentExceptHeader: boolean | null;
  /** Sesja albo plik oryginału jest w historii tej faktury. */
  ownHistory: boolean | null;
  /** Data nadania numeru oryginałowi (metadane KSeF); `null`, gdy nieznana. */
  acquiredAt: string | null;
  /** Status HTTP odmowy pobrania. */
  httpStatus: number | null;
  /** Faktura sprzedaży w FaktFlow, która ma już ten numer KSeF (`known-number`). */
  knownInvoice: { id: string; internalNumber: string | null } | null;
  /**
   * Ostatnie ponowne sprawdzenie, które NIE pobrało oryginału (np. cron I5
   * po 48 h dostał 503) — dane wyżej pochodzą z wcześniejszego, udanego.
   */
  recheck: { reason: DuplicateCheckReason; httpStatus: number | null; checkedAt: string } | null;
  /**
   * Decyzja klienta (00148, `decide_ksef_duplicate`) — tylko na wpisie, który
   * stał się `number_taken`. Klucz obecny wyłącznie przy poprawnym zapisie;
   * zapis bez decyzji wraca bez tego klucza (odczyt PR A bez zmian).
   */
  decision?: KsefDuplicateDecisionRecord;
  /**
   * PR C (5.1 punkt 4): ocena pliku oryginału — tylko `faktflow-original`
   * i tylko poprawny kształt (`parseImportGate`); brak klucza = blokada
   * `recheck-needed` (4.5 krok 11c).
   */
  importGate?: KsefOriginalImportGate;
  /** PR C (4.7b): trwały znacznik „sprawdź ponownie”; nowy werdykt zapisuje znacznik bez niego. */
  recheckNeeded?: KsefOriginalRecheckNeeded;
}

/** Powody, przy których sprawdzenie nie pobrało oryginału z powodu chwilowej albo uprawnieniowej awarii. */
const FAILED_FETCH_REASONS: readonly DuplicateCheckReason[] = ['download-pending', 'download-refused', 'storage-pending', 'archive-pending'];

/**
 * Nowy zapis po kolejnym sprawdzeniu. Sprawdzenie, które nie pobrało
 * oryginału (awaria, 403), NIE kasuje danych z wcześniejszego udanego —
 * na nich klient podejmuje decyzję; dopisuje tylko wynik próby (`recheck`).
 * Nowe dane oryginału, „znany numer” albo inne środowisko — zapis w całości.
 */
export function mergeDuplicateCheck(previous: KsefDuplicateCheck | null, next: KsefDuplicateCheck): KsefDuplicateCheck {
  const keepPrevious = previous !== null
    && previous.sha256 !== null
    && previous.env === next.env
    && FAILED_FETCH_REASONS.includes(next.reason)
    && (next.sha256 === null || next.sha256 === previous.sha256);
  if (!keepPrevious) return { ...next, recheck: null };
  return { ...previous, recheck: { reason: next.reason, httpStatus: next.httpStatus, checkedAt: next.checkedAt } };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);

function parseSummary(v: unknown): OriginalInvoiceSummary | null {
  if (!isRecord(v)) return null;
  return {
    systemInfo: str(v.systemInfo),
    number: str(v.number),
    issueDate: str(v.issueDate),
    buyerNip: str(v.buyerNip),
    buyerName: str(v.buyerName),
    gross: str(v.gross),
    currency: str(v.currency),
  };
}

/** Odczyt `original_check` z bazy (jsonb) — `null` dla braku albo nieznanego kształtu. */
export function parseDuplicateCheck(value: unknown): KsefDuplicateCheck | null {
  if (!isRecord(value) || value.v !== 1) return null;
  const reason = value.reason;
  if (typeof reason !== 'string' || !(DUPLICATE_CHECK_REASONS as readonly string[]).includes(reason)) return null;
  const known = isRecord(value.knownInvoice) && str(value.knownInvoice.id)
    ? { id: str(value.knownInvoice.id)!, internalNumber: str(value.knownInvoice.internalNumber) }
    : null;
  const r = value.recheck;
  const recheck = isRecord(r) && typeof r.reason === 'string' && (DUPLICATE_CHECK_REASONS as readonly string[]).includes(r.reason)
    ? { reason: r.reason as DuplicateCheckReason, httpStatus: typeof r.httpStatus === 'number' ? r.httpStatus : null, checkedAt: str(r.checkedAt) ?? '' }
    : null;
  const decision = parseDecision(value.decision);
  return {
    v: 1,
    env: str(value.env) ?? '',
    checkedAt: str(value.checkedAt) ?? '',
    reason: reason as DuplicateCheckReason,
    sha256: str(value.sha256),
    archivePath: str(value.archivePath),
    sizeBytes: typeof value.sizeBytes === 'number' ? value.sizeBytes : null,
    summary: parseSummary(value.summary),
    sameContentExceptHeader: bool(value.sameContentExceptHeader),
    ownHistory: bool(value.ownHistory),
    acquiredAt: str(value.acquiredAt),
    httpStatus: typeof value.httpStatus === 'number' ? value.httpStatus : null,
    knownInvoice: known,
    recheck,
    ...(decision ? { decision } : {}),
  };
}

/** `original_check.decision` — `{choice, via, at}` tylko przy poprawnych wartościach (reszta zapisu RPC zostaje w bazie). */
function parseDecision(value: unknown): KsefDuplicateDecisionRecord | null {
  if (!isRecord(value)) return null;
  const { choice, via, at } = value;
  if (choice !== 'same_sale' && choice !== 'other_sale') return null;
  if (via !== 'client' && via !== 'operator') return null;
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return null;
  return { choice, via, at };
}

// ─── PR C — sygnatury kontraktu (commit 1); ciała: commit 3 (grupa B) ───────
/* eslint-disable @typescript-eslint/no-unused-vars -- PR C kontrakt: sygnatury bez ciał, wyłącznik znika z ciałami */

/**
 * Lustro `ksef_duplicate_gate_ok` (4.4a): `v = 1`, `rules` liczbą, `kind`
 * `importable`|`review`, `problems` tablicą napisów, `kind = 'importable'` ⇔
 * `problems` puste. `null`/inny typ → `false`. Nie sprawdza `preview`
 * ani `release` (tego SQL nie czyta przy poprawności bramy).
 */
export function originalGateOk(gate: unknown): boolean {
  throw new Error('PR C: nie zaimplementowane');
}

/**
 * `original_check.importGate` z bazy (5.1 punkt 4): sprawdza to, co czyta
 * oferta (`originalGateOk`) — zły kształt → `null` (klucz pominięty w
 * `parseDuplicateCheck`, czyli `recheck-needed`); `preview` (obiekt albo
 * `null`) zostaje BEZ przebudowy; `release` w całości, gdy ma kształt
 * `KsefOriginalRelease` (`at` — dowolny niepusty napis, nie tylko data: SQL
 * sprawdza sam typ, więc oferta TS z odczytanych danych zgadza się z SQL),
 * inaczej klucz `release` pominięty.
 */
export function parseImportGate(value: unknown): KsefOriginalImportGate | null {
  throw new Error('PR C: nie zaimplementowane');
}

/**
 * Dzień nadania numeru KSeF oryginałowi (RRRR-MM-DD, Europe/Warsaw):
 * `acquiredAt`, a bez niego data z numeru KSeF (`NIP-RRRRMMDD-…`); `null`,
 * gdy żadnej nie da się odczytać. Ten sam wiersz „Numer nadany w KSeF” co
 * `describeDuplicateOriginal` (`{dzien}` w `FAKTFLOW.INTRO_RECORD_*`).
 */
export function originalAssignedDay(check: Pick<KsefDuplicateCheck, 'acquiredAt'> | null, ksefNumber: string): string | null {
  throw new Error('PR C: nie zaimplementowane');
}

/* eslint-enable @typescript-eslint/no-unused-vars */

export interface DuplicateOriginalView {
  /** Nagłówek panelu na karcie faktury. */
  title: string;
  /** Wiersze „etykieta — wartość” danych oryginału (tylko znane). */
  rows: ReadonlyArray<{ label: string; value: string }>;
  /** Co to znaczy i co robić (bez obietnic przycisku, którego jeszcze nie ma). */
  note: string;
  /** Odnośnik pod notatką — dokument Y przy `known-number` (C16); `null` dla każdego innego powodu. */
  link: { href: string; label: string } | null;
}

const DONT_REISSUE = 'Nie wystawiaj tej faktury ponownie.';

/**
 * Notatki panelu „W KSeF jest już faktura o tym numerze” (D-A4-1b-3 PR B, 2.11.B):
 * bez „zajmujemy się” i „operatora” (reguła 07.10.2026), z adresem pomocy.
 * W przeglądzie prawnika razem z `DUPLICATE_DECISION_TEXTS` (decyzje A i 8).
 * `{doc}` = „Faktura {nr}” albo „Ta faktura”.
 */
export const DUPLICATE_ORIGINAL_NOTES = {
  /** `known-number` bez decyzji w panelu (zapis PR A bez danych, własna historia, known-stale). */
  KNOWN_NUMBER_NOTE: (k: string, y: string, nr: string) =>
    `W FaktFlow numer KSeF ${k} ma już dokument ${y} — te dane się nie zgadzają i musimy je wyjaśnić, zanim zdecydujesz, czym jest ten dokument. Napisz do nas: pomoc@faktflow.pl, podając numer ${nr}. ${DONT_REISSUE}`,
  /** Odnośnik do dokumentu Y (`/invoices/{Y.id}`). */
  KNOWN_LINK: (y: string) => `Zobacz dokument ${y}`,
  /** Odmowa pobrania inna niż 403. */
  DOWNLOAD_REFUSED_NOTE:
    `Nie mogliśmy pobrać treści tej faktury z KSeF — sprawdzimy ją ponownie automatycznie (zwykle w ciągu 2 dni); pytania: pomoc FaktFlow (pomoc@faktflow.pl), podaj numer faktury. ${DONT_REISSUE}`,
  /** Pobranie, magazyn albo archiwum chwilowo nieudane — panel widać dopiero po wyczerpaniu ponowień joba. */
  PENDING_NOTE:
    `Nie udało się jeszcze sprawdzić treści tej faktury w KSeF — sprawdzimy ponownie automatycznie (zwykle w ciągu 2 dni). Jeśli ten komunikat zostanie dłużej, napisz do nas: pomoc@faktflow.pl, podając numer faktury. ${DONT_REISSUE}`,
  DEFAULT_NOTE: (doc: string) =>
    `${doc} nie została przyjęta, bo KSeF ma już fakturę Twojej firmy o tym numerze (dane wyżej). Tej sprawy nie rozstrzygniesz jeszcze w panelu — pytania: pomoc FaktFlow (pomoc@faktflow.pl), podaj numer faktury. ${DONT_REISSUE}`,
  OWN_HISTORY_NOTE: (doc: string) =>
    `${doc} nie została przyjęta, bo KSeF ma już wcześniejszą wersję tej faktury wysłaną z FaktFlow (dane wyżej). Tej sprawy nie rozstrzygniesz jeszcze w panelu — pytania: pomoc FaktFlow (pomoc@faktflow.pl), podaj numer faktury. ${DONT_REISSUE}`,
} as const;

/** Dzień w Polsce (Europe/Warsaw) jako RRRR-MM-DD — nie dzień w UTC. */
function warsawDay(iso: string): string | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(at);
  const get = (type: 'year' | 'month' | 'day') => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Data `RRRR-MM-DD` z numeru KSeF (`NIP-RRRRMMDD-…`) — gdy KSeF nie podał daty nadania. */
function dateFromKsefNumber(ksefNumber: string): string | null {
  const m = /^\d{10}-(\d{4})(\d{2})(\d{2})-/.exec(ksefNumber);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

const PROGRAM_FAKTFLOW = 'KSeF SaaS v1.0';

/**
 * Panel „W KSeF jest już faktura o tym numerze” dla klienta: fakty z KSeF
 * i notatka. Gdy decyzja jest dostępna (`no-own-file`, `known-number` z danymi
 * oryginału — `duplicateDecisionOptions`), karta pokazuje zamiast notatki panel
 * decyzji; notatka zostaje dla pozostałych powodów (D-A4-1b-3 PR B).
 */
export function describeDuplicateOriginal(
  invoiceNumber: string | null,
  ksefNumber: string,
  check: KsefDuplicateCheck | null,
): DuplicateOriginalView {
  const s = check?.summary ?? null;
  const rows: Array<{ label: string; value: string }> = [{ label: 'Numer KSeF', value: ksefNumber }];
  const assigned = (check?.acquiredAt ? warsawDay(check.acquiredAt) : null) ?? dateFromKsefNumber(ksefNumber);
  if (assigned) rows.push({ label: 'Numer nadany w KSeF', value: assigned });
  if (s?.number) rows.push({ label: 'Numer faktury', value: s.number });
  if (s?.issueDate) rows.push({ label: 'Data wystawienia', value: s.issueDate });
  const buyer = [s?.buyerName, s?.buyerNip ? `NIP ${s.buyerNip}` : null].filter(Boolean).join(', ');
  if (buyer) rows.push({ label: 'Nabywca', value: buyer });
  if (s?.gross) rows.push({ label: 'Kwota brutto', value: `${s.gross} ${s.currency ?? 'PLN'}` });
  if (s?.systemInfo) {
    rows.push({ label: 'Program', value: s.systemInfo === PROGRAM_FAKTFLOW ? 'FaktFlow' : s.systemInfo });
  }

  const doc = invoiceNumber ? `Faktura ${invoiceNumber}` : 'Ta faktura';
  const N = DUPLICATE_ORIGINAL_NOTES;
  let note: string;
  let link: DuplicateOriginalView['link'] = null;
  switch (check?.reason) {
    case 'download-refused':
      note = check.httpStatus === 403
        ? 'Nie mogliśmy pobrać treści tej faktury z KSeF — dane logowania KSeF w FaktFlow nie mają uprawnienia do odczytu ' +
          'faktur (InvoiceRead). Sprawdź uprawnienia w Aplikacji Podatnika KSeF albo podłącz KSeF ponownie w Ustawieniach → KSeF. ' +
          DONT_REISSUE
        : N.DOWNLOAD_REFUSED_NOTE;
      break;
    case 'download-pending':
    case 'storage-pending':
    case 'archive-pending':
      // Panel widać dopiero po wyczerpaniu ponowień joba — następne sprawdzenie robi cron (po 48 h).
      note = N.PENDING_NOTE;
      break;
    case 'known-number':
      // Notatka tylko przy odmowie decyzji (zapis PR A bez danych, własna historia,
      // known-stale): przy decyzji dostępnej karta pokazuje panel (C16: „dokument {Y}”).
      if (check.knownInvoice) {
        const y = check.knownInvoice.internalNumber ?? 'bez numeru';
        note = N.KNOWN_NUMBER_NOTE(ksefNumber, y, invoiceNumber ?? 'faktury');
        link = { href: `/invoices/${encodeURIComponent(check.knownInvoice.id)}`, label: N.KNOWN_LINK(y) };
      } else {
        note = N.DEFAULT_NOTE(doc);
      }
      break;
    default:
      note = check?.reason === 'faktflow-original' && check.ownHistory ? N.OWN_HISTORY_NOTE(doc) : N.DEFAULT_NOTE(doc);
  }
  return { title: 'W KSeF jest już faktura o tym numerze', rows, note, link };
}
