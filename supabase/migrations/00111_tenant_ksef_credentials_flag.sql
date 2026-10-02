-- 00111_tenant_ksef_credentials_flag.sql
--
-- AUD-103 (część 1/2): strony sprawdzały „czy firma ma certyfikat KSeF”,
-- czytając kluczem użytkownika cały zaszyfrowany blob
-- `ksef_credentials_encrypted`. Kolumna generowana mówi tylko „tak/nie”.
-- Część 2 (00112) odbiera rolom klienckim SELECT samego blobu — po wdrożeniu
-- kodu, który czyta już tę flagę.
--
-- Tylko nowa kolumna generowana (tabela tenants jest mała) — bezpieczna
-- przed wdrożeniem.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS has_ksef_credentials boolean
  GENERATED ALWAYS AS (ksef_credentials_encrypted IS NOT NULL) STORED;

COMMENT ON COLUMN public.tenants.has_ksef_credentials IS
  'Czy firma ma zapisane dane dostępowe KSeF (bez ujawniania blobu) — AUD-103, 00111.';
