-- 00105_flo_usage_increment.sql
--
-- AUD-116: zapis zużycia AI (`flo_usage`) był „odczytaj wiersz dnia →
-- zapisz sumę” z aplikacji. Dwa równoległe wywołania (np. dwa zdjęcia
-- kosztów naraz) czytały ten sam stan i jedno zużycie znikało — dzienny
-- i miesięczny budżet AI firmy liczył za mało. Teraz dodawanie robi baza,
-- jednym poleceniem.
--
-- Tylko nowa funkcja — bez zmian danych i tabel. Stary kod (odczyt + upsert)
-- działa dalej do wdrożenia nowego.

CREATE OR REPLACE FUNCTION public.flo_record_usage(
  p_tenant_id uuid,
  p_day date,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_cost_usd numeric
)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  INSERT INTO public.flo_usage (tenant_id, day, input_tokens, output_tokens, cost_usd, calls)
  VALUES (p_tenant_id, p_day, p_input_tokens, p_output_tokens, p_cost_usd, 1)
  ON CONFLICT (tenant_id, day) DO UPDATE SET
    input_tokens = public.flo_usage.input_tokens + EXCLUDED.input_tokens,
    output_tokens = public.flo_usage.output_tokens + EXCLUDED.output_tokens,
    cost_usd = public.flo_usage.cost_usd + EXCLUDED.cost_usd,
    calls = public.flo_usage.calls + 1;
$$;

COMMENT ON FUNCTION public.flo_record_usage(uuid, date, bigint, bigint, numeric) IS
  'Atomowe dodanie zużycia AI do wiersza dnia (AUD-116, 00105). Tylko backend (service_role).';

REVOKE EXECUTE ON FUNCTION public.flo_record_usage(uuid, date, bigint, bigint, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flo_record_usage(uuid, date, bigint, bigint, numeric) TO service_role;
