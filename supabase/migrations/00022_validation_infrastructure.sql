-- Spec 13.2.1 „Infrastruktura live walidacji NIP/VAT”.
-- Numer 00022: plik 00017 jest zajęty przez invoice_offline_qr_columns.sql.

-- ============================================================================
-- ENUMs
-- ============================================================================

CREATE TYPE public.vat_status_enum AS ENUM (
  'active',
  'exempt',
  'inactive',
  'unknown',
  'pending'
);

CREATE TYPE public.validation_source_enum AS ENUM (
  'whitelist',
  'vies',
  'manual'
);

-- ============================================================================
-- Tabela: validation_cache (współdzielony między tenantami — dane jawne MF/VIES)
-- ============================================================================

CREATE TABLE public.validation_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  nip TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'PL',
  source public.validation_source_enum NOT NULL,

  is_valid BOOLEAN,
  vat_status public.vat_status_enum,

  legal_name TEXT,
  registered_address TEXT,
  registration_date DATE,
  termination_date DATE,
  bank_accounts TEXT[] DEFAULT '{}',

  raw_response JSONB,

  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),

  hit_count INTEGER NOT NULL DEFAULT 0,

  UNIQUE(nip, country_code, source)
);

-- UNIQUE(nip, country_code, source) już daje indeks pod lookup; osobny idx redundantny.

CREATE INDEX idx_validation_cache_expires_at
  ON public.validation_cache(expires_at);

ALTER TABLE public.validation_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.validation_cache FROM anon;
GRANT SELECT ON public.validation_cache TO authenticated;

DROP POLICY IF EXISTS validation_cache_authenticated_select ON public.validation_cache;
CREATE POLICY validation_cache_authenticated_select ON public.validation_cache
  FOR SELECT TO authenticated
  USING (true);

COMMENT ON TABLE public.validation_cache IS
  'Cache wyników z Białej Listy MF i VIES — TTL 24 h; zapis przez service_role (RLS nie dotyczy).';

-- ============================================================================
-- Rozszerzenie contractors
-- ============================================================================

ALTER TABLE public.contractors
  ADD COLUMN IF NOT EXISTS vat_status public.vat_status_enum DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS last_validation_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_validation_source public.validation_source_enum,
  ADD COLUMN IF NOT EXISTS bank_accounts_validated TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS validation_warning TEXT;

CREATE INDEX IF NOT EXISTS idx_contractors_vat_status
  ON public.contractors(tenant_id, vat_status);

CREATE INDEX IF NOT EXISTS idx_contractors_needs_revalidation
  ON public.contractors(tenant_id, last_validation_at NULLS FIRST)
  WHERE vat_status <> 'unknown'::public.vat_status_enum;

COMMENT ON COLUMN public.contractors.vat_status IS
  'Status VAT z ostatniej weryfikacji (active/exempt/inactive/unknown/pending)';
COMMENT ON COLUMN public.contractors.bank_accounts_validated IS
  'IBAN-y zgłoszone do US (z Białej Listy)';

-- ============================================================================
-- Rozszerzenie invoices: snapshot przy wystawieniu
-- ============================================================================

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS buyer_vat_status_at_issue public.vat_status_enum,
  ADD COLUMN IF NOT EXISTS bank_account_validated BOOLEAN,
  ADD COLUMN IF NOT EXISTS validation_warnings TEXT[] DEFAULT '{}';

COMMENT ON COLUMN public.invoices.buyer_vat_status_at_issue IS
  'Snapshot statusu VAT nabywcy w momencie wystawienia (dowód na kontrolę)';
COMMENT ON COLUMN public.invoices.bank_account_validated IS
  'TRUE jeśli rachunek bankowy na fakturze jest na Białej Liście';

-- ============================================================================
-- Funkcja: cleanup starych wpisów cache (cyklicznie, np. Inngest cron)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cleanup_expired_validation_cache()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.validation_cache
  WHERE expires_at < NOW() - INTERVAL '7 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION public.cleanup_expired_validation_cache IS
  'Usuwa wpisy cache z expires_at starszym niż 7 dni. Wywołuj cyklicznie z Inngest cron.';
