-- Audyt #5: usuwa test-only helpery z bazy.
--
-- `test_as_user(uuid, uuid, text)` z migracji 00006/00007 robi `EXECUTE p_sql`
-- — dynamiczne SQL z konkatenacji. Granty są wyłącznie na `service_role`,
-- ale to oznacza, że KAŻDY wyciek `SUPABASE_SERVICE_ROLE_KEY` (Vercel envs,
-- log z błędem zawierającym konfigurację, leak przez `process.env` w SSR)
-- pivotuje do dowolnego SQL-a w schemacie public — eskalacja z access-token
-- do RCE w bazie.
--
-- Tę migrację MUSIMY uruchomić na produkcji. Lokalne testy Vitest
-- (`tests/rls-isolation.test.ts`) korzystają z prawdziwego flow
-- magic-link → access_token (`tests/helpers/tenant-client.ts`),
-- więc NIE potrzebują tej funkcji do działania — w razie gdyby ktoś
-- w przyszłości dopisał test wykorzystujący `test_as_user`, doinstaluj
-- helpery w `beforeAll` z osobnego fixture'a (np. `tests/sql/install-test-helpers.sql`),
-- zamiast cofać tę migrację.
--
-- Sygnatury w DROP muszą się zgadzać z definicjami z 00006/00007:
--   public.test_as_user(uuid, uuid, text)
--   public.install_test_helpers()

DROP FUNCTION IF EXISTS public.test_as_user(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.install_test_helpers();

COMMENT ON SCHEMA public IS
  'Test helpers (test_as_user, install_test_helpers) celowo usunięte w prod (audyt 00026). Używaj fixture `tests/sql/install-test-helpers.sql` w Vitest beforeAll, jeśli kiedyś będą potrzebne.';
