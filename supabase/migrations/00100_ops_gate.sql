-- 00100 — bramka operatora w Telegramie (B-2, krok 9 planu automatyzacji).
--
-- Bramka (ops/bramka) działa na ops-1, osobno od aplikacji, i nie dostaje
-- klucza service_role. Łączy się rolą `ops_actor`, która widzi wyłącznie
-- cztery funkcje w schemacie `ops`:
--   ops.status()          — stan do /status (bez danych klientów: same liczby),
--   ops.queues()          — zaległości pg-boss do /kolejki,
--   ops.disable(flag, …)  — WYŁĄCZENIE funkcji (flaga globalna = true),
--   ops.log(action, …)    — wpis do audit_logs.
-- Włączenia z powrotem bramka nie potrafi — ops.disable() przyjmuje tylko
-- trzy flagi „kill” i ustawia je wyłącznie na true. Zdjęcie flagi: SQL ręcznie
-- (docs/runbooks/hamulce-ksef.md).
--
-- Schemat `ops` nie jest w PGRST_DB_SCHEMAS, więc PostgREST (anon,
-- authenticated) go nie widzi; USAGE ma tylko ops_actor.
--
-- Rola powstaje jako NOLOGIN, bez hasła (repo jest publiczne). Hasło
-- i LOGIN nadaje Bartosz ręcznie — docs/runbooks/bramka-telegram.md.
--
-- Addytywna: nowa rola, schemat i funkcje; bez zmian w istniejących tabelach.
-- Uruchamiać z --single-transaction.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ops_actor') THEN
    CREATE ROLE ops_actor NOLOGIN;
  END IF;
END
$$;

ALTER ROLE ops_actor CONNECTION LIMIT 3;
ALTER ROLE ops_actor SET statement_timeout = '5s';

CREATE SCHEMA IF NOT EXISTS ops;
REVOKE ALL ON SCHEMA ops FROM PUBLIC;
GRANT USAGE ON SCHEMA ops TO ops_actor;

-- ── /status ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ops.status()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'now', now(),
    'ksef', (
      SELECT jsonb_build_object('level', level, 'at', recorded_at, 'ms', response_time_ms)
        FROM public.ksef_health_log
       ORDER BY recorded_at DESC
       LIMIT 1
    ),
    'backup', (
      SELECT jsonb_build_object('at', started_at, 'kind', kind)
        FROM public.backup_log
       WHERE status = 'success'
       ORDER BY started_at DESC
       LIMIT 1
    ),
    'backup_failed_24h', (
      SELECT count(*) FROM public.backup_log
       WHERE status = 'failed' AND started_at > now() - interval '24 hours'
    ),
    'flags', (SELECT jsonb_object_agg(flag, enabled) FROM public.global_feature_flags),
    'invoices', jsonb_build_object(
      'sending_15m', (
        SELECT count(*) FROM public.invoices
         WHERE ksef_status = 'sending'
           AND coalesce(last_attempt_at, updated_at) < now() - interval '15 minutes'
      ),
      'queued_15m', (
        SELECT count(*) FROM public.invoices
         WHERE ksef_status = 'queued' AND updated_at < now() - interval '15 minutes'
      ),
      'held', (
        SELECT jsonb_object_agg(code, n) FROM (
          SELECT last_error_code AS code, count(*) AS n
            FROM public.invoices
           WHERE ksef_status = 'failed'
             AND last_error_code IN ('KSEF_PAUSED', 'KOR_HOLD', 'ROZ_HOLD_RECONCILE', 'KSEF_DUPLICATE_RECONCILE')
           GROUP BY 1
        ) h
      )
    ),
    'offline_queue', (
      SELECT jsonb_object_agg(status, n) FROM (
        SELECT status, count(*) AS n FROM public.ksef_offline_queue GROUP BY 1
      ) q
    ),
    'migration', (SELECT max(version) FROM supabase_migrations.schema_migrations),
    'migrations_recent', (
      SELECT coalesce(jsonb_agg(version ORDER BY version DESC), '[]'::jsonb)
        FROM (SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 60) m
    ),
    'heartbeat_at', (
      SELECT max(completed_on) FROM pgboss.job
       WHERE name = 'cron.ops-heartbeat' AND state = 'completed'
    )
  );
