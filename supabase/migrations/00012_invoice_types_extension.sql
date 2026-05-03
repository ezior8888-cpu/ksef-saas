-- ═══════════════════════════════════════════════════════════════
-- Rozszerzenie tabeli invoices: typ cyklu życia faktury, korekty,
-- zaliczki, B2C, status płatności.
-- ═══════════════════════════════════════════════════════════════
-- UWAGA (konflikt z surową instrukcją „00009”):
--   Kolumna `invoices.invoice_type` JUŻ ISTNIEJE w 00001 jako VARCHAR
--   (np. 'VAT' — rodzaj dokumentu w FA). NIE dodajemy drugiej kolumny
--   o tej samej nazwie. Semantykę regular/correction/advance/final
--   trzymamy w `invoice_kind` (ENUM).
-- ═══════════════════════════════════════════════════════════════

-- 1. ENUM-y (idempotentnie)
DO $$ BEGIN
  CREATE TYPE public.invoice_type_enum AS ENUM (
    'regular',
    'correction',
    'advance',
    'final'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.correction_type_enum AS ENUM (
    'before_after',
    'amount_change',
    'cancellation'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_status_enum AS ENUM (
    'unpaid',
    'partial',
    'paid',
    'overdue'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.buyer_id_type_enum AS ENUM (
    'nip',
    'pesel',
    'id_card',
    'passport',
    'no_id'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Nowe kolumny (invoice_type VARCHAR z 00001 — bez zmian)
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS invoice_kind public.invoice_type_enum NOT NULL DEFAULT 'regular',
  ADD COLUMN IF NOT EXISTS parent_invoice_id UUID REFERENCES public.invoices(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS correction_reason TEXT,
  ADD COLUMN IF NOT EXISTS correction_type public.correction_type_enum,
  ADD COLUMN IF NOT EXISTS advance_amount NUMERIC(15, 2),
  ADD COLUMN IF NOT EXISTS advance_invoice_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_b2c BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS buyer_id_type public.buyer_id_type_enum NOT NULL DEFAULT 'nip',
  ADD COLUMN IF NOT EXISTS buyer_pesel TEXT,
  ADD COLUMN IF NOT EXISTS buyer_id_number TEXT,
  ADD COLUMN IF NOT EXISTS payment_status public.payment_status_enum NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(15, 2) NOT NULL DEFAULT 0;

-- 3. Indeksy
CREATE INDEX IF NOT EXISTS idx_invoices_parent_invoice
  ON public.invoices(parent_invoice_id)
  WHERE parent_invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_payment_status
  ON public.invoices(tenant_id, payment_status, payment_due_date);

CREATE INDEX IF NOT EXISTS idx_invoices_kind
  ON public.invoices(tenant_id, invoice_kind);

-- 4. Constraints
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS check_correction_has_parent;
ALTER TABLE public.invoices ADD CONSTRAINT check_correction_has_parent
  CHECK (
    (invoice_kind != 'correction')
    OR (parent_invoice_id IS NOT NULL AND correction_type IS NOT NULL)
  );

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS check_advance_has_amount;
ALTER TABLE public.invoices ADD CONSTRAINT check_advance_has_amount
  CHECK (
    (invoice_kind != 'advance')
    OR (advance_amount IS NOT NULL AND advance_amount > 0)
  );

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS check_final_has_advances;
ALTER TABLE public.invoices ADD CONSTRAINT check_final_has_advances
  CHECK (
    (invoice_kind != 'final')
    OR (COALESCE(array_length(advance_invoice_ids, 1), 0) >= 1)
  );

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS check_b2c_has_id;
ALTER TABLE public.invoices ADD CONSTRAINT check_b2c_has_id
  CHECK (
    (is_b2c = FALSE)
    OR (buyer_id_type IN ('pesel', 'id_card', 'passport', 'no_id'))
  );

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS check_paid_amount_valid;
ALTER TABLE public.invoices ADD CONSTRAINT check_paid_amount_valid
  CHECK (
    paid_amount >= 0
    AND (gross_total IS NULL OR paid_amount <= gross_total)
  );

-- 5. Trigger: aktualizacja payment_status z paid_amount / terminu
CREATE OR REPLACE FUNCTION public.update_invoice_payment_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.paid_amount = 0 THEN
    IF NEW.payment_due_date IS NOT NULL AND NEW.payment_due_date < CURRENT_DATE THEN
      NEW.payment_status := 'overdue';
    ELSE
      NEW.payment_status := 'unpaid';
    END IF;
  ELSIF NEW.gross_total IS NOT NULL AND NEW.paid_amount >= NEW.gross_total THEN
    NEW.payment_status := 'paid';
    IF NEW.paid_at IS NULL THEN
      NEW.paid_at := NOW();
    END IF;
  ELSE
    NEW.payment_status := 'partial';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_payment_status ON public.invoices;
CREATE TRIGGER trigger_update_payment_status
  BEFORE INSERT OR UPDATE OF paid_amount, payment_due_date, gross_total ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_invoice_payment_status();

-- 6. Komentarze
COMMENT ON COLUMN public.invoices.invoice_kind IS
  'Cykl życia faktury w KSeF: regular / correction / advance / final (osobno od invoice_type=VARCHAR, np. VAT).';
COMMENT ON COLUMN public.invoices.parent_invoice_id IS
  'Faktura pierwotna dla korekt; powiązanie dla finału ze zaliczkami — według modelu biznesowego.';
COMMENT ON COLUMN public.invoices.correction_type IS
  'Typ korekty: before_after / amount_change / cancellation.';
COMMENT ON COLUMN public.invoices.advance_invoice_ids IS
  'Dla invoice_kind=final: UUID faktur zaliczkowych rozliczanych tą fakturą.';
COMMENT ON COLUMN public.invoices.is_b2c IS
  'TRUE gdy nabywca to osoba fizyczna (B2C).';
COMMENT ON COLUMN public.invoices.buyer_pesel IS
  'PESEL nabywcy B2C; dostęp wg RLS.';
