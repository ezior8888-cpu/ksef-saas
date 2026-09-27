/**
 * Formaty eksportu chwilowo wyłączone — z powodem, który widzi człowiek.
 *
 * JPK_V7M: generator tworzy strukturę JPK_V7M(2), a od rozliczenia za luty
 * 2026 obowiązuje JPK_V7M(3) (wzór CRWDE 2025/12/19/14090) z numerem KSeF
 * albo oznaczeniem OFF/BFK/DI w każdym wierszu ewidencji. Plik (2) nie
 * przejdzie przez bramkę MF, a brakuje w nim też sprzedaży zwolnionej (K_10)
 * i 0% (K_13). Decyzja Igora 27.09.2026: wyłączyć do czasu przebudowy.
 *
 * Bez importów — czyta to także komponent kliencki.
 */
export const SUSPENDED_EXPORT_FORMATS: Readonly<Record<string, string>> = {
  jpk_v7m:
    'JPK_V7M jest chwilowo wyłączony: przechodzimy na wersję JPK_V7M(3), obowiązującą od rozliczenia za luty 2026. Dotychczasowy plik nie przeszedłby przez bramkę Ministerstwa Finansów.',
};

export function isExportFormatSuspended(format: string): boolean {
  return Object.prototype.hasOwnProperty.call(SUSPENDED_EXPORT_FORMATS, format);
}
