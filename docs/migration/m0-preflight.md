# M0 — Pre-flight Hetzner (Migracja Self-hosted)

**Cel:** Konto Hetzner gotowe, dedykowany SSH key, hcloud CLI, DNS u Cloudflare, Storage Box, test VM smoke.

**Czas:** 1-2 dni (głównie waiting na rejestrację konta / weryfikację billingową).

**Rollback:** trivialny — nic nie jest jeszcze podpięte do produkcji. W razie wątpliwości anuluj konto.

---

## Decyzje przyjęte (Auto Mode defaults)

| Parametr | Wartość | Dlaczego |
|---|---|---|
| Region | **FSN1 (Falkenstein)** | Najtańszy + EU + RODO + ten sam datacenter cluster co Nuremberg |
| SSH key | **Nowy dedykowany** `~/.ssh/hetzner_faktflow_ed25519` | Separation od osobistego klucza, easier rotation |
| Storage Box | **1 TB** (~€4/mc) | Wystarczy na pre-launch backupy DB; upgrade do 5/10 TB po launchu |
| Test VM | **CX22** (~€3.79/mc) | Najmniejsza shared vCPU dla smoke testu; destroy po teście |
| Domena | **faktflow.pl** | Główna brand domena |
| Cloudflare CDN | Zostaje | Free tier wystarcza na duże ruchy, nie ma sensu zastępować |

---

## Krok 1 — Hetzner Cloud konto (~30 min)

### 1.1 Rejestracja

1. https://accounts.hetzner.com/signUp
2. Wybierz **Cloud** (NIE Robot — to dedicated servers, za drogo na start)
3. Wymaga: email + hasło + weryfikacja telefonu + dane firmowe (NIP)

### 1.2 Płatność

Hetzner billing jest **post-paid** (faktura na koniec miesiąca), ale wymaga
metody płatności potwierdzonej. Default: SEPA direct debit (najtańszy) albo
karta kredytowa.

Initial pre-authorization: zostanie pobrane **€1** przy dodaniu karty
(zwracane). Twoje pierwsze € będą rachowane dopiero przy provisioningu VM
w M1.

### 1.3 Utwórz Project

Po zalogowaniu: **Cloud Console** → **+ New Project** → nazwa: **faktflow-prod**.

> Konwencja: jeden projekt = jedno środowisko. Po launchu dodać `faktflow-staging`
> jako osobny project, żeby nie pomyłkowo destroy prod VM.

---

## Krok 2 — SSH key (~5 min)

### 2.1 Wygeneruj key

```bash
bash scripts/hetzner/keygen.sh
```

Skrypt:
- Generuje **ed25519** w `~/.ssh/hetzner_faktflow_ed25519`
- Pyta o passphrase (zapisz w 1Password — będzie potrzebne przy każdym `ssh-add`)
- Ustawia permissions 600/644

### 2.2 Upload public key do Hetzner

```bash
# Skopiuj public key do schowka
pbcopy < ~/.ssh/hetzner_faktflow_ed25519.pub        # macOS
# albo
xclip -sel clip < ~/.ssh/hetzner_faktflow_ed25519.pub  # Linux
```

W Hetzner Cloud Console:
1. **Projects** → **faktflow-prod** → **Security** (boczne menu)
2. Tab **SSH Keys** → **Add SSH Key**
3. Nazwa: `faktflow-deploy-key`
4. Public Key: wklej (zaczyna się od `ssh-ed25519 AAAA...`)
5. Save

### 2.3 Załaduj key do ssh-agent

```bash
ssh-add ~/.ssh/hetzner_faktflow_ed25519
# Wpisz passphrase z 1Password
```

Sprawdź:
```bash
ssh-add -l
# Powinno pokazać: 256 SHA256:... hetzner-faktflow-YYYYMMDD (ED25519)
```

---

## Krok 3 — hcloud CLI (~10 min)

### 3.1 Instalacja

