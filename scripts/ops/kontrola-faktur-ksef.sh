#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
# Kontrola stanu produkcji: faktury, kolejki pg-boss, worker — TYLKO ODCZYT
# ────────────────────────────────────────────────────────────────
# Jedna linia, bez argumentów, z katalogu repo:
#
#   ./scripts/ops/kontrola-faktur-ksef.sh
#
# Skrypt sam ładuje `.agents/infra.env` (K, APP, DB, PGC, APP_PREFIX,
# WORKER_PREFIX) — przycisk „Run” w aplikacji uruchamia każdy blok w świeżej
# powłoce, więc osobne `source` nic nie daje. Nic nie zmienia na serwerach:
# `docker ps`, `docker logs`, `curl` do /api/health i SELECT-y przez psql.
#
# Co pokazuje (sekcje odpowiadają kontrolom z rewizji 03.10.2026):
#   1. kontenery na app-1 i SHA obrazów (web i worker na tym samym commicie?)
#   2. log workera z 2 h: crony, błędy, wyczerpane ponowienia, heartbeat
#   3. /api/health aplikacji
#   4. faktury wychodzące wg statusu; `queued` i `sending` > 15 min;
#      `failed` wg kodu; `failed`/`rejected` z przejęciem wysyłki (K3);
#      przyjęte bez środowiska KSeF (W15)
#   5. UPO wg statusu i błędu (W12)
#   6. skrzynka: przychodzące bez kosztu, bez XML, z otwartym znacznikiem (K2)
#   7. pg-boss: joby wg (kolejka, stan), harmonogramy, polityka kolejek
#   8. ostatnie migracje w schema_migrations
#
# Błąd jednego zapytania nie przerywa reszty (np. kolumna sprzed migracji).
# ════════════════════════════════════════════════════════════════

set -euo pipefail

