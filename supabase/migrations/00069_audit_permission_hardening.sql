-- ═══════════════════════════════════════════════════════════════
-- 00069 — Uszczelnienie uprawnień: SEC-C-06, SEC-C-07, SEC-C-08
-- ═══════════════════════════════════════════════════════════════
--
-- ZNALEZIONE W AUDYCIE BEZPIECZEŃSTWA (dzień 3, docs/security/audyt/).
-- WDROŻENIE: Bartosz, procedura w AGENTS.md. NIE wdrożone przez audyt.
--
-- Wspólny mianownik wszystkich trzech ustaleń: rola `anon` (niezalogowany)
-- i `PUBLIC` mają uprawnienia, których intencja kodu im nie dawała. Część
-- pochodzi z pułapki `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon`,
-- który działa JEDNORAZOWO i nie obejmuje obiektów utworzonych później.
--
-- Każdy REVOKE poniżej jest addytywny i odwracalny; żaden nie dotyka danych.

-- ── SEC-C-06 (wysokie): anonymize_user_audit_logs wywoływalna przez anon ──
-- Funkcja SECURITY DEFINER (działa jako postgres, omija RLS i trigger
-- niezmienności audit_logs) i NIE waliduje wywołującego. Migracja 00052
-- miała ją zostawić tylko dla service_role (REVOKE ALL FROM PUBLIC + GRANT
-- service_role), ale na produkcji `anon` i `authenticated` MAJĄ EXECUTE —
-- REVOKE z 00052 nie obowiązuje (prawdopodobnie późniejszy CREATE OR REPLACE
-- przywrócił domyślny PUBLIC EXECUTE). Bez tego niezalogowany mógł przez
-- /rpc zniszczyć czyjeś logi audytu.
REVOKE EXECUTE ON FUNCTION public.anonymize_user_audit_logs(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.anonymize_user_audit_logs(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.anonymize_user_audit_logs(uuid) FROM authenticated;
-- service_role zachowuje EXECUTE (nadane w 00052) — to jedyny właściwy wywołujący.

-- ── SEC-C-07 (niskie): nadmiarowe uprawnienia `anon` na tabelach ──────────
-- Żaden z tych obiektów nie jest anonowi potrzebny. Zapis, który MA być
-- publiczny (newsletter, flagi globalne), i tak idzie przez service_role
-- w akcjach serwerowych — potwierdzone w kodzie (app/actions/newsletter.ts,
-- lib/feature-flags/global-flags.ts). Odczyt dla zalogowanych zostaje nietknięty
-- (REVOKE celuje wyłącznie w anon).
REVOKE ALL ON TABLE public.global_feature_flags   FROM anon;
REVOKE ALL ON TABLE public.newsletter_subscribers FROM anon;
REVOKE ALL ON TABLE public.gdpr_deletion_requests FROM anon;
REVOKE ALL ON TABLE public.mfa_recovery_codes     FROM anon;
REVOKE ALL ON public.tenant_verification_status   FROM anon;  -- to widok

-- ── SEC-C-08 (niskie, rozpoznanie): funkcje admin_* / list_public_tables ──
-- SECURITY DEFINER z anon=X — niezalogowany mógł poznać rozmiar bazy,
-- rozmiary i nazwy tabel. Nie wycieka danych klientów, ale ułatwia rozpoznanie.
REVOKE EXECUTE ON FUNCTION public.admin_database_size() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_table_sizes()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_public_tables()  FROM PUBLIC, anon, authenticated;

-- ── Weryfikacja po wdrożeniu ────────────────────────────────────
-- 1. anon nie powinien już wywołać anonymize (z wnętrza sieci, adres kontenera):
--    curl -s -X POST "http://<rest-ip>:3000/rpc/anonymize_user_audit_logs" \
--      -H 'Content-Type: application/json' \
--      -d '{"p_user_id":"00000000-0000-0000-0000-000000000000"}'
--    -- oczekiwane: 401/403/42501 (przed naprawą: {"updated_rows":0})
-- 2. anon nie widzi już tych tabel:
--    SELECT table_name FROM information_schema.role_table_grants
--    WHERE grantee='anon' AND table_schema='public'
--      AND table_name IN ('global_feature_flags','newsletter_subscribers',
--        'gdpr_deletion_requests','mfa_recovery_codes','tenant_verification_status');
--    -- oczekiwane: 0 wierszy
-- 3. newsletter signup i flagi globalne DZIAŁAJĄ NADAL (idą przez service_role) —
--    przetestować zapis na środowisku przed produkcją.
