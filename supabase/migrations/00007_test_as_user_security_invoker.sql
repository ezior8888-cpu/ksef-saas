-- Idempotentna naprawa / nadpisanie test_as_user.
-- Jeśli wcześniej wdrożono starą wersję (np. SECURITY DEFINER), DROP + CREATE
-- usuwa wszelkie niezgodności typu SET ROLE w DEFINER.
--
-- Sygnatura w DROP/REVOKE/GRANT/COMMENT: (uuid, uuid, text) — małe litery.

DROP FUNCTION IF EXISTS public.test_as_user(uuid, uuid, text);

CREATE FUNCTION public.test_as_user(
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
  'Tylko testy: JWT (sub) + SET ROLE authenticated; SECURITY INVOKER + wywołanie z service_role.';

REVOKE ALL ON FUNCTION public.test_as_user(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.test_as_user(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.test_as_user(uuid, uuid, text) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.test_as_user(uuid, uuid, text) TO service_role;
