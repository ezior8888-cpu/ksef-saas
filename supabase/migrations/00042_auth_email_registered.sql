-- Sprawdzenie „czy email już ma konto w auth.users” — tylko service_role (rejestracja).
-- GoTrue przy włączonym potwierdzaniu emaila często nie zwraca błędu przy duplikacie (anty-enumeracja).

CREATE OR REPLACE FUNCTION public.auth_email_registered(p_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE lower(trim(email)) = lower(trim(p_email))
  );
$$;

COMMENT ON FUNCTION public.auth_email_registered(text) IS
  'TRUE, jeśli w auth.users istnieje użytkownik o tym emailu — wyłącznie dla service_role (walidacja rejestracji).';

REVOKE ALL ON FUNCTION public.auth_email_registered(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_email_registered(text) TO service_role;
