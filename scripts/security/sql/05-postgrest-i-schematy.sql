-- ═══════════════════════════════════════════════════════════════
-- 05 — Co PostgREST wystawia na świat
-- ═══════════════════════════════════════════════════════════════
--
-- TYLKO ODCZYT.
--
-- PO CO: Supabase wystawia bazę przez HTTP. Wszystko, co jest w schemacie
-- widocznym dla PostgREST-a, ma publiczny adres URL — niezależnie od tego,
-- czy aplikacja kiedykolwiek z tego korzysta. Tabela pomocnicza wrzucona
-- „na chwilę" do `public` jest wystawiona tak samo jak `invoices`.

\echo '═══ 5.1 Schematy w bazie i ich właściciele ═══'

SELECT
  n.nspname                   AS schemat,
  pg_get_userbyid(n.nspowner) AS wlasciciel,
  (SELECT count(*) FROM pg_class c
    WHERE c.relnamespace = n.oid AND c.relkind = 'r') AS tabel
FROM pg_namespace n
WHERE n.nspname NOT LIKE 'pg\_%'
  AND n.nspname <> 'information_schema'
ORDER BY n.nspname;

\echo ''
\echo '═══ 5.2 Ustawienia PostgREST-a zapisane w bazie ═══'
-- Konfiguracja bywa w zmiennych środowiskowych kontenera ALBO w ustawieniach
-- roli. Pusty wynik nie znaczy „brak konfiguracji" — znaczy „konfiguracja
-- jest w kontenerze". Wtedy sprawdzamy ją komendą z punktu 5.4.

SELECT
  r.rolname                            AS rola,
  array_to_string(r.rolconfig, E'\n')  AS ustawienia
FROM pg_roles r
WHERE r.rolconfig IS NOT NULL
ORDER BY r.rolname;

\echo ''
\echo '═══ 5.3 Tabele bez klucza głównego ═══'
-- Nie jest to bezpośrednio kwestia bezpieczeństwa, ale PostgREST inaczej
-- traktuje takie tabele przy zapisie, a przy okazji często są to tabele
-- doraźne, o których nikt już nie pamięta — czyli dokładnie te, które
-- warto obejrzeć w audycie.

SELECT c.relname AS tabela
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND NOT EXISTS (
    SELECT 1 FROM pg_constraint k
    WHERE k.conrelid = c.oid AND k.contype = 'p'
  )
ORDER BY c.relname;

-- ═══════════════════════════════════════════════════════════════
-- 5.4 — DO WYKONANIA W POWŁOCE, NIE W psql
-- ═══════════════════════════════════════════════════════════════
--
-- Bartoszu: te dwie komendy uruchom osobno, na `db-1`, i wklej wynik
-- do dziennika razem z wynikiem powyższych zapytań.
--
-- (a) Które schematy PostgREST faktycznie wystawia:
--
--     docker inspect supabase-rest-ovrhjbsdpjdlnmkle1ulid4s \
--       --format '{{range .Config.Env}}{{println .}}{{end}}' \
--       | grep -E 'PGRST_DB_SCHEMAS|PGRST_DB_ANON_ROLE|PGRST_DB_URI' \
--       | sed -E 's/(:\/\/[^:]+:)[^@]+@/\1***@/'
--
--     Ostatni `sed` zamazuje hasło w `PGRST_DB_URI` — dziennik jest
--     w repozytorium, więc hasło nie ma prawa tam trafić. Jeżeli
--     wynik pokazuje hasło mimo tego filtra, zamaż je ręcznie przed wklejeniem.
--
--     CZEGO SZUKAMY: `PGRST_DB_SCHEMAS` powinno zawierać wyłącznie `public`
--     (ewentualnie `graphql_public`). Każdy dodatkowy schemat to dodatkowa
--     powierzchnia. `PGRST_DB_URI` mówi, JAKĄ ROLĄ łączy się PostgREST —
--     i to jest odpowiedź na pytanie z pliku 01 o `FORCE ROW LEVEL SECURITY`.
--
-- (b) Czy PostgREST odpowiada na zapytanie BEZ tokenu (z wnętrza sieci):
--
--     IP=$(docker inspect -f \
--       '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' \
--       supabase-rest-ovrhjbsdpjdlnmkle1ulid4s)
--     for T in invoices contractors tenants audit_logs flo_proposals; do
--       printf '%-16s ' "$T"
--       curl -s "http://$IP:3000/$T?limit=1" | head -c 200
--       echo
--     done
--
--     JAK CZYTAĆ: `42501 permission denied` to odpowiedź POPRAWNA — znaczy,
--     że tabela istnieje, a odmowa nastąpiła na autoryzacji. `PGRST205`
--     znaczy, że tabeli nie ma. Natomiast JAKIEKOLWIEK DANE w odpowiedzi
--     przy takim zapytaniu (bez tokenu!) to ustalenie krytyczne — zatrzymaj
--     się i napisz do Bartosza i Igora od razu, nie kończ pozostałych zadań.
