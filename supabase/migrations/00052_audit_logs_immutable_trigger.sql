-- Migracja 00052: trigger PREVENT UPDATE/DELETE na audit_logs (Faza 28 Krok 8).
--
-- Defense-in-depth: RLS w migracji 00008 już blokuje UPDATE/DELETE dla
-- `authenticated`, ale service_role i bezpośrednie SQL od admina mogłyby
-- ominąć. Trigger działa NIEZALEŻNIE od roli — łapie nawet superuser próbę.
--
-- WYJĄTEK: trigger akceptuje INSERT (audit log to append-only) i jawne
-- delete z `current_setting('app.allow_audit_purge')` = 'true' (używane
-- przez `cleanup-audit-logs` cron job po 12 miesiącach + GDPR
-- anonymization gdzie tylko zerujemy kolumny, nie usuwamy wpisu).
--
-- Dla GDPR użycia: zerowanie kolumn (UPDATE) jest blokowane, ale my
-- chcemy je dla anonymizacji audit_logs przy delete usera. Workaround:
-- aplikacja używa `SET LOCAL app.allow_audit_purge = 'true'` w transakcji.

CREATE OR REPLACE FUNCTION public.prevent_audit_logs_mutate()
RETURNS TRIGGER AS $$
BEGIN
  -- Wpisy mogą być modyfikowane wyłącznie z opt-in: SET LOCAL
  -- app.allow_audit_purge = 'true' w obrębie transakcji.
  IF current_setting('app.allow_audit_purge', true) = 'true' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  RAISE EXCEPTION
    'audit_logs is append-only (% blocked). Use SET LOCAL app.allow_audit_purge=true for cleanup jobs.',
    TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_prevent_update ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_prevent_update
  BEFORE UPDATE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_logs_mutate();

DROP TRIGGER IF EXISTS trg_audit_logs_prevent_delete ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_prevent_delete
  BEFORE DELETE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_logs_mutate();

COMMENT ON FUNCTION public.prevent_audit_logs_mutate IS
  'Append-only enforcement na audit_logs. Faza 28 Krok 8. Override przez '
  'SET LOCAL app.allow_audit_purge=true dla cleanup-audit-logs cron i '
  'GDPR anonymization.';

-- ═══════════════════════════════════════════════════════════════
-- Update cleanup_old_audit_logs żeby trigger nie blokował legalnego
-- usuwania zgodnego z 12-mc retencją (migracja 00044).
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

  -- Opt-in dla append-only trigger (00052) — purge jest jawną decyzją.
  PERFORM set_config('app.allow_audit_purge', 'true', true);

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

-- ═══════════════════════════════════════════════════════════════
-- RPC dla GDPR delete (Faza 28 Krok 7) — anonimizuje wpisy audit_logs
-- konkretnego usera, omijając append-only trigger.
--
-- Wywoływane z `lib/gdpr/deletion.ts → executeGdprRequest`.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.anonymize_user_audit_logs(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated bigint;
BEGIN
  PERFORM set_config('app.allow_audit_purge', 'true', true);

  UPDATE public.audit_logs
  SET
    user_id = NULL,
    ip_address = NULL,
    user_agent = NULL,
    metadata = jsonb_build_object(
      'anonymized_at', now()::text,
      'reason', 'gdpr_user_deletion'
    )
  WHERE user_id = p_user_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('updated_rows', v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.anonymize_user_audit_logs(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.anonymize_user_audit_logs(uuid) TO service_role;

COMMENT ON FUNCTION public.anonymize_user_audit_logs IS
  'GDPR art. 17 — anonimizacja audit_logs przy usunięciu konta usera. '
  'Zostawia zdarzenie, zerove PII. Faza 28 Krok 7.';
