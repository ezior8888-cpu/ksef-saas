-- Migracja 00061: Agent FLO — sześć tabel warstwy decyzyjnej.
--
-- FLO to agent, który sam obserwuje dane klienta, sam przygotowuje robotę
-- i zaczepia człowieka dopiero wtedy, gdy została jedna decyzja. Cała
-- specyfikacja zachowania: FLO-PLAN-BARTOSZ.md, część II.
--
-- flo_proposals — serce agenta; jeden wiersz = jedna karta w interfejsie
-- flo_approvals — żeton zgody; BEZ WIERSZA TUTAJ NIC NIE WYJDZIE NA ZEWNĄTRZ
-- flo_decisions — pamięć decyzji → wyciszanie typów po dwóch odrzuceniach
-- flo_prefs     — ustawienia kanałów + profil podatkowy
-- flo_usage     — zużycie modelu na konto na dobę (bezpiecznik kosztowy)
-- flo_shadow    — tryb cichy: co agent by pokazał vs co klient zrobił
--
-- UWAGA PROJEKTOWA: nie ma tu kolumny „poziom autonomii". Zachowanie agenta
-- jest identyczne u każdego klienta: czynności odwracalne wewnątrz konta FLO
-- robi sam (z cofnięciem przez 10 minut), a wszystko nieodwracalne albo
-- wychodzące na zewnątrz wymaga kliknięcia człowieka — zawsze, bez wyjątku
-- i bez możliwości wyłączenia. To decyzja właściciela produktu, nie
-- niedopatrzenie: przełącznik, o którym ktoś zapomni, że go włączył, jest
-- gorszy od braku funkcji.

-- ═══════════════════════════════════════════════════════════════
-- flo_proposals
-- ═══════════════════════════════════════════════════════════════

-- `kind` celowo TEXT, nie ENUM: rodzajów propozycji jest 33 i będą
-- przybywać. ENUM wymagałby migracji przy każdym nowym rodzaju, a wartości
-- i tak waliduje Zod na granicy kolejki (typ FloProposalKind w types/flo.ts).
-- `status` odwrotnie — mały, zamknięty zbiór, więc CHECK pilnuje go w bazie.
CREATE TABLE IF NOT EXISTS public.flo_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  -- kontrahent + rodzaj + okres; klucz deduplikacji (jeden temat = jedna karta)
  topic_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN (
      'open',      -- czeka na decyzję człowieka
      'approved',  -- zatwierdzona, czeka na wykonanie
      'executing', -- wykonanie w toku
      'done',      -- wykonana
      'expired',   -- minął termin ważności
      'dismissed', -- odrzucona przez człowieka
      'blocked'    -- warunek techniczny niespełniony (np. brak certyfikatu)
    )),
  -- 0 = najpilniejsze; kolejność w wątku wynika z priorytetu, nie z czasu
  priority SMALLINT NOT NULL DEFAULT 50,
  -- gotowy tekst z PODSTAWIONYMI liczbami — model językowy nigdy nie pisze kwot
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  -- argumenty akcji do wykonania (kształt zależny od `kind`)
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- [{label, href}] → „dlaczego to widzę". Wyłącznie identyfikatory i etykiety,
  -- nigdy treść dokumentu: usunięcie faktury usuwa też treść dowodu (RODO).
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- odcisk danych, na których powstała propozycja; liczony ponownie przy
  -- kliknięciu. Różnica = brak wykonania i komunikat, co się zmieniło.
  fingerprint TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  executed_at TIMESTAMPTZ,
  -- 'not_now' | 'never' | 'auto_expired' | 'stale'
  dismissed_reason TEXT
);

-- Jeden temat = najwyżej jedna ŻYWA propozycja. Nowa wiedza aktualizuje
-- istniejącą kartę zamiast tworzyć drugą — bez tego agent potrafiłby
-- przeczyć sam sobie w dwóch kartach obok siebie.
CREATE UNIQUE INDEX IF NOT EXISTS flo_proposals_topic_live
  ON public.flo_proposals (tenant_id, topic_key)
  WHERE status IN ('open', 'approved');

