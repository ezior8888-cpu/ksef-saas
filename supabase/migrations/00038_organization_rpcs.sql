-- ═══════════════════════════════════════════════════════════════
-- KSEF SAAS — MULTI-ORG REDESIGN: STEP 4
-- Migration: 00038
--
-- SECURITY DEFINER RPC dla operacji multi-org, które muszą być atomowe
-- albo wykraczają poza model RLS (np. INSERT na tenants, akceptacja
-- zaproszenia po token_hash).
-- ═══════════════════════════════════════════════════════════════

-- ─── create_organization_with_owner ─────────────────────────────
-- Atomowo: INSERT tenants + INSERT memberships(role='owner', status='active').
-- Wymaga zalogowanego usera (auth.uid()). Zwraca id nowej organizacji.
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

  -- Zapamiętaj jako last active dla redirect.
  UPDATE public.users SET last_active_tenant_id = v_org WHERE id = v_user;

  RETURN v_org;
END;
$$;

REVOKE ALL ON FUNCTION public.create_organization_with_owner(TEXT, TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_organization_with_owner(TEXT, TEXT, JSONB) TO authenticated;

COMMENT ON FUNCTION public.create_organization_with_owner IS
  'Tworzy nową organizację (tenants) + membership owner dla wywołującego. Atomowo. NIE szuka po NIP — kolizje są dozwolone i obsługiwane w UI jako warning.';

-- ─── accept_organization_invitation ────────────────────────────
-- Akceptuje zaproszenie po sha256 tokenu. Weryfikuje:
-- - nieprzeterminowane (expires_at > now())
-- - niezaakceptowane (accepted_at IS NULL)
-- - nieanulowane (revoked_at IS NULL)
-- - email zaproszenia = email zalogowanego usera (auth.users.email)
-- Zwraca organization_id przy sukcesie, NULL/exception przy błędzie.
CREATE OR REPLACE FUNCTION public.accept_organization_invitation(
  p_token_hash TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_user_email TEXT;
  v_inv RECORD;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user;

  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'user_no_email';
  END IF;

  SELECT * INTO v_inv
  FROM public.organization_invitations
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation_not_found';
  END IF;

  IF v_inv.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'invitation_revoked';
  END IF;

  IF v_inv.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'invitation_already_accepted';
  END IF;

  IF v_inv.expires_at <= now() THEN
    RAISE EXCEPTION 'invitation_expired';
  END IF;

  IF lower(v_inv.email::text) <> lower(v_user_email) THEN
    RAISE EXCEPTION 'invitation_email_mismatch';
  END IF;

  -- Idempotentny upsert membership (jeśli user już jest, podbija status do active)
  INSERT INTO public.memberships (organization_id, user_id, role, status, invited_by, invited_at, joined_at)
  VALUES (v_inv.organization_id, v_user, v_inv.role, 'active', v_inv.invited_by, v_inv.invited_at, now())
  ON CONFLICT (organization_id, user_id)
  DO UPDATE SET status = 'active', role = EXCLUDED.role, revoked_at = NULL, joined_at = now();

  UPDATE public.organization_invitations
  SET accepted_at = now(), accepted_by_user_id = v_user
  WHERE id = v_inv.id;

  UPDATE public.users SET last_active_tenant_id = v_inv.organization_id WHERE id = v_user;

  RETURN v_inv.organization_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_organization_invitation(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_organization_invitation(TEXT) TO authenticated;

COMMENT ON FUNCTION public.accept_organization_invitation IS
  'Akceptuje zaproszenie po sha256 tokenu. Weryfikuje termin, status i email. Tworzy/aktywuje membership.';

-- ─── approve_join_request ─────────────────────────────────────
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

REVOKE ALL ON FUNCTION public.approve_join_request(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.approve_join_request(UUID, TEXT) TO authenticated;

-- ─── deny_join_request ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.deny_join_request(
  p_request_id UUID
)
RETURNS VOID
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

  IF NOT (
    public.has_org_role(v_req.organization_id, 'owner')
    OR public.has_org_role(v_req.organization_id, 'admin')
  ) THEN
    RAISE EXCEPTION 'insufficient_role';
  END IF;

  UPDATE public.organization_join_requests
  SET status = 'denied', decided_by = v_user, decided_at = now()
  WHERE id = p_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.deny_join_request(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.deny_join_request(UUID) TO authenticated;

-- ─── revoke_membership (wyrzuć z org) ─────────────────────────
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

  -- Self-leave dozwolone; mutacja cudzych — tylko owner/admin.
  IF v_mem.user_id <> v_user THEN
    IF NOT (
      public.has_org_role(v_mem.organization_id, 'owner')
      OR public.has_org_role(v_mem.organization_id, 'admin')
    ) THEN
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

REVOKE ALL ON FUNCTION public.revoke_membership(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.revoke_membership(UUID) TO authenticated;

-- ─── change_membership_role ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.change_membership_role(
  p_membership_id UUID,
  p_new_role TEXT
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

  IF p_new_role NOT IN ('owner', 'admin', 'member', 'accountant') THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;

  SELECT * INTO v_mem
  FROM public.memberships
  WHERE id = p_membership_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership_not_found';
  END IF;

  -- Tylko owner może zmieniać role.
  IF NOT public.has_org_role(v_mem.organization_id, 'owner') THEN
    RAISE EXCEPTION 'insufficient_role';
  END IF;

  -- Demotion ostatniego ownera blokujemy.
  IF v_mem.role = 'owner' AND p_new_role <> 'owner' AND v_mem.status = 'active' THEN
    SELECT COUNT(*) INTO v_owner_count
    FROM public.memberships
    WHERE organization_id = v_mem.organization_id
      AND role = 'owner'
      AND status = 'active'
      AND id <> p_membership_id;

    IF v_owner_count = 0 THEN
      RAISE EXCEPTION 'cannot_demote_last_owner';
    END IF;
  END IF;

  UPDATE public.memberships SET role = p_new_role WHERE id = p_membership_id;
END;
$$;

REVOKE ALL ON FUNCTION public.change_membership_role(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.change_membership_role(UUID, TEXT) TO authenticated;
