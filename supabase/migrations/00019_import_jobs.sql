-- ═══════════════════════════════════════════════════════════════
-- Import joby (Magiczny Import z KSeF / plików CSV) — status progresu.
-- Aktualizacja z Inngest (service_role bypass RLS).
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'parsing', 'extracting', 'deduplicating', 'completed', 'failed')),

  progress_percent INT NOT NULL DEFAULT 0
    CHECK (progress_percent >= 0 AND progress_percent <= 100),
  progress_message TEXT,

  invoices_found INT,
  invoices_imported INT,

  contractors_created INT,
  contractors_updated INT,
  products_created INT,

  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,

  source TEXT,
  direction TEXT CHECK (direction IS NULL OR direction IN ('issued', 'received')),
  date_from DATE,
  date_to DATE,

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_tenant_created
  ON public.import_jobs(tenant_id, created_at DESC);

ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.import_jobs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_jobs TO authenticated;

DROP POLICY IF EXISTS import_jobs_tenant_isolation ON public.import_jobs;
CREATE POLICY import_jobs_tenant_isolation ON public.import_jobs
  FOR ALL
  TO authenticated
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

DROP TRIGGER IF EXISTS trigger_import_jobs_updated_at ON public.import_jobs;
CREATE TRIGGER trigger_import_jobs_updated_at
  BEFORE UPDATE ON public.import_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.import_jobs IS
  'Śledzenie postępu importu (KSeF, CSV…) — aktualizowane przez joby serwerowe.';
