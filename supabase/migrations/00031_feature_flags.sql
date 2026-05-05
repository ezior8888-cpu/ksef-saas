-- Audyt #27: feature flags per tenant.
--
-- Bez flag każdy nowy moduł (Co-Pilot, Magiczny Import, eksporty) idzie
-- na produkcję jednocześnie dla WSZYSTKICH tenantów. Gdy coś się popsuje
-- w jednej ścieżce (np. eksport KPiR rzuca błąd dla tenantów z 1000+
-- faktur miesięcznie), nie da się wyłączyć modułu dla pojedynczego klienta
-- bez deploymentu i bez wpływu na pozostałych.
--
-- `tenant_feature_flags` to kill-switch:
--   * jedna kolumna boolean per moduł,
--   * domyślnie FALSE → roll-out OPT-IN (admin włącza per tenant),
--   * RLS: tenant widzi WYŁĄCZNIE swój wiersz; modyfikuje WYŁĄCZNIE backend
--     (service_role) — klient nie może sobie sam włączyć modułu.
--
-- ON DELETE CASCADE z `tenants` — gdy tenant zostaje usunięty (RODO erasure),
-- jego flagi znikają automatycznie. Bez wycieku metadanych.

CREATE TABLE IF NOT EXISTS public.tenant_feature_flags (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  co_pilot_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  magic_import_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  exports_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.tenant_feature_flags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_feature_flags FROM anon;

-- Klient: tylko SELECT. Modyfikacje robi backend (service_role) — UI feature
-- flag musi być po stronie admin / Cursor SDK / Stripe webhook, nie własnego
-- konta usera.
GRANT SELECT ON public.tenant_feature_flags TO authenticated;

DROP POLICY IF EXISTS tenant_feature_flags_select ON public.tenant_feature_flags;
CREATE POLICY tenant_feature_flags_select ON public.tenant_feature_flags
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

-- Auto-touch updated_at — trigger `set_updated_at` istnieje już z 00024.
DROP TRIGGER IF EXISTS trigger_tenant_feature_flags_updated_at ON public.tenant_feature_flags;
CREATE TRIGGER trigger_tenant_feature_flags_updated_at
  BEFORE UPDATE ON public.tenant_feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.tenant_feature_flags IS
  'Per-tenant kill-switch dla modułów (Co-Pilot, Magiczny Import, eksporty). Tylko SELECT z UI; modyfikacje przez backend.';
