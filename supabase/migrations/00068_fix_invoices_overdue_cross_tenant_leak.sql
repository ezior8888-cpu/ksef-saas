-- ═══════════════════════════════════════════════════════════════
-- 00068 — SEC-C-05: widok `invoices_overdue` wynosił faktury
--         między najemcami
-- ═══════════════════════════════════════════════════════════════
--
-- ZNALEZIONE W AUDYCIE BEZPIECZEŃSTWA (dzień 3, docs/security/audyt/).
-- WDROŻENIE: Bartosz, zgodnie z procedurą w AGENTS.md („Wgrywanie migracji").
-- Ta migracja NIE została wdrożona przez audyt — jest przygotowana do wdrożenia.
--
-- ── Na czym polegał wyciek ──────────────────────────────────────
-- Widok `public.invoices_overdue` był utworzony jako SECURITY DEFINER
-- (domyślne zachowanie widoku w Postgresie): wykonywał się z uprawnieniami
-- właściciela (`postgres`), więc OMIJAŁ RLS tabeli `invoices`. Jego definicja
-- filtruje tylko po statusie płatności i dacie — NIE po `tenant_id`.
-- Rola `authenticated` ma na nim `SELECT`.
--
-- Skutek: każdy zalogowany użytkownik — także konto założone przez atakującego
-- minutę wcześniej — przez `GET /rest/v1/invoices_overdue` (PostgREST wystawia
-- widoki schematu `public`) dostawał faktury po terminie WSZYSTKICH najemców:
-- numer, kwoty, nazwę nabywcy, jego NIP i e-mail. Wyciek działał też w zwykłym
-- UI: strona `app/(dashboard)/payments/overdue/page.tsx` robi `select('*')`
-- bez filtra po najemcy, polegając wyłącznie na widoku.
--
-- ── Naprawa ─────────────────────────────────────────────────────
-- `security_invoker = true` sprawia, że widok wykonuje się z uprawnieniami
-- WYWOŁUJĄCEGO, a nie właściciela. Wtedy RLS tabeli `invoices` działa
-- normalnie: `get_current_tenant_id()` (z nagłówka `x-active-org`, walidowany
-- przez członkostwo) ogranicza wynik do własnej organizacji użytkownika.
--
-- `service_role` (joby w tle) ma atrybut BYPASSRLS, więc po tej zmianie nadal
-- widzi wszystko — funkcjonalność serwisowa bez zmian. Zmienia się tylko to,
-- co widzi `authenticated`: od teraz wyłącznie swoje.
--
-- WYMAGA PostgreSQL 15+ (opcja `security_invoker` na widokach). Supabase
-- działa na 15+. Gdyby środowisko było starsze, alternatywa bez tej opcji:
--
--   CREATE OR REPLACE VIEW public.invoices_overdue AS
--   SELECT … (bez zmian) …
--   FROM public.invoices i
--   WHERE i.direction = 'issued'
--     AND i.payment_status IN ('unpaid','partial','overdue')
--     AND i.payment_due_date IS NOT NULL
--     AND i.payment_due_date < CURRENT_DATE
--     AND i.ksef_status = 'accepted'
--     AND i.tenant_id = public.get_current_tenant_id();   -- ← dołożony filtr
--
-- ── Weryfikacja po wdrożeniu ────────────────────────────────────
-- Jako authenticated bez kontekstu organizacji widok MUSI być pusty:
--   SET ROLE authenticated;
--   SELECT count(*), count(DISTINCT tenant_id) FROM public.invoices_overdue;
--   -- oczekiwane: 0 wierszy (bez nagłówka x-active-org get_current_tenant_id = NULL)
--   RESET ROLE;
-- Przed naprawą to zapytanie zwracało wiersze wielu najemców.

ALTER VIEW public.invoices_overdue SET (security_invoker = true);

COMMENT ON VIEW public.invoices_overdue IS
  'Faktury po terminie. security_invoker=true (00068, audyt SEC-C-05) — '
  'respektuje RLS invoices, każdy widzi tylko swoją organizację.';
