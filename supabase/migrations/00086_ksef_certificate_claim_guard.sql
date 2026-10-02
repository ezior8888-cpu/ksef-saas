-- KSeF certificate ownership is a privileged, proof-backed transition.
-- 00039 granted authenticated direct EXECUTE on the old claim RPC; 00043
-- made that RPC delete other unverified tenants with the same NIP. Tenant
-- owners also had table-level UPDATE on the protected verification columns.
-- Apply only after operator confirms the exact db-1 migration history and
-- deploys a compatible web image. No historical migration is rewritten.

BEGIN;

DO $$
BEGIN
  IF pg_catalog.to_regclass(
    'public.idx_tenants_nip_ksef_unique_verified'
  ) IS NULL THEN
    RAISE EXCEPTION 'Apply 00039 before 00086'
      USING ERRCODE = '55000';
  END IF;
END;
$$;

-- Old markers cannot be assigned to an environment from audit metadata alone.
-- NULL provenance remains quarantined until a fresh Owner proof or manual review.
ALTER TABLE public.tenants
  ADD COLUMN ksef_verified_environment TEXT;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_ksef_verified_environment_valid
  CHECK (
    ksef_verified_environment IS NULL OR
    (ksef_verified_environment IN ('test', 'demo', 'production')
      AND ksef_verified_at IS NOT NULL)
  );

-- Keep the 00039 index name for the unique_violation handler. NULL provenance
-- stays outside this index and does not block a fresh, proof-backed claim.
DROP INDEX public.idx_tenants_nip_ksef_unique_verified;
CREATE UNIQUE INDEX idx_tenants_nip_ksef_unique_verified
  ON public.tenants (nip, ksef_verified_environment)
  WHERE ksef_verified_at IS NOT NULL
    AND ksef_verified_environment IS NOT NULL;

-- Offline24 rows created before this migration have no trustworthy environment.
-- They remain queued for manual reconciliation and cannot be auto-promoted.
ALTER TABLE public.ksef_offline_queue
  ADD COLUMN ksef_environment TEXT;
ALTER TABLE public.ksef_offline_queue
  ADD CONSTRAINT ksef_offline_queue_environment_valid
  CHECK (ksef_environment IS NULL OR
    ksef_environment IN ('test', 'demo', 'production'));

-- 00015 granted tenant users all queue mutations. The server is the sole
-- writer of Offline24 status, deadline and QR provenance.
REVOKE INSERT, UPDATE, DELETE ON public.ksef_offline_queue
  FROM PUBLIC, anon, authenticated;
-- 00015 also gave tenant users full DML on official UPO receipts. UI only
-- reads them; creation/status changes belong to the trusted worker.
REVOKE INSERT, UPDATE, DELETE ON public.upo_receipts
  FROM PUBLIC, anon, authenticated;

-- Authenticated callers may access the tenant queue under RLS, but may not
-- forge environment provenance. After insert even service_role cannot mutate
-- it; a legacy NULL requires an explicit postgres-operated reconciliation.
CREATE OR REPLACE FUNCTION public.guard_ksef_offline_queue_environment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('queued', 'sending', 'expired') AND EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = NEW.invoice_id AND i.tenant_id = NEW.tenant_id
        AND i.ksef_status = 'accepted'
    ) THEN
      RAISE EXCEPTION 'Accepted KSeF invoice cannot enter Offline24 queue'
        USING ERRCODE = '42501';
    END IF;
    IF current_user IN ('anon', 'authenticated') AND
       NEW.ksef_environment IS NOT NULL THEN
      RAISE EXCEPTION 'KSeF offline environment requires a trusted server'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status IN ('queued', 'sending', 'expired') AND EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = NEW.invoice_id AND i.tenant_id = NEW.tenant_id
      AND i.ksef_status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'Accepted KSeF invoice cannot re-enter Offline24 queue'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.ksef_environment IS DISTINCT FROM OLD.ksef_environment AND
     current_user <> 'postgres' THEN
    RAISE EXCEPTION 'KSeF offline environment is immutable'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_ksef_offline_queue_environment()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trigger_guard_ksef_offline_queue_environment
  ON public.ksef_offline_queue;
CREATE TRIGGER trigger_guard_ksef_offline_queue_environment
  BEFORE INSERT OR UPDATE OF ksef_environment, status
  ON public.ksef_offline_queue
  FOR EACH ROW EXECUTE FUNCTION public.guard_ksef_offline_queue_environment();

