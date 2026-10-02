-- 00103_org_role_guards.sql
--
-- AUD-29: admin organizacji mógł przez bezpośrednie RPC zatwierdzić prośbę
-- o dołączenie z rolą `owner` (np. własnego drugiego konta), a potem usunąć
-- prawdziwego właściciela przez `revoke_membership`. Teraz rolę właściciela
-- nadaje i odbiera tylko właściciel. Reszta logiki bez zmian (00038).
--
-- Wyłącznie CREATE OR REPLACE + REVOKE — bez zmian danych. Zgodne wstecz:
-- aplikacja woła te RPC tylko z akcji wymagających owner/admin, a formularz
-- zatwierdzania prośby nie oferuje roli owner.

CREATE OR REPLACE FUNCTION public.approve_join_request(
  p_request_id UUID,
  p_role TEXT DEFAULT 'member'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_req RECORD;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF p_role NOT IN ('owner', 'admin', 'member', 'accountant') THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;

  SELECT * INTO v_req
  FROM public.organization_join_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found';
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'request_already_decided';
  END IF;

  -- Zatwierdzić może owner lub admin org.
  IF NOT (
    public.has_org_role(v_req.organization_id, 'owner')
    OR public.has_org_role(v_req.organization_id, 'admin')
  ) THEN
    RAISE EXCEPTION 'insufficient_role';
  END IF;

  -- Rolę właściciela nadaje tylko właściciel (AUD-29). Admin, który
  -- zatwierdziłby własne drugie konto jako owner, mógłby potem usunąć
  -- prawdziwego właściciela.
  IF p_role = 'owner' AND NOT public.has_org_role(v_req.organization_id, 'owner') THEN
    RAISE EXCEPTION 'insufficient_role';
  END IF;

  INSERT INTO public.memberships (organization_id, user_id, role, status, invited_by, joined_at)
  VALUES (v_req.organization_id, v_req.requested_by_user_id, p_role, 'active', v_user, now())
  ON CONFLICT (organization_id, user_id)
  DO UPDATE SET status = 'active', role = EXCLUDED.role, revoked_at = NULL, joined_at = now();

  UPDATE public.organization_join_requests
  SET status = 'approved', decided_by = v_user, decided_at = now()
  WHERE id = p_request_id;

  RETURN v_req.organization_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_membership(
  p_membership_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_mem RECORD;
  v_owner_count INT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  SELECT * INTO v_mem
  FROM public.memberships
  WHERE id = p_membership_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership_not_found';
  END IF;

  -- Self-leave dozwolone; mutacja cudzych — tylko owner/admin, a cudzego
  -- właściciela usuwa wyłącznie właściciel (AUD-29).
  IF v_mem.user_id <> v_user THEN
    IF NOT (
      public.has_org_role(v_mem.organization_id, 'owner')
      OR public.has_org_role(v_mem.organization_id, 'admin')
    ) THEN
      RAISE EXCEPTION 'insufficient_role';
    END IF;
    IF v_mem.role = 'owner' AND NOT public.has_org_role(v_mem.organization_id, 'owner') THEN
      RAISE EXCEPTION 'insufficient_role';
    END IF;
  END IF;

  -- Nie można zostawić org bez ownera.
  IF v_mem.role = 'owner' AND v_mem.status = 'active' THEN
    SELECT COUNT(*) INTO v_owner_count
    FROM public.memberships
    WHERE organization_id = v_mem.organization_id
      AND role = 'owner'
      AND status = 'active'
      AND id <> p_membership_id;

    IF v_owner_count = 0 THEN
      RAISE EXCEPTION 'cannot_remove_last_owner';
    END IF;
  END IF;

  UPDATE public.memberships
  SET status = 'revoked', revoked_at = now()
  WHERE id = p_membership_id;
END;
$$;

-- Niezalogowany i tak dostaje 'unauthenticated' — odbieramy też samo wywołanie.
REVOKE EXECUTE ON FUNCTION public.approve_join_request(UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.revoke_membership(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.approve_join_request(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_membership(UUID) TO authenticated;
