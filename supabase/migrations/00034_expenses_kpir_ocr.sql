-- ============================================================================
-- MIGRACJA 00034: Wydatki, KPiR, OCR jobs, reguły kategoryzacji
-- Faza 18: OCR + Auto-Kategoryzacja KPiR
-- Uwaga: 00022 jest zajęty przez validation_infrastructure — ten plik = 00034.
-- ============================================================================

-- ENUMs
CREATE TYPE public.expense_source AS ENUM (
  'ocr_photo',
  'ksef_inbox',
  'manual',
  'import'
);

CREATE TYPE public.ocr_status AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed'
);

CREATE TYPE public.categorization_method AS ENUM (
  'rule_nip',
  'rule_keyword',
  'ml_heuristic',
  'ai_claude',
  'manual',
  'learned'
);

-- KPiR columns — enum z rozporządzenia Ministra Finansów (uproszczony zestaw)
CREATE TYPE public.kpir_column AS ENUM (
  'col_7',
  'col_8',
  'col_10',
  'col_11',
  'col_12',
  'col_13',
  'col_15',
  'col_16'
);

-- ============================================================================
-- Tabela: expenses (faktury kosztowe + paragony)
-- ============================================================================
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),

  source public.expense_source NOT NULL,
  ocr_job_id UUID,
  ksef_invoice_id UUID REFERENCES public.invoices(id),

  seller_name TEXT NOT NULL,
  seller_nip TEXT,
  seller_address TEXT,

  document_number TEXT,
  document_type TEXT NOT NULL DEFAULT 'invoice',
  issue_date DATE NOT NULL,

  net_amount NUMERIC(14, 2) NOT NULL,
  vat_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  gross_amount NUMERIC(14, 2) NOT NULL,
  vat_rate TEXT,

  vat_deductible_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,

  kpir_column public.kpir_column,
  category_label TEXT,
  categorization_method public.categorization_method,
  categorization_confidence NUMERIC(3, 2),

  source_file_path TEXT,
  source_file_mime TEXT,
  ocr_extracted_data JSONB,

  notes TEXT,
  is_reviewed BOOLEAN NOT NULL DEFAULT FALSE,
  is_deductible BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_expenses_tenant_date ON public.expenses(tenant_id, issue_date DESC);
CREATE INDEX idx_expenses_kpir ON public.expenses(tenant_id, kpir_column, issue_date)
  WHERE is_deductible = TRUE;
CREATE INDEX idx_expenses_seller_nip ON public.expenses(seller_nip) WHERE seller_nip IS NOT NULL;
CREATE INDEX idx_expenses_unreviewed ON public.expenses(tenant_id, created_at DESC)
  WHERE is_reviewed = FALSE;

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expenses_select_own_tenant"
  ON public.expenses FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY "expenses_insert_own_tenant"
  ON public.expenses FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND created_by = auth.uid()
  );

CREATE POLICY "expenses_update_own_tenant"
  ON public.expenses FOR UPDATE
  TO authenticated
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY "expenses_delete_own_tenant"
  ON public.expenses FOR DELETE
  TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE TRIGGER trg_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- Tabela: ocr_jobs
-- ============================================================================
CREATE TABLE public.ocr_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),

  status public.ocr_status NOT NULL DEFAULT 'pending',

  source_file_path TEXT NOT NULL,
  source_file_mime TEXT NOT NULL,
  source_file_size_bytes BIGINT,

  extracted_data JSONB,
  expense_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL,

  ai_model_used TEXT,
  ai_input_tokens INT,
  ai_output_tokens INT,
  processing_time_ms INT,
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_ocr_jobs_tenant ON public.ocr_jobs(tenant_id, created_at DESC);
CREATE INDEX idx_ocr_jobs_status ON public.ocr_jobs(status, created_at)
  WHERE status IN ('pending', 'processing');

ALTER TABLE public.ocr_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ocr_jobs_select_own_tenant"
  ON public.ocr_jobs FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY "ocr_jobs_insert_own_tenant"
  ON public.ocr_jobs FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND created_by = auth.uid()
  );

CREATE POLICY "ocr_jobs_update_own_tenant"
  ON public.ocr_jobs FOR UPDATE
  TO authenticated
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY "ocr_jobs_delete_own_tenant"
  ON public.ocr_jobs FOR DELETE
  TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

-- ============================================================================
-- Tabela: categorization_rules
-- ============================================================================
CREATE TABLE public.categorization_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  match_type TEXT NOT NULL CHECK (match_type IN ('nip', 'keyword', 'name_exact')),
  match_value TEXT NOT NULL,

  kpir_column public.kpir_column NOT NULL,
  category_label TEXT NOT NULL,

  hit_count INT NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (tenant_id, match_type, match_value)
);

CREATE INDEX idx_cat_rules_tenant_match ON public.categorization_rules(tenant_id, match_type, match_value);

ALTER TABLE public.categorization_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categorization_rules_select_own_tenant"
  ON public.categorization_rules FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY "categorization_rules_insert_own_tenant"
  ON public.categorization_rules FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY "categorization_rules_update_own_tenant"
  ON public.categorization_rules FOR UPDATE
  TO authenticated
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY "categorization_rules_delete_own_tenant"
  ON public.categorization_rules FOR DELETE
  TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

