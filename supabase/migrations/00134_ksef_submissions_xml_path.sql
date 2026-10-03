-- 00134_ksef_submissions_xml_path.sql
--
-- Decyzja D5 cyklu życia faktury (docs/architecture/cykl-zycia-faktury-ksef.md,
-- sekcja 9): plik XML w magazynie jest kluczowany per PRÓBA wysyłki
-- (`tenant/yyyy/mm/invoiceId/sendAttemptId.xml`), nie per faktura. Ponowna
-- wysyłka po powrocie do szkicu i poprawie nigdy nie nadpisuje pliku, który
-- poszedł do KSeF; stare próby czyści retencja razem z fakturą.
--
-- Żeby uzgodnienie po numerze referencyjnym (runner, krok
-- `reconcile-previous-submission`) wskazywało plik TEJ próby, wpis `sent`
-- w `ksef_submissions` zapamiętuje jego klucz. Wpisy sprzed zmiany mają NULL —
-- kod wraca wtedy do klucza historycznego per faktura.
--
-- PRZED wdrożeniem kodu (addytywna): jedna kolumna NULL-owalna, bez zmian
-- danych, bez DROP. Stary kod jej nie czyta. Wycofanie: DROP COLUMN (za zgodą).

BEGIN;

ALTER TABLE public.ksef_submissions
  ADD COLUMN IF NOT EXISTS xml_storage_path text;

COMMENT ON COLUMN public.ksef_submissions.xml_storage_path IS
  'D5 (00134): klucz XML tej próby wysyłki w magazynie (tenant/yyyy/mm/invoiceId/sendAttemptId.xml); NULL dla wpisów sprzed zmiany.';

COMMIT;
