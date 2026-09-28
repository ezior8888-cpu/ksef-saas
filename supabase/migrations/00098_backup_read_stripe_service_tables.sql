-- ═══════════════════════════════════════════════════════════════
-- 00098 — nocny backup znów czyta każdą tabelę public
-- ═══════════════════════════════════════════════════════════════
--
-- 00078 i 00080 odebrały service_role WSZYSTKIE prawa do czterech tabel
-- obsługiwanych wyłącznie przez RPC. `cron.daily-db-snapshot`
-- (lib/backup/db-snapshot.ts) czyta każdą tabelę public jako service_role,
-- więc od wdrożenia 25.09 padał co noc na pierwszej z nich:
--   dump_table_failed: stripe_financial_case_refs: permission denied
-- Od 26.09 do wgrania tej migracji nie powstał żaden snapshot.
--
-- Zwracamy WYŁĄCZNIE odczyt — tak samo, jak 00080 zostawiło go dla
-- stripe_financial_cases. Zapisy (INSERT/UPDATE/DELETE) zostają odebrane
-- i idą tylko przez funkcje SECURITY DEFINER z 00078/00080.
-- anon i authenticated nie dostają niczego.
--
-- Strażnik: tests/unit/backup-readable-tables.test.ts — migracja, która
-- zabierze service_role odczyt tabeli spoza SKIP_TABLES, wywali CI.

GRANT SELECT ON public.stripe_subscription_sync_leases TO service_role;
GRANT SELECT ON public.stripe_financial_case_refs TO service_role;
GRANT SELECT ON public.stripe_financial_case_reopenings TO service_role;
GRANT SELECT ON public.stripe_financial_case_reviews TO service_role;
