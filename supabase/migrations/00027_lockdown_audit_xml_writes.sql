-- Audyt #6: zacieśnienie uprawnień na tabelach append-only / read-only.
--
-- `audit_logs`, `xml_documents`, `ksef_submissions` są zapisywane wyłącznie
-- przez backend (Inngest jobs / Server Actions z service_role). Z poziomu
-- klienta authenticated nigdy NIE wolno robić INSERT/UPDATE/DELETE — bo:
--   * `audit_logs` to dowód zgodności (RODO + KSeF retention 10 lat),
--     skasowanie / podmiana tu = zerwanie łańcucha audytowego.
--   * `xml_documents` jest źródłem prawdy o XML-ach FA(3) wysłanych do KSeF;
--     manipulacja po stronie klienta otwiera furtkę do podmiany dokumentu
--     po jego akceptacji w KSeF.
--   * `ksef_submissions` archiwizuje historię prób wysyłki — to atrybut
--     niezmienny dla danej faktury.
--
-- Migracja 00002 (RLS) szeroko granted'owała `INSERT, UPDATE, DELETE` na
-- WSZYSTKICH tabelach `TO authenticated` w jednym `GRANT`. Bez polityk
-- WRITE te trzy tabele i tak są zablokowane przez RLS, ale szeroki GRANT
-- to "ślepe poganianie kierownicy" — każdy nowy kod, który (przez pomyłkę)
-- doda politykę INSERT, dziedziczy GRANT i otworzy zapis bez explicit review.
--
-- Bezpieczniej: explicite cofamy WRITE i zostawiamy tylko SELECT.
-- Service role bypassuje RLS i nie potrzebuje grantów authenticated — ma
-- własne uprawnienia w roli `postgres`/`service_role`.

-- 1. audit_logs — read-only z UI.
REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;

-- 2. xml_documents — read-only z UI; INSERT robi `lib/storage/r2.ts` przez admin.
REVOKE INSERT, UPDATE, DELETE ON public.xml_documents FROM authenticated;
GRANT SELECT ON public.xml_documents TO authenticated;

-- 3. ksef_submissions — historia immutable po stronie klienta.
REVOKE INSERT, UPDATE, DELETE ON public.ksef_submissions FROM authenticated;
GRANT SELECT ON public.ksef_submissions TO authenticated;

COMMENT ON TABLE public.audit_logs IS
  'Append-only z poziomu service_role; authenticated dostaje tylko SELECT.';
COMMENT ON TABLE public.xml_documents IS
  'Zapisywane wyłącznie z Inngest jobs (service_role); authenticated tylko SELECT.';
COMMENT ON TABLE public.ksef_submissions IS
  'Historia wysyłek do KSeF — immutable dla klienta; INSERT/UPDATE robi backend.';
