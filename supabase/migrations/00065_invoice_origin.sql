-- Migracja 00065: trwały znacznik pochodzenia faktury.
--
-- Potrzebne funkcji O-02 agenta FLO (krok 46 planu).
--
-- PROBLEM: dziś pochodzenie dokumentu da się odczytać wyłącznie z dwóch
-- miejsc, z których żadne nie jest trwałe:
--   - `notes` z prefiksem „[import] …" — pole EDYTOWALNE PRZEZ KLIENTA.
--     Jedna poprawka notatki i dokument przestaje być rozpoznawalny jako
--     zaimportowany;
--   - `fa3_data.import.source` — w blobie JSONB, który bywa przepisywany.
--
-- Dlaczego to ma znaczenie: agent MUSI wykluczyć dokumenty z importu
-- z dwóch rzeczy.
--   1. Ocena terminowości kontrahenta (K-03). Historia zaciągnięta z KSeF nie
--      niesie informacji o tym, kiedy faktura została zapłacona — liczenie jej
--      do oceny dałoby każdemu kontrahentowi ocenę „nie płaci".
--   2. Kontrola ciągłości numeracji. Zaimportowana historia ma numerację
--      z innego programu; wpuszczenie jej do kontroli oznacza alarm o luce
--      przy każdym koncie, które cokolwiek zaimportowało.
--
-- Kolumna z ograniczeniem CHECK zamiast kolejnego pola tekstowego: zbiór jest
-- mały i zamknięty, a literówka w wartości oznacza dokument liczony do oceny,
-- który nie powinien.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'app';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_origin_check'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_origin_check
      CHECK (origin IN ('app', 'ksef_import', 'ksef_inbox', 'file_import', 'ocr'));
  END IF;
END $$;

COMMENT ON COLUMN public.invoices.origin IS
  'Skąd wziął się dokument. Znacznik TRWAŁY — w odróżnieniu od notes, '
  'którego klient może dotknąć. Wszystko poza ''app'' jest wykluczone '
  'z oceny terminowości kontrahenta (K-03) i z kontroli ciągłości numeracji.';

-- Uzupełnienie historii z jedynego śladu, jaki był: prefiksu w notatce.
-- Dotyka WYŁĄCZNIE wierszy z tym prefiksem i ustawia WYŁĄCZNIE nową kolumnę.
UPDATE public.invoices
SET origin = CASE
  WHEN notes LIKE '[import] ksef_history%' THEN 'ksef_import'
  WHEN notes LIKE '[import] ksef_inbox%'   THEN 'ksef_inbox'
  WHEN notes LIKE '[import] ocr_photo%'    THEN 'ocr'
  ELSE 'file_import'
END
WHERE notes LIKE '[import]%'
  AND origin = 'app';

-- Zapytania agenta zawsze filtrują po tenancie i po pochodzeniu.
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_origin
  ON public.invoices (tenant_id, origin)
  WHERE origin <> 'app';

NOTIFY pgrst, 'reload schema';
