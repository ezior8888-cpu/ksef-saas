#!/usr/bin/env bash
#
# Odczyt diagnostyczny produkcji — kroki dnia 3 audytu bezpieczeństwa.
#
# TYLKO ODCZYT. Skrypt wykonuje wyłącznie SELECT-y po katalogu systemowym
# Postgresa oraz jedno zapytanie GET do PostgREST-a. NIC nie zapisuje do bazy,
# nie zakłada blokad, nie wgrywa migracji. Można go puścić na działającej
# produkcji.
#
# URUCHAMIA GO CZŁOWIEK w swoim terminalu WSL — bo klucz SSH jest chroniony
# hasłem, a Claude haseł do kluczy nie obsługuje. Skrypt pyta o hasło do klucza
# RAZ (przez ssh-agent), nie przy każdym z sześciu połączeń.
#
# Wyniki lądują w docs/security/audyt/wynik-*.txt — Claude czyta je stamtąd.
#
# Użycie (z katalogu worktree):
#   bash scripts/security/run-prod-readonly.sh
#
set -uo pipefail

KEY="$HOME/.ssh/hetzner_faktflow_ed25519"
OUT="docs/security/audyt"
SQL="scripts/security/sql"

# ── Sprawdzenia wstępne ──────────────────────────────────────────
if [[ ! -f "$KEY" ]]; then
  echo "BŁĄD: nie ma klucza $KEY. Jesteś w WSL? (nie w PowerShellu)"; exit 1
fi
if [[ ! -d "$SQL" ]]; then
  echo "BŁĄD: nie widzę $SQL. Uruchom z katalogu worktree, nie z /."; exit 1
fi
mkdir -p "$OUT"

# ── Klucz do agenta: hasło wpisujesz TU, raz ─────────────────────
if ! ssh-add -l 2>/dev/null | grep -q hetzner_faktflow; then
  echo "▶ Odblokowuję klucz SSH. Wpisz hasło do klucza (raz):"
  eval "$(ssh-agent -s)" >/dev/null
  ssh-add "$KEY" || { echo "BŁĄD: złe hasło albo klucz odrzucony."; exit 1; }
fi

# ── Gdzie jest baza: config mówi jedno, AGENTS.md drugie ─────────
# Pamięć projektu: „docs w repo podają PLAN, nie stan" — więc najpierw
# próbujemy aliasu z ~/.ssh/config (faktflow-db, przez bastion), a dopiero
# potem bezpośredniego IP z AGENTS.md. Który zadziała, ten zapiszemy.
DBSSH=""
echo "▶ Szukam drogi do bazy..."
if ssh -o BatchMode=yes -o ConnectTimeout=8 faktflow-db 'echo ok' 2>/dev/null | grep -q ok; then
  DBSSH="faktflow-db"
  echo "  ✓ działa alias 'faktflow-db' (przez bastion, zgodnie z ~/.ssh/config)"
elif ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=8 root@178.104.128.144 'echo ok' 2>/dev/null | grep -q ok; then
  DBSSH="-i $KEY root@178.104.128.144"
  echo "  ✓ działa bezpośredni adres 178.104.128.144 (zgodnie z AGENTS.md)"
else
  echo "BŁĄD: nie mogę połączyć się z bazą ani przez alias, ani bezpośrednio."
  echo "      Sprawdź VPN/sieć albo zapytaj Bartka, który adres jest prawdziwy."
  exit 1
fi

# zapisujemy, która wersja adresu okazała się prawdziwa — to jedno z ustaleń
echo "Baza osiągalna przez: $DBSSH  (data: $(date +%F))" > "$OUT/wynik-00-adres-bazy.txt"

# ── Nazwa kontenera Postgresa (hash generowany przez Coolify) ────
PGC=$(ssh $DBSSH "docker ps --format '{{.Names}}' | grep '^supabase-db' | head -1")
if [[ -z "$PGC" ]]; then
  echo "BŁĄD: nie znalazłem kontenera supabase-db na serwerze."; exit 1
fi
echo "  ✓ kontener bazy: $PGC"

# ── Blok A: sześć zapytań SQL po katalogu systemowym ────────────
echo "▶ Wykonuję zapytania SQL (tylko odczyt)..."
for f in "$SQL"/0*.sql; do
  name=$(basename "$f" .sql)
  echo "    · $name"
  # SQL leci na stdin przez ssh → docker exec -i → psql. Bez scp, bez /tmp.
  # Bez ON_ERROR_STOP: to odczyt, chcemy zobaczyć wszystkie zapytania,
  # nawet jeśli jedno się potknie.
  ssh $DBSSH "docker exec -i $PGC psql -U postgres -d postgres" \
    < "$f" > "$OUT/wynik-$name.txt" 2>&1
done

# ── Blok B: dwie rzeczy spoza psql (sekcja 5.4 pliku 05) ────────
# Rola, którą łączy się PostgREST — rozstrzyga wagę ustalenia SEC-C-01.
# Hasło w PGRST_DB_URI zamazujemy, BO ten plik pójdzie do repozytorium.
echo "▶ Konfiguracja PostgREST (hasło zamazane w wyniku)..."
REST=$(ssh $DBSSH "docker ps --format '{{.Names}}' | grep '^supabase-rest' | head -1")
{
  echo "=== rola i schematy PostgREST (hasło zamazane) ==="
  ssh $DBSSH "docker inspect $REST --format '{{range .Config.Env}}{{println .}}{{end}}'" \
    | grep -E 'PGRST_DB_SCHEMAS|PGRST_DB_ANON_ROLE|PGRST_DB_URI' \
    | sed -E 's#(://[^:]+:)[^@]+@#\1***@#'
} > "$OUT/wynik-05b-postgrest-config.txt" 2>&1

# Czy PostgREST oddaje dane BEZ tokenu (z wnętrza sieci, adres kontenera).
echo "▶ Test PostgREST bez tokenu (5 wrażliwych tabel)..."
{
  echo "=== odpowiedź PostgREST na zapytanie bez tokenu ==="
  echo "(42501 = poprawna odmowa; JAKIEKOLWIEK dane = ustalenie krytyczne)"
  ssh $DBSSH bash -s <<'REMOTE'
    IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' \
      $(docker ps --format '{{.Names}}' | grep '^supabase-rest' | head -1))
    for T in invoices contractors tenants audit_logs gdpr_deletion_requests; do
      printf '%-24s ' "$T"
      curl -s "http://$IP:3000/$T?limit=1" | head -c 200
      echo
    done
REMOTE
} > "$OUT/wynik-05c-postgrest-bez-tokenu.txt" 2>&1

# ── Podsumowanie ─────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "GOTOWE. Wyniki w $OUT/:"
ls -1 "$OUT"/wynik-*.txt | sed 's/^/  /'
echo ""
echo "Nic nie zostało zapisane do bazy. Teraz napisz Claude'owi:"
echo "  „wyniki są w docs/security/audyt/wynik-*.txt\""
echo "  a on je przeczyta i domknie dzień 3."
echo "═══════════════════════════════════════════════════════════"
