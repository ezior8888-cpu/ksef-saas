-- ═══════════════════════════════════════════════════════════════
-- 06 — Rozjazd między produkcją a repozytorium
-- ═══════════════════════════════════════════════════════════════
--
-- TYLKO ODCZYT.
--
-- PO CO: audyt czyta 67 plików migracji i wyciąga z nich wnioski. Wszystkie
-- te wnioski są warte tyle, ile prawdziwe jest założenie, że produkcja
-- wygląda tak, jak repozytorium. Rozjazd tutaj unieważnia dzień pracy —
-- dlatego to zapytanie idzie do Bartosza jako pierwsze, razem z 01.

\echo '═══ 6.1 Migracje wgrane na produkcji ═══'

SELECT version, name
FROM supabase_migrations.schema_migrations
ORDER BY version;

-- PORÓWNANIE: w repozytorium jest 67 plików, od `00001` do `00067`
-- (ostatni: `00067_flo_rollout.sql`). Interesują nas trzy rzeczy:
--   • numery obecne w repo, a nieobecne tutaj → produkcja jest starsza
--     niż kod, który czytamy;
--   • numery obecne tutaj, a nieobecne w repo → ktoś wgrał coś ręcznie,
--     poza repozytorium. To najgorszy wariant, bo takiego SQL-a nikt
--     nigdy nie przejrzał;
--   • dziury w numeracji.

\echo ''
\echo '═══ 6.2 Rozszerzenia i schematy, w których siedzą ═══'
-- Rozszerzenie zainstalowane w schemacie `public` dokłada tam swoje funkcje,
-- a te bywają wywoływalne przez `anon`. Zalecenie Supabase to trzymać je
-- w osobnym schemacie `extensions`.

SELECT
  e.extname   AS rozszerzenie,
  n.nspname   AS schemat,
  e.extversion AS wersja
FROM pg_extension e
JOIN pg_namespace n ON n.oid = e.extnamespace
ORDER BY n.nspname, e.extname;

-- SZCZEGÓLNIE: `pgcrypto`, `http`, `pg_net`, `dblink`, `postgres_fdw`.
-- Trzy ostatnie pozwalają bazie SAMEJ wykonywać zapytania sieciowe —
-- w połączeniu z funkcją DEFINER bez przypiętej ścieżki wyszukiwania
-- to jest gotowa droga wyprowadzenia danych na zewnątrz.

\echo ''
\echo '═══ 6.3 Wyzwalacze na tabelach z danymi ═══'
-- Wyzwalacz wykonuje się przy zapisie z uprawnieniami, które zależą od
-- funkcji, którą wywołuje. Chcemy wiedzieć, co dokłada się do każdego
-- zapisu — zwłaszcza na `audit_logs`, który ma być niezmienialny (00052).

SELECT
  c.relname AS tabela,
  t.tgname  AS wyzwalacz,
  p.proname AS funkcja,
  CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END AS tryb
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE n.nspname = 'public'
  AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname;

\echo ''
\echo '═══ 6.4 Kolumny wyglądające na dane wrażliwe ═══'
-- Inwentarz do dnia 4 (retencja i minimalizacja danych). Nie jest to samo
-- w sobie znalezisko — chodzi o listę miejsc, w których takie dane leżą,
-- żeby potem sprawdzić, czy każde z nich jest naprawdę potrzebne.

SELECT
  c.table_name  AS tabela,
  c.column_name AS kolumna,
  c.data_type   AS typ
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND (
    c.column_name ~* '(pesel|nip|regon|iban|account|konto|email|phone|telefon|address|adres|token|secret|password|hasl|encrypted|klucz|cert)'
  )
ORDER BY c.table_name, c.column_name;

-- CZEGO SZUKAMY: kolumny z nazwą sugerującą sekret, która NIE ma w nazwie
-- `encrypted` ani `hash`. Token trzymany otwartym tekstem oznacza, że kopia
-- zapasowa bazy jest kompletem kluczy do wszystkich kont.
