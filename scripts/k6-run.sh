#!/usr/bin/env bash
# Uruchamia k6 z flagami PRZED ścieżką skryptu (wymaganie CLI k6).
# pnpm dokleja argumenty na koniec komendy — bez tego wrappera
# `pnpm load:smoke -- -e BASE_URL=...` kończy się błędem "accepts 1 arg(s)".
#
# Przykład:
#   pnpm load:smoke -- -e BASE_URL=https://preview.vercel.app
#   pnpm load:run -- -e PROFILE=peak -e LOAD_TEST_PASSWORD=secret

set -euo pipefail

SCRIPT="${1:?Podaj ścieżkę skryptu k6, np. load-tests/smoke.js}"
shift

# pnpm: `pnpm load:smoke -- -e FOO=bar` → ... smoke.js -- -e FOO=bar
K6_ARGS=()
for arg in "$@"; do
  if [[ "$arg" == "--" ]]; then
    continue
  fi
  K6_ARGS+=("$arg")
done

exec k6 run "${K6_ARGS[@]}" "$SCRIPT"
