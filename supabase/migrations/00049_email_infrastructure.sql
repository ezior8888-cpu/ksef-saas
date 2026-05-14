-- ═══════════════════════════════════════════════════════════════
-- Faza 26 — Email Infrastructure & Deliverability (migracja 00049)
-- (W worktree Claude: 00047 — tu 00049, bo 00047 to billing_stripe w main.)
-- ═══════════════════════════════════════════════════════════════
-- Cel: bez tego 30% emaili leci do spamu (bez DKIM/SPF/DMARC) + brak
-- one-click unsubscribe → narusza RFC 8058 i CAN-SPAM, Resend automatycznie
-- obniża reputację domeny.
--
-- Tabele:
--   1. `email_preferences` — per user (auth.users) + kategoria emaila.
--      Transactional zawsze ON (force-required dla faktur, KSeF UPO etc.),
--      product_updates + marketing OPT-OUT.
--   2. `email_bounces` — log hard/soft/complaint z Resend webhook. Hard
--      bounce → auto-deactivate wszystkie kategorie poza transactional.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Kategorie emaili ───────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.email_category_enum AS ENUM (
    -- ZAWSZE WŁĄCZONE (RFC 6377 — service-critical). User nie może
    -- wyłączyć faktur, hasła reset, KSeF rejection.
    'transactional',
    -- Welcome, Magic Import done, miesięczne paczki Co-Pilot — OPT-OUT.
    'product_updates',
    -- Re-engagement, blog news, feature announcements — OPT-OUT.
    'marketing'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── 2. email_preferences ──────────────────────────────────────────────
--
-- Granularna kontrola: per user × per kategoria. Brak wiersza =
-- domyślnie subscribed (opt-out model). Wiersz z `unsubscribed_at` =
-- user explicit'nie wyłączył.

CREATE TABLE IF NOT EXISTS public.email_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category public.email_category_enum NOT NULL,
  unsubscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Skąd przyszła rezygnacja — debug + analytics. Wartości:
  --   'one_click' (List-Unsubscribe-Post header), 'settings_ui',
  --   'hard_bounce_auto', 'complaint_auto', 'admin'.
  source TEXT NOT NULL,
  -- Opcjonalny komentarz (np. od UI: "Za dużo emaili").
  reason TEXT
);

-- UNIQUE: jedno wycofanie subskrypcji per user × kategoria.
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_preferences_user_category
  ON public.email_preferences (user_id, category);

-- Dla `isEmailDeactivated(email)` query — IDX po user_id wystarczy
-- (UNIQUE powyżej i tak jest indexem).

-- RLS: SELECT own, INSERT/DELETE own (one-click unsubscribe wywołuje
-- z user-context jeśli user jest zalogowany; gdy nie — webhook handler
-- używa service_role).
ALTER TABLE public.email_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_preferences FROM anon;
GRANT SELECT, INSERT, DELETE ON public.email_preferences TO authenticated;

DROP POLICY IF EXISTS email_preferences_select_own ON public.email_preferences;
CREATE POLICY email_preferences_select_own ON public.email_preferences
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS email_preferences_insert_own ON public.email_preferences;
CREATE POLICY email_preferences_insert_own ON public.email_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS email_preferences_delete_own ON public.email_preferences;
CREATE POLICY email_preferences_delete_own ON public.email_preferences
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

COMMENT ON TABLE public.email_preferences IS
  'Per-user opt-out dla kategorii emaili (Faza 26). Brak wiersza = subscribed.';

-- ─── 3. email_bounces ─────────────────────────────────────────────────
--
-- Hard bounce = mailbox nie istnieje / domena martwa → automatycznie
-- unsubscribe'ujemy wszystkie kategorie POZA transactional (te są
-- service-critical i tak będą się retry'ować przez Resend).
--
-- Soft bounce = mailbox full / temporary → tylko log, nie deactivate.
--
-- Complaint = user kliknął "Mark as spam" w Gmail/Outlook → INSTANT
-- unsubscribe wszystkich kategorii (włącznie z transactional dla
-- bezpieczeństwa reputacji).

DO $$ BEGIN
  CREATE TYPE public.email_bounce_type_enum AS ENUM (
    'hard',
    'soft',
    'complaint',
    'delivery_delay'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.email_bounces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Email adres recipenta (case-insensitive — lower'd przez aplikację).
  -- Nie referujemy auth.users(email) bo bounces mogą dotyczyć adresów
  -- które już nie istnieją (np. księgowa = `account@deleted-domain.pl`).
  email TEXT NOT NULL,
  bounce_type public.email_bounce_type_enum NOT NULL,
  -- Powód z Resend (np. "mailbox_full", "blocked", "no_email").
  reason TEXT,
  -- Resend webhook event id — idempotency.
  resend_event_id TEXT UNIQUE,
  -- Surowy payload z webhook'a — debugging.
  raw_payload JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_bounces_email_time
  ON public.email_bounces (email, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_bounces_type
  ON public.email_bounces (bounce_type, occurred_at DESC);

ALTER TABLE public.email_bounces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_bounces FROM anon, authenticated;
GRANT ALL ON public.email_bounces TO service_role;

COMMENT ON TABLE public.email_bounces IS
  'Resend bounce/complaint log (Faza 26). service-role-only — admin czyta przez admin client.';