-- Submitted invoice provenance is required by UPO and its retry cron.
-- Historical accepted invoices remain NULL and require operator reconciliation.
ALTER TABLE public.invoices
  ADD COLUMN ksef_environment TEXT;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_ksef_environment_valid
  CHECK (ksef_environment IS NULL OR
    ksef_environment IN ('test', 'demo', 'production'));

CREATE OR REPLACE FUNCTION public.guard_invoice_ksef_environment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.ksef_status = 'accepted' AND NEW.ksef_environment IS NULL AND
       current_user <> 'postgres' THEN
      RAISE EXCEPTION 'Accepted KSeF invoice requires environment provenance'
        USING ERRCODE = '42501';
    END IF;
    IF current_user IN ('anon', 'authenticated') AND
       NEW.ksef_environment IS NOT NULL THEN
      RAISE EXCEPTION 'KSeF invoice environment requires a trusted server'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.ksef_status = 'accepted' AND NEW.ksef_status IS DISTINCT FROM 'accepted'
     AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Accepted KSeF invoice status is immutable'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.ksef_status = 'accepted' AND NEW.ksef_environment IS NULL AND
     current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Accepted KSeF invoice requires environment provenance'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.ksef_environment IS DISTINCT FROM OLD.ksef_environment AND
     (current_user IN ('anon', 'authenticated') OR
      (OLD.ksef_environment IS NOT NULL AND current_user <> 'postgres')) THEN
    RAISE EXCEPTION 'KSeF invoice environment cannot be changed'
      USING ERRCODE = '42501';
  END IF;
  -- 00073 protects accepted headers, but did not cover the official
  -- acceptance timestamp. A tenant must not rewrite it through PostgREST.
  IF current_user IN ('anon', 'authenticated') AND
     (OLD.ksef_status = 'accepted' OR NEW.ksef_status = 'accepted') AND
     NEW.ksef_accepted_at IS DISTINCT FROM OLD.ksef_accepted_at THEN
    RAISE EXCEPTION 'KSeF acceptance timestamp is server-managed'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_invoice_ksef_environment()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trigger_guard_invoice_ksef_environment
  ON public.invoices;
CREATE TRIGGER trigger_guard_invoice_ksef_environment
  BEFORE INSERT OR UPDATE OF ksef_environment, ksef_status, ksef_accepted_at
  ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_ksef_environment();

-- 00002 allows authenticated users to mutate line items of any own invoice.
-- 00079 only protects Stripe billing lines. Freeze lines of every accepted
-- KSeF invoice against direct client DML, including moves between invoices.
CREATE OR REPLACE FUNCTION public.guard_accepted_ksef_invoice_line()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') AND EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = OLD.invoice_id AND i.ksef_status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'Accepted KSeF invoice lines are server-managed'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = NEW.invoice_id AND i.ksef_status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'Accepted KSeF invoice lines are server-managed'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_accepted_ksef_invoice_line()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trigger_guard_accepted_ksef_invoice_line
  ON public.invoice_line_items;
CREATE TRIGGER trigger_guard_accepted_ksef_invoice_line
  BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_line_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_accepted_ksef_invoice_line();
-- UPO artifacts also need durable provenance; older receipts remain NULL.
ALTER TABLE public.upo_receipts
  ADD COLUMN ksef_environment TEXT;
ALTER TABLE public.upo_receipts
  ADD CONSTRAINT upo_receipts_ksef_environment_valid
  CHECK (ksef_environment IS NULL OR
    ksef_environment IN ('test', 'demo', 'production'));

CREATE OR REPLACE FUNCTION public.guard_upo_ksef_environment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_user IN ('anon', 'authenticated') AND
       NEW.ksef_environment IS NOT NULL THEN
      RAISE EXCEPTION 'UPO environment requires a trusted server'
        USING ERRCODE = '42501';
    END IF;
    IF current_user <> 'postgres' AND (
      NEW.ksef_environment IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.id = NEW.invoice_id AND i.tenant_id = NEW.tenant_id
          AND i.ksef_status = 'accepted'
          AND i.ksef_environment = NEW.ksef_environment
      )
    ) THEN
      RAISE EXCEPTION 'UPO requires an accepted invoice in the same environment'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.ksef_environment IS DISTINCT FROM OLD.ksef_environment AND
     current_user <> 'postgres' THEN
    RAISE EXCEPTION 'UPO environment is immutable'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.status = 'downloaded' AND current_user <> 'postgres' AND (
    NEW.ksef_environment IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = NEW.invoice_id AND i.tenant_id = NEW.tenant_id
        AND i.ksef_status = 'accepted'
        AND i.ksef_environment = NEW.ksef_environment
    )
  ) THEN
    RAISE EXCEPTION 'Downloaded UPO requires accepted invoice provenance'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_upo_ksef_environment()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trigger_guard_upo_ksef_environment
  ON public.upo_receipts;
