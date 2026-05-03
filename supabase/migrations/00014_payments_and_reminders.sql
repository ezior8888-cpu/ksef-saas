-- ═══════════════════════════════════════════════════════════════
-- Open Banking / przypomnienia — szkielet pod Fazy 14–15
--
-- Vs surowa instrukcja „00011”: plik realnie to `00014_*` bo 00011 już zajęta.
-- update_updated_at_column() nie istnieje — używamy public.set_updated_at() z 00001.
-- TRIGGER: AFTER ... OR DELETE OR UPDATE OF kolumn — poprawna składnia Postgres.
-- funkcja rekalkuluje paid_amount przy triggerze z kontekstu użytkownika — SECURITY DEFINER
-- ═══════════════════════════════════════════════════════════════

-- ─── ENUM-y (idempotentnie) ────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.payment_method_enum AS ENUM (
    'bank_transfer', 'card', 'cash', 'compensation', 'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.reminder_stage_enum AS ENUM (
    'stage_1', 'stage_2', 'stage_3', 'stage_4'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.reminder_status_enum AS ENUM (
    'pending', 'sent', 'failed', 'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.reminder_channel_enum AS ENUM (
    'email', 'sms', 'both'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── Tabele ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,

  amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL,
  payment_method public.payment_method_enum NOT NULL DEFAULT 'bank_transfer',

  bank_import_id UUID,
  bank_transaction_ref TEXT,
  bank_payer_name TEXT,
  bank_payer_account TEXT,

  match_confidence NUMERIC(3, 2) CHECK (match_confidence >= 0 AND match_confidence <= 1),
  match_method TEXT,
  is_auto_matched BOOLEAN NOT NULL DEFAULT FALSE,
  is_confirmed BOOLEAN NOT NULL DEFAULT FALSE,

  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_tenant_date
  ON public.payments(tenant_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_unconfirmed
  ON public.payments(tenant_id, is_auto_matched, is_confirmed)
  WHERE is_auto_matched = TRUE AND is_confirmed = FALSE;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;

DROP POLICY IF EXISTS payments_tenant_isolation ON public.payments;
CREATE POLICY payments_tenant_isolation ON public.payments
  FOR ALL TO authenticated
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

DROP TRIGGER IF EXISTS trigger_payments_updated_at ON public.payments;
CREATE TRIGGER trigger_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- payment_imports — po payments (FK matched_payment_id)
CREATE TABLE IF NOT EXISTS public.payment_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  provider TEXT NOT NULL DEFAULT 'gocardless',
  bank_name TEXT,
  account_iban TEXT NOT NULL,
  account_currency TEXT NOT NULL DEFAULT 'PLN',

  transaction_id TEXT NOT NULL,
  transaction_date DATE NOT NULL,
  booking_date DATE,
  amount NUMERIC(15, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'PLN',

  counterparty_name TEXT,
  counterparty_account TEXT,
  counterparty_nip TEXT,

  title TEXT,
  reference TEXT,

  is_matched BOOLEAN NOT NULL DEFAULT FALSE,
  matched_payment_id UUID REFERENCES public.payments(id),
  ignored BOOLEAN NOT NULL DEFAULT FALSE,

  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (tenant_id, provider, transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_imports_unmatched
  ON public.payment_imports(tenant_id, transaction_date DESC)
  WHERE is_matched = FALSE AND ignored = FALSE;

ALTER TABLE public.payment_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_imports FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_imports TO authenticated;

DROP POLICY IF EXISTS payment_imports_tenant_isolation ON public.payment_imports;
CREATE POLICY payment_imports_tenant_isolation ON public.payment_imports
  FOR ALL TO authenticated
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE TABLE IF NOT EXISTS public.payment_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,

  stage public.reminder_stage_enum NOT NULL,
  channel public.reminder_channel_enum NOT NULL DEFAULT 'email',

  scheduled_for TIMESTAMPTZ NOT NULL,
  status public.reminder_status_enum NOT NULL DEFAULT 'pending',

  email_subject TEXT,
  email_body TEXT,
  sms_body TEXT,

  sent_at TIMESTAMPTZ,
  email_message_id TEXT,
  sms_message_id TEXT,
  delivery_status TEXT,
  failure_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (invoice_id, stage)
);

CREATE INDEX IF NOT EXISTS idx_payment_reminders_pending
  ON public.payment_reminders(scheduled_for)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_payment_reminders_invoice
  ON public.payment_reminders(invoice_id);

ALTER TABLE public.payment_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_reminders FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_reminders TO authenticated;

DROP POLICY IF EXISTS payment_reminders_tenant_isolation ON public.payment_reminders;
CREATE POLICY payment_reminders_tenant_isolation ON public.payment_reminders
  FOR ALL TO authenticated
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

-- ─── Rekalkulacja invoices.paid_amount po payments ────────────
-- TRIGGER sumuje tylko: manualne lub auto-match potwierdzony.
-- SECURITY DEFINER: zwykły user ma RLS na invoices — bez tego UPDATE by padł.

CREATE OR REPLACE FUNCTION public.recalculate_invoice_paid_amount()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_paid NUMERIC(15, 2);
  inv UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    inv := OLD.invoice_id;
    SELECT COALESCE(SUM(amount), 0)
    INTO total_paid
    FROM public.payments
    WHERE invoice_id = inv
      AND (is_auto_matched = FALSE OR is_confirmed = TRUE);
    UPDATE public.invoices SET paid_amount = total_paid WHERE id = inv;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' AND OLD.invoice_id IS DISTINCT FROM NEW.invoice_id THEN
    -- stara faktura
    inv := OLD.invoice_id;
    SELECT COALESCE(SUM(amount), 0)
    INTO total_paid
    FROM public.payments
    WHERE invoice_id = inv
      AND (is_auto_matched = FALSE OR is_confirmed = TRUE);
    UPDATE public.invoices SET paid_amount = total_paid WHERE id = inv;

    inv := NEW.invoice_id;
    SELECT COALESCE(SUM(amount), 0)
    INTO total_paid
    FROM public.payments
    WHERE invoice_id = inv
      AND (is_auto_matched = FALSE OR is_confirmed = TRUE);
    UPDATE public.invoices SET paid_amount = total_paid WHERE id = inv;
    RETURN NEW;
  ELSE
    inv := NEW.invoice_id;
    SELECT COALESCE(SUM(amount), 0)
    INTO total_paid
    FROM public.payments
    WHERE invoice_id = inv
      AND (is_auto_matched = FALSE OR is_confirmed = TRUE);
    UPDATE public.invoices SET paid_amount = total_paid WHERE id = inv;
    RETURN NEW;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.recalculate_invoice_paid_amount IS
  'Po zmianie wierszy payments — przelicz sumę dla invoices.paid_amount (RLS przez SECURITY DEFINER).';

DROP TRIGGER IF EXISTS trigger_recalculate_paid_amount ON public.payments;
CREATE TRIGGER trigger_recalculate_paid_amount
  AFTER INSERT OR DELETE OR UPDATE OF amount, is_confirmed, invoice_id ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.recalculate_invoice_paid_amount();

COMMENT ON TABLE public.payments IS
  'Płatności zarejestrowane do faktur (manualne lub z Open Banking).';
COMMENT ON TABLE public.payment_imports IS
  'Surowe transakcje z Open Banking przed parowaniem.';
COMMENT ON TABLE public.payment_reminders IS
  'Kolejka przypomnień o płatnościach.';
COMMENT ON COLUMN public.payments.match_confidence IS
  'Pewność auto-matchingu 0–1 (Faza 15).';
