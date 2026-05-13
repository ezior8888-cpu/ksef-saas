-- Po udanym claimie KSeF usuń pozostałe niezweryfikowane org z tym samym NIP-em
-- (klony z MVP — zostaje jedna zweryfikowana organizacja na numer).

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

    DELETE FROM public.tenants t
    WHERE t.nip = v_nip
      AND t.id <> p_tenant_id
      AND t.ksef_verified_at IS NULL;

    RETURN 'claimed';
  EXCEPTION
    WHEN unique_violation THEN
      RETURN 'already_claimed_by_other';
  END;
END;
$$;

COMMENT ON FUNCTION public.claim_ksef_nip_ownership(UUID) IS
  'Atomowy claim KSeF dla NIP; po claimed usuwa inne niezweryfikowane tenants z tym NIP-em. Zwraca:
   claimed | already_claimed_by_self | already_claimed_by_other.';
