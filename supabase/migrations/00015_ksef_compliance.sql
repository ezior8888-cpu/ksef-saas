-- ═══════════════════════════════════════════════════════════════
-- Compliance KSeF: UPO, tłumaczenia błędów, kolejka Offline24
--
-- Vs surowa „00012”: w repo zajęta jest 00012_invoice_types_extension —
-- ta migracja ma numer 00015.
-- update_updated_at_column() nie istnieje → public.set_updated_at() z 00001.
-- error_translations: globalna tabela — RLS tylko SELECT dla authenticated.
-- ═══════════════════════════════════════════════════════════════

-- ─── ENUM-y ────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.upo_status_enum AS ENUM (
    'pending', 'downloaded', 'failed', 'archived'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.offline_queue_status_enum AS ENUM (
    'queued', 'sending', 'sent', 'failed', 'expired'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── upo_receipts ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.upo_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,

  ksef_number TEXT NOT NULL,
  upo_id TEXT,

  upo_xml_path TEXT,
  upo_pdf_path TEXT,
  archive_glacier_key TEXT,

  upo_xml_hash TEXT,

  status public.upo_status_enum NOT NULL DEFAULT 'pending',
  download_attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,

  ksef_acceptance_timestamp TIMESTAMPTZ NOT NULL,
  downloaded_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_upo_pending
  ON public.upo_receipts(status, created_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_upo_tenant
  ON public.upo_receipts(tenant_id, ksef_acceptance_timestamp DESC);

ALTER TABLE public.upo_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.upo_receipts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.upo_receipts TO authenticated;

DROP POLICY IF EXISTS upo_receipts_tenant_isolation ON public.upo_receipts;
CREATE POLICY upo_receipts_tenant_isolation ON public.upo_receipts
  FOR ALL TO authenticated
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

-- ─── error_translations (współdzielone, bez tenant_id) ───────────

CREATE TABLE IF NOT EXISTS public.error_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  error_code TEXT NOT NULL UNIQUE,
  error_xpath TEXT,

  user_message_pl TEXT NOT NULL,
  technical_description TEXT,

  field_hint TEXT,
  fix_suggestion TEXT,
  severity TEXT NOT NULL DEFAULT 'error',

  occurrence_count INTEGER NOT NULL DEFAULT 0,
  last_seen_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_translations_xpath ON public.error_translations(error_xpath);

ALTER TABLE public.error_translations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.error_translations FROM anon;

-- Tenant users: tylko odczyt (zapisy przez service_role / migracje poza RLS użytkownika)
DROP POLICY IF EXISTS error_translations_select_authenticated ON public.error_translations;
CREATE POLICY error_translations_select_authenticated ON public.error_translations
  FOR SELECT TO authenticated
  USING (true);

GRANT SELECT ON public.error_translations TO authenticated;

DROP TRIGGER IF EXISTS trigger_error_translations_updated_at ON public.error_translations;
CREATE TRIGGER trigger_error_translations_updated_at
  BEFORE UPDATE ON public.error_translations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.error_translations (
  error_code, error_xpath, user_message_pl, fix_suggestion, severity
) VALUES
  ('P_1', '/Faktura/Fa/P_1', 'Brakuje daty wystawienia faktury', 'Wpisz datę wystawienia w formacie RRRR-MM-DD', 'error'),
  ('P_2', '/Faktura/Fa/P_2', 'Brakuje numeru faktury', 'Numer faktury jest obowiązkowy', 'error'),
  ('P_6', '/Faktura/Fa/P_6', 'Niepoprawny format daty', 'Użyj formatu RRRR-MM-DD (np. 2026-04-15)', 'error'),
  ('P_12', '/Faktura/Fa/FaWiersz/P_12', 'Brakuje stawki VAT w pozycji', 'Wybierz: 23%, 8%, 5%, 0%, zw, oo lub np', 'error'),
  ('P_13_1', '/Faktura/Fa/FaWiersz/P_13_1', 'Niepoprawna wartość netto pozycji', 'Sprawdź ilość × cena jednostkowa', 'error'),
  ('P_15', '/Faktura/Fa/FaWiersz/P_15', 'Brakuje nazwy towaru/usługi', 'Wpisz nazwę pozycji (max 512 znaków)', 'error'),
  ('NIP_INVALID', '/Faktura/Podmiot1/DaneIdentyfikacyjne/NIP', 'Niepoprawny NIP wystawcy', 'NIP musi mieć 10 cyfr i poprawną sumę kontrolną', 'error'),
  ('NIP_NABYWCY_INVALID', '/Faktura/Podmiot2/DaneIdentyfikacyjne/NIP', 'Niepoprawny NIP nabywcy', 'Sprawdź NIP - możliwa literówka', 'error'),
  ('AUTH_FAILED', NULL, 'Błąd uwierzytelnienia w KSeF', 'Sprawdź czy certyfikat nie wygasł i jest poprawny', 'error'),
  ('SESSION_EXPIRED', NULL, 'Sesja KSeF wygasła', 'System odświeży sesję automatycznie i ponowi wysyłkę', 'warning'),
  ('RATE_LIMIT', NULL, 'Limit zapytań KSeF przekroczony', 'Spróbujemy ponownie za chwilę', 'warning'),
  ('SERVER_ERROR', NULL, 'Błąd serwera KSeF', 'Faktura zostanie wysłana automatycznie gdy serwer wstanie', 'warning')
ON CONFLICT (error_code) DO NOTHING;

-- ─── ksef_offline_queue ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ksef_offline_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,

  idempotency_key TEXT NOT NULL UNIQUE,

  status public.offline_queue_status_enum NOT NULL DEFAULT 'queued',

  deadline TIMESTAMPTZ NOT NULL,
  is_mf_outage BOOLEAN NOT NULL DEFAULT FALSE,

  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 100,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ,
  last_error TEXT,

  qr_offline_payload TEXT,
  qr_certyfikat_payload TEXT,

  user_notified BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offline_queue_pending
  ON public.ksef_offline_queue(next_attempt_at, status)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_offline_queue_deadline
  ON public.ksef_offline_queue(deadline)
  WHERE status IN ('queued', 'failed');

CREATE INDEX IF NOT EXISTS idx_offline_queue_invoice
  ON public.ksef_offline_queue(invoice_id);

ALTER TABLE public.ksef_offline_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ksef_offline_queue FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ksef_offline_queue TO authenticated;

DROP POLICY IF EXISTS offline_queue_tenant_isolation ON public.ksef_offline_queue;
CREATE POLICY offline_queue_tenant_isolation ON public.ksef_offline_queue
  FOR ALL TO authenticated
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

DROP TRIGGER IF EXISTS trigger_offline_queue_updated_at ON public.ksef_offline_queue;
CREATE TRIGGER trigger_offline_queue_updated_at
  BEFORE UPDATE ON public.ksef_offline_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.upo_receipts IS
  'Urzędowe Poświadczenia Odbioru — dowody akceptacji w KSeF.';
COMMENT ON TABLE public.error_translations IS
  'Mapowanie kodów błędów KSeF na komunikaty PL (globalnie współdzielone).';
COMMENT ON TABLE public.ksef_offline_queue IS
  'Tryb Offline24 — faktury oczekujące na wysłanie po powrocie KSeF.';
COMMENT ON COLUMN public.ksef_offline_queue.idempotency_key IS
  'Deterministyczny klucz idempotentny dla retry kolejki.';
