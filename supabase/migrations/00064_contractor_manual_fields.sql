-- Migracja 00064: trwały znacznik pól kontrahenta poprawionych ręcznie.
--
-- Potrzebne funkcji P-08 agenta FLO (krok 44 planu).
--
-- PROBLEM, KTÓRY TO ROZWIĄZUJE: klient poprawia nazwę albo adres kontrahenta,
-- bo w rejestrze stoi wpis stary, skrócony albo po prostu inny niż ten, pod
-- którym kontrahent chce dostawać faktury. Nocne odświeżenie danych z GUS-u
-- i białej listy nadpisuje tę poprawkę i wraca do wersji z rejestru.
--
-- Klient poprawia drugi raz. I trzeci. Za czwartym przestaje ufać całej
-- automatyzacji danych kontrahenta — słusznie, bo program cofa jego pracę
-- i nie mówi dlaczego.
--
-- Kolumna trzyma NAZWY PÓL, nie flagę na całym rekordzie: poprawiona nazwa
-- nie ma powodu blokować odświeżania numerów kont ani statusu VAT, który
-- jest jedyną rzeczą, o którą w tej funkcji naprawdę chodzi.

ALTER TABLE public.contractors
  ADD COLUMN IF NOT EXISTS manual_fields TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.contractors.manual_fields IS
  'Nazwy pól poprawionych ręcznie przez człowieka (np. {name,address}). '
  'Automatyczne odświeżanie z rejestrów NIGDY ich nie nadpisuje. '
  'Znacznik jest trwały: znika wyłącznie wtedy, gdy człowiek sam cofnie '
  'poprawkę.';

-- Indeks częściowy: interesują nas wyłącznie rekordy z jakąkolwiek poprawką,
-- a tych jest garstka. Pełny indeks GIN na tablicy pustej u 99% wierszy
-- kosztowałby więcej, niż daje.
CREATE INDEX IF NOT EXISTS idx_contractors_manual_fields
  ON public.contractors USING GIN (manual_fields)
  WHERE manual_fields <> '{}';

NOTIFY pgrst, 'reload schema';
