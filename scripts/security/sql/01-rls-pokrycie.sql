-- ═══════════════════════════════════════════════════════════════
-- 01 — Pokrycie RLS: co naprawdę stoi na produkcji
-- ═══════════════════════════════════════════════════════════════
--
-- TYLKO ODCZYT. Same SELECT-y po katalogu systemowym. Nie zmienia niczego.
--
-- PO CO: repozytorium ma 67 migracji i wynika z nich, że wszystkie 60 tabel
-- mają włączony RLS. To jest stan ZAMIERZONY. Ten plik sprawdza stan
-- FAKTYCZNY — czy każda migracja rzeczywiście doszła i czy ktoś czegoś
-- nie wyłączył ręcznie przy jakiejś nocnej naprawie.
--
-- NAJWAŻNIEJSZA KOLUMNA TO `wymuszony_rls`. Wyjaśnienie niżej, pod zapytaniem.

\echo '═══ 1.1 Tabele: RLS włączony, RLS wymuszony, liczba polityk ═══'

SELECT
  c.relname                                        AS tabela,
  c.relrowsecurity                                 AS rls_wlaczony,
  c.relforcerowsecurity                            AS wymuszony_rls,
  (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS liczba_polityk,
  pg_get_userbyid(c.relowner)                      AS wlasciciel
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY
  -- najgorsze przypadki na górze: brak RLS, potem RLS bez polityk
  c.relrowsecurity ASC,
  (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) ASC,
  c.relname;

-- JAK CZYTAĆ WYNIK
--
-- `rls_wlaczony = false`  → tabela jest otwarta dla każdego, kto ma połączenie
--                           z rolą `authenticated`. To znalezisko krytyczne.
--
-- `liczba_polityk = 0` przy `rls_wlaczony = true` → nikt nie ma dostępu poza
--                           `service_role`. Bywa CELOWE (tabele operatorskie
--                           `flo_usage`, `flo_shadow`) — porównać z migracją
--                           00061, gdzie jest to opisane wprost.
--
-- `wymuszony_rls = false` → TO JEST TO, PO CO POWSTAŁ TEN PLIK.
--   Postgres domyślnie NIE stosuje polityk RLS do właściciela tabeli.
--   Jeżeli aplikacja albo PostgREST łączą się rolą będącą właścicielem,
--   wszystkie polityki są dekoracją — przepuszczają wszystko.
--   Sprawdzenie, kto się faktycznie łączy, jest w pliku 06.
--
-- W repozytorium NIE MA ani jednego `FORCE ROW LEVEL SECURITY`, więc
-- spodziewamy się tu samych `false`. Pytanie brzmi, czy to ma znaczenie —
-- i na to odpowiada dopiero zestawienie z właścicielem i rolą połączenia.

\echo ''
\echo '═══ 1.2 Podsumowanie liczbowe ═══'

SELECT
  count(*)                                           AS tabel_razem,
  count(*) FILTER (WHERE relrowsecurity)             AS z_rls,
  count(*) FILTER (WHERE NOT relrowsecurity)         AS BEZ_RLS,
  count(*) FILTER (WHERE relforcerowsecurity)        AS z_wymuszonym_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r';

\echo ''
\echo '═══ 1.3 Widoki — RLS ich nie dotyczy ═══'
-- Widok wykonuje się z uprawnieniami swojego właściciela, więc potrafi
-- wynieść dane z tabeli chronionej RLS-em. Interesują nas te bez
-- `security_invoker`, bo one omijają polityki tabel źródłowych.

SELECT
  c.relname                    AS widok,
  pg_get_userbyid(c.relowner)  AS wlasciciel,
  COALESCE(
    (SELECT option_value FROM pg_options_to_table(c.reloptions)
      WHERE option_name = 'security_invoker'),
    'brak (czyli DEFINER)'
  )                            AS security_invoker
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('v', 'm')
ORDER BY c.relname;
