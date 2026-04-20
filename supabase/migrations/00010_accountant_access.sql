-- ═══════════════════════════════════════════════════════════════
-- Faza 7.4: Dostęp księgowej — rozszerzenie accountant_access (00001).
-- Uwaga: 00008 to audit_logs — ta migracja to 00010.
-- W DB trzymamy wyłącznie SHA-256 tokenu (token_hash), nie plaintext.
-- ═══════════════════════════════════════════════════════════════

-- Nowe kolumny (id, tenant_id, accountant_email, access_level, granted_at, expires_at już są w 00001)
ALTER TABLE public.accountant_access
  ADD COLUMN IF NOT EXISTS accountant_name TEXT;
ALTER TABLE public.accountant_access
  ADD COLUMN IF NOT EXISTS token_hash TEXT;
ALTER TABLE public.accountant_access
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
ALTER TABLE public.accountant_access
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;
ALTER TABLE public.accountant_access
  ADD COLUMN IF NOT EXISTS use_count INT NOT NULL DEFAULT 0;
ALTER TABLE public.accountant_access
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES public.users(id);
ALTER TABLE public.accountant_access
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Poziom dostępu: read_only | download (mapowanie ze starego read | export)
ALTER TABLE public.accountant_access DROP CONSTRAINT IF EXISTS accountant_access_access_level_check;
UPDATE public.accountant_access SET access_level = 'read_only' WHERE access_level = 'read';
UPDATE public.accountant_access SET access_level = 'download' WHERE access_level = 'export';
UPDATE public.accountant_access
  SET access_level = 'read_only'
  WHERE access_level IS NULL OR access_level NOT IN ('read_only', 'download');
ALTER TABLE public.accountant_access
  ADD CONSTRAINT accountant_access_access_level_check
  CHECK (access_level IN ('read_only', 'download'));
ALTER TABLE public.accountant_access
  ALTER COLUMN access_level SET DEFAULT 'read_only';

-- Wiersze bez token_hash (stare zaproszenia) — usuwamy; nie da się ich zweryfikować.
DELETE FROM public.accountant_access WHERE token_hash IS NULL;

-- Nazwa księgowej — z emaila jeśli brak
UPDATE public.accountant_access
SET accountant_name = split_part(accountant_email, '@', 1)
WHERE accountant_name IS NULL OR trim(accountant_name) = '';

ALTER TABLE public.accountant_access
  ALTER COLUMN accountant_name SET NOT NULL;

ALTER TABLE public.accountant_access
  ALTER COLUMN token_hash SET NOT NULL;

DO $uniq$
BEGIN
  ALTER TABLE public.accountant_access
    ADD CONSTRAINT accountant_access_token_hash_key UNIQUE (token_hash);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $uniq$;

UPDATE public.accountant_access
SET expires_at = COALESCE(expires_at, now() + interval '90 days')
WHERE expires_at IS NULL;

ALTER TABLE public.accountant_access
  ALTER COLUMN expires_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_accountant_access_token_hash
  ON public.accountant_access (token_hash);

CREATE INDEX IF NOT EXISTS idx_accountant_access_tenant_active
  ON public.accountant_access (tenant_id)
  WHERE revoked_at IS NULL;

-- RLS: zastępujemy polityki z 00002 jedną spójną (tylko owner zarządza)
DROP POLICY IF EXISTS "accountant_access_select_own_tenant" ON public.accountant_access;
DROP POLICY IF EXISTS "accountant_access_manage_by_owner" ON public.accountant_access;
DROP POLICY IF EXISTS "accountant_access_owner_manage" ON public.accountant_access;

CREATE POLICY "accountant_access_owner_manage"
  ON public.accountant_access
  FOR ALL
  TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.users AS u
      WHERE u.id = auth.uid() AND u.role = 'owner'
    )
  )
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.users AS u
      WHERE u.id = auth.uid() AND u.role = 'owner'
    )
  );

REVOKE ALL ON TABLE public.accountant_access FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.accountant_access TO authenticated;