-- ============================================================================
-- Tabela: kpir_global_rules (read-only dla authenticated)
-- ============================================================================
CREATE TABLE public.kpir_global_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  nip TEXT,
  keyword TEXT,

  kpir_column public.kpir_column NOT NULL,
  category_label TEXT NOT NULL,
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT kpir_global_rules_nip_or_keyword CHECK (
    (nip IS NOT NULL AND nip <> '')
    OR (keyword IS NOT NULL AND keyword <> '')
  )
);

CREATE UNIQUE INDEX idx_kpir_global_rules_nip_unique ON public.kpir_global_rules(nip)
  WHERE nip IS NOT NULL;

CREATE INDEX idx_global_rules_nip ON public.kpir_global_rules(nip) WHERE nip IS NOT NULL;
CREATE INDEX idx_global_rules_keyword ON public.kpir_global_rules(keyword) WHERE keyword IS NOT NULL;

ALTER TABLE public.kpir_global_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpir_global_rules_select_authenticated"
  ON public.kpir_global_rules FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- Seed: znane firmy (NIP unikalny w seedzie)
-- ============================================================================
INSERT INTO public.kpir_global_rules (nip, kpir_column, category_label, notes) VALUES
  ('5260250995', 'col_13', 'Paliwo', 'PKN Orlen S.A.'),
  ('7740001454', 'col_13', 'Paliwo', 'BP Europa SE Oddział w Polsce'),
  ('7740005374', 'col_13', 'Paliwo', 'Grupa Lotos S.A.'),
  ('5862037102', 'col_13', 'Paliwo', 'Shell Polska Sp. z o.o.'),
  ('1132026625', 'col_13', 'Paliwo', 'Circle K Polska Sp. z o.o.'),
  ('5210527477', 'col_13', 'Paliwo', 'AMIC Polska Sp. z o.o.'),
  ('5210077313', 'col_13', 'Telekomunikacja', 'T-Mobile Polska S.A.'),
  ('9512029877', 'col_13', 'Telekomunikacja', 'Polkomtel Sp. z o.o. (Plus)'),
  ('7820068262', 'col_13', 'Telekomunikacja', 'P4 Sp. z o.o. (Play)'),
  ('5252027720', 'col_13', 'Telekomunikacja', 'Netia S.A.'),
  ('5210008538', 'col_13', 'Oprogramowanie', 'Microsoft Sp. z o.o.'),
  ('5252535079', 'col_13', 'Oprogramowanie', 'Google Poland Sp. z o.o.'),
  ('5252242171', 'col_13', 'Przesyłki', 'InPost S.A.'),
  ('5250007313', 'col_13', 'Przesyłki', 'Poczta Polska S.A.'),
  ('5260204110', 'col_13', 'Przesyłki', 'DPD Polska sp. z o.o.'),
  ('1130100154', 'col_13', 'Energia elektryczna', 'PGE Obrót S.A.'),
  ('5251006700', 'col_13', 'Energia elektryczna', 'Tauron Sprzedaż'),
  ('5263180409', 'col_13', 'Gaz', 'PGNiG Obrót Detaliczny');

INSERT INTO public.kpir_global_rules (keyword, kpir_column, category_label) VALUES
  ('Orlen', 'col_13', 'Paliwo'),
  ('Lotos', 'col_13', 'Paliwo'),
  ('Shell', 'col_13', 'Paliwo'),
  ('Circle K', 'col_13', 'Paliwo'),
  ('Stacja', 'col_13', 'Paliwo'),
  ('Orange', 'col_13', 'Telekomunikacja'),
  ('Google Ads', 'col_13', 'Marketing'),
  ('Meta', 'col_13', 'Marketing'),
  ('McDonald', 'col_13', 'Reprezentacja'),
  ('KFC', 'col_13', 'Reprezentacja'),
  ('Restauracja', 'col_13', 'Reprezentacja'),
  ('Hotel', 'col_13', 'Podróże służbowe'),
  ('Booking.com', 'col_13', 'Podróże służbowe'),
  ('Uber', 'col_13', 'Podróże służbowe'),
  ('Bolt', 'col_13', 'Podróże służbowe'),
  ('PKP', 'col_13', 'Podróże służbowe'),
  ('Allegro', 'col_10', 'Zakupy towarów'),
  ('Amazon', 'col_10', 'Zakupy towarów'),
  ('Hurtownia', 'col_10', 'Zakupy towarów');

COMMENT ON TABLE public.expenses IS 'Faktury kosztowe + paragony. Faza 18.';
COMMENT ON TABLE public.ocr_jobs IS 'Procesy OCR dla zdjęć faktur. Faza 18.';
COMMENT ON TABLE public.categorization_rules IS 'Per-tenant reguły uczone z poprawek usera. Faza 18.';
COMMENT ON TABLE public.kpir_global_rules IS 'Globalna baza znanych firm PL → KPiR. Faza 18.';

REVOKE ALL ON TABLE public.expenses FROM anon;
REVOKE ALL ON TABLE public.ocr_jobs FROM anon;
REVOKE ALL ON TABLE public.categorization_rules FROM anon;
REVOKE ALL ON TABLE public.kpir_global_rules FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.expenses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ocr_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.categorization_rules TO authenticated;
GRANT SELECT ON TABLE public.kpir_global_rules TO authenticated;
