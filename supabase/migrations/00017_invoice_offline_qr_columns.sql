-- Tryb Offline24: cache payloadów QR na fakturze (również trzymane w ksef_offline_queue)
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS offline_qr_offline TEXT,
  ADD COLUMN IF NOT EXISTS offline_qr_certyfikat TEXT;

COMMENT ON COLUMN public.invoices.offline_qr_offline IS
  'Treść zakodowana w kodzie QR trybu Offline (payload tekstowy/JSON wg spec MF).';

COMMENT ON COLUMN public.invoices.offline_qr_certyfikat IS
  'Treść zakodowana w kodzie QR „CERTYFIKAT” (payload tekstowy/JSON wg spec MF).';
