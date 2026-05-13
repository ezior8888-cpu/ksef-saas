-- ═══════════════════════════════════════════════════════════════
-- Faza 24 — Admin Panel (sekcja 24.1)
-- ═══════════════════════════════════════════════════════════════
-- Cel: tabela `admin_user_notes` na wewnętrzne notatki operatora przy
-- userze (np. "klient zgłaszał, że karta odrzucona — sprawdzić Stripe",
-- "ID weryfikacji KSeF: 12345 — sprawa otwarta w MF").
--
-- Bez tego operator zapomina kontekst między ticketami, support staje się
-- gra w głuchy telefon przy 100+ klientach.
--
-- RLS: tabela jest service_role-only. Klient nie widzi swoich notek
-- (są wewnętrzne!) ani innych userów. Wszystkie INSERT/SELECT przez
-- `lib/admin/*` z admin client.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.admin_user_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Target user — czyja notatka.
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Author — kto napisał (zwykle Ty lub kolega). Może być NULL gdy author
  -- został usunięty z systemu (nie chcemy cascade'ować całej notki).
  author_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Email author'a w momencie pisania — backup gdy `author_user_id` zostanie
  -- usunięty (audit-friendly snapshot).
  author_email TEXT NOT NULL,
  body        TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  -- Soft delete — admin może archiwizować stare notki bez tracenia historii.
  archived_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Najczęstszy query: "pokaż mi wszystkie notki dla usera X, najnowsze pierwsze".
CREATE INDEX IF NOT EXISTS idx_admin_notes_user_created
  ON public.admin_user_notes (user_id, created_at DESC)
  WHERE archived_at IS NULL;

-- Sekundarny query: "wszystkie notki napisane przez admin X" (audit jego pracy).
CREATE INDEX IF NOT EXISTS idx_admin_notes_author_created
  ON public.admin_user_notes (author_user_id, created_at DESC);

-- Auto-touch updated_at — trigger `set_updated_at` istnieje od 00024.
DROP TRIGGER IF EXISTS trigger_admin_user_notes_updated_at ON public.admin_user_notes;
CREATE TRIGGER trigger_admin_user_notes_updated_at
  BEFORE UPDATE ON public.admin_user_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════
-- RLS — service_role only
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.admin_user_notes ENABLE ROW LEVEL SECURITY;

-- Klient JWT (anon + authenticated) nie ma żadnego dostępu. Brak SELECT
-- policy = wszystko zablokowane domyślnie.
REVOKE ALL ON public.admin_user_notes FROM anon, authenticated;

-- service_role omija RLS, więc nie potrzebuje policy. Wszystko admin
-- robi przez `createAdminClient()` z `lib/supabase/admin.ts`.
GRANT ALL ON public.admin_user_notes TO service_role;

COMMENT ON TABLE public.admin_user_notes IS
  'Wewnętrzne notatki operatora (Faza 24). Service-role-only — klient ich nie widzi.';

-- ═══════════════════════════════════════════════════════════════
-- ADMIN ACTIONS AUDIT — dedykowane akcje w `audit_logs.action`
-- ═══════════════════════════════════════════════════════════════
-- Nie tworzymy osobnej tabeli — `audit_logs` jest już źródłem prawdy.
-- Konwencja akcji admin: prefix `admin.*`:
--
--   admin.note.created      — utworzono notatkę
--   admin.note.archived     — zarchiwizowano notatkę
--   admin.user.suspended    — zawieszono konto
--   admin.user.unsuspended  — wznowiono konto
--   admin.user.force_logout — wymuszono wylogowanie wszystkich sesji
--   admin.user.password_reset_triggered
--   admin.user.trial_extended
--   admin.user.deleted      — kasowanie GDPR
--   admin.flag.toggled      — zmiana feature flag dla tenanta
--
-- Te wartości są wpisywane do `audit_logs.action` przez `lib/admin/*`.
-- Lista w `lib/audit/log.ts::AuditAction` rozszerzy się przy implementacji
-- konkretnych akcji (Krok 2 Fazy 24).