CREATE TRIGGER trigger_guard_upo_ksef_environment
  BEFORE INSERT OR UPDATE OF ksef_environment, status
  ON public.upo_receipts
  FOR EACH ROW EXECUTE FUNCTION public.guard_upo_ksef_environment();
-- Fail closed for both direct PostgREST calls and any old web instance.
CREATE OR REPLACE FUNCTION public.claim_ksef_nip_ownership(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'legacy_ksef_claim_disabled' USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION public.claim_ksef_nip_ownership(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

-- The legacy helper has no environment argument. Do not let old consumers
-- interpret a TEST/DEMO or unknown historical marker as a production claim.
CREATE OR REPLACE FUNCTION public.is_nip_ksef_claimed(p_nip TEXT, p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'legacy_ksef_claim_lookup_disabled' USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION public.is_nip_ksef_claimed(TEXT, UUID)
  FROM PUBLIC, anon, authenticated, service_role;

-- RLS grants authenticated owners UPDATE on tenants as a whole. They must
-- not set the KSeF proof marker, authority or ciphertext through PostgREST.
-- A verified NIP must also not be changed while retaining the old proof.
CREATE OR REPLACE FUNCTION public.guard_tenant_ksef_claim_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_user IN ('anon', 'authenticated') AND (
      NEW.ksef_verified_at IS NOT NULL OR
      NEW.ksef_verified_environment IS NOT NULL OR
      NEW.ksef_authority_user_id IS NOT NULL OR
      NEW.ksef_credentials_encrypted IS NOT NULL OR
      NEW.ksef_certificate_expiry IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'KSeF claim fields require a trusted server'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF (OLD.ksef_verified_at IS NOT NULL OR
      OLD.ksef_credentials_encrypted IS NOT NULL)
     AND NEW.nip IS DISTINCT FROM OLD.nip
     AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'KSeF NIP with proof or credentials cannot be changed'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.ksef_verified_at IS NOT NULL
     AND NEW.ksef_verified_at IS NULL
     AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'KSeF verification cannot be cleared'
      USING ERRCODE = '23514';
  END IF;
  IF OLD.ksef_verified_environment IS NOT NULL
     AND NEW.ksef_verified_environment IS NULL
     AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'KSeF proof environment cannot be cleared'
      USING ERRCODE = '23514';
  END IF;

  IF current_user IN ('anon', 'authenticated') AND (
    NEW.ksef_verified_at IS DISTINCT FROM OLD.ksef_verified_at OR
    NEW.ksef_verified_environment IS DISTINCT FROM OLD.ksef_verified_environment OR
    NEW.ksef_authority_user_id IS DISTINCT FROM OLD.ksef_authority_user_id OR
    NEW.ksef_credentials_encrypted IS DISTINCT FROM OLD.ksef_credentials_encrypted OR
    NEW.ksef_certificate_expiry IS DISTINCT FROM OLD.ksef_certificate_expiry
  ) THEN
    RAISE EXCEPTION 'KSeF claim fields require a trusted server'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_tenant_ksef_claim_fields()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trigger_guard_tenant_ksef_claim_fields ON public.tenants;
CREATE TRIGGER trigger_guard_tenant_ksef_claim_fields
  BEFORE INSERT OR UPDATE OF nip, ksef_verified_at,
    ksef_verified_environment, ksef_authority_user_id,
    ksef_credentials_encrypted, ksef_certificate_expiry
  ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_ksef_claim_fields();

-- This function is called only with service_role after the server has
-- validated an AAL2 owner session and successfully authenticated with KSeF
-- using the submitted XAdES certificate. The DB rechecks live membership,
-- NIP and ciphertext and commits status, credentials and audit together.
-- A service-role credential is still a high-trust secret: SQL cannot prove
-- that the external KSeF exchange happened.
CREATE OR REPLACE FUNCTION public.finalize_ksef_certificate_claim(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_nip TEXT,
  p_encrypted_credentials BYTEA,
  p_certificate_expiry TIMESTAMPTZ,
  p_environment TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_nip TEXT;
  v_verified_at TIMESTAMPTZ;
  v_verified_environment TEXT;
  v_first_claim BOOLEAN;
  v_constraint_name TEXT;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR
     p_expected_nip IS NULL OR p_expected_nip !~ '^[0-9]{10}$' OR
     p_encrypted_credentials IS NULL OR octet_length(p_encrypted_credentials) <= 28 OR
     p_environment NOT IN ('test', 'demo', 'production') OR p_environment IS NULL THEN
    RAISE EXCEPTION 'invalid_ksef_claim_input' USING ERRCODE = '22023';
  END IF;

  -- Hold the active owner membership through commit. A concurrent revocation
  -- cannot take effect between the authorization check and the claim write.
  PERFORM 1 FROM public.memberships m
  WHERE m.organization_id = p_tenant_id
    AND m.user_id = p_actor_user_id
    AND m.role = 'owner'
    AND m.status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_org_owner' USING ERRCODE = '42501';
  END IF;

  SELECT t.nip, t.ksef_verified_at, t.ksef_verified_environment
    INTO v_nip, v_verified_at, v_verified_environment
    FROM public.tenants t
    WHERE t.id = p_tenant_id
    FOR UPDATE;
  IF NOT FOUND OR v_nip IS DISTINCT FROM p_expected_nip THEN
    RAISE EXCEPTION 'ksef_tenant_or_nip_changed' USING ERRCODE = '23514';
  END IF;


  IF EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.nip = v_nip
      AND t.id <> p_tenant_id
      AND t.ksef_verified_at IS NOT NULL
      AND t.ksef_verified_environment = p_environment
  ) THEN
    RETURN 'already_claimed_by_other';
  END IF;

  -- A proof for test/demo is never silently promoted to production.
  -- A historical marker on this tenant receives provenance only after a
  -- fresh Owner proof; the server must perform XAdES before every RPC call.
  v_first_claim := v_verified_at IS NULL OR
    v_verified_environment IS DISTINCT FROM p_environment;
  BEGIN
    UPDATE public.tenants t
    SET ksef_verified_at = CASE WHEN v_first_claim THEN now() ELSE t.ksef_verified_at END,
        ksef_verified_environment = p_environment,
        ksef_authority_user_id = CASE WHEN v_first_claim THEN p_actor_user_id ELSE t.ksef_authority_user_id END,
        ksef_credentials_encrypted = p_encrypted_credentials,
        ksef_certificate_expiry = p_certificate_expiry,
        updated_at = now()
    WHERE t.id = p_tenant_id;

    INSERT INTO public.audit_logs
      (tenant_id, user_id, action, entity_type, entity_id, metadata)
    VALUES
      (p_tenant_id, p_actor_user_id, 'ksef.credentials_uploaded', 'tenants', p_tenant_id,
       jsonb_build_object('environment', p_environment, 'certificateExpiry', p_certificate_expiry));
    IF v_first_claim THEN
      INSERT INTO public.audit_logs
        (tenant_id, user_id, action, entity_type, entity_id, metadata)
      VALUES
        (p_tenant_id, p_actor_user_id, 'tenant.ksef_nip_ownership_claimed', 'tenants', p_tenant_id,
         jsonb_build_object('method', 'xades', 'environment', p_environment)),
        (p_tenant_id, p_actor_user_id, 'tenant.ksef_verified', 'tenants', p_tenant_id,
         jsonb_build_object('method', 'xades', 'environment', p_environment));
    END IF;

    RETURN CASE WHEN v_first_claim THEN 'claimed' ELSE 'already_claimed_by_self' END;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
    IF v_constraint_name IS DISTINCT FROM 'idx_tenants_nip_ksef_unique_verified' THEN
      RAISE;
    END IF;
    -- The partial unique index arbitrates concurrent claims for the same NIP.
    -- The subtransaction also undoes the credential and audit writes.
    RETURN 'already_claimed_by_other';
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_ksef_certificate_claim(
  UUID, UUID, TEXT, BYTEA, TIMESTAMPTZ, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_ksef_certificate_claim(
  UUID, UUID, TEXT, BYTEA, TIMESTAMPTZ, TEXT
) TO service_role;

COMMENT ON FUNCTION public.finalize_ksef_certificate_claim(
  UUID, UUID, TEXT, BYTEA, TIMESTAMPTZ, TEXT
) IS 'Service-only atomic KSeF claim + encrypted certificate + audit after server-side XAdES verification; never deletes duplicate tenants.';

-- The old view has no environment parameter. A true boolean only means a
-- proof exists in a known environment; callers must compare the exposed
-- environment with their configured KSEF_ENV before granting access.
CREATE OR REPLACE VIEW public.tenant_verification_status
WITH (security_invoker = true) AS
SELECT
  t.id,
  t.nip,
  t.name,
  (t.ksef_verified_at IS NOT NULL AND
   t.ksef_verified_environment IS NOT NULL) AS is_ksef_verified,
  t.ksef_verified_at,
  t.ksef_authority_user_id,
  t.ksef_verified_environment AS verified_environment
FROM public.tenants t;

COMMIT;