-- 00092 — urząd skarbowy firmy (PROŚBA: wgrywa Bartosz).
--
-- Po co: pliki JPK mają w nagłówku KodUrzedu — urząd, do którego plik jest
-- składany. Aplikacja go nie znała, więc JPK_FA wpisywał każdemu klientowi
-- kod 1408 (według słownika MF: Urząd Skarbowy w Kozienicach). Urząd to cecha
-- firmy, nie pojedynczego eksportu, więc trzymamy go tutaj. JPK_V7M(3) też
-- go wymaga.
--
-- NULL = nie ustawiono (stan każdej istniejącej firmy — zmiana czysto
-- addytywna, bez UPDATE istniejących wierszy). Poprawność kodu względem
-- słownika MF (400 urzędów) sprawdza aplikacja; tu tylko format 4 cyfr.
--
-- Kolejność: TA MIGRACJA PRZED wdrożeniem kodu. Kod czyta kolumnę odpornie
-- (brak kolumny = „nie ustawiono”), ale zapis ustawienia wymaga kolumny.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS tax_office_code TEXT;

-- DROP ... IF EXISTS tylko dla powtarzalności: usuwa ograniczenie tworzone
-- przez tę samą migrację, żeby ponowne uruchomienie nie padło.
ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_tax_office_code_check;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_tax_office_code_check
  CHECK (tax_office_code IS NULL OR tax_office_code ~ '^[0-9]{4}$');

COMMENT ON COLUMN public.tenants.tax_office_code IS
  'Kod urzędu skarbowego firmy (KodUrzedu w JPK, słownik MF KodyUrzedowSkarbowych). NULL = nie ustawiono.';
