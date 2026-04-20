-- ═══════════════════════════════════════════════════════════════
-- Faza 7: Retencja danych
-- (00007 = test RLS helpers — ta migracja to 00009.)
-- ═══════════════════════════════════════════════════════════════

-- Per-tenant ustawienia retencji (można nadpisać default)
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS retention_years INT NOT NULL DEFAULT 10
  CHECK (retention_years BETWEEN 1 AND 50);

-- Pola do śledzenia archiwizacji faktur
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS archive_storage_path TEXT;
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS scheduled_deletion_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_invoices_retention
  ON public.invoices (scheduled_deletion_at)
  WHERE scheduled_deletion_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_archive_candidates
  ON public.invoices (issue_date)
  WHERE archived_at IS NULL;

-- Soft-delete dla tenantów (GDPR)
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS hard_delete_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tenants_deletion
  ON public.tenants (hard_delete_at)
  WHERE hard_delete_at IS NOT NULL;
