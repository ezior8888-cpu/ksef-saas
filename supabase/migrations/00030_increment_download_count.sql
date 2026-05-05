-- Audyt #23: atomowy increment licznika pobrań pliku eksportu.
--
-- `downloadExportFileAction` w `app/actions/exports.ts` dotąd robił
-- read-then-write:
--   const nextCount = (file.download_count ?? 0) + 1;
--   await supabase.from('export_files').update({ download_count: nextCount, ... }).eq('id', fileId);
--
-- Race: dwa równoległe pobrania tego samego pliku odczytują tę samą wartość
-- (np. 5), oba zapisują 6 — utracony increment. To jest dokładnie ten sam
-- bug, który audyt zlikwidował dla `accountant_settings.total_packages_sent`
-- via RPC `increment_packages_sent` (migracja 00025).
--
-- Tu robimy analogiczny pattern. SECURITY INVOKER + sprawdzenie
-- `tenant_id = public.get_current_tenant_id()` w WHERE — funkcja jest
-- bezpieczna do wywołania z `authenticated` clienta:
--   * nie podnosi się do uprawnień DEFINER (SECURITY INVOKER),
--   * RLS na `export_files` i tak by zablokował UPDATE cudzego tenanta,
--     ale dodatkowy WHERE w funkcji to defense-in-depth dla scenariusza,
--     w którym ktoś poluzowuje politykę WRITE w przyszłości.
--
-- p_user_id przekazujemy z parametrów (a nie auth.uid()) celowo —
-- akcja serwerowa przed wywołaniem RPC robi własną walidację `auth.getUser()`,
-- więc parametr odzwierciedla "kto faktycznie kliknął download" w aktach
-- audytowych, nawet gdyby kiedykolwiek zmieniono mechanizm sesji.

CREATE OR REPLACE FUNCTION public.increment_export_file_download(
  p_file_id UUID,
  p_user_id UUID
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE public.export_files
  SET download_count = download_count + 1,
      last_downloaded_at = NOW(),
      last_downloaded_by = p_user_id
  WHERE id = p_file_id
    AND tenant_id = public.get_current_tenant_id();
END;
$$;

REVOKE ALL ON FUNCTION public.increment_export_file_download(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_export_file_download(UUID, UUID) FROM anon;

GRANT EXECUTE ON FUNCTION public.increment_export_file_download(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_export_file_download(UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.increment_export_file_download(UUID, UUID) IS
  'Atomowy increment download_count w export_files dla aktualnego tenanta — eliminuje read-then-write race.';
