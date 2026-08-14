-- ═══════════════════════════════════════════════════════════════
-- 00059: Zapisy na newsletter bloga (audyt przedlaunchowy, blok A)
--
-- Formularz na /blog był dotąd atrapą („zapis demonstracyjny"). Ta tabela
-- robi z niego prawdziwy zapis: e-mail + źródło + timestamp zgody (RODO —
-- data zapisu dokumentuje moment wyrażenia zgody marketingowej).
--
-- Wysyłka newslettera (Resend audience / Listmonk po migracji Hetzner)
-- czyta z tej tabeli — DB jest źródłem prawdy, nie zewnętrzny SaaS.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Normalizacja (trim + lowercase) po stronie aplikacji PRZED insertem;
  -- UNIQUE na kolumnie wystarcza wtedy jako deduplikacja.
  email TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'blog',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Wypis (RODO): rekord zostaje z timestampem zamiast DELETE, żeby ponowny
  -- zapis tego samego adresu nie wyglądał jak „nowa zgoda" bez historii.
  unsubscribed_at TIMESTAMPTZ
);

COMMENT ON TABLE public.newsletter_subscribers IS
  'Zapisy na newsletter z formularzy publicznych (blog). Zapis wyłącznie przez service_role (Server Action z walidacją + rate limit + honeypot).';

-- RLS bez żadnych polityk = deny-all dla anon/authenticated.
-- Jedyna ścieżka zapisu/odczytu to service_role (omija RLS).
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
