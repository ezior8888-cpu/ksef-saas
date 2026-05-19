-- Migracja 00054: AI Support System (Faza 30).
--
-- Własny AI support chat (decyzja: nie Crisp.chat — dane RODO-friendly,
-- zero kosztów SaaS, integracja z naszym KB).
--
-- support_conversations — jeden wątek wsparcia (user ↔ AI ↔ ewent. human)
-- support_messages      — pojedyncze wiadomości w wątku
--
-- Konwersacja należy do USERA (nie tenanta) — wsparcie jest osobiste.
-- `tenant_id` to tylko kontekst (aktywna org gdy zaczął chat) dla admina.

DO $$ BEGIN
  CREATE TYPE public.support_conversation_status AS ENUM (
    'open',       -- trwa, AI obsługuje
    'escalated',  -- AI nie poradził → czeka na człowieka
    'resolved',   -- zamknięte z sukcesem
    'closed'      -- zamknięte bez rozwiązania / porzucone
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.support_message_role AS ENUM ('user', 'assistant', 'system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.support_category AS ENUM (
    'onboarding',
    'ksef',
    'invoicing',
    'ocr_kpir',
    'billing',
    'team',
    'security',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.support_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- kontekst org — SET NULL gdy tenant usunięty (konwersacja zostaje przy userze)
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  -- właściciel — SET NULL przy GDPR delete (zostaje anon konwersacja do statystyk)
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status public.support_conversation_status NOT NULL DEFAULT 'open',
  -- auto-tag przez AI (Krok 7)
  category public.support_category,
  -- skrót pierwszego pytania — lista w admin /support
  subject TEXT,
  -- CSAT: NULL = brak oceny, true = 👍, false = 👎
  csat_positive BOOLEAN,
  csat_comment TEXT,
  escalated_at TIMESTAMPTZ,
  escalation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL
    REFERENCES public.support_conversations(id) ON DELETE CASCADE,
  role public.support_message_role NOT NULL,
  content TEXT NOT NULL,
  -- slugi artykułów KB zacytowanych przez AI w tej odpowiedzi
  cited_articles TEXT[],
  -- AI zaznaczył że nie zna odpowiedzi (sygnał do eskalacji)
  ai_uncertain BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_conv_user
  ON public.support_conversations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_conv_tenant
  ON public.support_conversations(tenant_id, created_at DESC);
-- Hot-path admin: otwarte / eskalowane wątki do obsługi.
CREATE INDEX IF NOT EXISTS idx_support_conv_open
  ON public.support_conversations(status, created_at DESC)
  WHERE status IN ('open', 'escalated');
CREATE INDEX IF NOT EXISTS idx_support_msg_conv
  ON public.support_messages(conversation_id, created_at);

ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- User czyta własne konwersacje (widget pokazuje historię).
DROP POLICY IF EXISTS "support_conv_own_select" ON public.support_conversations;
CREATE POLICY "support_conv_own_select"
  ON public.support_conversations
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- User czyta wiadomości w swoich konwersacjach.
DROP POLICY IF EXISTS "support_msg_own_select" ON public.support_messages;
CREATE POLICY "support_msg_own_select"
  ON public.support_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.support_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  );

-- INSERT/UPDATE/DELETE wyłącznie service_role — API route + Server Actions
-- piszą po uprzedniej weryfikacji auth.getUser().
REVOKE INSERT, UPDATE, DELETE ON public.support_conversations FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.support_messages FROM authenticated;
REVOKE ALL ON public.support_conversations FROM anon;
REVOKE ALL ON public.support_messages FROM anon;
