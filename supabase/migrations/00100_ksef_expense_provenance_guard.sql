-- Stage 1: preserve the partial client guard while installing the verified
-- server review RPC. Stage 2 (00101) blocks every direct KSeF UPDATE, after
-- the web version using this RPC is live. Never deploy 00101 before that web.

-- No authenticated application path inserts expenses. Keeping INSERT open
-- would let a client replace a guarded KSeF expense with a fabricated row.
REVOKE INSERT ON TABLE public.expenses FROM authenticated;

CREATE OR REPLACE FUNCTION public.guard_ksef_expense_provenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.source = 'ksef_inbox' OR OLD.ksef_invoice_id IS NOT NULL THEN
      RAISE EXCEPTION 'KSeF expense evidence is server-managed'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.source IS DISTINCT FROM OLD.source
     OR NEW.ksef_invoice_id IS DISTINCT FROM OLD.ksef_invoice_id THEN
    RAISE EXCEPTION 'Expense source and KSeF link are server-managed'
      USING ERRCODE = '42501';
  END IF;

  IF (OLD.source = 'ksef_inbox' OR OLD.ksef_invoice_id IS NOT NULL)
     AND NEW.ocr_extracted_data IS DISTINCT FROM OLD.ocr_extracted_data THEN
    RAISE EXCEPTION 'KSeF expense currency evidence is server-managed'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS a_guard_ksef_expense_provenance ON public.expenses;
CREATE TRIGGER a_guard_ksef_expense_provenance
  BEFORE UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.guard_ksef_expense_provenance();

COMMENT ON FUNCTION public.guard_ksef_expense_provenance() IS
  'Stage 1: client roles cannot rewrite or delete the KSeF source/link or original FX evidence; 00101 closes all direct KSeF updates.';

