#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
# M0 · Preflight check — wszystko gotowe do M1?
# ────────────────────────────────────────────────────────────────
# Sprawdza wszystkie prerequisity zanim ruszysz z provisioningiem
# VM-ów w M1. Każdy check independentny — fail jednego nie blokuje
# pozostałych. Końcowy raport pokazuje ile zaliczonych / wymaganych.
#
# Argumenty opcjonalne:
#   --test-vm <IP>   sprawdza ssh root@IP z dedykowanym kluczem
# ════════════════════════════════════════════════════════════════

set -uo pipefail  # -e wyłączone bo chcemy kontynuować nawet po fail

readonly KEY_PATH="${HOME}/.ssh/hetzner_faktflow_ed25519"
readonly DOMAIN="faktflow.pl"

# Kolory
if [ -t 1 ]; then
  G="\033[32m"; Y="\033[33m"; R="\033[31m"; B="\033[34m"; N="\033[0m"
else
  G=""; Y=""; R=""; B=""; N=""
fi

PASSED=0
FAILED=0
TOTAL=0

check() {
  local name="$1"
  local cmd="$2"
  TOTAL=$((TOTAL + 1))
  printf "  %-40s " "${name}"
  if eval "${cmd}" >/dev/null 2>&1; then
    printf "${G}✓${N}\n"
    PASSED=$((PASSED + 1))
    return 0
  else
    printf "${R}✗${N}\n"
    FAILED=$((FAILED + 1))
    return 1
  fi
}

note() {
  printf "       ${B}→${N} %s\n" "$1"
}

echo -e "${G}▸ M0 · Preflight check${N}"
echo

# ─── 1. SSH keys ─────────────────────────────────────────────
echo -e "${B}[1/5] SSH keys${N}"
if check "Private key existuje (${KEY_PATH##*/})" "[ -f '${KEY_PATH}' ]"; then
  # Permissions sanity — Hetzner SSH wymaga 600.
  perms=$(stat -f '%A' "${KEY_PATH}" 2>/dev/null || stat -c '%a' "${KEY_PATH}" 2>/dev/null || echo "???")
  if [ "${perms}" != "600" ]; then
    note "Permissions powinny być 600 (są ${perms}). Napraw: chmod 600 ${KEY_PATH}"
  fi
fi
check "Public key existuje" "[ -f '${KEY_PATH}.pub' ]"
check "Key załadowany w ssh-agent" "ssh-add -l 2>/dev/null | grep -q '${KEY_PATH##*/}\\|ED25519'"
if [ $? -ne 0 ]; then
  note "Załaduj: ssh-add ${KEY_PATH}"
fi
echo

# ─── 2. hcloud CLI ───────────────────────────────────────────
echo -e "${B}[2/5] hcloud CLI${N}"
if check "hcloud installed" "command -v hcloud"; then
  hcloud_version=$(hcloud version 2>/dev/null | head -1 || echo "?")
  note "${hcloud_version}"
fi
if check "HCLOUD_TOKEN env set" "[ -n \"\${HCLOUD_TOKEN:-}\" ]"; then
  note "Token długość: ${#HCLOUD_TOKEN} znaków (oczekiwane 64+)"
fi
check "hcloud connect works" "hcloud context list 2>/dev/null | grep -q active"
echo

# ─── 3. DNS / Cloudflare ─────────────────────────────────────
echo -e "${B}[3/5] DNS · ${DOMAIN}${N}"
check "${DOMAIN} resolves" "dig +short ${DOMAIN} | grep -qE '^[0-9]'"
ns=$(dig +short NS "${DOMAIN}" | sort | tr '\n' ' ' | sed 's/ $//')
if echo "${ns}" | grep -qi "cloudflare"; then
  printf "  %-40s ${G}✓${N}\n" "Nameservery to Cloudflare"
  PASSED=$((PASSED + 1)); TOTAL=$((TOTAL + 1))
  note "${ns}"
else
  printf "  %-40s ${R}✗${N}\n" "Nameservery to Cloudflare"
  FAILED=$((FAILED + 1)); TOTAL=$((TOTAL + 1))
  note "Aktualne NS: ${ns:-?}"
  note "DNS musi być u Cloudflare zanim ruszymy z migracją (front jest tam)."
fi
echo

# ─── 4. Storage Box (env vars) ───────────────────────────────
echo -e "${B}[4/5] Storage Box${N}"
check "HETZNER_SB_HOST env set" "[ -n \"\${HETZNER_SB_HOST:-}\" ]"
check "HETZNER_SB_USER env set" "[ -n \"\${HETZNER_SB_USER:-}\" ]"
# Jeśli oba set, próbuj rsync --dry-run
if [ -n "${HETZNER_SB_HOST:-}" ] && [ -n "${HETZNER_SB_USER:-}" ]; then
  check "Storage Box reachable (ping)" "ping -c 1 -W 2 ${HETZNER_SB_HOST}"
fi
echo

# ─── 5. Optional: test VM connectivity ───────────────────────
echo -e "${B}[5/5] Test VM (opcjonalne)${N}"
test_vm_ip=""
for arg in "$@"; do
  if [[ "${arg}" == --test-vm=* ]]; then
    test_vm_ip="${arg#--test-vm=}"
  fi
done
if [ -n "${test_vm_ip}" ]; then
  check "SSH to root@${test_vm_ip}" "ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new -i ${KEY_PATH} root@${test_vm_ip} 'echo ok' | grep -q ok"
else
  note "Pomiń lub uruchom: $0 --test-vm=<IP>"
fi
echo

# ─── Raport końcowy ──────────────────────────────────────────
echo "════════════════════════════════════════════"
if [ ${FAILED} -eq 0 ]; then
  echo -e "${G}✓ WSZYSTKO GOTOWE  · ${PASSED}/${TOTAL} checks passed${N}"
  echo
  echo "M0 zamknięte. Możemy startować M1 (provisioning VMs)."
else
  echo -e "${Y}⚠ ${PASSED}/${TOTAL} passed, ${FAILED} failed${N}"
  echo
  echo "Napraw failed checks i uruchom ponownie:"
  echo "  bash scripts/hetzner/preflight-check.sh"
  exit 1
fi
