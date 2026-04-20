-- ═══════════════════════════════════════════════════════════════
-- Wyrównanie CHECK na invoices.ksef_status (naprawa rozjazdów z ręcznym
-- SQL w Supabase / częściowymi migracjami). Idempotentne z 00003.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_ksef_status_check;

ALTER TABLE public.invoices ADD CONSTRAINT invoices_ksef_status_check
  CHECK (ksef_status IN (
    'draft',
    'queued',
    'sending',
    'accepted',
    'rejected',
    'received',
    'failed'
  ));
