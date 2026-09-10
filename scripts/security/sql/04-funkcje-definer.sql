-- ═══════════════════════════════════════════════════════════════
-- 04 — Funkcje SECURITY DEFINER i helper tożsamości
-- ═══════════════════════════════════════════════════════════════
--
-- TYLKO ODCZYT.
--
-- PO CO: funkcja `SECURITY DEFINER` działa z uprawnieniami tego, kto ją
-- napisał, a nie tego, kto ją wywołuje. Jeżeli nie ma przypiętej ścieżki
-- wyszukiwania (`SET search_path`), atakujący może stworzyć własną tabelę
-- albo funkcję o tej samej nazwie w schemacie, który jest przeszukiwany
-- wcześniej — i funkcja wykona JEGO kod z uprawnieniami właściciela.
--
-- W repozytorium jest 31 funkcji, z tego 17 plików migracji zawiera
-- `SECURITY DEFINER`, a w co najmniej ośmiu liczba `SECURITY DEFINER`
-- przewyższa liczbę `SET search_path`. To zapytanie mówi, jak jest naprawdę.

\echo '═══ 4.1 Funkcje DEFINER BEZ przypiętej ścieżki wyszukiwania ═══'

SELECT
  p.proname                   AS funkcja,
  pg_get_function_identity_arguments(p.oid) AS argumenty,
  pg_get_userbyid(p.proowner) AS wlasciciel,
  p.proconfig                 AS ustawienia
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef
  AND (
    p.proconfig IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM unnest(p.proconfig) AS cfg
      WHERE cfg LIKE 'search\_path=%'
    )
  )
ORDER BY p.proname;

-- KAŻDY WIERSZ TEJ LISTY TO ZNALEZISKO. Pusty wynik = temat zamknięty.
-- Naprawa jest jednolinijkowa (`ALTER FUNCTION ... SET search_path = public,
-- pg_temp`), ale NIE ROBIMY JEJ TERAZ — audyt jest w trybie „tylko raport".

\echo ''
\echo '═══ 4.2 Wszystkie funkcje DEFINER z ustawieniami ═══'

SELECT
  p.proname                   AS funkcja,
  pg_get_userbyid(p.proowner) AS wlasciciel,
  COALESCE(array_to_string(p.proconfig, ', '), '— BRAK USTAWIEŃ —') AS ustawienia
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
ORDER BY p.proname;

\echo ''
\echo '═══ 4.3 Treść `get_current_tenant_id()` — fundament całej izolacji ═══'
-- To jest NAJWAŻNIEJSZE ZAPYTANIE W CAŁYM AUDYCIE BAZY.
--
-- Cała architektura wielonajemcowa opiera się na jednym założeniu, opisanym
-- w `lib/supabase/active-org.ts`: klient przekazuje identyfikator organizacji
-- w nagłówku `x-active-org`, a ta funkcja SPRAWDZA, czy zalogowany użytkownik
-- jest jej aktywnym członkiem. Jeśli nie — zwraca NULL i wszystkie polityki
-- odmawiają dostępu.
--
-- Jeżeli ta funkcja zwraca nagłówek BEZ sprawdzenia członkostwa, to podmiana
-- jednej wartości w ciasteczku otwiera dane dowolnej organizacji w systemie.
-- Wtedy nie mamy błędu do naprawienia, tylko wyciek do zgłoszenia.

SELECT pg_get_functiondef(p.oid) AS definicja
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'get_current_tenant_id';

-- CO MUSI BYĆ W TREŚCI, ŻEBY UZNAĆ TO ZA POPRAWNE:
--   1. odczyt nagłówka `x-active-org` z `current_setting('request.headers', ...)`,
--   2. zapytanie do `memberships` z warunkiem na `auth.uid()` ORAZ na
--      identyfikator z nagłówka, ORAZ na `status = 'active'`,
--   3. zwrócenie NULL, gdy takiego wiersza nie ma.
--
-- Brak któregokolwiek z tych trzech elementów = ustalenie krytyczne.
