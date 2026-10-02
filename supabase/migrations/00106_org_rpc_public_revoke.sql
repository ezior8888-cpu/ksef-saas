-- 00106_org_rpc_public_revoke.sql
--
-- Dopełnienie 00103 (AUD-29). `REVOKE … FROM anon` nie odebrało wywołania
-- niezalogowanym, bo EXECUTE przychodzi przez rolę PUBLIC (domyślne
-- uprawnienie funkcji) — sprawdzone na produkcji po wgraniu 00103.
-- Funkcje i tak odmawiają bez `auth.uid()`; tu domykamy samo wywołanie.
-- Tylko REVOKE/GRANT, bez zmian danych.

REVOKE EXECUTE ON FUNCTION public.approve_join_request(UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.revoke_membership(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_join_request(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_membership(UUID) TO authenticated, service_role;
