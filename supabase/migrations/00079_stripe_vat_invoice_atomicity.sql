-- Stripe VAT invoice / admin-refund boundary.
-- Apply as a privileged database owner, never as service_role: the guarded
-- column can be written only by this owner's SECURITY DEFINER RPC.
-- Apply only after 00075-00078, with old web and workers drained and the new
-- application release ready. The old refund path directly INSERTs operations;
-- it will fail after the INSERT grant is revoked below. Do not run this SQL from
-- Codex. The owner must rehearse it on a production copy and deploy it with the
-- companion application change.
--
-- Historical records are NOT backfilled. Before enabling self-invoicing or
-- refunds, reconcile duplicate vat_invoice_id links, unlinked VAT documents,
-- and mismatches between stripe_payments, invoice notes/fa3_data, tenant,
-- amount, buyer and KSeF state. A legacy document without a trustworthy full
-- Stripe ID requires a human decision; never infer identity from the 8-character
-- suffix in internal_number. The two RPCs below reject recognizable legacy
-- documents instead of silently creating another invoice or issuing a refund.

DO $$
BEGIN
  IF pg_catalog.to_regclass('public.stripe_subscription_sync_leases') IS NULL THEN
    RAISE EXCEPTION 'Apply 00078 before 00079' USING ERRCODE = '55000';
  END IF;
END;
$$;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS stripe_invoice_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.invoices'::pg_catalog.regclass
      AND conname = 'invoices_stripe_invoice_identity_check'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_stripe_invoice_identity_check
      CHECK (
        stripe_invoice_id IS NULL OR (
          stripe_invoice_id ~ '^in_[A-Za-z0-9]+$'
          AND direction = 'outgoing'
          AND invoice_kind = 'regular'::public.invoice_type_enum
        )
      );
  END IF;
END;
$$;

-- Full Stripe invoice IDs are globally unique. This catches a retry even when
-- an absent paid_at previously changed the human-readable month/number.
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_stripe_invoice_id
  ON public.invoices (stripe_invoice_id)
  WHERE stripe_invoice_id IS NOT NULL;

-- One VAT document cannot be linked to two payment rows. This index will fail
-- on dirty history; that is an intended stop for manual reconciliation.
CREATE UNIQUE INDEX IF NOT EXISTS uq_stripe_payments_vat_invoice_id
  ON public.stripe_payments (vat_invoice_id)
  WHERE vat_invoice_id IS NOT NULL;

COMMENT ON COLUMN public.invoices.stripe_invoice_id IS
  'Full, server-managed Stripe invoice ID for the operator VAT invoice. NULL for other invoices and unreconciled history.';