# Gdzie leży `.agents/infra.env`: zmienna FAKTFLOW_INFRA_ENV, katalog tego
# repo, a dla worktree (`.claude/worktrees/*`) — główny checkout, bo plik jest
# poza gitem i worktree go nie ma.
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
MAIN_ROOT=""
if command -v git >/dev/null 2>&1; then
  COMMON_DIR=$(git -C "$ROOT" rev-parse --git-common-dir 2>/dev/null || true)
  if [ -n "$COMMON_DIR" ]; then
    case "$COMMON_DIR" in
      /*) MAIN_ROOT=$(cd "$COMMON_DIR/.." && pwd) ;;
      *)  MAIN_ROOT=$(cd "$ROOT/$COMMON_DIR/.." && pwd) ;;
    esac
  fi
fi

ENV_FILE=""
for candidate in "${FAKTFLOW_INFRA_ENV:-}" "$ROOT/.agents/infra.env" "${MAIN_ROOT:+$MAIN_ROOT/.agents/infra.env}"; do
  if [ -n "$candidate" ] && [ -f "$candidate" ]; then
    ENV_FILE=$candidate
    break
  fi
done

if [ -z "$ENV_FILE" ]; then
  {
    echo "Nie znalazłem .agents/infra.env (plik jest poza gitem — AGENTS.md → Infrastruktura)."
    echo "Szukałem w: ${FAKTFLOW_INFRA_ENV:-(FAKTFLOW_INFRA_ENV nieustawione)}, $ROOT/.agents/infra.env${MAIN_ROOT:+, $MAIN_ROOT/.agents/infra.env}"
  } >&2
  exit 1
fi
# shellcheck source=/dev/null
source "$ENV_FILE"
for v in K APP DB PGC APP_PREFIX WORKER_PREFIX; do
  if [ -z "${!v:-}" ]; then
    echo "Brak zmiennej $v w $ENV_FILE." >&2
    exit 1
  fi
done

# `--sprawdz`: tylko pokaż, skąd czytasz konfigurację, bez łączenia z serwerami.
if [ "${1:-}" = "--sprawdz" ]; then
  echo "Konfiguracja: $ENV_FILE"
  echo "Klucz SSH: $K ($([ -f "$K" ] && echo 'jest' || echo 'BRAK PLIKU'))"
  echo "Serwery: app=$APP db=$DB; kontener Postgresa: $PGC"
  exit 0
fi

SSH=(ssh -i "$K" -o ConnectTimeout=15 -o BatchMode=yes)

section() { printf '\n=== %s\n' "$1"; }

# SELECT przez psql w kontenerze Postgresa. SQL bez cudzysłowów, backticków
# i znaku dolara — przechodzi przez dwie powłoki.
sql() {
  local label=$1 query=$2
  printf -- '--- %s\n' "$label"
  "${SSH[@]}" "root@$DB" \
    "docker exec $PGC psql -U postgres -d postgres -At -F' | ' -v ON_ERROR_STOP=1 -c \"$query\"" \
    || echo "  (zapytanie nieudane — brak tabeli/kolumny albo brak dostępu)"
}

section "1. app-1: kontenery (web i worker na tym samym SHA?)"
"${SSH[@]}" "root@$APP" 'docker ps --format "{{.Names}}\t{{.Status}}\t{{.Image}}" | grep -v coolify-' \
  || echo "  (nie udało się odczytać kontenerów)"

section "2. app-1: worker — crony, błędy, wyczerpane ponowienia, heartbeat (2 h)"
"${SSH[@]}" "root@$APP" \
  "W=\$(docker ps --format '{{.Names}}' | grep '^$WORKER_PREFIX' | head -1); \
   if [ -z \"\$W\" ]; then echo '  (brak kontenera workera)'; exit 0; fi; \
   docker logs --since 2h \"\$W\" 2>&1 | grep -iE 'cron|error|exhaust|heartbeat|błąd|bledy' | grep -v getSession | tail -40" \
  || echo "  (nie udało się odczytać logu workera)"

section "3. app-1: /api/health"
"${SSH[@]}" "root@$APP" \
  "A=\$(docker ps --format '{{.Names}}' | grep '^$APP_PREFIX' | head -1); \
   if [ -z \"\$A\" ]; then echo '  (brak kontenera aplikacji)'; exit 0; fi; \
   docker exec \"\$A\" curl -s -o /dev/null -w 'HTTP %{http_code} w %{time_total}s\n' http://localhost:3000/api/health" \
  || echo "  (nie udało się odpytać /api/health)"

section "4. db-1: faktury wychodzące"
sql "statusy" \
  "SELECT coalesce(ksef_status,'(null)') AS status, count(*) FROM invoices WHERE direction='outgoing' GROUP BY 1 ORDER BY 1"
sql "queued > 15 min (W2/W3: bez joba?)" \
  "SELECT count(*) FROM invoices WHERE direction='outgoing' AND ksef_status='queued' AND updated_at < now() - interval '15 min'"
sql "sending > 15 min od przejęcia (alarm stale_ksef_sending_invoices)" \
  "SELECT count(*) FROM invoices WHERE direction='outgoing' AND ksef_status='sending' AND (submitted_to_ksef_at IS NULL OR submitted_to_ksef_at < now() - interval '15 min')"
sql "failed wg kodu błędu" \
  "SELECT coalesce(last_error_code,'(brak kodu)') AS kod, count(*) FROM invoices WHERE direction='outgoing' AND ksef_status='failed' GROUP BY 1 ORDER BY 2 DESC"
sql "failed/rejected z przejęciem wysyłki (K3: zamrożone, bez ponowienia)" \
  "SELECT ksef_status, count(*) FROM invoices WHERE direction='outgoing' AND ksef_status IN ('failed','rejected') AND submitted_to_ksef_at IS NOT NULL GROUP BY 1"
sql "przyjęte bez środowiska KSeF (W15/S13: do uzgodnienia jako postgres)" \
  "SELECT direction, count(*) FROM invoices WHERE ksef_status='accepted' AND ksef_environment IS NULL GROUP BY 1"
sql "przyjęte wg środowiska (przed przełączeniem KSEF_ENV)" \
  "SELECT direction, coalesce(ksef_environment,'(null)') AS env, count(*) FROM invoices WHERE ksef_status='accepted' GROUP BY 1,2 ORDER BY 1,2"

section "5. db-1: UPO"
sql "statusy" "SELECT status, count(*) FROM upo_receipts GROUP BY 1 ORDER BY 1"
sql "failed wg błędu (W12: NO_SESSION_REFERENCE wraca co godzinę)" \
  "SELECT left(coalesce(last_error,'(brak)'),60) AS blad, count(*) FROM upo_receipts WHERE status='failed' GROUP BY 1 ORDER BY 2 DESC"

section "6. db-1: skrzynka (faktury przychodzące)"
sql "bez kosztu w expenses (K2)" \
  "SELECT count(*) FROM invoices i WHERE i.direction='incoming' AND NOT EXISTS (SELECT 1 FROM expenses e WHERE e.ksef_invoice_id = i.id)"
sql "bez oryginału XML (W11)" \
  "SELECT count(*) FROM invoices WHERE direction='incoming' AND xml_storage_path IS NULL"
sql "z otwartym znacznikiem _pendingFullFetch (K2: cron inbox-backfill)" \
  "SELECT count(*) FROM invoices WHERE direction='incoming' AND fa3_data->>'_pendingFullFetch' = 'true'"
sql "kursory skrzynki (window_to = HWM, saved_count)" \
  "SELECT tenant_id, window_to, announced_count, saved_count, updated_at FROM ksef_inbox_cursor ORDER BY updated_at DESC LIMIT 10"

section "7. db-1: pg-boss"
sql "joby wg kolejki i stanu (osierocone kolejki po ETAP 10?)" \
  "SELECT name, state, count(*) FROM pgboss.job GROUP BY 1,2 ORDER BY 1,2"
sql "harmonogramy (powinny odpowiadać CRON_JOBS; wycofane: cron.refresh-materialized-views)" \
  "SELECT name, cron FROM pgboss.schedule ORDER BY 1"
sql "polityka kolejek (QUEUE_POLICY: retry_limit, expire_seconds)" \
  "SELECT name, retry_limit, retry_delay, expire_seconds FROM pgboss.queue ORDER BY 1"

section "8. db-1: ostatnie migracje"
sql "schema_migrations" \
  "SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5"

printf '\nKoniec. Skrypt niczego nie zmienił.\n'