```bash
brew install hcloud           # macOS
# albo
curl -fsSL https://github.com/hetznercloud/cli/releases/latest/download/hcloud-linux-amd64.tar.gz \
  | tar -xz -C /tmp && sudo mv /tmp/hcloud /usr/local/bin/   # Linux
```

Sprawdź:
```bash
hcloud version
# hcloud 1.x.x
```

### 3.2 API token

W Hetzner Cloud Console:
1. **Projects** → **faktflow-prod** → **Security** → tab **API Tokens**
2. **Generate API Token**
3. Nazwa: `hcloud-cli-local`
4. Permissions: **Read & Write** (potrzebne do create/destroy VMs)
5. **Generate** → **SKOPIUJ TOKEN OD RAZU** (Hetzner pokaże go raz, nigdy więcej)
6. Zapisz w 1Password jako `Hetzner API Token (cli local)`

### 3.3 Konfiguracja context

```bash
hcloud context create faktflow-prod
# Wklej token gdy zapyta
```

Eksport do shellrc dla preflight-check:
```bash
# Dodaj do ~/.zshrc lub ~/.bashrc
export HCLOUD_TOKEN="..."  # token z 1Password
```

Sanity:
```bash
hcloud server list
# Pusty (jeszcze brak VMs) — ale brak errora = działa
```

---

## Krok 4 — Cloudflare DNS check (~5 min)

DNS dla `faktflow.pl` **MUSI** być u Cloudflare zanim ruszymy z M5 (deploy
appki). Jeśli jest u Vercela / GoDaddy / OVH — transfer NS teraz.

### 4.1 Weryfikacja

```bash
dig +short NS faktflow.pl
# Oczekiwane: dwa adresy *.cloudflare.com (np. ada.ns.cloudflare.com)
```

Jeśli zwraca inne nameservery (np. Vercel, OVH) → transfer NS.

### 4.2 Transfer NS na Cloudflare (jeśli trzeba)

1. https://dash.cloudflare.com/sign-up
2. Free plan wystarcza (CDN + DNS + DDoS + Turnstile)
3. **Add Site** → `faktflow.pl`
4. Cloudflare zeskanuje istniejące DNS records i przyjmie je
5. Cloudflare poda **dwa nameservery** do skopiowania
6. U poprzedniego registrara (gdziekolwiek faktflow.pl jest zarejestrowane)
   ustaw te nameservery
7. Propagacja: ~24h (czasem szybciej)

### 4.3 Planowane subdomeny (do dodania w M1, NIE TERAZ)

Tylko dokumentacja — żebyś wiedział co przyjdzie:

| Subdomena | Cel | Public? |
|---|---|---|
| `faktflow.pl` | App + marketing (Vercel teraz, Hetzner po M5) | Public |
| `app.faktflow.pl` | App docelowo na Hetzner | Public (proxy CF) |
| `ops.faktflow.pl` | Coolify dashboard | Public (restricted IP) |
| `db.faktflow.pl` | Postgres host | Private only |
| `s3.faktflow.pl` | MinIO endpoint | Public (signed URLs) |
| `analytics.faktflow.pl` | PostHog self-hosted (M7) | Public |
| `errors.faktflow.pl` | GlitchTip (M2) | Public (restricted IP) |
| `grafana.faktflow.pl` | LGTM dashboard (M2) | Restricted IP |
| `status.faktflow.pl` | Uptime Kuma public status (M11) | Public |

---

## Krok 5 — Hetzner Storage Box (~15 min)

Storage Box to **osobny produkt** od Cloud — inny panel (`accounts.hetzner.com`,
nie `console.hetzner.cloud`).

### 5.1 Rejestracja

1. https://accounts.hetzner.com → **Storage Box** → **Order**
2. Wybierz **BX11** (1 TB, ~€4.13/mc) — wystarczy pre-launch
3. Region: **Falkenstein** (same datacenter co Cloud — szybkie backup transfer)
4. Wymagania: konto już musi istnieć z M1 (Cloud account = ten sam billing)

### 5.2 Credentials

