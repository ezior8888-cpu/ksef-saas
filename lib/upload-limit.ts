/**
 * Limit pliku wysyłanego z przeglądarki przez Server Action (plan
 * skalowania, sesja 4; HOR-V1, LIM-08, CPU-06).
 *
 * Next przyjmuje w ciele Server Action najwyżej 1 MB (domyślny
 * `serverActions.bodySizeLimit`, `next.config.ts` go nie zmienia) i odrzuca
 * większe żądanie, zanim akcja ruszy. Kontrole „max 10 MB” w akcjach
 * (`uploadExpensePhotoAction`, `startFileImportAction`) są więc dla panelu
 * nieosiągalne — działają tylko dla `/share-target`, który woła akcję jak
 * zwykłą funkcję. Przeglądarka sprawdza ten limit sama, żeby klient dostał
 * polski komunikat zamiast odrzuconego żądania.
 *
 * Podniesienie limitu działa na wszystkie Server Actions naraz, a akcja
 * trzyma plik 2–3 razy w pamięci jedynego procesu web — decyzja Bartosza.
 * Zmiana limitu w `next.config.ts` = zmiana dwóch stałych niżej.
 *
 * Ten plik nie importuje niczego, więc nadaje się i do klienta, i na serwer.
 */

/** Limit ciała Server Action w Next (`bodySizeLimit`, domyślnie 1 MB). */
export const ACTION_BODY_LIMIT_BYTES = 1024 * 1024;

/** Ten sam limit w komunikatach dla klienta. */
export const ACTION_FILE_LIMIT_LABEL = '1 MB';

/**
 * Zapas na resztę ciała żądania: granice multipart, nagłówek pola z nazwą
 * pliku i pole z argumentami akcji. Realnie ok. 0,5–1 KB, sprawdza to
 * `tests/unit/limit-wgrywania-akcji.test.ts` na prawdziwym koderze Reacta.
 */
const MULTIPART_RESERVE_BYTES = 16 * 1024;

/** Największy plik, jaki przeglądarka wyśle przez Server Action. */
export const ACTION_FILE_LIMIT_BYTES = ACTION_BODY_LIMIT_BYTES - MULTIPART_RESERVE_BYTES;

/** Rozmiar pliku do komunikatu: „300 KB”, „1,5 MB”. */
export function formatUploadSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