$$;

-- ── /kolejki ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ops.queues()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.name), '[]'::jsonb)
    FROM (
      SELECT name,
             count(*) FILTER (WHERE state IN ('created', 'retry')) AS waiting,
             count(*) FILTER (WHERE state = 'active') AS active,
             count(*) FILTER (WHERE state = 'failed' AND completed_on > now() - interval '24 hours') AS failed_24h,
             min(created_on) FILTER (WHERE state IN ('created', 'retry') AND start_after <= now()) AS oldest_due
        FROM pgboss.job
       GROUP BY name
      HAVING count(*) FILTER (WHERE state IN ('created', 'retry', 'active')) > 0
          OR count(*) FILTER (WHERE state = 'failed' AND completed_on > now() - interval '24 hours') > 0
    ) q;
$$;

-- ── /wylacz ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ops.disable(p_flag text, p_actor text, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous boolean;
BEGIN
  IF p_flag NOT IN ('killAllKsefSubmissions', 'killFloAgent', 'disableSignups') THEN
    RAISE EXCEPTION 'ops.disable: niedozwolona flaga %', p_flag USING ERRCODE = '22023';
  END IF;
  IF p_actor IS NULL OR p_actor !~ '^[A-Za-z0-9_:. -]{1,64}$' THEN
    RAISE EXCEPTION 'ops.disable: niepoprawny wykonawca' USING ERRCODE = '22023';
  END IF;

  SELECT enabled INTO v_previous FROM public.global_feature_flags WHERE flag = p_flag FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ops.disable: brak flagi % w global_feature_flags', p_flag USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.global_feature_flags
     SET enabled = true,
         updated_at = now(),
         updated_by = left('bramka:' || p_actor, 100),
         note = left(coalesce(p_note, 'Wyłączone z Telegrama'), 500)
   WHERE flag = p_flag;

  INSERT INTO public.audit_logs (action, entity_type, metadata)
  VALUES (
    'ops.flag.disabled',
    'global_feature_flag',
    jsonb_build_object('flag', p_flag, 'previous', v_previous, 'actor', p_actor, 'source', 'telegram')
  );

  RETURN jsonb_build_object('flag', p_flag, 'previous', v_previous, 'enabled', true);
END;
$$;

-- ── dziennik ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ops.log(p_action text, p_actor text, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_action !~ '^ops\.[a-z_.]{1,60}$' THEN
    RAISE EXCEPTION 'ops.log: niedozwolona akcja %', p_action USING ERRCODE = '22023';
  END IF;
  IF p_actor IS NULL OR p_actor !~ '^[A-Za-z0-9_:. -]{1,64}$' THEN
    RAISE EXCEPTION 'ops.log: niepoprawny wykonawca' USING ERRCODE = '22023';
  END IF;
  IF pg_column_size(p_metadata) > 4096 THEN
    RAISE EXCEPTION 'ops.log: metadane > 4 KB' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.audit_logs (action, entity_type, metadata)
  VALUES (p_action, 'ops', coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('actor', p_actor, 'source', 'telegram'));
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ops FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.status() TO ops_actor;
GRANT EXECUTE ON FUNCTION ops.queues() TO ops_actor;
GRANT EXECUTE ON FUNCTION ops.disable(text, text, text) TO ops_actor;
GRANT EXECUTE ON FUNCTION ops.log(text, text, jsonb) TO ops_actor;

COMMENT ON SCHEMA ops IS 'Bramka operatora (ops/bramka): tylko funkcje dla roli ops_actor. Krok 9 planu automatyzacji.';
