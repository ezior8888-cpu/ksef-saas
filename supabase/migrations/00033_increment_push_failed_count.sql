-- Atomowy bump failed_count + deaktywacja po progue (SECURITY DEFINER — tylko service_role).
CREATE OR REPLACE FUNCTION public.increment_push_failed_count(sub_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.push_subscriptions
  SET failed_count = failed_count + 1,
      -- porównanie po inkrementacji (wartość PRZED update w wyrażeniu SET to stary wiersz)
      is_active = CASE
        WHEN failed_count + 1 >= 5 THEN FALSE
        ELSE is_active
      END
  WHERE id = sub_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_push_failed_count(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_push_failed_count(UUID) FROM anon;

GRANT EXECUTE ON FUNCTION public.increment_push_failed_count(UUID) TO service_role;

COMMENT ON FUNCTION public.increment_push_failed_count(UUID) IS
  'Bump failed_count na push subscription; przy >= 5 ustawia is_active = FALSE. Backend (service_role) only.';
