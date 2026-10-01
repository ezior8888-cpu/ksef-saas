#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
# „Najpierw test” dla PR agenta kodu (krok 7 planu automatyzacji)
# ────────────────────────────────────────────────────────────────
# Testy dodane albo zmienione w PR agenta uruchamiamy na kodzie BAZOWYM.
# Muszą tam paść: test, który przechodzi bez poprawki, nie dowodzi ani
# naprawy błędu, ani nowej funkcji. Na kodzie z PR te same testy sprawdza
# zwykły job „Typecheck + Lint + Unit tests”.
#
# Użycie (w katalogu repo z zainstalowanymi zależnościami):
#   test-first.sh <sha-bazy> <plik testu>...
# Listę plików daje `agent-guard.mjs detect` (tylko bezpieczne znaki).
# ════════════════════════════════════════════════════════════════

set -euo pipefail

BASE_SHA=${1:?podaj SHA gałęzi bazowej}
shift
[ "$#" -gt 0 ] || { echo "::error::Brak plików testów do sprawdzenia"; exit 1; }

ROOT=$(pwd)
WT=$(mktemp -d)/base
git worktree add --detach --quiet "$WT" "$BASE_SHA"
trap 'git -C "$ROOT" worktree remove --force "$WT" > /dev/null 2>&1 || true' EXIT

# Zależności z PR — baza dostaje te same node_modules; różnice w zależnościach
# i tak wymagają zgody na obszar wrażliwy (package.json, pnpm-lock.yaml).
ln -s "$ROOT/node_modules" "$WT/node_modules"
for t in "$@"; do
  mkdir -p "$WT/$(dirname "$t")"
  cp "$ROOT/$t" "$WT/$t"
done

LOG=$(mktemp)
if (cd "$WT" && pnpm exec vitest run "$@") > "$LOG" 2>&1; then
  echo "::error::Nowe testy PRZECHODZĄ na kodzie bazowym ($BASE_SHA). Nie dowodzą zmiany — najpierw test, który pada bez poprawki."
  tail -30 "$LOG"
  exit 1
fi
echo "OK: nowe testy padają na kodzie bazowym ($BASE_SHA), więc sprawdzają wprowadzaną zmianę."
grep -E "Test Files|Tests |FAIL" "$LOG" | head -15 || true