-- Called only by the authenticated Server Action after verified MFA and active
-- organization selection. The database rechecks membership and row identity
-- because service_role bypasses RLS. A failed audit INSERT rolls back UPDATE.
CREATE OR REPLACE FUNCTION public.review_ksef_expense(
  p_tenant_id uuid,
  p_expense_id uuid,
  p_actor_user_id uuid,
  p_expected_updated_at timestamptz,
  p_patch jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_key text;
  v_value jsonb;
  v_before public.expenses%ROWTYPE;
  v_after public.expenses%ROWTYPE;
  v_currency text;
  v_action text;
  v_fields text[];
BEGIN
  IF current_user <> 'service_role'
     OR p_tenant_id IS NULL OR p_expense_id IS NULL
     OR p_actor_user_id IS NULL OR p_expected_updated_at IS NULL
     OR jsonb_typeof(p_patch) IS DISTINCT FROM 'object'
     OR NOT (p_patch ? 'is_reviewed') THEN
    RAISE EXCEPTION 'Invalid KSeF expense review request'
      USING ERRCODE = '42501';
  END IF;

  -- FOR SHARE serializes a concurrent membership revocation with the review.
  PERFORM 1 FROM public.memberships AS m
   WHERE m.organization_id = p_tenant_id
     AND m.user_id = p_actor_user_id
     AND m.status = 'active'
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active organization membership'
      USING ERRCODE = '42501';
  END IF;

  -- Do not allow a service-role caller to supply tenant, source, link, FX
  -- evidence, creator, timestamps or other columns through the JSON patch.
  FOR v_key, v_value IN SELECT key, value FROM jsonb_each(p_patch) LOOP
    IF v_key NOT IN (
      'is_reviewed', 'kpir_column', 'category_label', 'is_deductible',
      'notes', 'seller_name', 'seller_nip', 'document_number', 'issue_date',
      'net_amount', 'vat_amount', 'gross_amount',
      'categorization_method', 'vat_deductible_amount'
    ) THEN
      RAISE EXCEPTION 'Unsupported KSeF expense review field'
        USING ERRCODE = '22023';
    END IF;

    IF (v_key IN ('is_reviewed', 'is_deductible')
        AND jsonb_typeof(v_value) <> 'boolean')
       OR (v_key IN ('net_amount', 'vat_amount', 'gross_amount',
                     'vat_deductible_amount')
           AND jsonb_typeof(v_value) <> 'number')
       OR (v_key IN ('seller_name', 'issue_date')
           AND jsonb_typeof(v_value) <> 'string')
       OR (v_key IN ('kpir_column', 'category_label', 'notes', 'seller_nip',
                     'document_number', 'categorization_method')
           AND jsonb_typeof(v_value) NOT IN ('string', 'null')) THEN
      RAISE EXCEPTION 'Invalid KSeF expense review field type'
        USING ERRCODE = '22023';
    END IF;

    IF v_key = 'issue_date'
       AND (p_patch->>'issue_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      RAISE EXCEPTION 'Invalid KSeF expense issue date'
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- A row lock plus the timestamp comparison prevents stale form submissions
  -- from overwriting a newer review. NULL means not found or stale.
  SELECT e.* INTO v_before
    FROM public.expenses AS e
   WHERE e.id = p_expense_id
     AND e.tenant_id = p_tenant_id
     AND e.updated_at = p_expected_updated_at
     AND (e.source = 'ksef_inbox' OR e.ksef_invoice_id IS NOT NULL)
   FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  UPDATE public.expenses AS e
     SET is_reviewed = CASE WHEN p_patch ? 'is_reviewed'
                            THEN (p_patch->>'is_reviewed')::boolean ELSE e.is_reviewed END,
         kpir_column = CASE WHEN p_patch ? 'kpir_column'
                            THEN (p_patch->>'kpir_column')::public.kpir_column ELSE e.kpir_column END,
         category_label = CASE WHEN p_patch ? 'category_label'
                               THEN p_patch->>'category_label' ELSE e.category_label END,
         is_deductible = CASE WHEN p_patch ? 'is_deductible'
                              THEN (p_patch->>'is_deductible')::boolean ELSE e.is_deductible END,
         notes = CASE WHEN p_patch ? 'notes'
                      THEN p_patch->>'notes' ELSE e.notes END,
         seller_name = CASE WHEN p_patch ? 'seller_name'
                            THEN p_patch->>'seller_name' ELSE e.seller_name END,
         seller_nip = CASE WHEN p_patch ? 'seller_nip'
                           THEN p_patch->>'seller_nip' ELSE e.seller_nip END,
         document_number = CASE WHEN p_patch ? 'document_number'
                                THEN p_patch->>'document_number' ELSE e.document_number END,
         issue_date = CASE WHEN p_patch ? 'issue_date'
                           THEN (p_patch->>'issue_date')::date ELSE e.issue_date END,
         net_amount = CASE WHEN p_patch ? 'net_amount'
                           THEN (p_patch->>'net_amount')::numeric ELSE e.net_amount END,
         vat_amount = CASE WHEN p_patch ? 'vat_amount'
                           THEN (p_patch->>'vat_amount')::numeric ELSE e.vat_amount END,
         gross_amount = CASE WHEN p_patch ? 'gross_amount'
                             THEN (p_patch->>'gross_amount')::numeric ELSE e.gross_amount END,
         categorization_method = CASE WHEN p_patch ? 'categorization_method'
                                      THEN (p_patch->>'categorization_method')::public.categorization_method
                                      ELSE e.categorization_method END,
         vat_deductible_amount = CASE WHEN p_patch ? 'vat_deductible_amount'
                                      THEN (p_patch->>'vat_deductible_amount')::numeric
                                      ELSE e.vat_deductible_amount END
   WHERE e.id = v_before.id AND e.tenant_id = p_tenant_id
   RETURNING e.* INTO v_after;

  IF v_after.ksef_invoice_id IS NOT NULL THEN
    SELECT nullif(upper(btrim(i.currency)), '') INTO v_currency
      FROM public.invoices AS i
     WHERE i.id = v_after.ksef_invoice_id
       AND i.tenant_id = p_tenant_id;
  END IF;

  -- An unlinked or unidentifiable historical KSeF expense may only be
  -- excluded. The Server Action applies the fuller FX review policy.
  IF v_currency IS NULL AND (v_after.is_reviewed OR v_after.is_deductible) THEN
    RAISE EXCEPTION 'Unknown KSeF currency permits exclusion only'
      USING ERRCODE = '42501';
  END IF;

  v_action := CASE
    WHEN v_currency = 'PLN' THEN 'expense.reviewed'
    WHEN v_after.is_reviewed THEN 'expense.foreign_currency_reviewed'
    ELSE 'expense.foreign_currency_excluded'
  END;

  SELECT array_agg(k ORDER BY k) INTO v_fields
    FROM jsonb_object_keys(p_patch) AS fields(k);

  INSERT INTO public.audit_logs (
    tenant_id, user_id, action, entity_type, entity_id, metadata
  ) VALUES (
    p_tenant_id, p_actor_user_id, v_action, 'expense', v_after.id,
    jsonb_build_object(
      'currency', coalesce(v_currency, 'unknown'),
      'includedInKpir', v_after.is_deductible,
      'fields', to_jsonb(v_fields)
    )
  );

  RETURN v_after.id;
END;
$$;

REVOKE ALL ON FUNCTION public.review_ksef_expense(
  uuid, uuid, uuid, timestamptz, jsonb
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_ksef_expense(
  uuid, uuid, uuid, timestamptz, jsonb
) TO service_role;

COMMENT ON FUNCTION public.review_ksef_expense(uuid, uuid, uuid, timestamptz, jsonb) IS
  'Service-role-only KSeF expense review: tenant membership, row version and atomic audit are checked in one transaction.';

-- Self-hosted PostgREST caches RPC signatures. Make the newly installed RPC
-- visible before switching web traffic to the Server Action that calls it.
NOTIFY pgrst, 'reload schema';
