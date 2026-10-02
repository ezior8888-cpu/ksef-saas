-- Przeniesione 02.10.2026 ze szkicu Codexa #64 (tam 00089) jako 00120 — C-20.
-- Numeracja: 00089→00120, 00090→00121.
-- An incoming invoice is identified by the KSeF number within a tenant and
-- KSeF environment. Its issuer's invoice number is not unique across sellers.
-- Requires 00086 (invoices.ksef_environment). No historical rows are deleted
-- or assigned an environment by this migration.
BEGIN;

-- Keep the preflight and replacement indexes on one stable set of rows.
-- Operator must schedule a short write pause for this migration.
LOCK TABLE public.invoices IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.invoices
    WHERE direction = 'incoming'
      AND ksef_number IS NOT NULL
      AND ksef_environment IS NULL
  ) THEN
    RAISE EXCEPTION 'Incoming KSeF invoices without environment require manual reconciliation before 00120';
  END IF;

  IF EXISTS (
    SELECT 1 FROM (
      SELECT tenant_id, ksef_environment, ksef_number
      FROM public.invoices
      WHERE direction = 'incoming' AND ksef_number IS NOT NULL
      GROUP BY tenant_id, ksef_environment, ksef_number
      HAVING count(*) > 1
    ) AS duplicates
  ) THEN
    RAISE EXCEPTION 'Duplicate incoming KSeF identities require manual reconciliation before 00120';
  END IF;
END;
$$;

-- The old 00028 index also covers incoming invoices. Two independent sellers
-- may both issue FV/1; only our outgoing numbering needs this constraint.
CREATE UNIQUE INDEX uq_invoices_tenant_outgoing_internal_number
  ON public.invoices (tenant_id, internal_number)
  WHERE direction = 'outgoing' AND internal_number IS NOT NULL;

CREATE UNIQUE INDEX uq_invoices_incoming_ksef_identity
  ON public.invoices (tenant_id, ksef_environment, ksef_number)
  WHERE direction = 'incoming' AND ksef_environment IS NOT NULL
    AND ksef_number IS NOT NULL;

-- Prevent a new unclassified incoming KSeF number after the preflight.
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_incoming_ksef_environment_required
  CHECK (direction <> 'incoming' OR ksef_number IS NULL OR ksef_environment IS NOT NULL);

-- C-08 may have replaced 00028 earlier in an independent hotfix. Remove its
-- temporary, environment-agnostic keys only after both canonical indexes and
-- the environment constraint above exist. Without C-08 these are no-ops.
DROP INDEX IF EXISTS public.uq_invoices_tenant_internal_number;
DROP INDEX IF EXISTS public.uq_invoices_tenant_outgoing_internal_number_c08;
DROP INDEX IF EXISTS public.uq_invoices_tenant_incoming_ksef_number_c08;

COMMENT ON INDEX public.uq_invoices_tenant_outgoing_internal_number IS
  'One issued invoice number per tenant; incoming numbers belong to different sellers.';
COMMENT ON INDEX public.uq_invoices_incoming_ksef_identity IS
  'At most one received KSeF document per tenant and environment.';

COMMIT;
