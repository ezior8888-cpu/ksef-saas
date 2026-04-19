-- ═══════════════════════════════════════════════════════════════
-- KSEF SAAS — INITIAL SCHEMA
-- Migration: 00001
-- Created: 2026-04
-- ═══════════════════════════════════════════════════════════════

-- Włącz rozszerzenie dla UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ═══════════════════════════════════════════════════════════════
-- TABELA 1: tenants (najemcy / firmy-klienci)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  nip VARCHAR(10) NOT NULL UNIQUE,
  regon VARCHAR(14),
  address_json JSONB,
  ksef_credentials_encrypted BYTEA,
  ksef_certificate_expiry TIMESTAMPTZ,
  subscription_tier VARCHAR(20) DEFAULT 'basic',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.tenants IS 'Firmy/organizacje korzystające z SaaS. Jeden tenant = jedno NIP.';

-- ═══════════════════════════════════════════════════════════════
-- TABELA 2: users (integracja z auth.users Supabase)
-- Zmodyfikowana względem mega-prompta:
-- - id jest FK do auth.users(id) zamiast własnego UUID
-- - usuwamy email (jest w auth.users.email)
-- - dodajemy role (owner/member/accountant)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name VARCHAR(255),
  role VARCHAR(20) DEFAULT 'owner' CHECK (role IN ('owner', 'member', 'accountant')),
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.users IS 'Profile użytkowników. FK do auth.users (Supabase). tenant_id łączy z firmą.';
CREATE INDEX idx_users_tenant ON public.users(tenant_id);

-- ═══════════════════════════════════════════════════════════════
-- TABELA 3: invoices (faktury)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('outgoing', 'incoming')),
  internal_number VARCHAR(100),
  ksef_number VARCHAR(255),
  ksef_status VARCHAR(30) DEFAULT 'draft' CHECK (ksef_status IN ('draft', 'queued', 'sending', 'accepted', 'rejected', 'received')),
  invoice_type VARCHAR(30),
  issue_date DATE NOT NULL,
  seller_nip VARCHAR(10),
  buyer_nip VARCHAR(10),
  currency VARCHAR(3) DEFAULT 'PLN',
  net_total NUMERIC(12,2),
  vat_total NUMERIC(12,2),
  gross_total NUMERIC(12,2),
  payment_due_date DATE,
  fa3_data JSONB NOT NULL,
  xml_storage_path TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  submitted_to_ksef_at TIMESTAMPTZ,
  ksef_accepted_at TIMESTAMPTZ
);

COMMENT ON TABLE public.invoices IS 'Faktury wystawione (outgoing) i odebrane (incoming). fa3_data = pełne dane FA(3) jako JSON.';
CREATE INDEX idx_inv_tenant_date ON public.invoices(tenant_id, issue_date);
CREATE INDEX idx_inv_ksef_number ON public.invoices(tenant_id, ksef_number);
CREATE INDEX idx_inv_status ON public.invoices(tenant_id, ksef_status);

-- ═══════════════════════════════════════════════════════════════
-- TABELA 4: invoice_line_items (pozycje faktur)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE public.invoice_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  ordinal INT NOT NULL,
  name VARCHAR(512),
  quantity NUMERIC(14,4),
  unit VARCHAR(50),
  unit_price_net NUMERIC(14,4),
  vat_rate VARCHAR(10),
  net_amount NUMERIC(12,2),
  vat_amount NUMERIC(12,2),
  gross_amount NUMERIC(12,2),
  kpir_category VARCHAR(20),
  ryczalt_rate NUMERIC(5,2)
);

COMMENT ON TABLE public.invoice_line_items IS 'Wiersze (pozycje) faktury. ON DELETE CASCADE - usunięcie faktury usuwa pozycje.';
CREATE INDEX idx_line_items_invoice ON public.invoice_line_items(invoice_id);

-- ═══════════════════════════════════════════════════════════════
-- TABELA 5: ksef_sessions (sesje KSeF)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE public.ksef_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  session_token_encrypted BYTEA,
  auth_method VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true
);

COMMENT ON TABLE public.ksef_sessions IS 'Zapisane sesje KSeF per tenant. Token zaszyfrowany AES-256-GCM.';
CREATE INDEX idx_ksef_sessions_active ON public.ksef_sessions(tenant_id, is_active, expires_at);

-- ═══════════════════════════════════════════════════════════════
-- TABELA 6: ksef_submissions (historia wysyłek)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE public.ksef_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE, -- denormalizacja dla RLS
  submission_type VARCHAR(20),
  status VARCHAR(20),
  request_payload_hash VARCHAR(64),
  response_ksef_number VARCHAR(255),
  error_code VARCHAR(20),
  error_message TEXT,
  attempted_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  retry_count INT DEFAULT 0
);

COMMENT ON TABLE public.ksef_submissions IS 'Każda próba wysyłki do KSeF (retry też). tenant_id zduplikowane dla szybkiego RLS.';
CREATE INDEX idx_submissions_invoice ON public.ksef_submissions(invoice_id);
CREATE INDEX idx_submissions_tenant ON public.ksef_submissions(tenant_id, attempted_at);

-- ═══════════════════════════════════════════════════════════════
-- TABELA 7: xml_documents (dokumenty XML)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE public.xml_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  version INT DEFAULT 1,
  storage_provider VARCHAR(20) DEFAULT 'r2' CHECK (storage_provider IN ('r2', 's3_glacier')),
  storage_path TEXT NOT NULL,
  file_size_bytes INT,
  sha256_hash VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.xml_documents IS 'Metadane XML FA(3). Plik żyje w Cloudflare R2 (lata 0-4) lub S3 Glacier (5-10).';
CREATE INDEX idx_xml_invoice ON public.xml_documents(invoice_id);
CREATE INDEX idx_xml_tenant ON public.xml_documents(tenant_id);

-- ═══════════════════════════════════════════════════════════════
-- TABELA 8: audit_logs (logi audytowe)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  details_json JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.audit_logs IS 'Audyt każdej istotnej akcji (login, wystawienie faktury, wysyłka). Retencja 10 lat.';
CREATE INDEX idx_audit_tenant ON public.audit_logs(tenant_id, created_at);
CREATE INDEX idx_audit_user ON public.audit_logs(user_id, created_at);
CREATE INDEX idx_audit_entity ON public.audit_logs(entity_type, entity_id);

-- ═══════════════════════════════════════════════════════════════
-- TABELA 9: kpir_entries (wpisy KPiR)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE public.kpir_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  entry_date DATE NOT NULL,
  category VARCHAR(20),
  description TEXT,
  net_amount NUMERIC(12,2),
  vat_amount NUMERIC(12,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.kpir_entries IS 'Wpisy do Księgi Przychodów i Rozchodów auto-generowane z faktur.';
CREATE INDEX idx_kpir_tenant_date ON public.kpir_entries(tenant_id, entry_date);

-- ═══════════════════════════════════════════════════════════════
-- TABELA 10: accountant_access (dostęp dla księgowych)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE public.accountant_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  accountant_email VARCHAR(255) NOT NULL,
  access_level VARCHAR(20) DEFAULT 'read' CHECK (access_level IN ('read', 'export')),
  granted_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);

COMMENT ON TABLE public.accountant_access IS 'Zaproszeni księgowi - dostęp ograniczony (read/export) i wygasający.';
CREATE INDEX idx_accountant_tenant ON public.accountant_access(tenant_id);
CREATE INDEX idx_accountant_email ON public.accountant_access(accountant_email);

-- ═══════════════════════════════════════════════════════════════
-- TRIGGERY automatyczne: updated_at
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();