-- 00002 grants authenticated table-level INSERT/UPDATE/DELETE on invoices.
-- Column-level REVOKE would not override that grant, so use a trigger. A client
-- cannot impersonate a Stripe invoice or remove an unsubmitted billing draft.
CREATE OR REPLACE FUNCTION public.guard_billing_invoice_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- The service role may perform only a due retention deletion. Otherwise
    -- deletion would erase the durable VAT identity and clear the payment FK.
    IF OLD.stripe_invoice_id IS NOT NULL
       AND current_user IN ('authenticated', 'anon', 'service_role')
       AND NOT (
         current_user = 'service_role'
         AND OLD.scheduled_deletion_at IS NOT NULL
         AND OLD.scheduled_deletion_at < pg_catalog.now()
       ) THEN
      RAISE EXCEPTION 'Billing invoice identity is server-managed'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  -- SECURITY DEFINER executes as its privileged owner, while direct
  -- authenticated/service_role writes cannot set or rewrite the identity.
  IF current_user NOT IN ('authenticated', 'anon', 'service_role') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.stripe_invoice_id IS NOT NULL THEN
      RAISE EXCEPTION 'Billing invoice identity is server-managed'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.stripe_invoice_id IS DISTINCT FROM OLD.stripe_invoice_id THEN
    RAISE EXCEPTION 'Billing invoice identity is server-managed'
      USING ERRCODE = '42501';
  END IF;
  IF OLD.stripe_invoice_id IS NOT NULL AND (
    ROW(
      NEW.tenant_id, NEW.direction, NEW.internal_number,
      NEW.invoice_type, NEW.invoice_kind, NEW.origin,
      NEW.issue_date, NEW.sale_date, NEW.seller_nip, NEW.buyer_nip,
      NEW.seller_data, NEW.buyer_data, NEW.payment_data,
      NEW.payment_due_date, NEW.currency, NEW.notes,
      NEW.net_total, NEW.vat_total, NEW.gross_total, NEW.fa3_data,
      NEW.is_b2c, NEW.buyer_id_type, NEW.buyer_pesel,
      NEW.buyer_id_number, NEW.parent_invoice_id,
      NEW.correction_reason, NEW.correction_type, NEW.advance_amount,
      NEW.advance_invoice_ids
    ) IS DISTINCT FROM ROW(
      OLD.tenant_id, OLD.direction, OLD.internal_number,
      OLD.invoice_type, OLD.invoice_kind, OLD.origin,
      OLD.issue_date, OLD.sale_date, OLD.seller_nip, OLD.buyer_nip,
      OLD.seller_data, OLD.buyer_data, OLD.payment_data,
      OLD.payment_due_date, OLD.currency, OLD.notes,
      OLD.net_total, OLD.vat_total, OLD.gross_total, OLD.fa3_data,
      OLD.is_b2c, OLD.buyer_id_type, OLD.buyer_pesel,
      OLD.buyer_id_number, OLD.parent_invoice_id,
      OLD.correction_reason, OLD.correction_type, OLD.advance_amount,
      OLD.advance_invoice_ids
    )
  ) THEN
    RAISE EXCEPTION 'Billing VAT document is immutable'
      USING ERRCODE = '42501';
  END IF;
  -- KSeF delivery state/number, PDF/XML paths, payment ledger state,
  -- archival/retention and operational timestamps remain writable.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS a_guard_billing_invoice_identity ON public.invoices;
CREATE TRIGGER a_guard_billing_invoice_identity
  BEFORE INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_billing_invoice_identity();

