-- ═══════════════════════════════════════════════════════════════
-- KSEF SAAS — MULTI-ORG REDESIGN: STEP 1
-- Migration: 00035
--
-- Cel:
--   Tabela `tenants` semantycznie staje się `organizations`. Zachowujemy
--   nazwę `tenants` (i `tenant_id` w innych tabelach), bo rename do
--   `organizations` w 20+ miejscach to scope creep bez wartości.
--
--   • Zdejmujemy UNIQUE z NIP-u — wiele organizacji może mieć ten sam NIP
--     (np. równoległy sandbox/test). Kolizja jest informacją w UI, nie
--     ograniczeniem schematu. Hard claim na NIP jest zarezerwowany dla
--     udanej autoryzacji w KSeF (kolumna `ksef_verified_at`).
--   • Dodajemy `created_by_user_id`, `ksef_verified_at`, `ksef_authority_user_id`
--     — sygnały ownership / domain claim.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_nip_key;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS ksef_verified_at TIMESTAMPTZ;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS ksef_authority_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tenants_nip ON public.tenants(nip);
CREATE INDEX IF NOT EXISTS idx_tenants_ksef_verified
  ON public.tenants(nip)
  WHERE ksef_verified_at IS NOT NULL;

COMMENT ON COLUMN public.tenants.created_by_user_id IS
  'User, który utworzył organizację. Informacyjne — nie nadaje uprawnień (te są w memberships).';
COMMENT ON COLUMN public.tenants.ksef_verified_at IS
  'Kiedy organizacja udowodniła kontrolę nad NIP-em przez autoryzację w KSeF.';
COMMENT ON COLUMN public.tenants.ksef_authority_user_id IS
  'User, który zakończył autoryzację KSeF dla tego NIP-u (claim authority).';
