-- Migracja 00066: przełączniki funkcji agenta per konto (M8, krok 53 planu).
--
-- DLACZEGO OSOBNA TABELA, A NIE KOLUMNY W `tenant_feature_flags`:
-- tamta tabela ma jedną kolumnę BOOLEAN na flagę. Agent ma 33 funkcje, więc
-- ten kształt oznaczałby 33 kolumny i migrację przy każdej kolejnej — czyli
-- wdrożenie za każdym razem, gdy ktoś chce komuś wyłączyć jedną sprawę.
-- Tutaj wiersz powstaje TYLKO wtedy, gdy ustawienie odbiega od domyślnego.
-- Konto bez ani jednego wiersza ma wszystko włączone i nic nie kosztuje.
--
-- CZEGO TA TABELA NIE POTRAFI I NIE MA POTRAFIĆ: włączyć funkcji, która jest
-- zablokowana w kodzie (`lib/flo/flags.ts` — pozycje czekające na opinię
-- prawnika albo na potwierdzenie danych). Warstwa kodu jest NAD tą tabelą.
-- Gdyby było odwrotnie, wystarczyłby jeden UPDATE o drugiej w nocy, żeby
-- wypuścić na klienta funkcję, której nikt nie zatwierdził — a właśnie przed
-- tym miało chronić trzymanie tamtej listy w commicie.
--
-- Globalny wyłącznik CAŁEGO agenta siedzi osobno, w `global_feature_flags`
-- pod nazwą `killFloAgent` — bo ma działać w trzydzieści sekund, bez
-- wdrożenia i bez wiedzy o rodzajach propozycji.

CREATE TABLE IF NOT EXISTS public.flo_kind_flags (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Rodzaj propozycji (`FloProposalKind`). TEXT, nie ENUM — tak samo jak
  -- w `flo_proposals`: rodzajów przybywa, a ENUM wymagałby migracji za każdym.
  kind TEXT NOT NULL,
  enabled BOOLEAN NOT NULL,
  -- Powód wpisany przez operatora. Wyłącznik bez powodu po pół roku jest
  -- nie do odróżnienia od pomyłki i nikt nie odważy się go cofnąć.
  reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, kind)
);

ALTER TABLE public.flo_kind_flags ENABLE ROW LEVEL SECURITY;

-- Klient może zobaczyć, co ma wyłączone na swoim koncie — to jego ustawienie.
-- Zmieniać może wyłącznie service_role (panel operatora, akcje serwerowe).
DROP POLICY IF EXISTS "flo_kind_flags_tenant_select" ON public.flo_kind_flags;
CREATE POLICY "flo_kind_flags_tenant_select"
  ON public.flo_kind_flags
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

REVOKE INSERT, UPDATE, DELETE ON public.flo_kind_flags FROM authenticated;
REVOKE ALL ON public.flo_kind_flags FROM anon;

COMMENT ON TABLE public.flo_kind_flags IS
  'Przełączniki funkcji agenta FLO per konto (M8). Wiersz istnieje tylko '
  'przy odstępstwie od domyślnego „włączone". Warstwa NAD nią to lib/flo/'
  'flags.ts — tej tabeli nie wolno użyć do włączenia funkcji zablokowanej '
  'w kodzie.';

-- Globalny wyłącznik całego agenta. Wiersz zakładamy wyłączony; ma być
-- gotowy do przestawienia jednym UPDATE-em w czasie incydentu, a nie
-- tworzony wtedy od zera.
INSERT INTO public.global_feature_flags (flag, enabled, note)
VALUES (
  'killFloAgent',
  false,
  'Wyłącza CAŁEGO agenta FLO: żadna nowa propozycja nie powstaje. '
  'Pierwszy krok runbooku docs/runbooks/flo-incident.md.'
)
ON CONFLICT (flag) DO NOTHING;

NOTIFY pgrst, 'reload schema';
