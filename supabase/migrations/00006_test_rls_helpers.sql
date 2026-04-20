-- Testy RLS: funkcje pomocnicze (tylko dev/test).
-- Wywołanie z klienta: wyłącznie service_role (GRANT na końcu).
--
-- test_as_user MUSI być SECURITY INVOKER: w SECURITY DEFINER
-- PostgreSQL zabrania SET ROLE („cannot set parameter role within security-definer function”).
--
-- Sygnatury w REVOKE/GRANT/COMMENT: zawsze (uuid, uuid, text) — małe litery,
-- inaczej często: „function public.test_as_user(uuid, uuid, text) does not exist”.

-- -----------------------------------------------------------------
-- install_test_helpers — no-op / hook (np. blokada na produkcji).
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.install_test_helpers()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $install$
BEGIN
  NULL;
END;
$install$;

COMMENT ON FUNCTION public.install_test_helpers() IS
  'Rezerwa na helpery testowe; wywoływane z Vitest beforeAll.';

-- -----------------------------------------------------------------
-- test_as_user — dynamiczne SQL w kontekście roli authenticated + JWT (sub).
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.test_as_user(
  p_user_id uuid,
  p_tenant_id uuid,
  p_sql text
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $test$
DECLARE
  resolved_tenant_id uuid;
  rec record;
BEGIN
  SELECT u.tenant_id
  INTO resolved_tenant_id
  FROM public.users AS u
  WHERE u.id = p_user_id;

  IF resolved_tenant_id IS NULL THEN
    RAISE EXCEPTION 'No public.users row for user %', p_user_id;
  END IF;

  IF resolved_tenant_id IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'p_tenant_id % does not match users.tenant_id for user %',
      p_tenant_id, p_user_id;
  END IF;

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', p_user_id::text,
      'role', 'authenticated'
    )::text,
    true
  );

  SET LOCAL ROLE authenticated;

  FOR rec IN EXECUTE 'SELECT to_jsonb(src.*) AS j FROM (' || p_sql || ') AS src'
  LOOP
    RETURN NEXT rec.j;
  END LOOP;

  RETURN;
END;
$test$;

COMMENT ON FUNCTION public.test_as_user(uuid, uuid, text) IS
  'Tylko testy: request.jwt.claims + SET ROLE authenticated; p_sql wyłącznie z zaufanego kodu.';

-- -----------------------------------------------------------------
-- Uprawnienia: tylko service_role (PostgREST z service key).
-- -----------------------------------------------------------------
REVOKE ALL ON FUNCTION public.install_test_helpers() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.install_test_helpers() FROM anon;
REVOKE ALL ON FUNCTION public.install_test_helpers() FROM authenticated;

REVOKE ALL ON FUNCTION public.test_as_user(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.test_as_user(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.test_as_user(uuid, uuid, text) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.install_test_helpers() TO service_role;
GRANT EXECUTE ON FUNCTION public.test_as_user(uuid, uuid, text) TO service_role;
