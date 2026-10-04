-- 00143_ksef_error_code_env_mismatch_terminal.sql
--
-- D-A4-2 (decyzja Bartosza 04.10.2026, plan „zero zgubionych faktur”):
-- `ENV_MISMATCH` — zdarzenie wysyłki pochodzi z innego środowiska KSeF niż
-- skonfigurowane w workerze (np. faktura zlecona na TEST, worker już na PROD,
-- albo worker bez poprawnego `KSEF_ENV`). Runner odmawia, zanim dotknie KSeF.
--
-- Dotąd klasa `reconcile`: `reset_ksef_send` odmawiał powrotu do szkicu,
-- klient nie miał przycisku, operator — tylko „Tylko uzgodnij” przy otwartym
-- wpisie. Bez wpisu: ślepa uliczka. A `requeue_ksef_send` klasy reconcile nie
-- blokował — ponowienie (nowe zdarzenie z BIEŻĄCYM środowiskiem) wysłałoby
-- dokument zlecony na TEST jako prawdziwą fakturę na PROD; chronił przed tym
-- tylko przycisk.
--
-- Teraz klasa `terminal` („ta wysyłka nie dojdzie do skutku — tylko szkic”,
-- jak `KSEF_NUMBER_TAKEN`): RPC z 00131 bez zmian w funkcjach —
--   - `reset_ksef_send` przepuszcza szkic, gdy nie ma dowodu kontaktu;
--     z dowodem odmawia (operator: „Tylko uzgodnij”);
--   - `requeue_ksef_send` odmawia ponowienia, przepuszcza tylko tryb
--     „tylko uzgodnij”.
-- Klient wraca do szkicu i decyduje: wysłać fakturę w bieżącym środowisku
-- albo jej nie wystawiać.
--
-- PRZED wdrożeniem kodu: UPDATE jednego wiersza tabeli referencyjnej (klasa
-- i komunikat), bez danych klientów, bez DROP. Na produkcji 04.10.2026 żadna
-- faktura nie ma tego kodu (0 wierszy). Stary kod z nową klasą: przycisków
-- nie przybywa (lustro klas w kodzie mówi jeszcze reconcile), baza tylko
-- przestaje przepuszczać ponowienie — kierunek bezpieczny.
-- Wycofanie: UPDATE z powrotem na 'reconcile' i poprzedni komunikat.

BEGIN;

UPDATE public.ksef_error_codes
   SET class = 'terminal',
       client_message = 'Tej wysyłki nie wykonaliśmy: zlecenie dotyczyło innego środowiska KSeF (testowego albo produkcyjnego) niż obecne ustawienie FaktFlow. Wróć do szkicu i zdecyduj, czy wysłać fakturę w obecnym środowisku. Jeśli powrót do szkicu jest zablokowany, wcześniejsza próba mogła dotrzeć do KSeF: nie wystawiaj tej faktury ponownie, uzgodni ją operator FaktFlow.'
 WHERE code = 'ENV_MISMATCH';

COMMIT;
