-- ═══════════════════════════════════════════════════════════════
-- 03 — Uprawnienia ról: co widzi niezalogowany
-- ═══════════════════════════════════════════════════════════════
--
-- TYLKO ODCZYT.
--
-- PO CO: RLS jest drugą linią obrony. Pierwszą są uprawnienia tabelowe
-- (GRANT). Jeżeli rola `anon` nie ma `SELECT` na tabeli, to nawet przy
-- najgorzej napisanej polityce nikt niezalogowany danych nie zobaczy.
-- Jeżeli ma — cała nadzieja w RLS-ie.

\echo '═══ 3.1 Co może rola `anon` (niezalogowany gość) ═══'

SELECT
  table_name  AS tabela,
  string_agg(DISTINCT privilege_type, ', ' ORDER BY privilege_type) AS uprawnienia
FROM information_schema.role_table_grants
WHERE grantee = 'anon'
  AND table_schema = 'public'
GROUP BY table_name
ORDER BY table_name;

-- OCZEKIWANIE: ta lista powinna być pusta albo zawierać wyłącznie tabele
-- z treścią publiczną (np. słownik statusów, flagi funkcji). Każda tabela
-- z danymi klientów — `invoices`, `contractors`, `tenants`, `audit_logs`,
-- cokolwiek z prefiksem `flo_` — jest tu znaleziskiem.

\echo ''
\echo '═══ 3.2 Co może rola `authenticated` (dowolny zalogowany) ═══'

SELECT
  table_name AS tabela,
  string_agg(DISTINCT privilege_type, ', ' ORDER BY privilege_type) AS uprawnienia
FROM information_schema.role_table_grants
WHERE grantee = 'authenticated'
  AND table_schema = 'public'
GROUP BY table_name
ORDER BY table_name;

-- Tu obecność tabel jest normalna — na tym polega działanie aplikacji.
-- Ale UWAGA: „zalogowany" to dowolny użytkownik dowolnej organizacji,
-- także konto założone przez atakującego pięć minut temu. Dla każdej tabeli
-- z tej listy izolacja opiera się WYŁĄCZNIE na polityce RLS z pliku 02.

\echo ''
\echo '═══ 3.3 Uprawnienia do funkcji ═══'
-- Funkcja `SECURITY DEFINER` wykonuje się z uprawnieniami swojego właściciela.
-- Jeśli `anon` może ją wywołać, to `anon` działa z uprawnieniami właściciela.

SELECT
  p.proname AS funkcja,
  CASE WHEN p.prosecdef THEN 'DEFINER (!)' ELSE 'INVOKER' END AS tryb,
  pg_get_userbyid(p.proowner) AS wlasciciel,
  array_to_string(p.proacl, E'\n') AS uprawnienia
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef
ORDER BY p.proname;

-- CZEGO SZUKAMY: wiersza, w którym `tryb = DEFINER (!)` i w uprawnieniach
-- widnieje `anon=X` albo `=X` (czyli PUBLIC). To znaczy, że niezalogowany
-- gość może wywołać funkcję działającą z pełnymi uprawnieniami właściciela.

\echo ''
\echo '═══ 3.4 Kto jest w jakiej roli ═══'
-- Sprawdzamy, czy role aplikacyjne nie odziedziczyły przypadkiem
-- uprawnień superużytkownika albo właściciela tabel.

SELECT
  r.rolname                                        AS rola,
  r.rolsuper                                       AS superuzytkownik,
  r.rolbypassrls                                   AS OMIJA_RLS,
  r.rolcanlogin                                    AS moze_sie_logowac,
  COALESCE(
    (SELECT string_agg(g.rolname, ', ')
       FROM pg_auth_members m
       JOIN pg_roles g ON g.oid = m.roleid
      WHERE m.member = r.oid),
    '—'
  ) AS dziedziczy_po
FROM pg_roles r
WHERE r.rolname NOT LIKE 'pg\_%'
ORDER BY r.rolsuper DESC, r.rolbypassrls DESC, r.rolname;

-- NAJWAŻNIEJSZA KOLUMNA: `OMIJA_RLS` (atrybut BYPASSRLS). Rola z tym
-- atrybutem ignoruje WSZYSTKIE polityki, niezależnie od `FORCE RLS`.
-- Dla `service_role` to jest zamierzone i konieczne. Dla `authenticated`
-- albo `anon` byłoby katastrofą — i dokładnie po to tu patrzymy.
