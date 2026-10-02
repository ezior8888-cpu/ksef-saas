-- 00112_tenant_credentials_column_privileges.sql
--
-- AUD-103 (część 2/2): `tenants.ksef_credentials_encrypted` (zaszyfrowany
-- certyfikat i klucz KSeF) był czytelny dla każdego członka firmy kluczem
-- użytkownika — RLS wpuszcza do wiersza, a uprawnień kolumnowych nie było.
--
-- Uprawnienie kolumnowe działa tylko bez uprawnienia do całej tabeli, więc:
-- odbieramy SELECT tabeli rolom klienckim i przyznajemy SELECT wszystkich
-- kolumn POZA blobem (lista z katalogu, żeby nie pominąć żadnej).
--
-- !!! WGRAĆ PO WDROŻENIU KODU z 00111 (strony czytają `has_ksef_credentials`,
-- kolejkowanie czyta blob kluczem serwisowym). Wgrana wcześniej wywróci
-- ustawienia KSeF, import i wysyłkę na starym kodzie.
--
-- !!! Każda NOWA kolumna `tenants` potrzebuje odtąd jawnego
-- `GRANT SELECT (kolumna) ON public.tenants TO authenticated` — pilnuje
-- tests/unit/dane-ksef-uprawnienia-kolumn.test.ts.
--
-- Bez zmian danych. UPDATE/INSERT bez zmian (zapis blobu idzie kluczem
-- serwisowym).

REVOKE SELECT ON public.tenants FROM anon, authenticated;

DO $$
DECLARE
  v_columns text;
BEGIN
  SELECT string_agg(pg_catalog.quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO v_columns
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'tenants'
     AND column_name <> 'ksef_credentials_encrypted';
  EXECUTE pg_catalog.format('GRANT SELECT (%s) ON public.tenants TO authenticated', v_columns);
END;
$$;
