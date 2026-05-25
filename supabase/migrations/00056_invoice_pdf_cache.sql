-- Migracja 00056: cache PDF faktur (Faza 33 Krok 3).
--
-- PDF faktury generujemy raz (pdfkit, ~0.5-2s) i cache'ujemy w R2.
-- Kolejne pobrania = instant download z R2 bez regeneracji.
--
-- `pdf_storage_path`  — klucz obiektu PDF w R2 (NULL = jeszcze nie wygenerowano)
-- `pdf_generated_at`  — kiedy wygenerowano; gdy faktura zostanie zmieniona
--                       (updated_at > pdf_generated_at) cache jest nieważny
--                       i PDF regenerujemy.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS pdf_storage_path TEXT;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS pdf_generated_at TIMESTAMPTZ;
