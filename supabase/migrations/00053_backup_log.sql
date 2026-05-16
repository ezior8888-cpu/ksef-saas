-- Migracja 00053: backup_log table (Faza 29 — Backup, Recovery & DR).
--
-- Trackujemy każdy snapshot DB zrobiony przez Inngest cron. Pozwala:
--   - Pokazać w admin /system "ostatni backup: 2h temu, ✅ 4.2 MB"
--   - Wykrywać uciekający rozmiar (alert gdy growth > X% week-over-week)
--   - Verify cron (Krok 5) porównuje checksum z R2 obiektem
--   - Cleanup cron (Krok 6) wie co usunąć po retention
--
-- RLS: tylko service_role może czytać (admin endpoint używa admin client).
-- INSERT/UPDATE robi wyłącznie Inngest job z service_role.

DO $$ BEGIN
  CREATE TYPE public.backup_kind AS ENUM ('daily', 'weekly', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.backup_status AS ENUM ('running', 'success', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.backup_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.backup_kind NOT NULL,
  status public.backup_status NOT NULL DEFAULT 'running',
  -- pełny klucz w R2 po sukcesie, np. backups/db/2026/05/15-020000.json.gz
  r2_key TEXT,
  size_bytes BIGINT,
  -- per-table row counts dla quick-glance verify
  row_counts JSONB,
  -- SHA-256 hex gzipped payload — Krok 4 verify porównuje
  checksum TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_ms INT,
  error_message TEXT
);

-- Najczęstszy access pattern: ostatni snapshot danego rodzaju.
CREATE INDEX IF NOT EXISTS idx_backup_log_kind_started
  ON public.backup_log(kind, started_at DESC);

-- Verify/cleanup szukają po status (failed → alert, success → cleanup po retention).
CREATE INDEX IF NOT EXISTS idx_backup_log_status_started
  ON public.backup_log(status, started_at DESC);

ALTER TABLE public.backup_log ENABLE ROW LEVEL SECURITY;

-- Brak SELECT dla authenticated/anon — admin czyta przez service_role.
-- Inngest jobs (service_role) mają pełny dostęp.
REVOKE ALL ON TABLE public.backup_log FROM authenticated;
REVOKE ALL ON TABLE public.backup_log FROM anon;

-- ═══════════════════════════════════════════════════════════════
-- RPC dla dynamicznej listy tabel public.* w snapshot job.
--
-- Dlaczego RPC a nie hard-coded lista w kodzie: gdy w przyszłych
-- fazach dodajemy tabele (np. Faza 30 `messages/conversations`),
-- snapshot automatycznie je obejmie bez deploy aplikacji.
--
-- SECURITY DEFINER żeby service_role mogło czytać `pg_catalog`.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.list_public_tables()
RETURNS TABLE (table_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT c.relname::text AS table_name
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'  -- tylko zwykłe tabele (nie views, indexes, sequences)
  ORDER BY c.relname;
$$;

REVOKE ALL ON FUNCTION public.list_public_tables() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_tables() TO service_role;

COMMENT ON FUNCTION public.list_public_tables IS
  'Lista tabel w schemacie public, używana przez backup snapshot (Faza 29).';
