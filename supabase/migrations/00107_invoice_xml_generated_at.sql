-- 00107_invoice_xml_generated_at.sql
--
-- AUD-46: XML FA(3) dostawał `DataWytworzeniaFa` = chwila generowania przy
-- KAŻDEJ próbie wysyłki. Ponowienie budowało inny plik niż pierwsza próba,
-- więc archiwum (i jego skrót) przestawało odpowiadać temu, co dostał KSeF.
-- Pierwsze generowanie zapisuje tu swoją chwilę; kolejne ją powtarzają.
--
-- Tylko nowa kolumna (NULL = jeszcze nie generowano) — stary kod jej nie
-- dotyka, więc migracja może iść przed wdrożeniem.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS xml_generated_at timestamptz;

COMMENT ON COLUMN public.invoices.xml_generated_at IS
  'Chwila pierwszego wygenerowania XML FA(3) (DataWytworzeniaFa) — ponowienia wysyłki powtarzają ją, żeby plik był identyczny (AUD-46, 00107).';
