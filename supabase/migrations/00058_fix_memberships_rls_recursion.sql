-- ═══════════════════════════════════════════════════════════════
-- 00058 — NAPRAWA: nieskończona rekurencja RLS na memberships
-- ═══════════════════════════════════════════════════════════════
-- PROBLEM (BUG-016, współwinny BUG-006):
--   Polityki SELECT na `memberships`, `users`, `organization_invitations`
--   i `organization_join_requests` (migracja 00036) zawierają w klauzuli
--   USING podzapytanie `EXISTS (SELECT ... FROM public.memberships ...)`.
--   Gdy Postgres ocenia politykę SELECT na `memberships`, podzapytanie do
--   `memberships` PONOWNIE uruchamia tę samą politykę → rekurencja. Postgres
--   przerywa: „infinite recursion detected in policy for relation
--   'memberships'". To wywala KAŻDE zapytanie dotykające memberships:
--     - bootstrap aktywnej organizacji (→ apka „zapomina" konto, BUG-006),
--     - lista zespołu / wysyłka zaproszeń / token księgowej (BUG-016),
--     - pośrednio wszystko, co przez RLS sprawdza membership.
--
-- ROZWIĄZANIE:
--   Zamiast inline `EXISTS (SELECT FROM memberships)` używamy funkcji
--   SECURITY DEFINER, które OMIJAJĄ RLS (więc nie wywołują polityki
--   rekurencyjnie):
--     - public.is_member_of(p_org)  — już istnieje (00037),
--     - public.shares_active_org_with(p_user) — nowa, dla polityki na `users`.
--
--   SECURITY DEFINER + STABLE + jawny search_path = bezpieczne i wydajne
--   (planner cache'uje wynik per-wiersz nadrzędny).
-- ═══════════════════════════════════════════════════════════════

-- ─── helper: shares_active_org_with ─────────────────────────────
-- TRUE, gdy zalogowany user (auth.uid()) i `p_user` należą do TEJ SAMEJ
-- organizacji, oboje ze statusem 'active'. Dla polityki widoczności `users`.
CREATE OR REPLACE FUNCTION public.shares_active_org_with(p_user UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships me
    JOIN public.memberships peer
      ON peer.organization_id = me.organization_id
     AND peer.status = 'active'
    WHERE me.user_id = auth.uid()
      AND me.status = 'active'
      AND peer.user_id = p_user
  );
$$;

COMMENT ON FUNCTION public.shares_active_org_with IS
  'TRUE jeśli zalogowany user i p_user mają wspólną aktywną organizację. SECURITY DEFINER — omija RLS, nie wywołuje rekurencji polityk memberships.';

REVOKE ALL ON FUNCTION public.shares_active_org_with(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.shares_active_org_with(UUID) TO authenticated;

-- ─── 1. memberships: polityka SELECT bez rekurencji ─────────────
DROP POLICY IF EXISTS "memberships_select_self_or_org" ON public.memberships;
CREATE POLICY "memberships_select_self_or_org"
  ON public.memberships FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_member_of(organization_id)
  );

-- ─── 2. users: widoczność współczłonków bez rekurencji ──────────
DROP POLICY IF EXISTS "users_select_self_or_org_member" ON public.users;
CREATE POLICY "users_select_self_or_org_member"
  ON public.users FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR public.shares_active_org_with(id)
  );

-- ─── 3. organization_invitations: widoczne dla członków org ─────
DROP POLICY IF EXISTS "org_invitations_select_org_members" ON public.organization_invitations;
CREATE POLICY "org_invitations_select_org_members"
  ON public.organization_invitations FOR SELECT
  TO authenticated
  USING (
    public.is_member_of(organization_id)
  );

-- ─── 4. organization_join_requests: requester + członkowie org ──
DROP POLICY IF EXISTS "join_requests_select_self_or_org" ON public.organization_join_requests;
CREATE POLICY "join_requests_select_self_or_org"
  ON public.organization_join_requests FOR SELECT
  TO authenticated
  USING (
    requested_by_user_id = auth.uid()
    OR public.is_member_of(organization_id)
  );

-- ═══════════════════════════════════════════════════════════════
-- Po wgraniu: zapytania o memberships/users/invitations/join_requests
-- przestają rekurować. BUG-016 znika, bootstrap organizacji działa (BUG-006).
-- ═══════════════════════════════════════════════════════════════
