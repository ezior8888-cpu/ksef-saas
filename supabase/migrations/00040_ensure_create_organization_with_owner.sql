-- Idempotent: odtwarza RPC z 00038 (środowiska bez zastosowanej migracji 00038
-- lub po ręcznym DDL). NOTIFY odświeża cache PostgREST (komunikat „schema cache”).
CREATE OR REPLACE FUNCTION public.create_organization_with_owner(
  p_name TEXT,
  p_nip TEXT,
  p_address_json JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_org UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF p_nip !~ '^\d{10}$' THEN
    RAISE EXCEPTION 'invalid_nip';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;

  INSERT INTO public.tenants (name, nip, address_json, created_by_user_id, is_active)
    VALUES (p_name, p_nip, p_address_json, v_user, true)
  RETURNING id INTO v_org;

  INSERT INTO public.memberships (organization_id, user_id, role, status, joined_at)
    VALUES (v_org, v_user, 'owner', 'active', now());

  UPDATE public.users SET last_active_tenant_id = v_org WHERE id = v_user;

  RETURN v_org;
END;
$$;

REVOKE ALL ON FUNCTION public.create_organization_with_owner(TEXT, TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_organization_with_owner(TEXT, TEXT, JSONB) TO authenticated;

COMMENT ON FUNCTION public.create_organization_with_owner IS
  'Tworzy nową organizację (tenants) + membership owner dla wywołującego. Atomowo. NIE szuka po NIP — kolizje są dozwolone i obsługiwane w UI jako warning.';

NOTIFY pgrst, 'reload schema';
