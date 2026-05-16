-- Migracja 00050: MFA recovery codes (Faza 28 Krok 6 — Security Hardening)
--
-- Supabase MFA native obsługuje TOTP factors w `auth.mfa_factors`, ale NIE
-- generuje backup codes. Implementujemy je sami: 8 kodów per user,
-- scrypt-hashed, one-time-use.
--
-- Flow:
--   1. User włącza 2FA → enroll TOTP factor (Supabase) → generujemy 8 kodów.
--   2. Zapisujemy tylko hash + salt — plaintext pokazujemy raz, user musi
--      zapisać. Nigdy nie da się ich odzyskać.
--   3. Przy challenge user może wpisać TOTP code LUB recovery code.
--   4. Po użyciu recovery code → mark `used_at = now()`, nigdy więcej.
--   5. "Regenerate codes" w settings: soft-delete starych (delete) + INSERT 8 nowych.

CREATE TABLE IF NOT EXISTS public.mfa_recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- scrypt(code, salt) — hex
  code_hash TEXT NOT NULL,
  -- random salt per row — hex 32 chars (16 bytes)
  code_salt TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ
);

-- Najczęstszy access pattern: znaleźć nieużyte kody dla usera przy challenge.
CREATE INDEX IF NOT EXISTS idx_mfa_recovery_codes_user_unused
  ON public.mfa_recovery_codes(user_id)
  WHERE used_at IS NULL;

ALTER TABLE public.mfa_recovery_codes ENABLE ROW LEVEL SECURITY;

-- User widzi tylko swoje wpisy (potrzebne do liczenia "ile zostało" w UI).
-- Nie odczytuje hashu, ale wie ile mu zostało kodów do użycia.
DROP POLICY IF EXISTS "mfa_recovery_codes_own_select" ON public.mfa_recovery_codes;
CREATE POLICY "mfa_recovery_codes_own_select"
  ON public.mfa_recovery_codes
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- INSERT/UPDATE/DELETE robi WYŁĄCZNIE service_role przez Server Actions
-- (klient nie może generować kodów ani markować ich jako użyte).
REVOKE INSERT, UPDATE, DELETE ON TABLE public.mfa_recovery_codes FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.mfa_recovery_codes FROM anon;

GRANT SELECT ON TABLE public.mfa_recovery_codes TO authenticated;
