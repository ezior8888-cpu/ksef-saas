-- ═══════════════════════════════════════════════════════════════
-- 00102: wyłącznik rejestracji w samym GoTrue (AUD-63, decyzja B2 z 02.10.2026)
--
-- `disableSignups` (00060) aplikacja czyta w formularzu /register i przy
-- zakładaniu pierwszej firmy. Konto i tak powstaje wcześniej, w GoTrue:
-- `/auth/v1/signup` z kluczem anon i pierwsze logowanie Google omijają
-- aplikację. Hook „before user created” odmawia założenia konta, gdy flaga
-- jest włączona — dla każdej drogi (e-mail, Google, API).
--
-- Brak wiersza flagi = rejestracja otwarta (jak `getGlobalFlagForExecution`).
-- Błąd w funkcji = GoTrue odmawia rejestracji (fail-closed, jak w aplikacji).
--
-- SECURITY DEFINER: tabela ma RLS bez polityk, a GoTrue woła hook jako
-- `supabase_auth_admin`. Właściciel funkcji (postgres) jest właścicielem
-- tabeli, więc czyta ją z pominięciem RLS. Pusty search_path — wszystkie
-- nazwy są kwalifikowane.
--
-- KOLEJNOŚĆ: najpierw ta migracja, potem w GoTrue na db-1:
--   GOTRUE_HOOK_BEFORE_USER_CREATED_ENABLED=true
--   GOTRUE_HOOK_BEFORE_USER_CREATED_URI=pg-functions://postgres/public/hook_before_user_created
-- i restart kontenera auth. Odwrotnie GoTrue woła nieistniejącą funkcję
-- i KAŻDA rejestracja pada. Samo wgranie migracji niczego nie zmienia.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.hook_before_user_created(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_closed boolean;
BEGIN
  SELECT enabled INTO v_closed
    FROM public.global_feature_flags
   WHERE flag = 'disableSignups';

  IF coalesce(v_closed, false) THEN
    RETURN jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'Rejestracja nowych kont jest chwilowo wstrzymana.'
    ));
  END IF;

  RETURN '{}'::jsonb;
END;
$$;

COMMENT ON FUNCTION public.hook_before_user_created(jsonb) IS
  'Hook GoTrue „before user created”: odmawia rejestracji przy disableSignups (AUD-63, 00102).';

REVOKE ALL ON FUNCTION public.hook_before_user_created(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hook_before_user_created(jsonb) TO supabase_auth_admin;
