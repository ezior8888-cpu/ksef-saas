/**
 * Wyłączniki funkcji agenta (mechanizm M8, wersja wstępna).
 *
 * PO CO OSOBNY MECHANIZM: istniejące flagi (`lib/feature-flags/`) opierają się
 * na kolumnach w tabeli — każda nowa flaga to migracja. Agent ma 33 funkcje
 * i część z nich jest gotowa, ale ŚWIADOMIE WYŁĄCZONA: czeka na opinię
 * prawnika albo na dane, których nie wolno brać z pamięci modelu.
 *
 * Trzymanie tej listy w kodzie ma jedną przewagę nad tabelą: powód wyłączenia
 * jest widoczny tam, gdzie ktoś będzie go szukał, i przechodzi przez przegląd
 * kodu. Włączenie funkcji prawnie wątpliwej wymaga wtedy commita z
 * uzasadnieniem, a nie kliknięcia w panelu o drugiej w nocy.
 *
 * Przełączniki per konto (krok 53 planu) dojdą osobno i będą warstwą NAD tym:
 * funkcja wyłączona tutaj pozostaje wyłączona niezależnie od ustawień konta.
 */

import { FLO_PROPOSAL_KINDS, type FloProposalKind } from '@/types/flo';

export type FloBlockReason =
  /** Czeka na odpowiedź prawnika — patrz bramka prawna w planie, część VI.2. */
  | 'legal'
  /** Działa, ale opiera się na danych, których nie potwierdził człowiek. */
  | 'unverified_data'
  /** Jeszcze nie zbudowana. */
  | 'not_built';

export interface FloKindStatus {
  enabled: boolean;
  reason?: FloBlockReason;
  /** Zdanie dla człowieka, który zajrzy tu za pół roku. */
  note?: string;
}

/**
 * Funkcje ZBUDOWANE, ale wyłączone. Wszystko, czego tu nie ma, a jest
 * zbudowane, działa; wszystko, czego nie ma w ogóle, i tak nie ma kodu.
 */
const BLOCKED: Partial<Record<FloProposalKind, FloKindStatus>> = {
  'payment.score': {
    enabled: false,
    reason: 'legal',
    note:
      'K-03: ocena terminowości płatności kontrahenta. Gdy kontrahentem jest ' +
      'jednoosobowa działalność, oceniamy zachowanie OSOBY FIZYCZNEJ — a to ' +
      'obszar, który akt o sztucznej inteligencji traktuje surowo. Włączyć ' +
      'dopiero po odpowiedzi na pytanie 3 z bramki prawnej.',
  },
  'payment.interest': {
    enabled: false,
    reason: 'unverified_data',
    note:
      'K-05: stawki odsetek to dane prawne, których nie wolno brać z pamięci ' +
      'modelu. Patrz RATES_VERIFIED w lib/flo/interest.ts — flaga i tabela ' +
      'muszą zostać potwierdzone razem.',
  },
  'tax.simulate': {
    enabled: false,
    reason: 'legal',
    note:
      'T-04: porównanie form opodatkowania na indywidualnych danych klienta. ' +
      'Pozycja CZERWONA w bramce prawnej — nie budujemy bez pisemnej opinii.',
  },
  'tax.deadline': {
    enabled: false,
    reason: 'legal',
    note: 'Grupa T czeka na zatwierdzenie treści komunikatów przez prawnika.',
  },
  'tax.limit': {
    enabled: false,
    reason: 'legal',
    note: 'Grupa T czeka na zatwierdzenie treści komunikatów przez prawnika.',
  },
  'tax.relief': {
    enabled: false,
    reason: 'legal',
    note: 'Grupa T czeka na zatwierdzenie treści komunikatów przez prawnika.',
  },
  'tax.setaside': {
    enabled: false,
    reason: 'legal',
    note: 'Grupa T czeka na zatwierdzenie treści komunikatów przez prawnika.',
  },
  'contractor.foreign': {
    enabled: false,
    reason: 'legal',
    note:
      'P-09: kwalifikacja transakcji zagranicznej. Treść musi zostać ' +
      'zatwierdzona, żeby agent nie wyszedł poza „zapytaj księgową".',
  },
};

export function kindStatus(kind: FloProposalKind): FloKindStatus {
  return BLOCKED[kind] ?? { enabled: true };
}

/**
 * Czy wolno w ogóle utworzyć propozycję tego rodzaju.
 *
 * Sprawdzane PRZED zapisem, nie przy wyświetlaniu: funkcja wyłączona ma nie
 * zostawiać śladu w bazie klienta. Inaczej po włączeniu wysypałaby się na
 * niego lawina kart sprzed miesięcy.
 */
export function isKindEnabled(kind: FloProposalKind): boolean {
  return kindStatus(kind).enabled;
}

/** Do panelu operatora i do raportu, co czeka na czyją decyzję. */
export function blockedKinds(): Array<{
  kind: FloProposalKind;
  status: FloKindStatus;
}> {
  return FLO_PROPOSAL_KINDS.filter((kind) => !isKindEnabled(kind)).map(
    (kind) => ({ kind, status: kindStatus(kind) }),
  );
}
