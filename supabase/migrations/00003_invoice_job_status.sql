-- ═══════════════════════════════════════════════════════════════
-- Faza 5: dodatkowe pola dla statusu jobów Inngest
-- ═══════════════════════════════════════════════════════════════
--
-- 00001 definiuje ksef_status z wartościami:
--   draft, queued, sending, accepted, rejected, received
--
-- Dokładamy TYLKO 'failed' (błąd infrastruktury po wyczerpaniu retries
-- Inngest: R2 down, DB down, network). 'rejected' zostawiamy dla
-- świadomego odrzucenia przez KSeF (XML/merytoryka). Semantyczna różnica:
--   rejected → KSeF powiedział "nie" → user musi poprawić fakturę
--   failed   → problem po naszej stronie → user może ponowić wysyłkę
--
-- 'pending' pomijamy, bo jest synonimem 'queued' w kontekście Inngest.

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_ksef_status_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_ksef_status_check
  CHECK (ksef_status IN (
    'draft', 'queued', 'sending', 'accepted', 'rejected', 'received', 'failed'
  ));

-- Liczba prób wysłania (Inngest retryuje automatycznie, ale zapisujemy
-- w DB dla audytu i UI typu "retry #3 z 5").
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS submission_attempts INT NOT NULL DEFAULT 0;

-- Ostatni błąd wysyłki (do pokazania użytkownikowi).
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS last_error TEXT;

-- Kiedy nastąpiła ostatnia próba (sending/rejected/failed).
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;

-- ═══════════════════════════════════════════════════════════════
-- Tabela: inngest_run_log
-- Wszystkie uruchomienia jobów dla audytu (osobno od audit_logs,
-- który jest zarezerwowany dla akcji użytkownika, nie systemowych).
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.inngest_run_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  run_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started', 'succeeded', 'failed')),
  payload JSONB,
  error_message TEXT,
  duration_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inngest_run_log_tenant
  ON public.inngest_run_log(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inngest_run_log_invoice
  ON public.inngest_run_log(invoice_id)
  WHERE invoice_id IS NOT NULL;

-- RLS: użytkownik widzi TYLKO logi swojego tenanta. Zapisy robi service role
-- (Inngest job przez Supabase service_role key), więc INSERT/UPDATE/DELETE
-- na authenticated pomijamy - czytelne są wyłącznie runy.
ALTER TABLE public.inngest_run_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inngest_run_log FROM anon;
GRANT SELECT ON public.inngest_run_log TO authenticated;

CREATE POLICY "inngest_run_log_select_own_tenant" ON public.inngest_run_log
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());
