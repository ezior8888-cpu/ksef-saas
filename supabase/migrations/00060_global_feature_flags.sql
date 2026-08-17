-- ═══════════════════════════════════════════════════════════════
-- 00060: Globalne feature flags w Postgresie (Etap 8 migracji Hetzner)
--
-- Zastępuje Vercel Edge Config — ostatnią zależność aplikacji od Vercela.
-- Te flagi to kill-switche na czas incydentu, działające dla WSZYSTKICH
-- organizacji naraz (per-tenant ma osobną tabelę z migracji 00031):
--   • killAllKsefSubmissions — wstrzymaj wysyłkę faktur (awaria po stronie MF)
--   • maintenanceMode        — przerwa techniczna
--   • disableSignups         — zamknij rejestrację
--
-- Odczyt idzie przez Redis (TTL 60 s), więc kill-switch propaguje się
-- w minutę, a normalny ruch nie dokłada zapytań do bazy.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.global_feature_flags (
  -- Klucz w camelCase, zgodny z typem `GlobalFlag` w kodzie.
  flag TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  -- Kto i kiedy przestawił — przy incydencie to pierwsze pytanie.
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT,
  note TEXT
);

COMMENT ON TABLE public.global_feature_flags IS
  'Globalne kill-switche (Etap 8 migracji Hetzner, zastąpiły Vercel Edge Config). Zapis wyłącznie service_role — z panelu admina.';

-- RLS bez polityk = deny-all dla anon/authenticated.
-- Aplikacja czyta przez admin clienta (kill-switch nie może zależeć od RLS).
ALTER TABLE public.global_feature_flags ENABLE ROW LEVEL SECURITY;

-- Wiersze startowe: wszystko wyłączone (fail-soft = normalne działanie).
INSERT INTO public.global_feature_flags (flag, enabled, note)
VALUES
  ('killAllKsefSubmissions', false, 'Wstrzymuje wysyłkę faktur do KSeF (awaria MF)'),
  ('maintenanceMode', false, 'Przerwa techniczna — blokuje panel'),
  ('disableSignups', false, 'Zamyka rejestrację nowych kont')
ON CONFLICT (flag) DO NOTHING;
