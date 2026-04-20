-- ═══════════════════════════════════════════════════════════════
-- Faza 6: rozszerzenia schema dla UI (kontrahenci + Realtime + JSONB)
-- ═══════════════════════════════════════════════════════════════
-- UWAGA o kompatybilności z 00001:
--   - `tenants.name`  już istnieje jako VARCHAR(255) NOT NULL - zostawiamy.
--   - `tenants.address_json` już istnieje (nazwa z 00001). NIE dodajemy
--     drugiej kolumny `address` o tej samej semantyce - UI będzie czytać
--     `address_json`.
--   - `tenants.ksef_credentials_encrypted` w 00001 to BYTEA (hex w DB,
--     kod szyfrujący z Fazy 3 operuje na Bufferze). NIE zmieniamy na TEXT
--     - to by złamało `scripts/seed-tenant.ts` i `admin-queries.ts`.
--   - `tenants.ksef_certificate_expiry` już istnieje.
--   - `invoices.internal_number / issue_date / net_total / vat_total /
--      gross_total` już istnieją - zostawiamy typy z 00001.
--   - `invoices.invoice_type` już istnieje w 00001 (ta sama semantyka co
--      "type" w speccie Fazy 6). NIE dodajemy drugiej kolumny.
-- W praktyce ta migracja dodaje tylko to, czego NAPRAWDĘ nie ma.
-- ═══════════════════════════════════════════════════════════════

-- 1) TENANTS: flaga aktywności (używana przez inboxPollingJob do filtra).
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 2) INVOICES: pola JSONB dla snapshotu faktury + notatki + sale_date.
--    JSONB zamiast osobnych tabel: seller/buyer/payment to imutowalny snapshot
--    z momentu wystawienia - kontrahent może zmienić adres rok później,
--    faktura MUSI zachować stan oryginalny (wymóg prawny).
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS sale_date DATE,
  ADD COLUMN IF NOT EXISTS seller_data JSONB,
  ADD COLUMN IF NOT EXISTS buyer_data JSONB,
  ADD COLUMN IF NOT EXISTS payment_data JSONB,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Indeksy pod listy UI (sortowanie po dacie utworzenia, filtr po statusie,
-- szybki lookup po numerze KSeF).
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_created
  ON public.invoices(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_tenant_status_v2
  ON public.invoices(tenant_id, ksef_status);

CREATE INDEX IF NOT EXISTS idx_invoices_ksef_number_unique
  ON public.invoices(ksef_number)
  WHERE ksef_number IS NOT NULL;

-- Opcjonalny indeks GIN na buyer_data->>'nip' pod wyszukiwanie faktury
-- po NIP-ie kontrahenta ze snapshotu. Bez kosztu dysku dla nieużywanego
-- wariantu - pomijamy, doda się gdy będzie potrzeba w reportach.

-- 3) CONTRACTORS: cache kontrahentów do auto-uzupełniania formularza.
CREATE TABLE IF NOT EXISTS public.contractors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nip TEXT NOT NULL,
  name TEXT NOT NULL,
  address JSONB,
  email TEXT,
  phone TEXT,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, nip)
);

COMMENT ON TABLE public.contractors IS
  'Cache kontrahentów per tenant. Używany przez formularz faktury
   do auto-uzupełniania po NIP. Snapshot z `buyer_data` idzie do
   `invoices.buyer_data` przy save - to jest osobny byt (mutowalny).';

CREATE INDEX IF NOT EXISTS idx_contractors_tenant_recent
  ON public.contractors(tenant_id, last_used_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_contractors_nip_search
  ON public.contractors(tenant_id, nip text_pattern_ops);

ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contractors FROM anon;
GRANT ALL ON public.contractors TO authenticated;

-- RLS: tenant isolation przez pomocniczą funkcję z migracji 00002.
DROP POLICY IF EXISTS "contractors_tenant_isolation" ON public.contractors;
CREATE POLICY "contractors_tenant_isolation" ON public.contractors
  FOR ALL TO authenticated
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

-- 4) REALTIME: włącz publikację dla `invoices` żeby UI dostawało
--    natychmiastowe aktualizacje gdy job Inngest zmienia
--    ksef_status: 'sending' → 'accepted'/'rejected'.
--    `ADD TABLE` rzuci błąd jeśli już dodana - łapiemy try/catch w DO.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'invoices już w supabase_realtime - skip';
END
$$;