Po zatwierdzeniu zamówienia (kilka minut do paru godzin):
1. **Account console** → **Storage Box** → twój box
2. Notuj: **host** (`uXXXXX.your-storagebox.de`) + **username** (`uXXXXX`)
3. Ustaw hasło dla głównego usera (Storage Box → **Settings** → **Password**)

### 5.3 Eksport do env

Dodaj do `~/.zshrc`:
```bash
export HETZNER_SB_HOST="uXXXXX.your-storagebox.de"
export HETZNER_SB_USER="uXXXXX"
# Password — NIE eksportuj jako env. Trzymaj w 1Password,
# preflight-check sprawdza tylko reachability.
```

Reload: `source ~/.zshrc`

---

## Krok 6 — Test VM smoke (~10 min, koszt €0.01)

Ostatni sanity — provision najmniejszą VM, zaloguj się, zniszcz.

### 6.1 Provision

```bash
hcloud server create \
  --name preflight-test \
  --type cx22 \
  --image ubuntu-24.04 \
  --location fsn1 \
  --ssh-key faktflow-deploy-key
```

Wait ~30 sekund. Output pokaże IP VM.

### 6.2 SSH

```bash
# Zastąp <IP> z output powyżej
ssh root@<IP>
# Pierwszy raz: accept fingerprint (yes)
# Passphrase: z 1Password (chyba że ssh-agent ma)
```

Powinno wpuścić bez hasła. `exit` żeby wyjść.

### 6.3 Preflight check z testem VM

```bash
bash scripts/hetzner/preflight-check.sh --test-vm=<IP>
```

Wszystkie 5 sekcji powinny być zielone.

### 6.4 Destroy (KONIECZNE — inaczej naliczy się rachunek)

```bash
hcloud server delete preflight-test
# Potwierdź: y
```

Sanity:
```bash
hcloud server list
# Pusty list = nic nie działa, nic nie kosztuje
```

---

## Done criteria

Wszystkie z poniższych muszą być prawdziwe przed M1:

- [ ] Konto Hetzner Cloud aktywne, project **faktflow-prod** utworzony
- [ ] SSH key `hetzner_faktflow_ed25519` wygenerowany lokalnie
- [ ] Public key uploadowany do Hetzner pod nazwą `faktflow-deploy-key`
- [ ] `hcloud` CLI installed, context `faktflow-prod` aktywny
- [ ] DNS `faktflow.pl` u Cloudflare (NS resolve do `*.cloudflare.com`)
- [ ] Storage Box BX11 active, credentials zapisane w 1Password
- [ ] Test VM provision → ssh → destroy zaliczony
- [ ] `bash scripts/hetzner/preflight-check.sh` → wszystko zielone

**Koszt M0:** €0 (test VM <1h to <€0.01)

---

## Co dalej — M1

Po zielonym preflight-check ruszamy z M1:
- 3× VPS provisioning (ops, db, app)
- Hetzner Cloud Network (private)
- Firewall rules
- Coolify install na ops VM

Estymowany czas M1: 1 tydzień. Koszt: ~€30/mc dla 3 VMs (CX22 + 2× CCX13).

## Co NIGDY nie robić w M0

- ❌ Trzymać API token w pliku commitowanym (nawet w `.env` zachowuj go w `.env.local` ignored)
- ❌ Generować klucz SSH bez passphrase (`-N ""`) — Hetzner ma tylko public, ale lokalny private musi być chroniony
- ❌ Dodać public key do Hetzner BEZ utworzenia osobnego project — public key dodany "globalnie" jest deployowany do wszystkich VMs we wszystkich projektach
- ❌ Skip test VM smoke — to weryfikuje że cały łańcuch działa zanim wydasz €30 na M1

## Powiązane

- `scripts/hetzner/keygen.sh` — generator SSH key
- `scripts/hetzner/preflight-check.sh` — walidator wszystkich prereq
- [docs/runbooks/scaling-triggers.md](../runbooks/scaling-triggers.md) — pełen plan migracji M0-M12
