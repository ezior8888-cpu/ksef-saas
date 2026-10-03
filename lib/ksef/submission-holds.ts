/**
 * Hamulce wysyłki do KSeF (krok 5 planu automatyzacji).
 *
 * Dwie blokady, sprawdzane w tych samych miejscach co wstrzymanie ROZ
 * (`roz-submission-hold.ts`): przy kolejkowaniu z akcji użytkownika, na
 * starcie joba — przed sondą zdrowia i Offline24 — oraz tuż przed wysyłką.
 *
 * 1. Globalny wyłącznik `killAllKsefSubmissions` (AUD-63). Flaga istniała,
 *    ale nikt jej nie czytał — operator nie miał czym zatrzymać wysyłek.
 *    Odczyt autorytatywny: awaria bazy NIE może po cichu zdjąć wyłącznika.
 * 2. Faktury korygujące na KSeF produkcyjnym (AUD-03, AUD-04): generator
 *    wysyła wartości „po” zamiast różnicy i zamienia `zw` na 23%. Do czasu
 *    poprawki korekta zostaje szkicem. Na KSeF TEST wysyłka zostaje, żeby
 *    dało się sprawdzić poprawkę — dokumenty testowe nie mają skutków prawnych.
 *
 * Znaczniki w treści błędu przechodzą przez oba backendy jobów; handler
 * wyczerpania prób zamienia je na neutralny stan „do uzgodnienia”
 * (bez komunikatu „odrzucona”, jak `ROZ_HOLD_RECONCILE`).
 */

import { getGlobalFlagForExecution } from '@/lib/feature-flags/global-flags';
import type { KsefEnvironment } from '@/types/ksef';

export const KSEF_PAUSED = 'KSEF_PAUSED';
export const KOR_HOLD = 'KOR_HOLD';

/** Odmowa przy kolejkowaniu: dokument zostaje szkicem, wysyła go człowiek. */
export const KSEF_PAUSED_MESSAGE =
  'Wysyłka faktur do KSeF jest chwilowo wstrzymana przez operatora. Faktura została zapisana jako szkic — wyślij ją ponownie, gdy wysyłka zostanie przywrócona.';

export const KOR_HOLD_MESSAGE =
  'Wysyłka faktur korygujących do KSeF jest tymczasowo wstrzymana do czasu poprawki ich kwot. Korekta została zapisana jako szkic.';

/**
 * Hamulec napotkany już W JOBIE: faktura ma status `failed` z kodem hamulca,
 * a cron cyklu życia ponawia ją sam po zdjęciu hamulca (I7, PR 4). Komunikat
 * nie może kazać klientowi „wysłać ponownie” — do 03.10.2026 kazał, choć
 * ponowna wysyłka nie istniała (K3 z rewizji).
 */
export const KSEF_PAUSED_JOB_MESSAGE =
  'Wysyłka faktur do KSeF jest chwilowo wstrzymana przez operatora. Faktura wyjdzie automatycznie po przywróceniu wysyłki.';

export const KOR_HOLD_JOB_MESSAGE =
  'Wysyłka faktur korygujących do KSeF jest tymczasowo wstrzymana do czasu poprawki ich kwot. Korekta wyjdzie automatycznie po zdjęciu blokady.';

/** Czy operator zatrzymał wszystkie wysyłki. Rzuca przy błędzie bazy (fail-closed). */
export async function isKsefSubmissionPaused(): Promise<boolean> {
  return getGlobalFlagForExecution('killAllKsefSubmissions');
}

export function isCorrectionSubmission(input: {
  invoiceType?: string | null;
  storedInvoiceType?: string | null;
  invoiceKind?: string | null;
  auditKind?: string | null;
  correctionData?: unknown;
}): boolean {
  return input.invoiceType?.toUpperCase() === 'KOR'
    || input.storedInvoiceType?.toUpperCase() === 'KOR'
    || input.invoiceKind?.toLowerCase() === 'correction'
    || input.auditKind?.toLowerCase() === 'correction'
    || input.correctionData != null;
}

/** Korekty są wstrzymane tylko na KSeF produkcyjnym. */
export function isCorrectionHeldForEnv(env: KsefEnvironment): boolean {
  return env === 'production';
}

/** Treść błędu joba ze znacznikiem neutralnej blokady (wersja „wyjdzie automatycznie”). */
export function heldErrorMessage(code: typeof KSEF_PAUSED | typeof KOR_HOLD): string {
  return `[${code}] ${code === KSEF_PAUSED ? KSEF_PAUSED_JOB_MESSAGE : KOR_HOLD_JOB_MESSAGE}`;
}
