#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
# M0 · Generuj dedykowany SSH key dla Hetzner
# ────────────────────────────────────────────────────────────────
# Ed25519 (lepszy od RSA: szybszy, krótszy, równie bezpieczny),
# dedykowany dla Hetzner (separation od osobistego ~/.ssh/id_*).
# Z passphrase — Hetzner trzyma tylko PUBLIC key, ale private musi
# być chronione lokalnie.
#
# Bezpieczne uruchomienie wielokrotne (idempotent) — pyta przed
# nadpisaniem istniejącego pliku.
# ════════════════════════════════════════════════════════════════

set -euo pipefail

readonly KEY_NAME="hetzner_faktflow_ed25519"
readonly KEY_PATH="${HOME}/.ssh/${KEY_NAME}"
readonly KEY_COMMENT="hetzner-faktflow-$(date +%Y%m%d)"

# Kolory dla czytelności (TTY only)
if [ -t 1 ]; then
  readonly G="\033[32m"; readonly Y="\033[33m"; readonly R="\033[31m"; readonly N="\033[0m"
else
  G=""; Y=""; R=""; N=""
fi

echo -e "${G}▸ M0 · SSH keygen dla Hetzner Cloud${N}"
echo

# Sprawdź czy ~/.ssh istnieje, utwórz z poprawnymi prawami jeśli nie.
if [ ! -d "${HOME}/.ssh" ]; then
  mkdir -p "${HOME}/.ssh"
  chmod 700 "${HOME}/.ssh"
  echo "  Utworzono ${HOME}/.ssh (700)"
fi

# Sprawdź czy key już istnieje.
if [ -f "${KEY_PATH}" ]; then
  echo -e "${Y}  Key już istnieje: ${KEY_PATH}${N}"
  read -r -p "  Nadpisać? (y/N): " confirm
  if [[ ! "${confirm}" =~ ^[yY]$ ]]; then
    echo "  Przerwane — istniejący key zostaje. Nic nie ruszone."
    exit 0
  fi
  # Backup starego klucza zanim nadpiszemy.
  mv "${KEY_PATH}" "${KEY_PATH}.bak-$(date +%s)"
  mv "${KEY_PATH}.pub" "${KEY_PATH}.pub.bak-$(date +%s)" 2>/dev/null || true
  echo "  Stary key zbackupowany jako ${KEY_PATH}.bak-*"
fi

# Generuj. -N "" oznaczałoby brak passphrase — celowo NIE podajemy
# i ssh-keygen interaktywnie pyta o passphrase (silne hasło wymagane).
echo -e "${G}▸ Generuję klucz ed25519...${N}"
echo "  Podaj silne passphrase (zostanie zapytane 2×). Zapisz w 1Password / Bitwarden."
echo
ssh-keygen -t ed25519 -C "${KEY_COMMENT}" -f "${KEY_PATH}"

# Sanity check — ssh-keygen powinien zwrócić exit 0 a pliki istnieć.
if [ ! -f "${KEY_PATH}" ] || [ ! -f "${KEY_PATH}.pub" ]; then
  echo -e "${R}✗ Generowanie zawiodło — pliki nie istnieją.${N}" >&2
  exit 1
fi

chmod 600 "${KEY_PATH}"
chmod 644 "${KEY_PATH}.pub"

echo
echo -e "${G}✓ GOTOWE${N}"
echo
echo "  Private key (NIE udostępniaj):  ${KEY_PATH}"
echo "  Public key  (do Hetzner):       ${KEY_PATH}.pub"
echo
echo -e "${Y}▸ Następne kroki:${N}"
echo "  1. Skopiuj PUBLIC key do schowka:"
echo "       pbcopy < ${KEY_PATH}.pub      # macOS"
echo "       xclip -sel clip < ${KEY_PATH}.pub   # Linux"
echo
echo "  2. Wklej do Hetzner Cloud:"
echo "       https://console.hetzner.cloud/projects → Security → SSH Keys → Add SSH Key"
echo "       Nazwa: \"faktflow-deploy-key\""
echo
echo "  3. Dodaj key do ssh-agent (uniknięcie wpisywania passphrase za każdym razem):"
echo "       ssh-add ${KEY_PATH}"
echo
echo "  4. Uruchom preflight-check.sh aby zweryfikować wszystkie prereq."
