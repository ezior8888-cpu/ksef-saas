-- Spec 16.2.1 — Co-Pilot Księgowego + Export jobs
-- Numer 00024 (w repo zajęta jest już 00020_import_jobs_pending_metadata.sql).
--
-- accountant_settings: konfiguracja per tenant
-- export_jobs: historia eksportów (audit + retry)
-- export_files: storage paths dla wygenerowanych plików

-- ============================================================================
-- ENUMs (idempotentnie)
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.export_format_enum AS ENUM (
    'jpk_fa',
    'kpir_excel',
    'comarch_optima',
    'insert_subiekt',
    'symfonia',
    'wapro',
    'csv_universal'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.export_status_enum AS ENUM (
    'pending',
    'generating',
    'completed',
    'failed',
    'expired'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.export_trigger_enum AS ENUM (
    'manual',
    'co_pilot_monthly',
    'accountant_portal',
    'api'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- Tabela: accountant_settings (1 wiersz per tenant)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.accountant_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,

  co_pilot_enabled BOOLEAN NOT NULL DEFAULT FALSE,

  accountant_email TEXT,
  accountant_name TEXT,
  accountant_company TEXT,

  preferred_formats public.export_format_enum[] DEFAULT ARRAY['jpk_fa', 'kpir_excel']::public.export_format_enum[],

  send_day_of_month INTEGER NOT NULL DEFAULT 5 CHECK (send_day_of_month BETWEEN 1 AND 28),

  include_issued_invoices BOOLEAN NOT NULL DEFAULT TRUE,
  include_received_invoices BOOLEAN NOT NULL DEFAULT TRUE,
  include_corrections BOOLEAN NOT NULL DEFAULT TRUE,
  include_unpaid_only BOOLEAN NOT NULL DEFAULT FALSE,

  email_subject_template TEXT,
  email_body_template TEXT,
  cc_emails TEXT[],

  last_sent_at TIMESTAMPTZ,
  last_sent_period_start DATE,
  last_sent_period_end DATE,
  total_packages_sent INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accountant_settings_tenant
  ON public.accountant_settings(tenant_id);

ALTER TABLE public.accountant_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.accountant_settings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accountant_settings TO authenticated;

DROP POLICY IF EXISTS accountant_settings_tenant_isolation ON public.accountant_settings;
CREATE POLICY accountant_settings_tenant_isolation ON public.accountant_settings
  FOR ALL
  TO authenticated
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

DROP TRIGGER IF EXISTS trigger_accountant_settings_updated_at ON public.accountant_settings;
CREATE TRIGGER trigger_accountant_settings_updated_at
  BEFORE UPDATE ON public.accountant_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.accountant_settings IS 'Konfiguracja Co-Pilota Księgowego per tenant';

-- ============================================================================
-- Tabela: export_jobs (audit + retry)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  triggered_by UUID REFERENCES public.users(id) ON DELETE SET NULL,

  format public.export_format_enum NOT NULL,
  trigger_source public.export_trigger_enum NOT NULL DEFAULT 'manual',

  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  include_issued BOOLEAN NOT NULL DEFAULT TRUE,
  include_received BOOLEAN NOT NULL DEFAULT FALSE,
  include_corrections BOOLEAN NOT NULL DEFAULT TRUE,

  status public.export_status_enum NOT NULL DEFAULT 'pending',
  progress_message TEXT,

  invoices_count INTEGER NOT NULL DEFAULT 0,
  total_net NUMERIC(15, 2) DEFAULT 0,
  total_vat NUMERIC(15, 2) DEFAULT 0,
  total_gross NUMERIC(15, 2) DEFAULT 0,

  error_message TEXT,
  error_details JSONB,

  emailed_to TEXT,
  emailed_at TIMESTAMPTZ,
  email_message_id TEXT,

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_export_jobs_tenant
  ON public.export_jobs(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_export_jobs_status
  ON public.export_jobs(status, created_at)
  WHERE status IN ('pending', 'generating');

CREATE INDEX IF NOT EXISTS idx_export_jobs_expired
  ON public.export_jobs(expires_at)
  WHERE status = 'completed';

ALTER TABLE public.export_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.export_jobs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.export_jobs TO authenticated;

DROP POLICY IF EXISTS export_jobs_tenant_isolation ON public.export_jobs;
CREATE POLICY export_jobs_tenant_isolation ON public.export_jobs
  FOR ALL
  TO authenticated
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

COMMENT ON TABLE public.export_jobs IS 'Historia eksportów dla księgowego - audit + retry';

-- ============================================================================
-- Tabela: export_files
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.export_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  export_job_id UUID NOT NULL REFERENCES public.export_jobs(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  filename TEXT NOT NULL,
  format public.export_format_enum NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER,

  r2_path TEXT NOT NULL,

  file_hash TEXT,

  download_count INTEGER NOT NULL DEFAULT 0,
  last_downloaded_at TIMESTAMPTZ,
  last_downloaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_export_files_job ON public.export_files(export_job_id);
CREATE INDEX IF NOT EXISTS idx_export_files_tenant ON public.export_files(tenant_id, created_at DESC);

ALTER TABLE public.export_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.export_files FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.export_files TO authenticated;

DROP POLICY IF EXISTS export_files_tenant_isolation ON public.export_files;
CREATE POLICY export_files_tenant_isolation ON public.export_files
  FOR ALL
  TO authenticated
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

COMMENT ON TABLE public.export_files IS 'Pliki wygenerowane podczas eksportu (R2 storage)';
COMMENT ON COLUMN public.export_jobs.expires_at IS 'Pliki usuwane po 90 dniach z R2';
