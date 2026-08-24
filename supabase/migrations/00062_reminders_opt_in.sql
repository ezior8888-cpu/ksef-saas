-- Migracja 00062: koniec automatycznych ponagleń — nowe znaczenie flag.
--
-- KONTEKST (krok 6 planu agenta FLO): do 24.08.2026 cron `reminder-scheduler`
-- sam planował wysyłkę, a `send-reminder` sam wysyłał maila do kontrahenta
-- klienta. Żadnego kliknięcia człowieka po drodze. Od tej migracji:
--
--   · cron TWORZY PROPOZYCJĘ w `flo_proposals` (kind = 'payment.chase'),
--   · wysyłka wymaga `approvalId` — funkcja bez niego rzuca wyjątkiem,
--   · nie istnieje przełącznik „wysyłaj automatycznie", także w ustawieniach.
--
-- Ta migracja nie zmienia danych, tylko dokumentuje NOWE ZNACZENIE flag
-- w samej bazie — żeby ktoś, kto za rok zobaczy `enabled = true`, nie odczytał
-- tego jako zgody na automatyczną wysyłkę i nie „przywrócił" starego crona.
--
-- ŚWIADOMA DECYZJA CO DO DANYCH: nie ustawiamy istniejących wierszy na FALSE.
-- Klient, który wcześniej włączył „wysyłaj automatycznie", zgodził się na coś
-- MOCNIEJSZEGO niż to, co dostaje teraz (propozycja do zatwierdzenia zamiast
-- wysyłki). Zerowanie flagi odebrałoby mu funkcję bez powodu. Klient, który
-- miał FALSE, nadal nie dostanie żadnych propozycji — jego decyzja zostaje
-- uszanowana w obie strony.

COMMENT ON COLUMN public.reminder_settings.enabled IS
  'Czy FLO ma PROPONOWAĆ ponaglenia do zatwierdzenia. NIE oznacza zgody na '
  'automatyczną wysyłkę — ta nie istnieje: każda wiadomość do kontrahenta '
  'wymaga kliknięcia człowieka i żetonu zgody (flo_approvals).';

COMMENT ON COLUMN public.reminder_settings.stage_1_enabled IS
  'Czy FLO proponuje ponaglenie etapu 1. Wysyłka wyłącznie po zatwierdzeniu.';

COMMENT ON COLUMN public.reminder_settings.stage_2_enabled IS
  'Czy FLO proponuje ponaglenie etapu 2. Wysyłka wyłącznie po zatwierdzeniu.';

COMMENT ON COLUMN public.reminder_settings.stage_3_enabled IS
  'Czy FLO proponuje wezwanie do zapłaty (etap 3). Wysyłka wyłącznie po '
  'zatwierdzeniu, z osobną decyzją o odsetkach — domyślnie bez nich.';

COMMENT ON TABLE public.payment_reminders IS
  'Wysłane i zaplanowane ponaglenia. Od 24.08.2026 wiersz powstaje dopiero '
  'przy zatwierdzeniu propozycji przez człowieka — cron sam go nie tworzy.';
