#!/usr/bin/env bash
# Weryfikacja migracji 00200 (korekta z ujemną kwotą) na TYMCZASOWYM,
# lokalnym Postgresie — bez Supabase, bez żadnej zdalnej bazy.
#
#   bash scripts/verify-migration-00200.sh
#
# Wymaga binariów serwera Postgresa (initdb, pg_ctl, psql); katalog z nimi
# można podać w PGBIN. Klaster powstaje w katalogu tymczasowym (albo w
# PGTMP) i jest usuwany na końcu.
#
# Scenariusz: tabela z kolumnami i CHECK jak po migracji 00012 →
# korekta z gross_total = -246 pada → migracja 00200 → ta sama korekta
# przechodzi, a reguły dla kwot dodatnich działają jak wcześniej.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATION="$ROOT/supabase/migrations/00200_correction_negative_total_paid_check.sql"
PGBIN="${PGBIN:-$(pg_config --bindir 2>/dev/null || echo /usr/lib/postgresql/16/bin)}"
DIR="${PGTMP:-$(mktemp -d)}"
PORT="${PGPORT_TEST:-54329}"

# initdb nie działa jako root — wtedy uruchamiamy jako użytkownik postgres.
as_pg() {
  if [ "$(id -u)" = "0" ]; then runuser -u postgres -- "$@"; else "$@"; fi
}

mkdir -p "$DIR"
if [ "$(id -u)" = "0" ]; then chown postgres "$DIR"; fi
cleanup() {
  as_pg "$PGBIN/pg_ctl" -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$DIR"
}
trap cleanup EXIT

as_pg "$PGBIN/initdb" -D "$DIR/data" -U postgres -A trust >/dev/null
as_pg "$PGBIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=''" -w start >/dev/null

PSQL=("$PGBIN/psql" -h "$DIR" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)

# Stan jak po 00012: kolumny i CHECK check_paid_amount_valid.
as_pg "${PSQL[@]}" <<'SQL'
CREATE TABLE public.invoices (
  id serial PRIMARY KEY,
  gross_total NUMERIC(15, 2),
  paid_amount NUMERIC(15, 2) NOT NULL DEFAULT 0
);
ALTER TABLE public.invoices ADD CONSTRAINT check_paid_amount_valid
  CHECK (
    paid_amount >= 0
    AND (gross_total IS NULL OR paid_amount <= gross_total)
  );
INSERT INTO public.invoices (gross_total, paid_amount) VALUES (1230, 0), (1230, 1230), (NULL, 0);
SQL

expect_fail() {
  local label="$1" sql="$2"
  if as_pg "${PSQL[@]}" -c "$sql" >/dev/null 2>&1; then
    echo "BŁĄD: oczekiwano odrzucenia — $label"; exit 1
  fi
  echo "ok (odrzucone): $label"
}
expect_ok() {
  local label="$1" sql="$2"
  as_pg "${PSQL[@]}" -c "$sql" >/dev/null
  echo "ok: $label"
}

echo "— przed migracją 00200"
expect_fail "korekta w dół (gross_total -246, paid 0)" \
  "INSERT INTO public.invoices (gross_total) VALUES (-246);"

echo "— migracja 00200"
as_pg "${PSQL[@]}" --single-transaction -f "$MIGRATION"

echo "— po migracji 00200"
expect_ok "korekta w dół (gross_total -246, paid 0)" \
  "INSERT INTO public.invoices (gross_total) VALUES (-246);"
expect_fail "korekta w dół z wpłatą (paid 10)" \
  "INSERT INTO public.invoices (gross_total, paid_amount) VALUES (-246, 10);"
expect_fail "wpłata większa niż brutto (1230 / 1300)" \
  "INSERT INTO public.invoices (gross_total, paid_amount) VALUES (1230, 1300);"
expect_fail "ujemna wpłata" \
  "INSERT INTO public.invoices (gross_total, paid_amount) VALUES (1230, -1);"
expect_ok "wpłata częściowa (1230 / 500)" \
  "INSERT INTO public.invoices (gross_total, paid_amount) VALUES (1230, 500);"
expect_ok "istniejące wiersze nadal spełniają warunek" \
  "SELECT 1 FROM public.invoices;"

echo "Migracja 00200: wszystkie sprawdzenia przeszły."
