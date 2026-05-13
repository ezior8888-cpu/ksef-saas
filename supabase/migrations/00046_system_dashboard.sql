-- ═══════════════════════════════════════════════════════════════
-- Faza 24 — Admin /system dashboard (Krok 3)
-- ═══════════════════════════════════════════════════════════════
-- Cel: dane do operacyjnego dashboardu — KSeF health timeline 24h, rozmiary
-- tabel, slow queries. Inngest jobs status czytamy z istniejącego
-- `inngest_run_log`, nie potrzebuje migracji.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. KSeF health log (timeline 24h dla wykresu) ─────────────────────
--
-- Health monitor pinguje co 30s i zapisuje snapshot w Redisie (TTL 90s).
-- Dla 24h-wykresu w admin panelu potrzebujemy persistencji. Zapisujemy:
--   - przy każdej zmianie levelu (operational ↔ degraded ↔ down)
--   - co 5 minut "heartbeat" jeśli level się nie zmienił (≈ 288/dzień)
--
-- Tworzymy lekką tabelę bez kolumn typu metadata — chcemy się zmieścić
-- w ~3-5MB/rok per env. Cleanup robi `cleanup-audit-logs` cron (retencja
-- 3 miesiące dla logów telemetrycznych).
CREATE TABLE IF NOT EXISTS public.ksef_health_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  env             TEXT NOT NULL CHECK (env IN ('test', 'demo', 'production')),
  level           TEXT NOT NULL CHECK (level IN ('operational', 'degraded', 'down')),
  response_time_ms INTEGER,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  is_mf_outage    BOOLEAN NOT NULL DEFAULT FALSE,
  error_short     TEXT,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Najczęstszy query: "ostatnie 24h timeline dla env X".
CREATE INDEX IF NOT EXISTS idx_ksef_health_log_env_time
  ON public.ksef_health_log (env, recorded_at DESC);

-- BRIN dla efektywnego cleanup'u (append-only timeseries).
CREATE INDEX IF NOT EXISTS idx_ksef_health_log_recorded_brin
  ON public.ksef_health_log USING BRIN (recorded_at)
  WITH (pages_per_range = 32);

-- RLS — service_role only (admin czyta przez admin client).
ALTER TABLE public.ksef_health_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ksef_health_log FROM anon, authenticated;
GRANT ALL ON public.ksef_health_log TO service_role;

COMMENT ON TABLE public.ksef_health_log IS
  'Timeline pingów do KSeF API (Faza 24). Wypełniane przez recordKsefPing przy zmianie levelu lub co 5min heartbeat. Retencja 3mc.';

-- ─── 2. RPC: rozmiary tabel (admin /system) ─────────────────────────────
--
-- pg_total_relation_size jest ekspozyą informacji systemowej i wymaga
-- prawa do `pg_catalog` — anon nie ma. SECURITY DEFINER pozwala adminowi
-- czytać przez service_role.
CREATE OR REPLACE FUNCTION public.admin_table_sizes()
RETURNS TABLE (
  table_name TEXT,
  total_bytes BIGINT,
  row_estimate BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    c.relname::text AS table_name,
    pg_total_relation_size(c.oid)::bigint AS total_bytes,
    c.reltuples::bigint AS row_estimate
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'm')  -- regular tables + materialized views
  ORDER BY pg_total_relation_size(c.oid) DESC
  LIMIT 30;
$$;

REVOKE ALL ON FUNCTION public.admin_table_sizes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_table_sizes() TO service_role;

-- ─── 3. RPC: total database size ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_database_size()
RETURNS BIGINT
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT pg_database_size(current_database())::bigint;
$$;

REVOKE ALL ON FUNCTION public.admin_database_size() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_database_size() TO service_role;
