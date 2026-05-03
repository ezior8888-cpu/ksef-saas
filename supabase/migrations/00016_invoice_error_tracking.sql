-- ═══════════════════════════════════════════════════════════════
-- Rozszerzenie invoices o szczegółowe śledzenie błędów KSeF (po tłumaczeniu)
-- Nr 00016 — 00013 jest zajęta przez products_catalog.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS last_error_code TEXT,
  ADD COLUMN IF NOT EXISTS last_error_field TEXT,
  ADD COLUMN IF NOT EXISTS last_error_suggestion TEXT;

COMMENT ON COLUMN public.invoices.last_error_code IS
  'Kod błędu KSeF (P_13_1, AUTH_FAILED, itp.)';

COMMENT ON COLUMN public.invoices.last_error_field IS
  'Pole UI do podświetlenia (np. lines.2.vatRate)';

COMMENT ON COLUMN public.invoices.last_error_suggestion IS
  'Sugestia naprawy dla użytkownika';
