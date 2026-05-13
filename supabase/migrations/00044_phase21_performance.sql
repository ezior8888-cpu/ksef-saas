-- ═══════════════════════════════════════════════════════════════
-- Faza 21 — Database optimization & indexing (dashboard / logi)
-- ═══════════════════════════════════════════════════════════════
-- Cel (spec / Claude Code): przygotować bazę pod większy ruch i mandatory
-- KSeF bez dużego przepisywania — indeksy z `IF NOT EXISTS`, widoki MV +
-- funkcje REFRESH / cleanup.
--
-- Sekcje (idea „21.x”):
--   1. Composite / partial indexes pod typowe filtry (tenant, status, daty).
--   2. BRIN na append-only (`audit_logs`, `inngest_run_log`).
--   3. Materialized views: `mv_tenant_monthly_stats`, `mv_tenant_dashboard_summary`.
--   4. Funkcje: `refresh_dashboard_materialized_views`, `cleanup_old_audit_logs`.
--
-- Cron odświeżający MV: `lib/inngest/jobs/refresh-materialized-views.ts`
-- (rejestracja w `app/api/inngest/route.ts`).
--
-- Poprawki względem pierwotnego SQL z worktree (muszą być zgodne z tym repo):
--   - `invoices.direction`: wartości `outgoing` / `incoming` (nie `issued`).
--   - Termin płatności: `payment_due_date` (nie `due_date`).
--   - `ksef_offline_queue.status`: enum m.in. `queued` (nie `pending`).
--   - Kolumna terminu offline: `deadline` (nie `deadline_at`).
--   - `inngest_run_log`: znacznik czasu `created_at` (nie `started_at`).
-- Widok `mv_tenant_dashboard_summary`: jeden wiersz na tenant (bez wymiaru
-- `direction`), żeby uniknąć błędnych JOINów przy braku faktur w bieżącym miesiącu.
-- REFRESH CONCURRENTLY: wymaga UNIQUE INDEX na każdym MV — poniżej.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. INVOICES: composite / partial indexes ─────────────────────────

