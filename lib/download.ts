/**
 * Zapis Bloba jako pliku do pobrania — wspólny helper dla całej aplikacji.
 *
 * Dwa szczegóły decydują, czy Safari faktycznie zapisze plik:
 *
 *  1. Kotwica musi trafić do DOM przed kliknięciem — `click()` na elemencie
 *     poza drzewem dokumentu bywa ignorowane.
 *  2. Obiektu URL NIE wolno zwolnić w tym samym ticku co kliknięcie.
 *     Przeglądarka nie zdąży rozpocząć zapisu i pobieranie znika bez
 *     żadnego błędu — ani wyjątku w konsoli, ani komunikatu dla użytkownika.
 *
 * Wcześniej każdy z siedmiu punktów pobierania miał własną kopię tego kodu
 * i wszystkie zwalniały URL natychmiast. Sprzątanie jest teraz odroczone;
 * przeciek nie grozi, bo zwolnienie i tak nastąpi, tylko chwilę później.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  // Z zapasem na wolniejsze urządzenia i duże pliki (paczka ZIP z fakturami).
  window.setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 30_000);
}
