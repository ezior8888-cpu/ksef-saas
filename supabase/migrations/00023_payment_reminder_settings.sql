-- Spec 14.2.1 — Ustawienia „Wkurzacza” (payment reminders).
-- Numer 00023: 00018 jest zajęta przez offline_invoice_fields.sql.

-- ============================================================================
-- Tabela: reminder_settings (1 wiersz logicznie per tenant; UNIQUE tenant_id)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.reminder_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,

  enabled BOOLEAN NOT NULL DEFAULT TRUE,

  stage_1_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  stage_1_days_after_due INTEGER NOT NULL DEFAULT 3,

  stage_2_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  stage_2_days_after_due INTEGER NOT NULL DEFAULT 7,

  stage_3_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  stage_3_days_after_due INTEGER NOT NULL DEFAULT 14,

  sender_name TEXT,
  sender_email TEXT,
  reply_to_email TEXT,

  pause_on_reply BOOLEAN NOT NULL DEFAULT TRUE,
  pause_on_partial_payment BOOLEAN NOT NULL DEFAULT TRUE,
  send_on_weekdays_only BOOLEAN NOT NULL DEFAULT TRUE,
  send_hour INTEGER NOT NULL DEFAULT 9 CHECK (send_hour BETWEEN 6 AND 18),

  max_reminders_per_invoice INTEGER NOT NULL DEFAULT 3,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminder_settings_tenant
  ON public.reminder_settings(tenant_id);

ALTER TABLE public.reminder_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reminder_settings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminder_settings TO authenticated;

DROP POLICY IF EXISTS reminder_settings_tenant_isolation ON public.reminder_settings;
CREATE POLICY reminder_settings_tenant_isolation ON public.reminder_settings
  FOR ALL TO authenticated
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

DROP TRIGGER IF EXISTS trigger_reminder_settings_updated_at ON public.reminder_settings;
CREATE TRIGGER trigger_reminder_settings_updated_at
  BEFORE UPDATE ON public.reminder_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- Tabela: reminder_templates (custom templates per tenant)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.reminder_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  stage public.reminder_stage_enum NOT NULL,

  email_subject TEXT NOT NULL,
  email_body TEXT NOT NULL,

  is_default BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(tenant_id, stage)
);

CREATE INDEX IF NOT EXISTS idx_reminder_templates_tenant_stage
  ON public.reminder_templates(tenant_id, stage);

ALTER TABLE public.reminder_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reminder_templates FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminder_templates TO authenticated;

DROP POLICY IF EXISTS reminder_templates_tenant_isolation ON public.reminder_templates;
CREATE POLICY reminder_templates_tenant_isolation ON public.reminder_templates
  FOR ALL TO authenticated
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

DROP TRIGGER IF EXISTS trigger_reminder_templates_updated_at ON public.reminder_templates;
CREATE TRIGGER trigger_reminder_templates_updated_at
  BEFORE UPDATE ON public.reminder_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- Rozszerzenie contractors: per-contractor opt-out (+ metryki)
-- ============================================================================

ALTER TABLE public.contractors
  ADD COLUMN IF NOT EXISTS reminder_excluded BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reminder_exclusion_reason TEXT,
  ADD COLUMN IF NOT EXISTS payment_terms_days_avg INTEGER,
  ADD COLUMN IF NOT EXISTS late_payment_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_contractors_reminder_excluded
  ON public.contractors(tenant_id, reminder_excluded);

-- ============================================================================
-- Rozszerzenie payment_reminders: tracking
-- ============================================================================

ALTER TABLE public.payment_reminders
  ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS opened_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pdf_attachment_path TEXT,
  ADD COLUMN IF NOT EXISTS days_overdue_at_send INTEGER;

-- ============================================================================
-- Rozszerzenie invoices: payment / reminder pause
-- ============================================================================

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS reminders_paused BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reminders_paused_reason TEXT,
  ADD COLUMN IF NOT EXISTS days_to_payment INTEGER;

-- ============================================================================
-- Funkcja: dni przeterminowania względem CURRENT_DATE (STABLE — nie IMMUTABLE)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.days_overdue(invoice_due_date DATE)
RETURNS INTEGER
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT GREATEST(0, (CURRENT_DATE - invoice_due_date))::INTEGER;
$$;

COMMENT ON FUNCTION public.days_overdue IS
  'Ile pełnych dni minęło od payment_due_date (0 gdy termin w przyszłości lub dziś).';

-- ============================================================================
-- View: invoices_overdue (dla dashboardu przypomnień)
-- ============================================================================

DROP VIEW IF EXISTS public.invoices_overdue;

CREATE VIEW public.invoices_overdue AS
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
WHERE i.direction = 'issued'
  AND i.payment_status IN ('unpaid', 'partial', 'overdue')
  AND i.payment_due_date IS NOT NULL
  AND i.payment_due_date < CURRENT_DATE
  AND i.ksef_status = 'accepted';

REVOKE ALL ON public.invoices_overdue FROM anon;
GRANT SELECT ON public.invoices_overdue TO authenticated;

COMMENT ON VIEW public.invoices_overdue IS
  'Faktury wydane i zaakceptowane w KSeF z przeterminowanym terminem płatności.';

COMMENT ON TABLE public.reminder_settings IS
  'Konfiguracja przypomnień o płatności per tenant.';
COMMENT ON TABLE public.reminder_templates IS
  'Szablony e-mail/SMS dla przypomnień (override szablonu domyślnego aplikacji).';
COMMENT ON COLUMN public.contractors.reminder_excluded IS
  'TRUE — nie wysyłaj przypomnień dla tego kontrahenta.';
COMMENT ON COLUMN public.invoices.reminders_paused IS
  'Automatyka przypomnień wstrzymana (np. odpowiedź klienta lub ręcznie).';
