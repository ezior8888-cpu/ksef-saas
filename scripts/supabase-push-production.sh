#!/usr/bin/env bash
# Preferuj (działa bez chmod +x):  pnpm db:push:prod:dry | pnpm db:push:prod
# z ustawioną zmienną SUPABASE_DB_URL (patrz scripts/supabase-push-production.mjs).
#
# Zastosuj lokalny katalog supabase/migrations/ na bazę PRODUKCYJNą (wszystkie migracje
# widoczne jako „pending” w historii Supabase dla tego hosta — zwykle od 00015 jeśli
# prod jest zsynchronizowany do 00014).
#
# 1. Supabase Dashboard → Twój projekt PRODUCTION → Settings → Database
# 2. Skopiuj „Connection string” → URI (nie Session pooler przy problemach — użyj Direct)
#    Format: postgres://postgres.[ref]:[HASŁO]@aws-0-...pooler.supabase.com:6543/postgres
#    Dla migracji częściej: port 5432 + host „db.” (jak w dokumentacji „Direct connection”)
# UWAGA: host `db.<ref>.supabase.co` często ma tylko DNS AAAA (IPv6). Niektóre sieci
# CI / zdalne kontenery nie mają trasy IPv6 — wtedy `supabase db push` padnie z
# "no route to host". Uruchom ten skrypt **lokalnie** (macOS / domowy internet).
#
# Jednorazowo:
#   export SUPABASE_DB_URL='postgres://...'
#   ./scripts/supabase-push-production.sh
#
# Dry-run (tylko wypisze co zostałoby odpalone):
#   export SUPABASE_DB_URL='postgres://...'
#   ./scripts/supabase-push-production.sh --dry-run

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "Brak zmiennej SUPABASE_DB_URL. Ustaw connection URI do bazy produkcyjnej (patrz nagłówek skryptu)." >&2
  exit 1
fi

DRY=( )
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY=( --dry-run )
fi

exec npx --yes supabase@latest db push --workdir "$ROOT" --db-url "$SUPABASE_DB_URL" --yes "${DRY[@]}"
