-- 00141_ksef_error_code_not_in_ksef.sql
--
-- A2b z planu „zero zgubionych faktur” (ustalenie z sesji A2, 04.10.2026):
-- tryb „tylko uzgodnij” kończył się `failed RESULT_UNCERTAIN` także wtedy,
-- gdy uzgodnienie STWIERDZIŁO, że KSeF nie ma faktury (zamiar porzucony
-- w pustej sesji, wpis `sent` zamknięty jako STALE) i faktura nie ma już
-- dowodu kontaktu. Klasa `reconcile` blokuje wtedy wszystko: klient nie ma
-- przycisku, operator też nie („Wyślij ponownie” — klasa reconcile, „Tylko
-- uzgodnij” — brak otwartego wpisu, „Wróć do szkicu” — klasa reconcile
-- w `reset_ksef_send`). Ślepa uliczka.
--
-- Nowy kod katalogu `NOT_IN_KSEF`, klasa `transient`, BEZ automatycznego
-- ponowienia (`auto_requeue = false`): klient wysyła ponownie albo wraca do
-- szkicu; cron nie wysyła sam, bo to decyzja o dacie wystawienia (B1/B2).
-- RPC z 00131 czytają klasę z tego katalogu (`ksef_error_class`), więc
-- `requeue_ksef_send` i `reset_ksef_send` dopuszczają kod bez zmian w funkcjach.
--
-- PRZED wdrożeniem kodu (addytywna): jeden wiersz w tabeli referencyjnej,
-- bez UPDATE danych klientów, bez DROP. Stary kod go nie zapisuje; nowy kod
-- bez tego wiersza dostałby I4 (kod spoza katalogu). Wycofanie: DELETE tego
-- wiersza (za zgodą), gdy żadna faktura nie ma tego kodu.

BEGIN;

INSERT INTO public.ksef_error_codes (code, class, auto_requeue, client_message) VALUES
  ('NOT_IN_KSEF', 'transient', false,
   'KSeF nie ma tej faktury — poprzednia wysyłka do niego nie dotarła. Wyślij ją ponownie albo wróć do szkicu.')
ON CONFLICT (code) DO NOTHING;

COMMIT;
