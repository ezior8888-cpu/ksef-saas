#!/usr/bin/env bash
#
# Potwierdzenie dwóch ustaleń dnia 3 — SEC-C-05 i SEC-C-06.
#
# OBA TESTY SĄ BEZPIECZNE I NIC NIE NISZCZĄ:
#  • Test 1 (SEC-C-05) to czysty SELECT — liczy, ile najemców widzi rola
#    `authenticated` przez widok `invoices_overdue`. Nie pobiera treści faktur,
#    tylko liczby.
#  • Test 2 (SEC-C-06) wywołuje `anonymize_user_audit_logs` z UUID, którego
#    W BAZIE NIE MA (`0000...`). Funkcja robi `UPDATE ... WHERE user_id = ten
#    nieistniejący` → dotyka ZERO wierszy. Sprawdzamy tylko, czy niezalogowany
#    W OGÓLE ma prawo ją wywołać. Żaden prawdziwy log nie zostaje ruszony.
#
# Dlaczego to potwierdzenie jest potrzebne: analiza kodu i uprawnień wskazuje
# na oba problemy jednoznacznie, ale zanim powiemy „potwierdzone", chcemy
# odpowiedzi od żywej bazy, a nie tylko z plików.
#
# URUCHAMIA CZŁOWIEK w WSL (hasło do klucza). Wyniki do docs/security/audyt/.
#
set -uo pipefail
KEY="$HOME/.ssh/hetzner_faktflow_ed25519"
OUT="docs/security/audyt"
[[ -f "$KEY" ]] || { echo "BŁĄD: brak klucza $KEY (jesteś w WSL?)"; exit 1; }
mkdir -p "$OUT"

if ! ssh-add -l 2>/dev/null | grep -q hetzner_faktflow; then
  echo "▶ Wpisz hasło do klucza SSH (raz):"
  eval "$(ssh-agent -s)" >/dev/null
  ssh-add "$KEY" || { echo "BŁĄD: klucz odrzucony."; exit 1; }
fi

DB="root@178.104.128.144"
PGC=$(ssh -i "$KEY" $DB "docker ps --format '{{.Names}}' | grep '^supabase-db' | head -1")
REST=$(ssh -i "$KEY" $DB "docker ps --format '{{.Names}}' | grep '^supabase-rest' | head -1")
echo "  kontener bazy:      $PGC"
echo "  kontener PostgREST: $REST"

# ── Test 1: SEC-C-05 — czy authenticated widzi wielu najemców ────
echo "▶ Test 1 (SEC-C-05): ilu najemców widać przez invoices_overdue jako authenticated..."
ssh -i "$KEY" $DB "docker exec -i $PGC psql -U postgres -d postgres" > "$OUT/wynik-99-sec-c-05.txt" 2>&1 <<'SQL'
\echo '=== SEC-C-05: widok invoices_overdue jako rola authenticated (bez kontekstu JWT) ==='
\echo '(wierszy_widocznych i roznych_najemcow > 1  =  WYCIEK MIĘDZY NAJEMCAMI potwierdzony)'
SET ROLE authenticated;
SELECT
  count(*)                     AS wierszy_widocznych,
  count(DISTINCT tenant_id)    AS roznych_najemcow
FROM public.invoices_overdue;
RESET ROLE;
\echo ''
\echo '=== dla porownania: to samo bezposrednio na tabeli invoices (RLS powinien odciac) ==='
SET ROLE authenticated;
SELECT count(*) AS invoices_widocznych_bez_kontekstu FROM public.invoices;
RESET ROLE;
SQL

# ── Test 2: SEC-C-06 — czy anon może wywołać anonymize (bezpiecznie) ─
echo "▶ Test 2 (SEC-C-06): czy niezalogowany może wywołać anonymize_user_audit_logs (UUID nieistniejący)..."
{
  echo "=== SEC-C-06: RPC bez tokenu, p_user_id = 0000... (nie istnieje, nic nie ruszy) ==="
  echo '{"updated_rows":0} = anon MOŻE wywołać (potwierdza); 401/403/42501 = nie może'
  ssh -i "$KEY" $DB bash -s <<'REMOTE'
    IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' \
      $(docker ps --format '{{.Names}}' | grep '^supabase-rest' | head -1))
    curl -s -X POST "http://$IP:3000/rpc/anonymize_user_audit_logs" \
      -H 'Content-Type: application/json' \
      -d '{"p_user_id":"00000000-0000-0000-0000-000000000000"}'
    echo
REMOTE
} > "$OUT/wynik-99-sec-c-06.txt" 2>&1

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "GOTOWE. Nic w bazie nie zostało zmienione. Wyniki:"
echo "  $OUT/wynik-99-sec-c-05.txt"
echo "  $OUT/wynik-99-sec-c-06.txt"
echo ""
echo "Napisz Claude'owi: „wyniki potwierdzenia są w wynik-99-*\""
echo "═══════════════════════════════════════════════════════════"
