-- ═══════════════════════════════════════════════════════════════
-- Katalog produktów/usług per tenant (autocomplete, Magiczny Import)
-- Uwagi vs surową instrukcję „10.3 / 00010”:
--   • nazwa migracji ≠ 00010 — plik `00010_accountant_access.sql` już jest
--   • trigger używa public.set_updated_at() z 00001 (nie update_updated_at_column)
--   • RLS jak contractors (00004): get_current_tenant_id + WITH CHECK + TO authenticated
-- ═══════════════════════════════════════════════════════════════
-- Idempotentnie: jeśli tabela powstała z ręcznego SQL w Dashboard,
-- kolejny `db push` nie może padać na CREATE TABLE.

CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'szt.',
  default_price_net NUMERIC(15, 2),
  default_vat_rate TEXT NOT NULL DEFAULT '23',

  category TEXT,
  pkwiu_code TEXT,
  gtu_code TEXT,

  description TEXT,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,

  use_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_tenant_usage
  ON public.products(tenant_id, last_used_at DESC NULLS LAST, use_count DESC)
  WHERE is_archived = FALSE;

CREATE INDEX IF NOT EXISTS idx_products_name_fts
  ON public.products
  USING gin(to_tsvector('simple', name));

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.products FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;

DROP POLICY IF EXISTS products_tenant_isolation ON public.products;
CREATE POLICY products_tenant_isolation ON public.products
  FOR ALL
  TO authenticated
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

DROP TRIGGER IF EXISTS trigger_products_updated_at ON public.products;
CREATE TRIGGER trigger_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.products IS
  'Katalog produktów/usług tenanta — auto-budowany z historii faktur.';
COMMENT ON COLUMN public.products.use_count IS
  'Liczba użyć na fakturach — sortowanie autocomplete.';
COMMENT ON COLUMN public.products.gtu_code IS
  'Kod GTU dla JPK_V7M (np. GTU_07 pojazdy, GTU_08 metale szlachetne).';
COMMENT ON COLUMN public.products.pkwiu_code IS
  'Kod PKWiU — klasyfikacja statystyczna PL.';
