/**
 * Wyłącznik rejestracji `disableSignups` (AUD-63).
 *
 * Flaga istniała w bazie i w bramce Telegrama (`/wylacz rejestracja`), ale
 * nikt jej nie czytał — bramka odpowiadała „Wyłączono”, a rejestracja szła
 * dalej. Czytają ją teraz: formularz e-mail (`signupWithEmail`, strona
 * `/register`) i zakładanie PIERWSZEJ firmy (`app/actions/organizations.ts`).
 * To drugie zamyka też Google i konta założone prosto w GoTrue: konto bez
 * firmy nic w aplikacji nie może. Zaproszenia do istniejących firm działają.
 *
 * Fail-closed: błąd odczytu = rejestracja zamknięta. Kosztu prawie nie ma —
 * gdy baza nie odpowiada, GoTrue (ta sama baza) i tak nie założy konta.
 */

import { getGlobalFlagForExecution } from './global-flags';

export const SIGNUPS_CLOSED_MESSAGE =
  'Rejestracja nowych kont jest chwilowo wstrzymana. Spróbuj ponownie później.';

export const FIRST_COMPANY_CLOSED_MESSAGE =
  'Zakładanie nowych firm jest chwilowo wstrzymane. Możesz zaakceptować zaproszenie albo spróbować później.';

/** Odczyt autorytatywny, bez cache — rejestracja to rzadki ruch. */
export async function isSignupClosed(): Promise<boolean> {
  try {
    return await getGlobalFlagForExecution('disableSignups');
  } catch {
    return true;
  }
}
