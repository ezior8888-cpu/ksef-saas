-- Migracja 00067: stan wdrożenia kanarkowego funkcji agenta (krok 55 planu).
--
-- Funkcje o promieniu rażenia 4 — dokument w rejestrze państwowym albo
-- wiadomość u obcej osoby — nie wychodzą na wszystkich naraz. Idą przez
-- 10% kont, potem 50%, potem 100%, z tygodniem na każdym etapie.
--
-- DLACZEGO STAN JEST W BAZIE, A NIE W KODZIE: rozwijanie i zatrzymywanie
-- dzieje się W TRAKCIE TYGODNIA, często w reakcji na jedno zgłoszenie.
-- Wdrożenie trwa kilkanaście minut, a zatrzymanie rozwijania ma być
-- natychmiastowe. To jest dokładnie odwrotny przypadek niż lista blokad
-- prawnych w `lib/flo/flags.ts`, która MA wymagać commita.
--
-- `complaints` liczy zgłoszenia klientów przypisane do tej funkcji.
-- Reguła z planu jest twarda: JEDNA REKLAMACJA ZATRZYMUJE ROZWIJANIE.
-- Nie cofa etapu — cofnięcie jest decyzją człowieka, bo bywa, że zgłoszenie
-- dotyczy czegoś, co i tak trzeba naprawić niezależnie od zasięgu.

CREATE TABLE IF NOT EXISTS public.flo_rollout (
  -- Rodzaj propozycji (`FloProposalKind`).
  kind TEXT PRIMARY KEY,
  -- Odsetek kont, dla których funkcja jest odsłonięta.
  stage SMALLINT NOT NULL DEFAULT 0
    CHECK (stage IN (0, 10, 50, 100)),
  -- Od kiedy trwa bieżący etap. NULL przy etapie 0.
  stage_since TIMESTAMPTZ,
  -- Zgłoszenia klientów przypisane do tej funkcji.
  complaints INTEGER NOT NULL DEFAULT 0,
  -- Rozwijanie wstrzymane ręcznie albo przez zgłoszenie.
  halted BOOLEAN NOT NULL DEFAULT false,
  halt_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.flo_rollout ENABLE ROW LEVEL SECURITY;

-- Dane operatorskie. Klient nie ma powodu wiedzieć, że jest w kanarku —
-- ta wiedza zmieniałaby jego zachowanie, a my mierzymy właśnie zachowanie.
-- RLS włączony bez polityki SELECT = odmowa dla wszystkich poza service_role.

REVOKE INSERT, UPDATE, DELETE ON public.flo_rollout FROM authenticated;
REVOKE ALL ON public.flo_rollout FROM anon;

COMMENT ON TABLE public.flo_rollout IS
  'Etap wdrożenia kanarkowego per rodzaj propozycji (krok 55 planu FLO). '
  'Brak wiersza = funkcja jeszcze nieodsłonięta. Jedno zgłoszenie klienta '
  'zatrzymuje rozwijanie, ale nie cofa etapu — cofnięcie jest decyzją '
  'człowieka.';

NOTIFY pgrst, 'reload schema';