-- A billing VAT line is part of the tax document, not mutable application
-- state. During FK ON DELETE CASCADE, the parent is already absent, so scheduled
-- invoice retention may still remove its lines.
CREATE OR REPLACE FUNCTION public.guard_billing_invoice_line()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon', 'service_role') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') AND EXISTS (
    SELECT 1 FROM public.invoices AS i
    WHERE i.id = OLD.invoice_id AND i.stripe_invoice_id IS NOT NULL
      AND NOT (
        TG_OP = 'DELETE' AND current_user = 'service_role'
        AND i.scheduled_deletion_at IS NOT NULL
        AND i.scheduled_deletion_at < pg_catalog.now()
      )
  ) THEN
    RAISE EXCEPTION 'Billing VAT line is immutable' USING ERRCODE = '42501';
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND EXISTS (
    SELECT 1 FROM public.invoices AS i
    WHERE i.id = NEW.invoice_id AND i.stripe_invoice_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Billing VAT line is immutable' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS a_guard_billing_invoice_line
  ON public.invoice_line_items;
CREATE TRIGGER a_guard_billing_invoice_line
  BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_line_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_billing_invoice_line();

-- The payment->VAT link is set only inside create_billing_vat_invoice. A direct
-- webhook upsert that omits this column may present it as NULL; preserve the
-- existing link without failing the webhook. Any direct attempt to set a new
-- non-NULL value or replace the linked invoice is rejected. The independent
-- refund/status guard from 00075/00077 continues to run on status changes.
CREATE OR REPLACE FUNCTION public.guard_stripe_payment_vat_invoice_link()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_retention_unlink boolean := false;
BEGIN
  IF current_user IN ('authenticated', 'anon', 'service_role') THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.vat_invoice_id IS NOT NULL THEN
        RAISE EXCEPTION 'VAT invoice link is server-managed'
          USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END IF;
    IF OLD.vat_invoice_id IS NOT NULL AND NEW.vat_invoice_id IS NULL THEN
      -- FK ON DELETE SET NULL during a due retention deletion must complete.
      -- All other direct NULL attempts are ignored, preserving the old link.
      IF current_user = 'service_role' AND (
        NOT EXISTS (
          SELECT 1 FROM public.invoices AS i
          WHERE i.id = OLD.vat_invoice_id
        ) OR EXISTS (
          SELECT 1 FROM public.invoices AS i
          WHERE i.id = OLD.vat_invoice_id
            AND i.scheduled_deletion_at IS NOT NULL
            AND i.scheduled_deletion_at < pg_catalog.now()
        )
      ) THEN
        v_retention_unlink := true;
      ELSE
        NEW.vat_invoice_id := OLD.vat_invoice_id;
      END IF;
    END IF;
    IF NEW.vat_invoice_id IS DISTINCT FROM OLD.vat_invoice_id
       AND NOT v_retention_unlink THEN
      RAISE EXCEPTION 'VAT invoice link is server-managed'
        USING ERRCODE = '42501';
    END IF;
    -- Once a VAT document exists, the signed billing evidence is immutable.
    -- An identical retry/upsert passes; a changed paid snapshot needs manual
    -- reconciliation. Refund status and technical payment references remain
    -- writable through their existing, separate controls.
    IF OLD.vat_invoice_id IS NOT NULL AND ROW(
      NEW.stripe_invoice_id, NEW.amount_cents, NEW.currency,
      NEW.paid_at, NEW.subscription_id, NEW.last_webhook_payload
    ) IS DISTINCT FROM ROW(
      OLD.stripe_invoice_id, OLD.amount_cents, OLD.currency,
      OLD.paid_at, OLD.subscription_id, OLD.last_webhook_payload
    ) THEN
      RAISE EXCEPTION 'Linked Stripe payment evidence is immutable'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- PostgreSQL orders same-kind triggers by name. Run this after the 00077
-- trigger_preserve_stripe_payment_refund_status, which may discard a stale
-- success/failure webhook before its old snapshot reaches this evidence guard.
DROP TRIGGER IF EXISTS z_guard_stripe_payment_vat_invoice_link
  ON public.stripe_payments;
CREATE TRIGGER z_guard_stripe_payment_vat_invoice_link
  BEFORE INSERT OR UPDATE OF vat_invoice_id, stripe_invoice_id,
    amount_cents, currency, paid_at, subscription_id, last_webhook_payload
  ON public.stripe_payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_stripe_payment_vat_invoice_link();
-- PostgREST invokes each RPC in one database transaction. Both RPCs take the
-- same payment row lock before checking invoice/refund state; therefore a new
-- automatic refund claim and a new VAT document cannot both win the race.
-- Only the function owner may write invoices and refund claims inside these
-- SECURITY DEFINER functions. The caller must be service_role.
CREATE OR REPLACE FUNCTION public.create_billing_vat_invoice(
  p_payment_id uuid,
  p_customer_tenant_id uuid,
  p_operator_tenant_id uuid,
  p_stripe_invoice_id text,
  p_invoice jsonb
)
RETURNS TABLE(invoice_id uuid, internal_number text, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payment public.stripe_payments%ROWTYPE;
  v_subscription public.subscriptions%ROWTYPE;
  v_customer public.tenants%ROWTYPE;
  v_operator public.tenants%ROWTYPE;
  v_existing public.invoices%ROWTYPE;
  v_snapshot jsonb;
  v_line jsonb;
  v_paid_date date;
  v_number text;
  v_note text;
  v_gross numeric;
  v_net numeric;
  v_vat numeric;
  v_stripe_customer text;
  v_legacy_subscription text;
  v_parent_subscription text;
  v_new_invoice_id uuid;
  v_rows integer;
BEGIN
  IF p_payment_id IS NULL OR p_customer_tenant_id IS NULL
     OR p_operator_tenant_id IS NULL OR p_stripe_invoice_id IS NULL
     OR p_stripe_invoice_id !~ '^in_[A-Za-z0-9]{8,}$'
     OR pg_catalog.jsonb_typeof(p_invoice) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid billing invoice request' USING ERRCODE = '22023';
  END IF;

  SELECT p.* INTO v_payment
  FROM public.stripe_payments AS p
  WHERE p.id = p_payment_id AND p.tenant_id = p_customer_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment identity requires reconciliation'
      USING ERRCODE = '23514';
  END IF;
  IF v_payment.status IS DISTINCT FROM 'succeeded'
     OR v_payment.stripe_invoice_id IS DISTINCT FROM p_stripe_invoice_id
     OR v_payment.paid_at IS NULL
     OR v_payment.amount_cents <= 0
     OR pg_catalog.lower(v_payment.currency) <> 'pln'
     OR v_payment.subscription_id IS NULL THEN
    RAISE EXCEPTION 'Payment not eligible for automatic VAT invoice'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
      SELECT 1 FROM public.stripe_refund_operations AS o
      WHERE o.payment_id = v_payment.id
    ) OR EXISTS (
      SELECT 1 FROM public.stripe_refunds AS r
      WHERE r.payment_id = v_payment.id
    ) THEN
    RAISE EXCEPTION 'Refund requires VAT reconciliation'
      USING ERRCODE = '23514';
  END IF;

  SELECT s.* INTO v_subscription FROM public.subscriptions AS s
  WHERE s.id = v_payment.subscription_id AND s.tenant_id = v_payment.tenant_id;
  SELECT t.* INTO v_customer FROM public.tenants AS t
  WHERE t.id = p_customer_tenant_id;
  SELECT t.* INTO v_operator FROM public.tenants AS t
  WHERE t.id = p_operator_tenant_id;
  IF v_subscription.id IS NULL OR v_customer.id IS NULL OR v_operator.id IS NULL
     OR v_subscription.stripe_customer_id IS DISTINCT FROM v_customer.stripe_customer_id
     OR v_customer.stripe_customer_id IS NULL THEN
    RAISE EXCEPTION 'Billing customer binding requires reconciliation'
      USING ERRCODE = '23514';
  END IF;

  -- A paid invoice snapshot came from a verified webhook. Reject incomplete
  -- legacy snapshots rather than trusting a mutable subscription plan alone.
  v_snapshot := v_payment.last_webhook_payload;
  IF pg_catalog.jsonb_typeof(v_snapshot) IS DISTINCT FROM 'object'
     OR v_snapshot->>'id' IS DISTINCT FROM p_stripe_invoice_id
     OR v_snapshot->>'status' IS DISTINCT FROM 'paid'
     OR v_snapshot->>'currency' IS DISTINCT FROM 'pln'
     OR pg_catalog.jsonb_typeof(v_snapshot->'amount_paid') IS DISTINCT FROM 'number'
     OR (v_snapshot->>'amount_paid')::numeric IS DISTINCT FROM v_payment.amount_cents THEN
    RAISE EXCEPTION 'Paid Stripe snapshot requires reconciliation'
      USING ERRCODE = '23514';
  END IF;
  v_stripe_customer := CASE
    WHEN pg_catalog.jsonb_typeof(v_snapshot->'customer') = 'string'
      THEN v_snapshot->>'customer'
    ELSE v_snapshot#>>'{customer,id}'
  END;
  v_legacy_subscription := CASE
    WHEN pg_catalog.jsonb_typeof(v_snapshot->'subscription') = 'string'
      THEN v_snapshot->>'subscription'
    ELSE v_snapshot#>>'{subscription,id}'
  END;
  v_parent_subscription := CASE
    WHEN pg_catalog.jsonb_typeof(v_snapshot#>'{parent,subscription_details,subscription}') = 'string'
      THEN v_snapshot#>>'{parent,subscription_details,subscription}'
    ELSE v_snapshot#>>'{parent,subscription_details,subscription,id}'
  END;
  IF v_stripe_customer IS DISTINCT FROM v_subscription.stripe_customer_id
     OR (v_legacy_subscription IS NOT NULL AND v_parent_subscription IS NOT NULL
         AND v_legacy_subscription <> v_parent_subscription)
     OR COALESCE(v_legacy_subscription, v_parent_subscription)
        IS DISTINCT FROM v_subscription.stripe_subscription_id THEN
    RAISE EXCEPTION 'Stripe snapshot subscription/customer mismatch'
      USING ERRCODE = '23514';
  END IF;

  v_paid_date := (v_payment.paid_at AT TIME ZONE 'UTC')::date;
  v_number := 'FF/' || pg_catalog.to_char(
    v_payment.paid_at AT TIME ZONE 'UTC', 'YYYY/MM'
  ) || '/' || pg_catalog.upper(pg_catalog.right(pg_catalog.substr(p_stripe_invoice_id, 4), 8));
  v_note := 'Faktura za subskrypcję FaktFlow. Płatność Stripe: '
    || p_stripe_invoice_id || '.';

  IF pg_catalog.jsonb_typeof(p_invoice->'lines') IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_array_length(p_invoice->'lines') <> 1
     OR pg_catalog.jsonb_typeof(p_invoice->'seller') IS DISTINCT FROM 'object'
     OR pg_catalog.jsonb_typeof(p_invoice->'buyer') IS DISTINCT FROM 'object'
     OR pg_catalog.jsonb_typeof(p_invoice->'payment') IS DISTINCT FROM 'object'
     OR pg_catalog.jsonb_typeof(p_invoice->'grossTotal') IS DISTINCT FROM 'number'
     OR pg_catalog.jsonb_typeof(p_invoice->'netTotal') IS DISTINCT FROM 'number'
     OR pg_catalog.jsonb_typeof(p_invoice->'vatTotal') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'Incomplete billing VAT draft' USING ERRCODE = '22023';
  END IF;
  v_line := p_invoice->'lines'->0;
  IF pg_catalog.jsonb_typeof(v_line) IS DISTINCT FROM 'object'
     OR pg_catalog.jsonb_typeof(v_line->'quantity') IS DISTINCT FROM 'number'
     OR pg_catalog.jsonb_typeof(v_line->'unitPriceNet') IS DISTINCT FROM 'number'
     OR pg_catalog.jsonb_typeof(v_line->'netAmount') IS DISTINCT FROM 'number'
     OR pg_catalog.jsonb_typeof(v_line->'vatAmount') IS DISTINCT FROM 'number'
     OR pg_catalog.jsonb_typeof(v_line->'grossAmount') IS DISTINCT FROM 'number'
     OR pg_catalog.jsonb_typeof(p_invoice->'payment'->'amountDue') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'Incomplete billing VAT line' USING ERRCODE = '22023';
  END IF;
  v_gross := (p_invoice->>'grossTotal')::numeric;
  v_net := (p_invoice->>'netTotal')::numeric;
  v_vat := (p_invoice->>'vatTotal')::numeric;
  IF v_gross <= 0 OR v_gross * 100 <> v_payment.amount_cents
     OR v_net + v_vat <> v_gross
     OR (v_line->>'grossAmount')::numeric <> v_gross
     OR (v_line->>'netAmount')::numeric <> v_net
     OR (v_line->>'vatAmount')::numeric <> v_vat
     OR (v_line->>'unitPriceNet')::numeric <> v_net
     OR (v_line->>'quantity')::numeric <> 1
     OR v_line->>'ordinal' IS DISTINCT FROM '1'
     OR v_net <> pg_catalog.round(v_gross / 1.23, 2)
     OR v_vat <> v_gross - v_net
     OR (p_invoice->'payment'->>'amountDue')::numeric <> v_gross
     OR COALESCE(v_line->>'unit', '') <> 'usł.'
     OR COALESCE(v_line->>'vatRate', '') <> '23'
     OR COALESCE(v_line->>'name', '') NOT LIKE 'FaktFlow — subskrypcja miesięczna (%'
        AND COALESCE(v_line->>'name', '') NOT LIKE 'FaktFlow — subskrypcja roczna (%' THEN
    RAISE EXCEPTION 'Billing VAT amount/line requires reconciliation'
      USING ERRCODE = '23514';
  END IF;
  IF p_invoice->>'internalNumber' IS DISTINCT FROM v_number
     OR p_invoice->>'notes' IS DISTINCT FROM v_note
     OR p_invoice->>'type' IS DISTINCT FROM 'VAT'
     OR p_invoice->>'issueDate' IS DISTINCT FROM v_paid_date::text
     OR p_invoice->>'saleDate' IS DISTINCT FROM v_paid_date::text
     OR p_invoice->'seller'->>'nip' IS DISTINCT FROM v_operator.nip
     OR p_invoice->'buyer'->>'nip' IS DISTINCT FROM v_customer.nip
     OR p_invoice->'payment'->>'currency' IS DISTINCT FROM 'PLN'
     OR p_invoice->'payment'->>'dueDate' IS DISTINCT FROM v_paid_date::text
     OR p_invoice->'payment'->>'method' IS DISTINCT FROM 'card' THEN
    RAISE EXCEPTION 'Billing VAT identity/date requires reconciliation'
      USING ERRCODE = '23514';
  END IF;

  IF v_payment.vat_invoice_id IS NOT NULL THEN
    SELECT i.* INTO v_existing FROM public.invoices AS i
    WHERE i.id = v_payment.vat_invoice_id;
    IF v_existing.id IS NULL
       OR v_existing.stripe_invoice_id IS DISTINCT FROM p_stripe_invoice_id
       OR v_existing.tenant_id IS DISTINCT FROM p_operator_tenant_id
       OR v_existing.internal_number IS DISTINCT FROM v_number
       OR v_existing.fa3_data IS DISTINCT FROM p_invoice
       OR (SELECT pg_catalog.count(*) FROM public.invoice_line_items AS li
           WHERE li.invoice_id = v_existing.id) <> 1
       OR NOT EXISTS (
         SELECT 1 FROM public.invoice_line_items AS li
         WHERE li.invoice_id = v_existing.id
           AND li.ordinal = 1
           AND li.name = v_line->>'name'
           AND li.unit = v_line->>'unit'
           AND li.quantity = (v_line->>'quantity')::numeric
           AND li.unit_price_net = (v_line->>'unitPriceNet')::numeric
           AND li.net_amount = (v_line->>'netAmount')::numeric
           AND li.vat_rate = v_line->>'vatRate'
           AND li.vat_amount = (v_line->>'vatAmount')::numeric
           AND li.gross_amount = (v_line->>'grossAmount')::numeric
       ) THEN
      RAISE EXCEPTION 'Existing VAT invoice requires reconciliation'
        USING ERRCODE = '23514';
    END IF;
    RETURN QUERY SELECT v_existing.id, v_number, false;
    RETURN;
  END IF;

  -- Historical notes/fa3_data are customer-editable. Inspect only the
  -- configured operator tenant, so an unrelated tenant cannot block billing.
  IF EXISTS (
      SELECT 1 FROM public.invoices AS i
      WHERE i.tenant_id = p_operator_tenant_id
        AND (
          i.stripe_invoice_id = p_stripe_invoice_id
          OR i.notes = v_note
          OR i.fa3_data->>'notes' = v_note
        )
    ) THEN
    RAISE EXCEPTION 'Existing or legacy VAT invoice requires reconciliation'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.invoices (
    tenant_id, direction, ksef_status, invoice_kind, origin,
    stripe_invoice_id, internal_number, invoice_type, issue_date, sale_date,
    seller_nip, buyer_nip, seller_data, buyer_data, payment_data,
    payment_due_date, currency, notes, net_total, vat_total, gross_total,
    is_b2c, fa3_data
  ) VALUES (
    p_operator_tenant_id, 'outgoing', 'draft', 'regular', 'app',
    p_stripe_invoice_id, v_number, 'VAT', v_paid_date, v_paid_date,
    v_operator.nip, v_customer.nip, p_invoice->'seller', p_invoice->'buyer',
    p_invoice->'payment', v_paid_date, 'PLN', v_note, v_net, v_vat, v_gross,
    false, p_invoice
  ) RETURNING id INTO v_new_invoice_id;

  INSERT INTO public.invoice_line_items (
    invoice_id, ordinal, name, unit, quantity, unit_price_net,
    net_amount, vat_rate, vat_amount, gross_amount
  ) VALUES (
    v_new_invoice_id, 1, v_line->>'name', v_line->>'unit',
    (v_line->>'quantity')::numeric, (v_line->>'unitPriceNet')::numeric,
    (v_line->>'netAmount')::numeric, v_line->>'vatRate',
    (v_line->>'vatAmount')::numeric, (v_line->>'grossAmount')::numeric
  );

  UPDATE public.stripe_payments AS p
  SET vat_invoice_id = v_new_invoice_id
  WHERE p.id = v_payment.id AND p.tenant_id = p_customer_tenant_id
    AND p.status = 'succeeded' AND p.vat_invoice_id IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'Payment changed during VAT invoice transaction'
      USING ERRCODE = '40001';
  END IF;

  -- Any error above aborts the PostgREST transaction, including header/line.
  -- This timestamp belongs to a confirmed KSeF enqueue, not draft creation.
  RETURN QUERY SELECT v_new_invoice_id, v_number, true;
END;
$$;

REVOKE ALL ON FUNCTION public.create_billing_vat_invoice(
  uuid, uuid, uuid, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_billing_vat_invoice(
  uuid, uuid, uuid, text, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_admin_refund_uninvoiced(
  p_payment_id uuid,
  p_tenant_id uuid,
  p_operator_tenant_id uuid,
  p_admin_user_id uuid,
  p_reason text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payment public.stripe_payments%ROWTYPE;
  v_note text;
BEGIN
  IF p_payment_id IS NULL OR p_tenant_id IS NULL
     OR p_operator_tenant_id IS NULL OR p_admin_user_id IS NULL
     OR pg_catalog.char_length(COALESCE(p_reason, '')) > 500 THEN
    RETURN 'invalid_payment';
  END IF;
  PERFORM 1 FROM public.tenants AS t
  WHERE t.id = p_operator_tenant_id;
  IF NOT FOUND THEN RETURN 'invalid_payment'; END IF;

  SELECT p.* INTO v_payment FROM public.stripe_payments AS p
  WHERE p.id = p_payment_id AND p.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN 'invalid_payment'; END IF;

  -- 00075's PRIMARY KEY(payment_id) remains the durable idempotency claim.
  -- An old direct refund row without an operation is also a blocking attempt;
  -- the caller must reconcile it instead of trying Stripe again.
  IF EXISTS (
      SELECT 1 FROM public.stripe_refund_operations AS o
      WHERE o.payment_id = v_payment.id
    ) OR EXISTS (
      SELECT 1 FROM public.stripe_refunds AS r
      WHERE r.payment_id = v_payment.id
    ) THEN
    RETURN 'already_claimed';
  END IF;

  v_note := 'Faktura za subskrypcję FaktFlow. Płatność Stripe: '
    || v_payment.stripe_invoice_id || '.';
  IF v_payment.vat_invoice_id IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM public.invoices AS i
       WHERE i.tenant_id = p_operator_tenant_id
         AND (
           i.stripe_invoice_id = v_payment.stripe_invoice_id
           OR i.notes = v_note
           OR i.fa3_data->>'notes' = v_note
         )
     ) THEN
    RETURN 'invoice_exists';
  END IF;

  IF v_payment.status IS DISTINCT FROM 'succeeded' THEN
    RETURN 'not_succeeded';
  END IF;
  IF v_payment.stripe_invoice_id IS NULL
     OR v_payment.amount_cents <= 0
     OR v_payment.currency !~ '^[A-Za-z]{3}$'
     OR COALESCE(v_payment.stripe_payment_intent_id,
                            v_payment.stripe_charge_id) IS NULL THEN
    RETURN 'invalid_payment';
  END IF;

  INSERT INTO public.stripe_refund_operations (
    payment_id, tenant_id, idempotency_key, amount_cents, currency,
    stripe_payment_reference, status, requested_by_user_id, reason
  ) VALUES (
    v_payment.id, v_payment.tenant_id,
    'admin-full-refund-v1:' || v_payment.id::text,
    v_payment.amount_cents, v_payment.currency,
    COALESCE(v_payment.stripe_payment_intent_id,
                        v_payment.stripe_charge_id),
    'processing', p_admin_user_id, p_reason
  );
  RETURN 'claimed';
END;
$$;

REVOKE ALL ON FUNCTION public.claim_admin_refund_uninvoiced(
  uuid, uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_admin_refund_uninvoiced(
  uuid, uuid, uuid, uuid, text
) TO service_role;

-- The old application path inserted directly. Removing INSERT forces every
-- new admin refund through the payment-row-locking RPC. Keep SELECT/UPDATE for
-- existing reconciliation/completion code. This is a coordinated release gate.
REVOKE INSERT ON public.stripe_refund_operations
  FROM PUBLIC, anon, authenticated, service_role;
