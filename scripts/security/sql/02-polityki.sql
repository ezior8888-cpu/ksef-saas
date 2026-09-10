-- ═══════════════════════════════════════════════════════════════
-- 02 — Treść polityk RLS
-- ═══════════════════════════════════════════════════════════════
--
-- TYLKO ODCZYT.
--
-- PO CO: samo „RLS włączony" nic nie znaczy, jeżeli polityka pokrywa
-- wyłącznie SELECT. Brakujący UPDATE oznacza, że obcy użytkownik nie
-- przeczyta cudzej faktury, ale będzie mógł ją zmienić. Brakujący DELETE —
-- że będzie mógł ją skasować.

\echo '═══ 2.1 Tabele z niepełnym pokryciem operacji ═══'
-- Czerwona lista: tabela ma polityki, ale nie na wszystkie cztery operacje.
-- `ALL` w polityce liczy się jako komplet.

WITH pokrycie AS (
  SELECT
    c.relname AS tabela,
    bool_or(p.polcmd IN ('r', '*')) AS ma_select,
    bool_or(p.polcmd IN ('a', '*')) AS ma_insert,
    bool_or(p.polcmd IN ('w', '*')) AS ma_update,
    bool_or(p.polcmd IN ('d', '*')) AS ma_delete,
    count(*)                        AS polityk
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
  GROUP BY c.relname
)
SELECT * FROM pokrycie
WHERE NOT (ma_select AND ma_insert AND ma_update AND ma_delete)
ORDER BY tabela;

-- UWAGA PRZY CZYTANIU: niepełne pokrycie NIE jest automatycznie błędem.
-- Tabela `audit_logs` ma być niezmienialna (migracja 00052 pilnuje tego
-- wyzwalaczem), więc brak polityk UPDATE i DELETE jest tam zamierzony
-- i pożądany. Każdy wiersz z tej listy wymaga decyzji: „celowe" albo
-- „przeoczone" — i ta decyzja idzie do rejestru ustaleń.

\echo ''
\echo '═══ 2.2 Pełna treść polityk ═══'

SELECT
  c.relname AS tabela,
  p.polname AS polityka,
  CASE p.polcmd
    WHEN 'r' THEN 'SELECT'
    WHEN 'a' THEN 'INSERT'
    WHEN 'w' THEN 'UPDATE'
    WHEN 'd' THEN 'DELETE'
    WHEN '*' THEN 'ALL'
  END AS operacja,
  CASE WHEN p.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END AS typ,
  COALESCE(
    (SELECT string_agg(rolname, ', ') FROM pg_roles WHERE oid = ANY(p.polroles)),
    'PUBLIC'
  ) AS role,
  pg_get_expr(p.polqual, p.polrelid)      AS warunek_using,
  pg_get_expr(p.polwithcheck, p.polrelid) AS warunek_with_check
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
ORDER BY c.relname, p.polname;

-- CZEGO SZUKAMY W TREŚCI WARUNKÓW:
--
-- 1. `role = PUBLIC` — polityka stosuje się do wszystkich ról, także `anon`.
--    Przy tabeli z danymi najemcy to znalezisko.
--
-- 2. Warunek `true` albo pusty — polityka, która przepuszcza wszystko.
--
-- 3. `warunek_with_check` puste przy polityce INSERT/UPDATE — brak sprawdzenia
--    przy ZAPISIE. Użytkownik może wtedy wstawić wiersz z cudzym `tenant_id`,
--    mimo że go nie przeczyta. Tak wygląda wstrzyknięcie danych do cudzej
--    organizacji.
--
-- 4. Odwołanie do `public.get_current_tenant_id()` — to jest właściwy wzorzec
--    w tym projekcie. Definicję tej funkcji sprawdza plik 04.
