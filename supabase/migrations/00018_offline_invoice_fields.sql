-- Offline24 / Tryb Offline: pola QR, klucz idempotencji i status invoices.ksef_status.
-- Uwaga: pozycja „00014” w repo zajęta jest przez `00014_payments_and_reminders.sql`.

-- Rozszerz CHECK o status kolejki offline (bez tego INSERT/UPDATE kończy się błędem).
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_ksef_status_check;

ALTER TABLE public.invoices ADD CONSTRAINT invoices_ksef_status_check
  CHECK (ksef_status IN (
    'draft',
    'queued',
    'sending',
    'accepted',
    'rejected',
    'received',
    'failed',
    'offline_queued'
  ));

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS offline_qr_offline TEXT,
  ADD COLUMN IF NOT EXISTS offline_qr_certyfikat TEXT,
  ADD COLUMN IF NOT EXISTS offline_idempotency_key TEXT;

CREATE INDEX IF NOT EXISTS idx_invoices_offline_queued
  ON public.invoices(tenant_id, ksef_status)
  WHERE ksef_status = 'offline_queued';

COMMENT ON COLUMN public.invoices.offline_qr_offline IS
  'QR kod OFFLINE - link do weryfikacji';

COMMENT ON COLUMN public.invoices.offline_qr_certyfikat IS
  'QR kod CERTYFIKAT - podpis kryptograficzny';

COMMENT ON COLUMN public.invoices.offline_idempotency_key IS
  'Klucz idempotencji dla deterministycznego retry';
