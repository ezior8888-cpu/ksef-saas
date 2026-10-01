#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
# Nocny pełny zrzut bazy na db-1 (krok 6 planu automatyzacji)
# ────────────────────────────────────────────────────────────────
# Dlaczego obok nocnego snapshotu aplikacji: tamten
# (lib/backup/db-snapshot.ts) czyta przez REST tylko schemat `public`,
# stronami, bez punktu w czasie — bez `auth.*` (loginy, MFA) i `pgboss.*`
# (AUD-08). pg_dump robi spójny zrzut całej bazy `postgres` w jednej
# transakcji, a próba odtworzenia z 1 października 2026 potwierdziła, że
# da się go wgrać do czystego obrazu supabase/postgres
# (docs/runbooks/backup-restore.md).
#
# Uruchamia cron na db-1 jako root. Konfiguracja poza repo, w
# /etc/faktflow-backup.env:
#   PGC=<nazwa kontenera Postgresa>   wymagane
#   BACKUP_DIR=/root/backups/daily    katalog zrzutów
#   KEEP=14                           ile ostatnich KOMPLETNYCH zrzutów trzymać
#   MIN_BYTES=1000000                 mniejszy zrzut = błąd (pusty albo ucięty)
#   HC_URL=https://hc-ping.com/<id>   ping Healthchecks (start / sukces / fail)
#   RCLONE_REMOTE=boxcrypt:db         kopia poza serwerem; MUSI być zdalnym
#                                     typu `crypt` — niezaszyfrowanego zrzutu
#                                     skrypt nie wyśle
#
# Retencja ma bezpiecznik (jak AUD-07 w snapshotach aplikacji): kasowanie
# rusza tylko po udanym zrzucie i liczy wyłącznie kompletne zrzuty (z plikiem
# .sha256). Seria awarii nie wypycha dobrych kopii.
#
# Kopia poza serwerem idzie przez `rclone copy`, nie `sync` — skasowanie
# zrzutu na db-1 (retencja, włamanie, pomyłka) nie kasuje go na Storage Box.
# Starsze kopie tam czyści się osobno (snapshoty i retencja Storage Box).
# ════════════════════════════════════════════════════════════════

set -Eeuo pipefail

CONFIG=${FAKTFLOW_BACKUP_CONFIG:-/etc/faktflow-backup.env}
# shellcheck source=/dev/null
[ -f "$CONFIG" ] && . "$CONFIG"

: "${PGC:?brak PGC (nazwa kontenera Postgresa) w $CONFIG}"
BACKUP_DIR=${BACKUP_DIR:-/root/backups/daily}
KEEP=${KEEP:-14}
MIN_BYTES=${MIN_BYTES:-1000000}

log() { echo "$(date -u +%FT%TZ) $*"; }

ping_hc() {
  [ -n "${HC_URL:-}" ] || return 0
  curl -fsS -m 10 --retry 3 -o /dev/null "${HC_URL}$1" || log "uwaga: ping Healthchecks ($1) nieudany"
}

fail() {
  log "BŁĄD: $*" >&2
  ping_hc /fail
  exit 1
}
trap 'fail "przerwane w linii $LINENO"' ERR

# Dwa przebiegi naraz (cron + ręczne uruchomienie) pisałyby te same pliki.
exec 9> /var/lock/faktflow-db-backup.lock
flock -n 9 || fail "poprzedni przebieg wciąż trwa"

umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
ping_hc /start

# Pozostałości po przerwanym przebiegu nie mogą udawać kopii.
rm -rf "$BACKUP_DIR"/.partial-* "$BACKUP_DIR"/.outbox

NAME="faktflow-$(date -u +%Y%m%dT%H%M%SZ)"
PART="$BACKUP_DIR/.partial-$NAME"
T0=$(date +%s)

# Pełna baza (public, auth, storage, pgboss, supabase_migrations, …) w jednej
# transakcji. supabase_admin = superużytkownik obrazu; `postgres` nie widzi
# wszystkich schematów.
docker exec "$PGC" pg_dump -U supabase_admin -d postgres -Fc -Z 6 > "$PART.dump"
# Role z hasłami (hashe) — potrzebne, gdy odtwarzamy poza obrazem Supabase.
docker exec "$PGC" pg_dumpall -U supabase_admin --roles-only > "$PART.roles.sql"

SIZE=$(stat -c %s "$PART.dump")
[ "$SIZE" -ge "$MIN_BYTES" ] || fail "zrzut ma ${SIZE} B (< ${MIN_BYTES}) — pusty albo ucięty"
# Spis treści musi dać się przeczytać, inaczej zrzut jest bezużyteczny.
TOC=$(docker exec -i "$PGC" pg_restore -l < "$PART.dump" | grep -c ';') || fail "pg_restore nie czyta zrzutu"
grep -q 'CREATE ROLE' "$PART.roles.sql" || fail "zrzut ról jest pusty"

mv "$PART.dump" "$BACKUP_DIR/$NAME.dump"
mv "$PART.roles.sql" "$BACKUP_DIR/$NAME.roles.sql"
(cd "$BACKUP_DIR" && sha256sum "$NAME.dump" "$NAME.roles.sql" > "$NAME.sha256")
log "zrzut $NAME: ${SIZE} B, ${TOC} pozycji spisu, $(( $(date +%s) - T0 )) s"

if [ -n "${RCLONE_REMOTE:-}" ]; then
  command -v rclone > /dev/null || fail "RCLONE_REMOTE ustawiony, a rclone nie jest zainstalowany"
  REMOTE_NAME=${RCLONE_REMOTE%%:*}
  rclone config show "$REMOTE_NAME" 2>/dev/null | grep -q '^type = crypt' \
    || fail "zdalny '$REMOTE_NAME' nie jest typu crypt — niezaszyfrowanego zrzutu nie wysyłam"
  mkdir -p "$BACKUP_DIR/.outbox/$NAME"
  cp "$BACKUP_DIR/$NAME.dump" "$BACKUP_DIR/$NAME.roles.sql" "$BACKUP_DIR/$NAME.sha256" "$BACKUP_DIR/.outbox/$NAME/"
  rclone copy --immutable --retries 3 "$BACKUP_DIR/.outbox/$NAME" "$RCLONE_REMOTE/$NAME"
  # Sprawdzenie po stronie Storage Box: odszyfrowane pliki mają te same sumy.
  rclone cryptcheck --one-way "$BACKUP_DIR/.outbox/$NAME" "$RCLONE_REMOTE/$NAME" \
    || fail "kopia na $RCLONE_REMOTE nie zgadza się z lokalną"
  rm -rf "$BACKUP_DIR/.outbox"
  log "kopia poza serwerem: $RCLONE_REMOTE/$NAME"
fi

# Retencja: tylko kompletne zrzuty, najnowsze najpierw (nazwa zawiera czas UTC).
mapfile -t COMPLETE < <(find "$BACKUP_DIR" -maxdepth 1 -name 'faktflow-*.sha256' | sort -r)
if [ "${#COMPLETE[@]}" -gt "$KEEP" ]; then
  for sha in "${COMPLETE[@]:$KEEP}"; do
    base=${sha%.sha256}
    rm -f "$base.dump" "$base.roles.sql" "$sha"
    log "retencja: usunięto $(basename "$base")"
  done
fi

ping_hc ""
log "OK"
