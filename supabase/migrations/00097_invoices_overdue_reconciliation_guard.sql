-- Only automatically chaseable invoices belong in the overdue dashboard.
-- Corrections are not independent receivables, and imported history lacks a
-- trustworthy payment balance. Until C-01 reconciles the legal amount after
-- corrections, also omit any original with a linked child (even a draft or
-- rejected child), including advances settled through advance_invoice_ids.
-- Final/ROZ is held until advance settlement is represented in a trusted
-- balance: gross_total - paid_amount can overstate its remaining claim.
-- This intentionally understates total receivables; the UI
-- labels the sum as the displayed, provisional subset.
--
-- CREATE OR REPLACE keeps the 00082 column names, order and types as well as
-- existing grants. Keep security_invoker=true: dropping it reopens SEC-C-05.
CREATE OR REPLACE VIEW public.invoices_overdue
WITH (security_invoker = true) AS
SELECT
  i.id,
  i.tenant_id,
  i.internal_number,
  i.issue_date,
  i.payment_due_date,
  i.gross_total,
  i.paid_amount,
  i.gross_total - COALESCE(i.paid_amount, 0)::NUMERIC AS amount_due,
  i.payment_status,
  public.days_overdue(i.payment_due_date::DATE) AS days_overdue,
  COALESCE(i.buyer_data->>'name', '') AS buyer_name,
  COALESCE(i.buyer_nip, i.buyer_data->>'nip', '') AS buyer_nip,
  COALESCE(i.buyer_data->>'email', '') AS buyer_email,
  i.reminders_paused,
  (
    SELECT COUNT(*)::BIGINT
    FROM public.payment_reminders pr
    WHERE pr.invoice_id = i.id
      AND pr.status = 'sent'
  ) AS reminders_sent_count
FROM public.invoices i
WHERE i.direction = 'outgoing'
  AND i.origin = 'app'
  AND (
    (i.invoice_kind = 'regular' AND i.invoice_type IN ('VAT', 'UPR')) OR
    (i.invoice_kind = 'advance' AND i.invoice_type = 'ZAL')
  )
  AND i.payment_status IN ('unpaid', 'partial', 'overdue')
  AND i.payment_due_date IS NOT NULL
  AND i.payment_due_date < CURRENT_DATE
  AND i.ksef_status = 'accepted'
  AND (i.currency IS NULL OR i.currency = 'PLN')
  AND i.gross_total > 0
  AND i.paid_amount >= 0
  AND i.paid_amount < i.gross_total
  AND NOT EXISTS (
    SELECT 1
    FROM public.invoices child
    WHERE child.tenant_id = i.tenant_id
      AND (child.parent_invoice_id = i.id OR i.id = ANY(child.advance_invoice_ids))
  );

REVOKE ALL ON public.invoices_overdue FROM anon;
GRANT SELECT ON public.invoices_overdue TO authenticated;

COMMENT ON VIEW public.invoices_overdue IS
  'Tylko prowizorycznie kwalifikowane pozycje do przypomnienia: app, bez '
  'powiązanych dokumentów, bez ROZ, z security_invoker=true. Nie jest pełnym saldem '
  'należności po korektach ani po imporcie.';
