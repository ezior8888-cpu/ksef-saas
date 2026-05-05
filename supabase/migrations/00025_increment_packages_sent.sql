-- Atomowy increment pola total_packages_sent (paczki Co-Pilot / eksport dla księgowej).

CREATE OR REPLACE FUNCTION public.increment_packages_sent(p_tenant_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE public.accountant_settings
  SET total_packages_sent = total_packages_sent + 1
  WHERE tenant_id = p_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_packages_sent(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_packages_sent(UUID) TO service_role;

COMMENT ON FUNCTION public.increment_packages_sent(UUID) IS
  'Zwiększa licznik paczek dla wiersza accountant_settings danego tenantu (bez odczytu poprzedniej wartości po stronie klienta).';