-- Hot-path: wątek /flo i karta na dashboardzie.
CREATE INDEX IF NOT EXISTS flo_proposals_open
  ON public.flo_proposals (tenant_id, status, priority, created_at DESC);

-- Cron wygaszający przeterminowane.
CREATE INDEX IF NOT EXISTS flo_proposals_expiring
  ON public.flo_proposals (expires_at)
  WHERE status IN ('open', 'approved');

-- ═══════════════════════════════════════════════════════════════
-- flo_approvals — żeton zgody
-- ═══════════════════════════════════════════════════════════════

-- Każda funkcja wychodząca (wysyłka do KSeF, mail do kontrahenta, paczka do
-- księgowej) przyjmuje obowiązkowy approvalId i sprawdza tutaj: czy istnieje,
-- czy dotyczy tej propozycji, czy nie został zużyty, czy nie wygasł.
-- Brak żetonu = wyjątek, nigdy „domyślne przepuszczenie".
--
-- `snapshot` przechowuje DOKŁADNIE to, co człowiek widział, klikając —
-- przy reklamacji „ja tego nie wysyłałem" to jest dowód.
--
-- user_id bez FK do auth.users z ON DELETE SET NULL, tylko CASCADE przez
-- proposal → tenant: prawny ślad zgody żyje w audit_logs (niemutowalnych),
-- a te wiersze znikają razem z kontem przy realizacji prawa do usunięcia.
CREATE TABLE IF NOT EXISTS public.flo_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL
    REFERENCES public.flo_proposals(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at TIMESTAMPTZ,
  -- krótkie okno: zgoda sprzed pół godziny nie jest już zgodą na teraz
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 minutes')
);

CREATE INDEX IF NOT EXISTS flo_approvals_proposal
  ON public.flo_approvals (proposal_id, created_at DESC);

-- Jeden żeton na propozycję w stanie niezużytym — druga zgoda na to samo
-- nie ma prawa powstać, dopóki pierwsza nie została skonsumowana.
CREATE UNIQUE INDEX IF NOT EXISTS flo_approvals_live
  ON public.flo_approvals (proposal_id)
  WHERE consumed_at IS NULL;

-- ═══════════════════════════════════════════════════════════════
-- flo_decisions — pamięć i wyciszanie
-- ═══════════════════════════════════════════════════════════════

-- Dwa odrzucenia tego samego rodzaju = wyciszenie na 90 dni. Agent, który
-- wraca z tym samym pytaniem po trzecim „nie", uczy ludzi ignorowania
-- wszystkich powiadomień, także tych trafnych.
CREATE TABLE IF NOT EXISTS public.flo_decisions (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  accepted INTEGER NOT NULL DEFAULT 0,
  dismissed INTEGER NOT NULL DEFAULT 0,
  muted_until TIMESTAMPTZ,
  last_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, kind)
);

-- ═══════════════════════════════════════════════════════════════
-- flo_prefs — ustawienia kanałów + profil podatkowy
-- ═══════════════════════════════════════════════════════════════

-- Cztery ustawienia i profil podatkowy. Nic więcej. W szczególności NIE MA
-- tu poziomu autonomii ani przełącznika „wysyłaj automatycznie" czegokolwiek.
--
-- tax_profile jest warunkiem koniecznym całej grupy funkcji podatkowych:
-- bez niego agent MILCZY w sprawach podatków, zamiast zgadywać formę
-- opodatkowania i straszyć klienta terminem, który go nie dotyczy.
CREATE TABLE IF NOT EXISTS public.flo_prefs (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  push_enabled BOOLEAN NOT NULL DEFAULT true,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  quiet_from TIME NOT NULL DEFAULT '21:00',
  quiet_to TIME NOT NULL DEFAULT '07:30',
  -- rodzaje wyciszone ręcznie albo automatycznie po dwóch odrzuceniach
  muted_kinds TEXT[] NOT NULL DEFAULT '{}',
  -- {form, vat, period, startedOn} — NULL = grupa podatkowa milczy
  tax_profile JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════
-- flo_usage — bezpiecznik kosztowy
-- ═══════════════════════════════════════════════════════════════

-- Przy cenie 39,99 zł brutto (32,51 zł netto) budżet modelu to 0,95 zł na
-- klienta miesięcznie, twardy limit 3,00 zł. Po przekroczeniu agent działa
-- dalej na regułach i szablonach — klient traci elokwencję, nie funkcje.
-- Dane operatorskie: klient ich nie widzi (brak polityki SELECT poniżej).
CREATE TABLE IF NOT EXISTS public.flo_usage (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
  calls INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, day)
);

