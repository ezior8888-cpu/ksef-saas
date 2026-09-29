/**
 * Formaty eksportu chwilowo wyłączone — z powodem, który widzi człowiek.
 *
 * JPK_V7M: generator tworzy strukturę JPK_V7M(2), a od rozliczenia za luty
 * 2026 obowiązuje JPK_V7M(3) (wzór CRWDE 2025/12/19/14090) z numerem KSeF
 * albo oznaczeniem OFF/BFK/DI w każdym wierszu ewidencji. Plik (2) nie
 * przejdzie przez bramkę MF, a brakuje w nim też sprzedaży zwolnionej (K_10)
 * i 0% (K_13). Decyzja Igora 27.09.2026: wyłączyć do czasu przebudowy.
 *
 * Comarch Optima: generator tworzył własny, zmyślony układ (`<Faktury>`,
 * `<Naglowek>`, `<Pozycje>`, przestrzeń `…/cdn/optima/faktury`). Optima
 * importuje rejestry VAT w formacie „Praca rozproszona”: `<ROOT
 * xmlns="http://www.comarch.pl/cdn/optima/offline">` z sekcjami
 * `REJESTRY_SPRZEDAZY_VAT` i `KONTRAHENCI`. Decyzja Igora 29.09.2026:
 * wyłączyć teraz, przebudować, odblokować po próbnym imporcie w Optimie.
 *
 * Bez importów — czyta to także komponent kliencki.
 */
export const SUSPENDED_EXPORT_FORMATS: Readonly<Record<string, string>> = {
  jpk_v7m:
    'JPK_V7M jest chwilowo wyłączony: przechodzimy na wersję JPK_V7M(3), obowiązującą od rozliczenia za luty 2026. Dotychczasowy plik nie przeszedłby przez bramkę Ministerstwa Finansów.',
  comarch_optima:
    'Eksport do Comarch Optima jest chwilowo wyłączony: dotychczasowy plik nie miał układu, który Optima importuje. Do czasu poprawki księgowa dostaje uniwersalny CSV.',
};

export function isExportFormatSuspended(format: string): boolean {
  return Object.prototype.hasOwnProperty.call(SUSPENDED_EXPORT_FORMATS, format);
}
