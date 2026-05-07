-- ═══════════════════════════════════════════════════════════════
-- KSEF SAAS — NIP ownership przy zweryfikowanym KSeF
-- Migration: 00039
--
-- Cel:
--   • Co najwyżej jedna organizacja z danym NIP-em może mieć
--     ksef_verified_at IS NOT NULL (twardy claim po KSeF).
--   • Niezweryfikowane orgi nadal mogą dzielić ten sam NIP (MVP / sandbox).
--   • Atomowy claim przez RPC + obsługa wyścigu (unique_violation).
--
-- Uwaga: jeśli w bazie są już DWIE org z tym samym NIP i obie mają
-- ksef_verified_at, CREATE UNIQUE INDEX się nie powiedzie — trzeba ręcznie
-- wyzerować ksef_verified_at na duplikacie przed `db push`.
-- ═══════════════════════════════════════════════════════════════

-- 00035 tworzyło nieunikalny partial index o tej samej nazwie warunku —
-- zastępujemy go UNIKALNYM indeksem częściowym.
DROP INDEX IF EXISTS public.idx_tenants_ksef_verified;

CREATE UNIQUE INDEX idx_tenants_nip_ksef_unique_verified
  ON public.tenants (nip)
  WHERE (ksef_verified_at IS NOT NULL);

COMMENT ON INDEX public.idx_tenants_nip_ksef_unique_verified IS
  'Co najwyżej jedna organizacja na NIP z udanym claimem KSeF (ksef_verified_at).';

-- ─── is_nip_ksef_claimed: czy inna org już „wygrała” NIP w KSeF ───
CREATE OR REPLACE FUNCTION public.is_nip_ksef_claimed(p_nip TEXT, p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.nip = p_nip
      AND t.ksef_verified_at IS NOT NULL
      AND t.id <> p_tenant_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_nip_ksef_claimed(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_nip_ksef_claimed(TEXT, UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.is_nip_ksef_claimed(TEXT, UUID) IS
  'TRUE jeśli istnieje inna organizacja z tym NIP-em i ustawionym ksef_verified_at.';

-- ─── claim_ksef_nip_ownership: atomowy claim (tylko aktywny członek org) ───
CREATE OR REPLACE FUNCTION public.claim_ksef_nip_ownership(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_nip TEXT;
  v_verified_at TIMESTAMPTZ;
  v_updated INT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF NOT public.is_member_of(p_tenant_id) THEN
    RAISE EXCEPTION 'not_org_member';
  END IF;

  SELECT t.nip, t.ksef_verified_at
  INTO v_nip, v_verified_at
  FROM public.tenants t
  WHERE t.id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND OR v_nip IS NULL THEN
    RAISE EXCEPTION 'tenant_not_found';
  END IF;

  IF v_verified_at IS NOT NULL THEN
    RETURN 'already_claimed_by_self';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.nip = v_nip
      AND t.ksef_verified_at IS NOT NULL
      AND t.id <> p_tenant_id
  ) THEN
    RETURN 'already_claimed_by_other';
  END IF;

  BEGIN
    UPDATE public.tenants
    SET
      ksef_verified_at = now(),
      ksef_authority_user_id = v_uid,
      updated_at = now()
    WHERE id = p_tenant_id
      AND ksef_verified_at IS NULL;

    GET DIAGNOSTICS v_updated = ROW_COUNT;

    IF v_updated = 0 THEN
      RETURN 'already_claimed_by_other';
    END IF;

    RETURN 'claimed';
  EXCEPTION
    WHEN unique_violation THEN
      RETURN 'already_claimed_by_other';
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ksef_nip_ownership(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_ksef_nip_ownership(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.claim_ksef_nip_ownership(UUID) IS
  'Pierwszy atomowy claim KSeF dla NIP w ramach FaktFlow. Zwraca:
   claimed | already_claimed_by_self | already_claimed_by_other.
   Wymaga auth.uid() oraz aktywnego membership w p_tenant_id.';

-- Widok pomocniczy dla UI (RLS jak przy SELECT z tenants — security_invoker)
CREATE OR REPLACE VIEW public.tenant_verification_status
WITH (security_invoker = true) AS
SELECT
  t.id,
  t.nip,
  t.name,
  (t.ksef_verified_at IS NOT NULL) AS is_ksef_verified,
  t.ksef_verified_at,
  t.ksef_authority_user_id
FROM public.tenants t;

COMMENT ON VIEW public.tenant_verification_status IS
  'Skrót statusu weryfikacji KSeF per tenant; SELECT respektuje RLS na tenants.';

GRANT SELECT ON public.tenant_verification_status TO authenticated, service_role;
