-- Migracja 00051: GDPR deletion requests (Faza 28 Krok 7).
--
-- Right to be forgotten (RODO art. 17). User żąda usunięcia konta → wpis
-- w tej tabeli z `scheduled_for = now() + 14 dni` (cooling-off period
-- ustalony w Q2 planowania Fazy 28).
--
-- Po 14 dniach Inngest cron sprawdza pending requests i wykonuje delete:
--   1. Anonimizuje audit_logs (user_id NULL, ip_address NULL)
--   2. Usuwa wszystkie memberships
--   3. Hard-delete public.users (CASCADE leci do FK w pozostałych tabelach)
--   4. supabase.auth.admin.deleteUser() — usuwa auth.users (źródło sesji)
--
-- Faktury podlegają 10-letniej retencji prawnej (RODO art. 17 ust. 3 lit. b
-- — obowiązek prawny) — zostają w bazie organizacji, ale `created_by_user`
-- i podobne FK są nullowane.
--
-- Cancel: user dostaje email z linkiem zawierającym `cancel_token`. Klika
-- przed scheduled_for → status='canceled'. Token = 32 bajty random hex.

DO $$ BEGIN
  CREATE TYPE public.gdpr_deletion_status AS ENUM (
    'pending',
    'canceled',
    'executed',
    'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.gdpr_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ON DELETE SET NULL żeby po wykonaniu delete (auth.users hard delete)
  -- audit ścieżki request → status='executed' został w bazie do compliance.
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  scheduled_for TIMESTAMPTZ NOT NULL,
  status public.gdpr_deletion_status NOT NULL DEFAULT 'pending',
  cancel_token TEXT NOT NULL,
  executed_at TIMESTAMPTZ,
  failure_reason TEXT,
  cancel_reason TEXT,
  ip_address TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_gdpr_deletion_user
  ON public.gdpr_deletion_requests(user_id)
  WHERE user_id IS NOT NULL;

-- Hot-path Inngest cron: znaleźć pending z scheduled_for <= now().
CREATE INDEX IF NOT EXISTS idx_gdpr_deletion_pending_due
  ON public.gdpr_deletion_requests(scheduled_for)
  WHERE status = 'pending';

-- cancel_token lookup w publicznej stronie /gdpr/cancel.
CREATE UNIQUE INDEX IF NOT EXISTS idx_gdpr_deletion_cancel_token
  ON public.gdpr_deletion_requests(cancel_token);

ALTER TABLE public.gdpr_deletion_requests ENABLE ROW LEVEL SECURITY;

-- User widzi tylko swoje requesty (do UI pokazującego status).
DROP POLICY IF EXISTS "gdpr_deletion_own_select"
  ON public.gdpr_deletion_requests;
CREATE POLICY "gdpr_deletion_own_select"
  ON public.gdpr_deletion_requests
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- INSERT/UPDATE/DELETE wyłącznie service_role (Server Actions + Inngest).
REVOKE INSERT, UPDATE, DELETE
  ON TABLE public.gdpr_deletion_requests FROM authenticated;
REVOKE INSERT, UPDATE, DELETE
  ON TABLE public.gdpr_deletion_requests FROM anon;
GRANT SELECT ON TABLE public.gdpr_deletion_requests TO authenticated;