CREATE INDEX IF NOT EXISTS flo_usage_day
  ON public.flo_usage (day DESC);

-- ═══════════════════════════════════════════════════════════════
-- flo_shadow — tryb cichy
-- ═══════════════════════════════════════════════════════════════

-- Nowa funkcja przez pierwsze tygodnie generuje propozycje NIEWIDOCZNE dla
-- klienta. Operator porównuje je z tym, co klient zrobił naprawdę, i dopiero
-- po przekroczeniu progu trafności funkcja wychodzi z ukrycia. Dzięki temu
-- nikt nie ogląda wersji, której skuteczności nie znamy.
CREATE TABLE IF NOT EXISTS public.flo_shadow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  -- co agent by pokazał
  proposal JSONB NOT NULL,
  -- co klient zrobił naprawdę (uzupełniane później przez zadanie porównujące)
  actual JSONB,
  matched BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS flo_shadow_kind
  ON public.flo_shadow (kind, created_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.flo_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flo_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flo_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flo_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flo_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flo_shadow ENABLE ROW LEVEL SECURITY;

-- Klient czyta propozycje swojej aktywnej organizacji.
DROP POLICY IF EXISTS "flo_proposals_tenant_select" ON public.flo_proposals;
CREATE POLICY "flo_proposals_tenant_select"
  ON public.flo_proposals
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

-- Klient widzi ślad własnych zgód — panel „Zatwierdzone, czeka na wykonanie"
-- pokazuje przy każdej pozycji, kiedy i czym została zatwierdzona.
DROP POLICY IF EXISTS "flo_approvals_tenant_select" ON public.flo_approvals;
CREATE POLICY "flo_approvals_tenant_select"
  ON public.flo_approvals
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

-- Ekran ustawień pokazuje, co zostało wyciszone i pozwala to przywrócić.
DROP POLICY IF EXISTS "flo_decisions_tenant_select" ON public.flo_decisions;
CREATE POLICY "flo_decisions_tenant_select"
  ON public.flo_decisions
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS "flo_prefs_tenant_select" ON public.flo_prefs;
CREATE POLICY "flo_prefs_tenant_select"
  ON public.flo_prefs
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

-- flo_usage i flo_shadow NIE MAJĄ polityki SELECT dla `authenticated`.
-- RLS włączony bez polityki = odmowa dla wszystkich poza service_role.
-- To dane operatorskie (koszt modelu, trafność funkcji w trybie cichym) —
-- klient nie ma powodu ich oglądać, a my nie mamy powodu ich pokazywać.

-- Zapis wyłącznie przez service_role: worker (cron flo.tick) i akcje
-- serwerowe po uprzedniej weryfikacji auth.getUser(). Ta sama konwencja co
-- w migracjach 00054 i 00047.
REVOKE INSERT, UPDATE, DELETE ON public.flo_proposals FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.flo_approvals FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.flo_decisions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.flo_prefs FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.flo_usage FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.flo_shadow FROM authenticated;

REVOKE ALL ON public.flo_proposals FROM anon;
REVOKE ALL ON public.flo_approvals FROM anon;
REVOKE ALL ON public.flo_decisions FROM anon;
REVOKE ALL ON public.flo_prefs FROM anon;
REVOKE ALL ON public.flo_usage FROM anon;
REVOKE ALL ON public.flo_shadow FROM anon;
