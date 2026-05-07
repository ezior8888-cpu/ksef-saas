-- ═══════════════════════════════════════════════════════════════
-- KSEF SAAS — MULTI-ORG REDESIGN: STEP 3
-- Migration: 00037
--
-- RLS membership-based.
--
-- Strategia: zachowujemy NAZWĘ helpera `get_current_tenant_id()` i sygnaturę,
-- ale przepisujemy go pod multi-org. Funkcja zwraca aktywną organizację
-- TYLKO jeśli user jest jej aktywnym członkiem. Aktywna organizacja
-- jest przekazywana z aplikacji przez nagłówek HTTP `x-active-org`
-- (PostgREST udostępnia go przez `request.headers`). Cookie `ksef.active_org`
-- z aplikacji → header → setting → ten helper.
--
-- Dzięki temu wszystkie istniejące polityki postaci
-- `tenant_id = public.get_current_tenant_id()` działają dalej bez zmian
-- — semantyka zmienia się z „mój jedyny tenant” na „aktywna organizacja
-- jeśli i tylko jeśli jestem jej członkiem”.
--
-- Dodatkowo eksponujemy `is_member_of(p_org)` i `has_org_role(p_org, p_role)`
-- dla nowych polityk, które potrzebują explicit checku (np. memberships,
-- invitations, KSeF authority claim).
-- ═══════════════════════════════════════════════════════════════

-- ─── helper: is_member_of ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_member_of(p_org UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships
    WHERE organization_id = p_org
      AND user_id = auth.uid()
      AND status = 'active'
  );
$$;

COMMENT ON FUNCTION public.is_member_of IS
  'TRUE jeśli zalogowany user ma aktywne membership w danej organizacji.';

-- ─── helper: has_org_role ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_org_role(p_org UUID, p_role TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships
    WHERE organization_id = p_org
      AND user_id = auth.uid()
      AND status = 'active'
      AND role = p_role
  );
$$;

COMMENT ON FUNCTION public.has_org_role IS
  'TRUE jeśli zalogowany user ma aktywne membership w danej organizacji z konkretną rolą (owner/admin/member/accountant).';

-- ─── get_current_tenant_id: redefiniowane pod multi-org ─────────
-- Czyta org z nagłówka HTTP `x-active-org` i waliduje membership.
-- Brak nagłówka lub user spoza org → NULL → wszystkie polityki blokują.
CREATE OR REPLACE FUNCTION public.get_current_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_headers jsonb;
  v_org_text text;
  v_org uuid;
BEGIN
  BEGIN
    v_headers := current_setting('request.headers', true)::jsonb;
  EXCEPTION WHEN others THEN
    v_headers := NULL;
  END;

  IF v_headers IS NULL THEN
    RETURN NULL;
  END IF;

  v_org_text := v_headers ->> 'x-active-org';

  IF v_org_text IS NULL OR v_org_text = '' THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_org := v_org_text::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;

  IF NOT public.is_member_of(v_org) THEN
    RETURN NULL;
  END IF;

  RETURN v_org;
END;
$$;

COMMENT ON FUNCTION public.get_current_tenant_id IS
  'Zwraca UUID aktywnej organizacji (z nagłówka x-active-org), gdy zalogowany user jest jej aktywnym członkiem; w przeciwnym razie NULL. Używane w istniejących politykach RLS.';

-- ═══════════════════════════════════════════════════════════════
-- Aktualizacja kluczowych polityk, które wcześniej referencjonowały
-- `users.role` — kolumna usunięta w 00036, więc te DEFAULT trzeba
-- przepisać na `has_org_role(tenant_id, 'owner')`.
-- ═══════════════════════════════════════════════════════════════

-- tenants_update_own_owner (z 00002) używa users.role
DROP POLICY IF EXISTS "tenants_update_own_owner" ON public.tenants;
CREATE POLICY "tenants_update_own_owner"
  ON public.tenants FOR UPDATE
  TO authenticated
  USING (
    id = public.get_current_tenant_id()
    AND public.has_org_role(id, 'owner')
  )
  WITH CHECK (id = public.get_current_tenant_id());

-- accountant_access_owner_manage (z 00010) używa users.role
DROP POLICY IF EXISTS "accountant_access_owner_manage" ON public.accountant_access;
CREATE POLICY "accountant_access_owner_manage"
  ON public.accountant_access
  FOR ALL
  TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.has_org_role(tenant_id, 'owner')
  )
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.has_org_role(tenant_id, 'owner')
  );

-- ═══════════════════════════════════════════════════════════════
-- INSERT/UPDATE/DELETE polityki na public.tenants
-- (00002 nie miał polityki INSERT — zostawiamy, INSERT idzie przez
-- SECURITY DEFINER RPC w 00038)
-- ═══════════════════════════════════════════════════════════════

-- Member każdej org widzi metadane swojej org. `tenants_select_own`
-- z 00002 jest węższe (tylko aktywna org); zastępujemy szerszą polityką
-- pod org switcher (lista organizacji w sidebarze).
DROP POLICY IF EXISTS "tenants_select_own" ON public.tenants;
DROP POLICY IF EXISTS "tenants_select_member_of" ON public.tenants;
CREATE POLICY "tenants_select_member_of"
  ON public.tenants FOR SELECT
  TO authenticated
  USING (public.is_member_of(id));
