#!/usr/bin/env bash
#
# Rozstrzygnięcie SEC-C-05 — bo pierwszy test był ślepy na pustą bazę.
#
# TYLKO ODCZYT. Jedno zapytanie jako postgres (widzi wszystko, bez RLS),
# żeby ustalić GROUND TRUTH: ile jest faktur po terminie i u ilu najemców,
# oraz jakie NAPRAWDĘ są opcje widoku `invoices_overdue` na produkcji.
#
# Dlaczego to rozstrzyga:
#  • overdue_total = 0            → baza nie ma faktur po terminie; pierwszy test
#                                   (authenticated → 0) był ślepy, nie dowodził
#                                   niczego. Wyciek pozostaje RYZYKIEM STRUKTURALNYM
#                                   (widok DEFINER bez filtra + grant), do naprawy
#                                   przed launchem, ale dziś nie ma czego wyciec.
#  • overdue_tenants ≥ 2 i widok DEFINER (brak security_invoker w reloptions)
#                                 → wyciek REALNY: authenticated zobaczyłby te
#                                   wiersze przez PostgREST.
#  • reloptions zawiera security_invoker=true
#                                 → widok JUŻ respektuje RLS; wycieku nie ma,
#                                   analiza była błędna (albo ktoś to już naprawił).
#
set -uo pipefail
KEY="$HOME/.ssh/hetzner_faktflow_ed25519"
OUT="docs/security/audyt"
[[ -f "$KEY" ]] || { echo "BŁĄD: brak klucza $KEY (jesteś w WSL?)"; exit 1; }

if ! ssh-add -l 2>/dev/null | grep -q hetzner_faktflow; then
  echo "▶ Wpisz hasło do klucza SSH (raz):"
  eval "$(ssh-agent -s)" >/dev/null
  ssh-add "$KEY" || { echo "BŁĄD: klucz odrzucony."; exit 1; }
fi

DB="root@178.104.128.144"
PGC=$(ssh -i "$KEY" $DB "docker ps --format '{{.Names}}' | grep '^supabase-db' | head -1")

echo "▶ Rozstrzygające zapytanie (jako postgres, tylko odczyt)..."
ssh -i "$KEY" $DB "docker exec -i $PGC psql -U postgres -d postgres" > "$OUT/wynik-99-sec-c-05-rozstrzygniecie.txt" 2>&1 <<'SQL'
\echo '=== GROUND TRUTH: ile danych i jakie opcje widoku (jako postgres, bez RLS) ==='
SELECT
  (SELECT count(*) FROM public.invoices)                          AS invoices_total,
  (SELECT count(*) FROM public.invoices_overdue)                  AS overdue_total,
  (SELECT count(DISTINCT tenant_id) FROM public.invoices_overdue) AS overdue_tenants;
\echo ''
\echo '=== opcje widoku invoices_overdue (security_invoker?) ==='
SELECT c.relname, c.reloptions
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'invoices_overdue';
SQL

echo ""
echo "GOTOWE. Wynik: $OUT/wynik-99-sec-c-05-rozstrzygniecie.txt"
echo "Napisz Claude'owi: „jest rozstrzygnięcie C-05\""
