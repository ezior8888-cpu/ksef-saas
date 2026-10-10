/**
 * Brama pochodzenia oryginału z oznaczeniem FaktFlow (D-A4-1b-3 PR C, plan
 * „zero zgubionych faktur”, spec v3 5.2; decyzje Bartosza 08.10.2026 C1–C8).
 *
 * Przy werdykcie `faktflow-original` runner ocenia plik oryginału z KSeF:
 * czy wygląda na plik z generatora FaktFlow zwykłej faktury (`importable` —
 * klient zapisze go w FaktFlow sam), czy nie (`review` — przegląd operatora,
 * I5R). Wynik trafia na znacznik jako `original_check.importGate`; SQL z 00149
 * czyta go w ofercie (`ksef_duplicate_original_offer`) i w blokadzie.
 *
 * Reguły są jawne (T2): każda odpowiada temu, czego generator FaktFlow
 * zwykłej faktury nie pisze; `parsed.warnings` NIE jest używane. Reguły
 * 1 (`currency`) i 2 (`parse`) kończą ocenę, pozostałe zbierane naraz,
 * w kolejności `ORIGINAL_GATE_PROBLEMS`. `preview` liczony, gdy plik się
 * odczytał (reguła 2 przeszła).
 *
 * CZYSTY moduł: bez bazy, magazynu, KSeF i zegara; nigdy nie rzuca (każdy
 * wyjątek → `parse`). Te same bajty i ta sama wersja reguł → ta sama brama
 * (ponowienie runnera od zera nadpisuje znacznik tym samym wynikiem).
 */

import type { ImportContent } from '@/lib/import/fa3-content';
import type { ImportLineAmounts } from '@/lib/import/fa3-line-amounts';
import type { ParsedInvoice } from '@/lib/import/fa3-parser';

import type { KsefOriginalImportGate } from './duplicate-check';

export interface OriginalGateInput {
  /** Plik oryginału (`decodeKsefXml(originalBytes)`). */
  xml: string;
  /** K — numer KSeF oryginału. */
  ksefNumber: string;
  /** Numer naszego dokumentu X (`invoice.internalNumber ?? ''`) — reguła 5 `number`. */
  internalNumber: string;
  /** NIP firmy (10 cyfr) — reguła 6 `seller`. */
  tenantNip: string;
}

export interface OriginalGateEvaluation {
  gate: KsefOriginalImportGate;
  /** `null`, gdy plik nie dał się odczytać (`parse`) albo waluta ≠ PLN (`currency`). */
  parsed: ParsedInvoice | null;
  content: ImportContent | null;
  amounts: ImportLineAmounts | null;
}

/* eslint-disable @typescript-eslint/no-unused-vars -- PR C kontrakt (commit 1): sygnatura bez ciała, wyłącznik znika z ciałem */

/** Ocena pliku oryginału (reguły 5.2). Czysta, deterministyczna, nigdy nie rzuca. */
export function evaluateOriginalGate(input: OriginalGateInput): OriginalGateEvaluation {
  throw new Error('PR C: nie zaimplementowane');
}

/* eslint-enable @typescript-eslint/no-unused-vars */
