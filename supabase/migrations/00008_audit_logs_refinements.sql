-- Uzupełnienie audit_logs (Faza 2 miała już tabelę w 00001).
-- Uwaga: 00006/00007 to test RLS — ta migracja to 00008.

-- -----------------------------------------------------------------
-- Kolumny: tylko brakujące (00001 ma już tenant_id, user_id, action,
-- entity_*, ip_address, created_at, details_json).
-- -----------------------------------------------------------------
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- Spójność typów i domyślne wartości
ALTER TABLE public.audit_logs ALTER COLUMN action TYPE TEXT;
UPDATE public.audit_logs SET created_at = now() WHERE created_at IS NULL;
ALTER TABLE public.audit_logs ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.audit_logs ALTER COLUMN created_at SET DEFAULT now();

-- Kasowanie tenanta usuwa logi audytu tego tenanta (append-only per tenant)
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_tenant_id_fkey;
ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

-- -----------------------------------------------------------------
-- Indeksy (nowe nazwy; stary idx_audit_tenant zastępujemy wersją z DESC)
-- -----------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_audit_tenant;
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_time
  ON public.audit_logs(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
  ON public.audit_logs(entity_type, entity_id)
  WHERE entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_time
  ON public.audit_logs(action, created_at DESC);

-- -----------------------------------------------------------------
-- Uprawnienia: tylko odczyt dla authenticated (INSERT idzie service_role)
-- -----------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON TABLE public.audit_logs FROM authenticated;
GRANT SELECT ON TABLE public.audit_logs TO authenticated;

-- -----------------------------------------------------------------
-- RLS: odczyt własny tenant + brak UPDATE/DELETE (immutable)
-- -----------------------------------------------------------------
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_select_own_tenant" ON public.audit_logs;
CREATE POLICY "audit_logs_select_own_tenant"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS "audit_logs_no_update" ON public.audit_logs;
CREATE POLICY "audit_logs_no_update"
  ON public.audit_logs
  FOR UPDATE
  TO authenticated
  USING (false);

DROP POLICY IF EXISTS "audit_logs_no_delete" ON public.audit_logs;
CREATE POLICY "audit_logs_no_delete"
  ON public.audit_logs
  FOR DELETE
  TO authenticated
  USING (false);
