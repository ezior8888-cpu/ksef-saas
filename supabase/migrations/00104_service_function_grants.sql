-- 00104_service_function_grants.sql
--
-- AUD-30, AUD-64: funkcje wyłącznie dla backendu (service_role) miały
-- EXECUTE także dla `anon` i `authenticated`. W Supabase domyślne
-- uprawnienia nadają EXECUTE tym rolom JAWNIE, więc wcześniejsze
-- `REVOKE ... FROM PUBLIC` ich nie odbierało (stan produkcji z 02.10:
-- anon=EXECUTE na trzech z czterech, authenticated na wszystkich).
--
--   cleanup_old_audit_logs       — SECURITY DEFINER, kasuje stary audyt
--   auth_email_registered        — zdradza istnienie konta po adresie
--   refresh_dashboard_materialized_views — ciężkie przeliczenie widoków
--   increment_push_failed_count  — wyłącza cudze subskrypcje push
--
-- Aplikacja woła wszystkie cztery kluczem service_role (zadania w tle,
-- wysyłka push) — bez zmian w działaniu. Tylko REVOKE/GRANT.

REVOKE EXECUTE ON FUNCTION public.cleanup_old_audit_logs(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auth_email_registered(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_dashboard_materialized_views() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_push_failed_count(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.cleanup_old_audit_logs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.auth_email_registered(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_dashboard_materialized_views() TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_push_failed_count(uuid) TO service_role;
