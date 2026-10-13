#!/usr/bin/env bash
# Audyt 13 (RUN-*): jedno polecenie do powtórzenia testu cookies i sieci.
#
# Co robi:
#   1. uruchamia lokalny „sinkhole” (narzedzia/sinkhole-proxy.mjs) — proxy HTTP,
#      które niczego nie przekazuje dalej, tylko zapisuje docelowy host i odpowiada 403;
#   2. uruchamia `pnpm start -p 3100` (build musi już istnieć) z:
#        - NODE_OPTIONS=--require narzedzia/blokada-egress-serwera.cjs — każde
#          połączenie TCP poza pętlę zwrotną i do lokalnego proxy wyjściowego jest
#          zapisywane i przerywane, zapytania DNS o nazwy zewnętrzne odrzucane,
#        - HTTP(S)_PROXY wskazującym na sinkhole (biblioteki respektujące proxy
#          trafiają tam zamiast do dostawcy),
#        - tymi samymi zmiennymi SYNTETYCZNYMI co build;
#   3. uruchamia narzedzia/test-cookies-i-sieci.mjs (Playwright, Chromium);
#   4. zatrzymuje serwer i sinkhole (także przy błędzie).
#
# Wymaga wcześniejszego buildu z tymi samymi zmiennymi NEXT_PUBLIC_* (są
# wkompilowane w bundle przeglądarki), np.:
#   env $(grep -v '^#' narzedzia/zmienne-syntetyczne.env | xargs) pnpm build
# Nie tworzy .env.local. Narzędzie testowe, nie część aplikacji.
set -euo pipefail

ROOT=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
N="$ROOT/docs/audyt/13-prywatnosc-i-zgodnosc/narzedzia"
WORK="${AUDYT_WORKDIR:-$(mktemp -d)}"
PORT="${PORT:-3100}"
SINK_PORT="${SINK_PORT:-3199}"
mkdir -p "$WORK"
: > "$WORK/egress.jsonl"
: > "$WORK/server-sinkhole.jsonl"

# Porty lokalnych proxy wyjściowych (na pętli zwrotnej) z bieżącego środowiska —
# blokada ma je odcinać, bo przez nie ruch wyszedłby z maszyny.
BLOCKED_PORTS=$(node -e '
const out = new Set();
for (const [k, v] of Object.entries(process.env)) {
  if (!/_proxy$/i.test(k) || !v) continue;
  try { const u = new URL(v.includes("://") ? v : "http://" + v);
        if (/^(localhost|127\.|::1|\[::1\])/.test(u.hostname) && u.port) out.add(u.port); } catch {}
}
console.log([...out].join(","));')

# Zmienne syntetyczne (wartości nie są sekretami ani adresami produkcyjnymi).
set -a
# shellcheck disable=SC1091
. "$N/zmienne-syntetyczne.env"
set +a

PIDS=()
# Każdy proces tła startuje przez `setsid` we własnej grupie procesów, więc
# sprzątanie zabija całą grupę (pnpm → next start → next-server). Samo
# `kill PID` zostawiało działający `next-server` (wnuk procesu pnpm).
cleanup() {
  for p in "${PIDS[@]:-}"; do
    [ -n "$p" ] || continue
    kill -TERM -- "-$p" 2>/dev/null || kill -TERM "$p" 2>/dev/null || true
  done
  sleep 2
  for p in "${PIDS[@]:-}"; do
    [ -n "$p" ] || continue
    kill -KILL -- "-$p" 2>/dev/null || true
  done
  # Zapas: tylko proces, którego wiersz poleceń ZACZYNA SIĘ od tytułu serwera
  # Next.js (luźniejszy wzorzec trafiał też w powłoki z tym słowem w poleceniu).
  pkill -f '^next-server \(v' 2>/dev/null || true
}
trap cleanup EXIT INT TERM

SINKHOLE_PORT="$SINK_PORT" SINKHOLE_LOG="$WORK/server-sinkhole.jsonl" \
  setsid node "$N/sinkhole-proxy.mjs" > "$WORK/sinkhole.out" 2>&1 &
PIDS+=($!)

(
  cd "$ROOT"
  exec setsid env \
    NODE_OPTIONS="--require $N/blokada-egress-serwera.cjs" \
    AUDYT_EGRESS_LOG="$WORK/egress.jsonl" \
    AUDYT_BLOCKED_PORTS="$BLOCKED_PORTS" \
    AUDYT_SINKHOLE_PORT="$SINK_PORT" \
    HTTP_PROXY="http://127.0.0.1:$SINK_PORT" HTTPS_PROXY="http://127.0.0.1:$SINK_PORT" \
    http_proxy="http://127.0.0.1:$SINK_PORT" https_proxy="http://127.0.0.1:$SINK_PORT" \
    NO_PROXY="localhost,127.0.0.1,::1" no_proxy="localhost,127.0.0.1,::1" \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    SENTRY_DSN="$NEXT_PUBLIC_SENTRY_DSN" \
    pnpm start -p "$PORT"
) > "$WORK/server.out" 2>&1 &
PIDS+=($!)

for _ in $(seq 1 90); do
  if curl -s --noproxy '*' -o /dev/null -w '%{http_code}' "http://localhost:$PORT/robots.txt" | grep -q 200; then break; fi
  sleep 1
done
curl -s --noproxy '*' -o /dev/null -w "serwer: HTTP %{http_code}\n" "http://localhost:$PORT/robots.txt"

EGRESS_LOG="$WORK/egress.jsonl" SERVER_SINKHOLE_LOG="$WORK/server-sinkhole.jsonl" \
  BASE_URL="http://localhost:$PORT" \
  node "$N/test-cookies-i-sieci.mjs" > "$WORK/test.out" 2>&1 || { tail -40 "$WORK/test.out"; exit 1; }

tail -3 "$WORK/test.out"
echo "Rejestry pomocnicze: $WORK"
