-- ═══════════════════════════════════════════════════════════════
-- 00071 — GDPR: jedno aktywne żądanie usunięcia na użytkownika
-- ═══════════════════════════════════════════════════════════════
--
-- Źródło projektu: docs/security/PROPOZYCJE-SCHEMATU-GDPR.md (Astra/Masło).
--
-- ── MUSI BYĆ URUCHOMIONA JAKO OSOBNE WYWOŁANIE PSQL ─────────────
-- Predykat indeksu odwołuje się do wartości ENUM `processing`, dodanej
-- w 00070. PostgreSQL nie pozwala użyć nowej wartości ENUM w tej samej
-- transakcji, w której ją dodano. Uruchomienie 00070 i 00071 w jednym
-- `psql --single-transaction` ZAKOŃCZY SIĘ BŁĘDEM. Wgrywaj osobno.
--
-- ── Po co to jest ───────────────────────────────────────────────
-- Bez tego ograniczenia dwa równoległe zgłoszenia mogą utworzyć dwa
-- żądania dla jednego użytkownika, a anulowanie jednego NIE powstrzyma
-- drugiego — konto zostanie usunięte mimo wycofania decyzji. To jest
-- realny błąd danych, nie teoria.
--
-- Stan `processing` również zajmuje miejsce aktywnego żądania, więc
-- podczas trwającego usuwania nie da się utworzyć kolejnego.
--
-- ── Wpływ na kod WDROŻONY dziś (b9c3703) ────────────────────────
-- Sprawdzone w lib/gdpr/deletion.ts: `createGdprRequest` już teraz
-- zapobiega duplikatom na poziomie aplikacji — robi SELECT istniejących
-- żądań i zwraca `pending`, jeśli istnieje (idempotencja). Indeks może
-- więc zadziałać WYŁĄCZNIE przy prawdziwym wyścigu: dwa równoległe
-- zgłoszenia przechodzą SELECT, zanim którekolwiek zdąży zrobić INSERT.
--
-- W takim wyścigu stary kod rzuci `gdpr_request_insert_failed` zamiast
-- po cichu utworzyć niebezpieczny duplikat. To zmiana zachowania, ale
-- na korzyść: błąd widoczny dla użytkownika, który naprawia się sam
-- przy ponowieniu (druga próba trafia w ścieżkę idempotencji), zamiast
-- cichego stanu, w którym anulowanie nie działa. Nowy kod z PR #1
-- obsługuje konflikt 23505 wprost, odczytując istniejące żądanie.
--
-- ── Sprawdzone przed wgraniem ───────────────────────────────────
-- Tabela ma 0 wierszy, brak duplikatów do rozstrzygnięcia:
--   SELECT user_id, count(*) FROM public.gdpr_deletion_requests
--   WHERE user_id IS NOT NULL AND status IN ('pending','processing')
--   GROUP BY user_id HAVING count(*) > 1;
--   -- wynik: 0 wierszy
--
-- GDYBY W PRZYSZŁOŚCI DUPLIKATY ISTNIAŁY: nie kasować automatycznie
-- ani nie wybierać „najnowszego". Trzeba uwzględnić wcześniejsze
-- anulowania i faktyczną decyzję użytkownika. Nierozstrzygnięte
-- duplikaty blokują wydanie — CREATE UNIQUE INDEX po prostu padnie.
--
-- ── Wycofanie ───────────────────────────────────────────────────
-- DROP INDEX public.idx_gdpr_one_active_request_per_user;
-- Bezpieczne i bezstratne.

CREATE UNIQUE INDEX IF NOT EXISTS idx_gdpr_one_active_request_per_user
  ON public.gdpr_deletion_requests (user_id)
  WHERE user_id IS NOT NULL AND status IN ('pending', 'processing');

COMMENT ON INDEX public.idx_gdpr_one_active_request_per_user IS
  'Jedno aktywne żądanie usunięcia konta na użytkownika (00071). Chroni przed duplikatem, w którym anulowanie jednego żądania nie powstrzymuje drugiego.';

-- ── Weryfikacja po wgraniu ──────────────────────────────────────
-- SELECT indexdef FROM pg_indexes WHERE schemaname = 'public'
--   AND indexname = 'idx_gdpr_one_active_request_per_user';