CREATE INDEX IF NOT EXISTS idx_invoices_tenant_direction_status_date
  ON public.invoices (tenant_id, direction, ksef_status, issue_date DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_tenant_payment_due
  ON public.invoices (tenant_id, payment_status, payment_due_date)
  WHERE direction = 'outgoing';

CREATE INDEX IF NOT EXISTS idx_invoices_unpaid_partial
  ON public.invoices (tenant_id, payment_due_date)
  WHERE payment_status IN ('unpaid', 'partial', 'overdue')
    AND direction = 'outgoing';

-- ─── 2. EXPENSES (indeks pomocniczy — ksef_invoice_id) ─────────────────

CREATE INDEX IF NOT EXISTS idx_expenses_ksef_invoice
  ON public.expenses (ksef_invoice_id)
  WHERE ksef_invoice_id IS NOT NULL;

-- ─── 3. AUDIT_LOGS ─────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_brin
  ON public.audit_logs USING BRIN (created_at)
  WITH (pages_per_range = 32);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created
  ON public.audit_logs (tenant_id, created_at);

-- ─── 4. KSEF_OFFLINE_QUEUE ───────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_offline_queue_queued_deadline
  ON public.ksef_offline_queue (deadline)
  WHERE status = 'queued';

-- ─── 5. INNGEST_RUN_LOG ────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_inngest_run_log_created_brin
  ON public.inngest_run_log USING BRIN (created_at)
  WITH (pages_per_range = 32);

-- ═══════════════════════════════════════════════════════════════
-- MATERIALIZED VIEWS
-- ═══════════════════════════════════════════════════════════════
-- Uwaga: MV nie podlegają RLS — aplikacja musi filtrować po tenant_id.

DROP MATERIALIZED VIEW IF EXISTS public.mv_tenant_dashboard_summary CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.mv_tenant_monthly_stats CASCADE;

CREATE MATERIALIZED VIEW public.mv_tenant_monthly_stats AS
SELECT
  tenant_id,
  to_char(issue_date, 'YYYY-MM') AS year_month,
  direction,
  COUNT(*)::bigint AS invoice_count,
  COUNT(*) FILTER (WHERE ksef_status = 'accepted')::bigint AS accepted_count,
  COUNT(*) FILTER (WHERE ksef_status = 'rejected')::bigint AS rejected_count,
  COUNT(*) FILTER (WHERE payment_status = 'paid')::bigint AS paid_count,
  COUNT(*) FILTER (WHERE payment_status IN ('unpaid', 'partial', 'overdue'))::bigint AS unpaid_count,
  COALESCE(SUM(net_total), 0)::numeric(18, 2) AS total_net,
  COALESCE(SUM(vat_total), 0)::numeric(18, 2) AS total_vat,
  COALESCE(SUM(gross_total), 0)::numeric(18, 2) AS total_gross,
  COALESCE(SUM(paid_amount), 0)::numeric(18, 2) AS total_paid,
  MAX(created_at) AS last_invoice_at
FROM public.invoices
WHERE issue_date IS NOT NULL
GROUP BY tenant_id, to_char(issue_date, 'YYYY-MM'), direction;

CREATE UNIQUE INDEX uq_mv_tenant_monthly_stats
  ON public.mv_tenant_monthly_stats (tenant_id, year_month, direction);

CREATE INDEX idx_mv_monthly_tenant_month
  ON public.mv_tenant_monthly_stats (tenant_id, year_month DESC);

-- Jeden wiersz na aktywnego tenant — agregaty bez wymiaru direction.
CREATE MATERIALIZED VIEW public.mv_tenant_dashboard_summary AS
WITH bounds AS (
  SELECT
    date_trunc('month', CURRENT_DATE::timestamp)::date AS cm_start,
    (date_trunc('month', CURRENT_DATE::timestamp) + INTERVAL '1 month')::date AS cm_end,
    (date_trunc('month', CURRENT_DATE::timestamp) - INTERVAL '1 month')::date AS pm_start,
    date_trunc('month', CURRENT_DATE::timestamp)::date AS pm_end
),
current_month AS (
  SELECT
    i.tenant_id,
    COUNT(*)::bigint AS invoice_count,
    COUNT(*) FILTER (WHERE i.ksef_status = 'accepted')::bigint AS accepted_count,
    COALESCE(SUM(i.net_total), 0)::numeric(18, 2) AS total_net,
    COALESCE(SUM(i.vat_total), 0)::numeric(18, 2) AS total_vat,
    COALESCE(SUM(i.gross_total), 0)::numeric(18, 2) AS total_gross
  FROM public.invoices i
  CROSS JOIN bounds b
  WHERE i.issue_date >= b.cm_start
    AND i.issue_date < b.cm_end
  GROUP BY i.tenant_id
),
prev_month AS (
  SELECT
    i.tenant_id,
    COUNT(*)::bigint AS invoice_count
  FROM public.invoices i
  CROSS JOIN bounds b
  WHERE i.issue_date >= b.pm_start
    AND i.issue_date < b.pm_end
  GROUP BY i.tenant_id
),
unpaid AS (
  SELECT
    i.tenant_id,
    COUNT(*)::bigint AS unpaid_count,
    COALESCE(SUM(i.gross_total - COALESCE(i.paid_amount, 0)), 0)::numeric(18, 2) AS unpaid_amount
  FROM public.invoices i
  WHERE i.direction = 'outgoing'
    AND i.payment_status IN ('unpaid', 'partial', 'overdue')
  GROUP BY i.tenant_id
)
SELECT
  t.id AS tenant_id,
  COALESCE(cm.invoice_count, 0) AS current_month_count,
  COALESCE(cm.accepted_count, 0) AS current_month_accepted,
  COALESCE(cm.total_net, 0) AS current_month_net,
  COALESCE(cm.total_vat, 0) AS current_month_vat,
  COALESCE(cm.total_gross, 0) AS current_month_gross,
  COALESCE(pm.invoice_count, 0) AS prev_month_count,
  COALESCE(u.unpaid_count, 0) AS unpaid_count,
  COALESCE(u.unpaid_amount, 0) AS unpaid_amount,
  now() AS refreshed_at
FROM public.tenants t
LEFT JOIN current_month cm ON cm.tenant_id = t.id
LEFT JOIN prev_month pm ON pm.tenant_id = t.id
LEFT JOIN unpaid u ON u.tenant_id = t.id
WHERE t.is_active = true;

CREATE UNIQUE INDEX uq_mv_tenant_dashboard_summary
  ON public.mv_tenant_dashboard_summary (tenant_id);

CREATE INDEX idx_mv_dashboard_tenant
  ON public.mv_tenant_dashboard_summary (tenant_id);

-- ═══════════════════════════════════════════════════════════════
-- REFRESH (CONCURRENTLY) — service_role
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.refresh_dashboard_materialized_views()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  monthly_start timestamp;
  monthly_end timestamp;
  summary_start timestamp;
  summary_end timestamp;
BEGIN
  monthly_start := clock_timestamp();
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_tenant_monthly_stats;
  monthly_end := clock_timestamp();

  summary_start := clock_timestamp();
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_tenant_dashboard_summary;
  summary_end := clock_timestamp();

  RETURN jsonb_build_object(
    'monthly_stats_ms', extract(epoch FROM (monthly_end - monthly_start)) * 1000,
    'dashboard_summary_ms', extract(epoch FROM (summary_end - summary_start)) * 1000,
    'refreshed_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_dashboard_materialized_views() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_dashboard_materialized_views() TO service_role;

-- ═══════════════════════════════════════════════════════════════
-- Cleanup starych logów (service_role / job Inngest)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs(p_retention_months integer DEFAULT 12)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cutoff timestamp;
  v_deleted bigint;
  v_started timestamp;
BEGIN
  IF p_retention_months < 6 THEN
    RAISE EXCEPTION 'retention_months < 6 zabronione — minimum 6mc dla audit_logs';
  END IF;

  v_started := clock_timestamp();
  v_cutoff := now() - (p_retention_months || ' months')::interval;

  DELETE FROM public.audit_logs WHERE created_at < v_cutoff;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  DELETE FROM public.inngest_run_log
  WHERE created_at < now() - INTERVAL '3 months';

  RETURN jsonb_build_object(
    'deleted_audit_logs', v_deleted,
    'cutoff', v_cutoff,
    'duration_ms', extract(epoch FROM (clock_timestamp() - v_started)) * 1000
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_old_audit_logs(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_old_audit_logs(integer) TO service_role;

ANALYZE public.invoices;
ANALYZE public.expenses;
ANALYZE public.audit_logs;
ANALYZE public.ksef_offline_queue;
