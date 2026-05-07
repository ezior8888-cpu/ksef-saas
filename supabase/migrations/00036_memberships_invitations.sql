-- ═══════════════════════════════════════════════════════════════
-- KSEF SAAS — MULTI-ORG REDESIGN: STEP 2
-- Migration: 00036
--
-- Tabele relacji user↔organizacja (memberships, invitations, join_requests).
-- Backfill istniejących `users.tenant_id` do `memberships`.
--
-- RLS na tych tabelach jest minimalna — `is_member_of()` używana w 00037
-- przeczytałaby z `memberships`, więc tu polityki opieramy się o
-- bezpośrednie `auth.uid()` (member widzi swoje wpisy + wpisy w jego org).
-- ═══════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS citext;

-- ─── memberships ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'admin', 'member', 'accountant')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'revoked')),
  invited_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_memberships_org_user
  ON public.memberships(organization_id, user_id);

CREATE INDEX IF NOT EXISTS idx_memberships_user_active
  ON public.memberships(user_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_memberships_org_active
  ON public.memberships(organization_id)
  WHERE status = 'active';

CREATE TRIGGER trg_memberships_updated_at
  BEFORE UPDATE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.memberships IS
  'Relacja user↔organizacja. Jeden user może mieć wiele membership w różnych orgs. RLS na pozostałych tabelach opiera się o aktywne memberships.';

-- ─── organization_invitations ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organization_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email CITEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'admin', 'member', 'accountant')),
  -- W bazie tylko sha256 tokenu. Plaintext żyje wyłącznie w mailu.
  token_hash TEXT NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at TIMESTAMPTZ,
  accepted_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_invitations_org
  ON public.organization_invitations(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_org_invitations_email_pending
  ON public.organization_invitations(email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- Tylko jedno aktywne (unaccepted, unrevoked) zaproszenie per (org, email).
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_invitations_active_per_email
  ON public.organization_invitations(organization_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

COMMENT ON TABLE public.organization_invitations IS
  'Zaproszenia do organizacji. Token plaintext tylko w mailu, w bazie sha256.';

-- ─── organization_join_requests ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organization_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  requested_by_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied')),
  decided_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_join_requests_org_pending
  ON public.organization_join_requests(organization_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_join_requests_user
  ON public.organization_join_requests(requested_by_user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_join_requests_active
  ON public.organization_join_requests(organization_id, requested_by_user_id)
  WHERE status = 'pending';

COMMENT ON TABLE public.organization_join_requests IS
  'Prośba usera o dołączenie do istniejącej org (alternatywa dla invite).';

-- ═══════════════════════════════════════════════════════════════
-- BACKFILL: existing users.tenant_id → memberships
-- ═══════════════════════════════════════════════════════════════
INSERT INTO public.memberships (organization_id, user_id, role, status, joined_at)
SELECT
  u.tenant_id,
  u.id,
  COALESCE(u.role, 'member'),
  'active',
  u.created_at
FROM public.users u
WHERE u.tenant_id IS NOT NULL
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- Backfill `created_by_user_id` w tenants — pierwszy owner per tenant.
UPDATE public.tenants t
SET created_by_user_id = sub.user_id
FROM (
  SELECT DISTINCT ON (organization_id)
    organization_id,
    user_id
  FROM public.memberships
  WHERE role = 'owner' AND status = 'active'
  ORDER BY organization_id, joined_at ASC
) sub
WHERE t.id = sub.organization_id
  AND t.created_by_user_id IS NULL;

-- ═══════════════════════════════════════════════════════════════
-- USERS: dodajemy `last_active_tenant_id` (luźny pointer dla redirect),
--         usuwamy `tenant_id` (ten sam efekt poprzez memberships).
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_active_tenant_id UUID
    REFERENCES public.tenants(id) ON DELETE SET NULL;

UPDATE public.users
SET last_active_tenant_id = tenant_id
WHERE tenant_id IS NOT NULL AND last_active_tenant_id IS NULL;

-- DROP polityk korzystających z users.tenant_id
DROP POLICY IF EXISTS "users_select_same_tenant" ON public.users;

-- Bezpieczna polityka SELECT na users — widzisz siebie + członków swoich orgs.
DROP POLICY IF EXISTS "users_select_self_or_org_member" ON public.users;
CREATE POLICY "users_select_self_or_org_member"
  ON public.users FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.memberships me
      JOIN public.memberships peer
        ON peer.organization_id = me.organization_id
       AND peer.status = 'active'
      WHERE me.user_id = auth.uid()
        AND me.status = 'active'
        AND peer.user_id = public.users.id
    )
  );

-- Indeks już niepotrzebny — usuniemy razem z kolumną.
DROP INDEX IF EXISTS idx_users_tenant;

-- Polityki RLS, które referencjonują `users.role` (z 00002 i 00010).
-- Trzeba je usunąć PRZED `DROP COLUMN role`, bo Postgres odmówi.
-- W 00037 odbudowujemy je z użyciem `has_org_role(tenant_id, 'owner')`.
DROP POLICY IF EXISTS "tenants_update_own_owner" ON public.tenants;
DROP POLICY IF EXISTS "accountant_access_owner_manage" ON public.accountant_access;
DROP POLICY IF EXISTS "accountant_access_manage_by_owner" ON public.accountant_access;

ALTER TABLE public.users DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE public.users DROP COLUMN IF EXISTS role;

-- ═══════════════════════════════════════════════════════════════
-- TRIGGER: handle_new_user — bez przypisywania tenant/role
-- (rola żyje w memberships, tenant przyjdzie z onboardingu)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user IS
  'Po rejestracji w Supabase Auth — tworzy wiersz w public.users. Przypisanie do organizacji odbywa się w onboardingu (createOrganization / acceptInvitation).';

-- ═══════════════════════════════════════════════════════════════
-- RLS: memberships, invitations, join_requests
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_join_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.memberships FROM anon;
REVOKE ALL ON TABLE public.organization_invitations FROM anon;
REVOKE ALL ON TABLE public.organization_join_requests FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organization_invitations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organization_join_requests TO authenticated;

-- memberships: user widzi swoje + memberships w swoich orgs.
-- Zarządzanie (UPDATE/DELETE/INSERT cudzych) tylko przez owner/admin org;
-- normalne wpisy (zaakceptowane invite, leave) idą przez Server Action / RPC.
CREATE POLICY "memberships_select_self_or_org"
  ON public.memberships FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.memberships me
      WHERE me.organization_id = public.memberships.organization_id
        AND me.user_id = auth.uid()
        AND me.status = 'active'
    )
  );

-- INSERT/UPDATE/DELETE odbywają się wyłącznie przez Server Actions
-- (createAdminClient lub SECURITY DEFINER RPC) — RLS blokuje default,
-- bo nie chcemy by user mógł sam sobie zmienić rolę na 'owner' przez
-- bezpośrednie UPDATE.

-- organization_invitations: widoczne dla członków org + dla maila zaproszonego
-- (po zalogowaniu na ten email — ale to obsługujemy w app, RLS sprawdza
-- accepted_by_user_id po akceptacji).
CREATE POLICY "org_invitations_select_org_members"
  ON public.organization_invitations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships me
      WHERE me.organization_id = public.organization_invitations.organization_id
        AND me.user_id = auth.uid()
        AND me.status = 'active'
    )
  );

-- organization_join_requests: org members widzą requesty do swojej org;
-- requester widzi własne.
CREATE POLICY "join_requests_select_self_or_org"
  ON public.organization_join_requests FOR SELECT
  TO authenticated
  USING (
    requested_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.memberships me
      WHERE me.organization_id = public.organization_join_requests.organization_id
        AND me.user_id = auth.uid()
        AND me.status = 'active'
    )
  );

CREATE POLICY "join_requests_insert_self"
  ON public.organization_join_requests FOR INSERT
  TO authenticated
  WITH CHECK (requested_by_user_id = auth.uid());
