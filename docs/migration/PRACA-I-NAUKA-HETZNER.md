# 🧭 JAK PRACOWAĆ NA WŁASNYCH SERWERACH — codzienna rutyna i plan nauki

> Towarzysz dokumentu [PRZEPROWADZKA-HETZNER.md](PRZEPROWADZKA-HETZNER.md).
> Tamten mówi JAK się przenieść; ten — jak potem ŻYĆ i czego się uczyć.

---

## 1. Twoja nowa codzienność (dobra wiadomość: 95% pracy = klikanie)

### Deploy nowej wersji apki

Nic się nie zmienia względem Vercela z Twojej perspektywy:

1. Commit + push na `main` (jak zawsze).
2. Coolify sam wykrywa push (webhook GitHuba) i buduje → wdraża.
3. Patrzysz na pasek builda w Coolify; zielony = wdrożone.

Rollback: w Coolify → aplikacja → **Deployments** → poprzedni build →
**Redeploy**. Dwa kliknięcia, ~1 minuta.

### Poranny rytuał (2 minuty, jak dotychczas)

1. Slack #urgent — cisza = dobrze.
2. Uptime Kuma (`status-int.faktflow.pl`) — wszystko zielone?
3. Błędy aplikacji — Sentry (a po Rescale `ops-1` i postawieniu GlitchTipa:
   `errors.faktflow.pl`). Nowe błędy od wczoraj?

### Gdy coś nie działa — drabinka diagnozy (w tej kolejności!)

| Krok | Gdzie | Co sprawdzasz |
|---|---|---|
| 1 | Uptime Kuma | CO dokładnie leży? (apka? baza? storage?) |
| 2 | Sentry / GlitchTip | Jaki błąd? (stack trace pokaże plik i linię) |
| 3 | Coolify → aplikacja → **Logs** | Co wypisuje proces? (ostatnie linie przed błędem) |
| 4 | Coolify → **Restart** | Klasyk: restart usługi. Nie wstydź się tego. |
| 5 | Hetzner Console → Graphs | Serwer nie dusi się? (CPU/RAM/dysk na 100%?) |
| 6 | AI (ja) | Wklej mi logi z kroku 3 — debugujemy razem |

Zapamiętaj zasadę: **logi najpierw, restart potem, panika nigdy.**

### ⚠️ Osobny przypadek: strona/panel „wisi w nieskończoność", jakby serwer był wyłączony

To NIE jest ta sama drabinka co wyżej — objaw wygląda inaczej (przeglądarka
kręci się bez końca, żadnego błędu, żadnej odpowiedzi) i ma inną
najbardziej prawdopodobną przyczynę: **firewall Hetznera blokuje Twój
AKTUALNY adres IP**, bo reguły portów 22 (SSH) i 8000 (panel Coolify) w
§1.4 przewodnika są jawnie ograniczone do „TWOJEGO IP" — a domowe IP z
polskich ISP zwykle zmienia się co jakiś czas.

**Kluczowe pytanie, które odróżnia to od prawdziwej awarii:** czy strona
nie ładuje się TYLKO Tobie, czy wszystkim? Sprawdź Uptime Kuma z telefonu
na transmisji danych (nie Wi-Fi domowe) albo poproś kogoś o sprawdzenie —
jeśli u innych działa, a u Ciebie nie, to niemal na pewno firewall+IP, nie
awaria serwera.

**Szybka diagnoza (bez terminala, tylko przeglądarka):**
1. Wejdź na `https://ifconfig.me` — to Twój AKTUALNY publiczny IP.
2. Hetzner Console → **Networking → Firewalls → faktflow-fw**.
3. Porównaj z regułami portów 22 i 8000 — jeśli adres się różni, to to.
4. Edytuj regułę (przycisk „Add my IP" robi to automatycznie) → zapisz →
   odśwież stronę (upewnij się, że wpisujesz `http://`, nie `https://` —
   panel Coolify na porcie 8000 nie ma certyfikatu, samoczynne dopisanie
   `https://` przez przeglądarkę da IDENTYCZNY objaw „wisi w nieskończoność").

Jeśli po tym nadal nie działa — wtedy dopiero drabinka standardowa wyżej
(może być coś innego). W praktyce (sierpień 2026, po 2-tygodniowej przerwie
w pracy) to był dokładnie ten winowajca: nieodświeżona reguła firewalla dla
portu 8000, mimo że reguła portu 22 była już wcześniej poprawiona.

### Cotygodniowo (15 minut, niedziela wieczór)

1. Aktualizacje systemów — na KAŻDYM z 3 serwerów:
   ```bash
   ssh -i ~/.ssh/hetzner_faktflow_ed25519 root@IP "apt update && apt upgrade -y"
   ```
2. Coolify → zakładka Updates — jeśli jest nowa wersja Coolify, aktualizuj.
3. Rzut oka na wykresy Hetzner (CPU > 70%? → czas myśleć o Rescale —
   progi masz w [scaling-triggers.md](../runbooks/scaling-triggers.md)).
4. Czy nocne backupy się robią? (`/admin/system` → BackupStatusCard
   + data ostatniego pliku na Storage Box).

### Comiesięcznie (30 minut)

- **Test odtworzenia backupu** (opis w przeprowadzce, Etap 8 pkt 4).
- `pnpm audit` w repo.
- Przejrzyj rachunek Hetznera (powinien być nudny i taki sam).

---

## 2. Ściąga: 20 komend, które pokrywają 95% Twoich potrzeb

### Poruszanie się

| Komenda | Co robi | Przykład |
|---|---|---|
| `ssh root@IP -i ~/.ssh/klucz` | wejdź na serwer | — |
| `exit` | wyjdź z serwera | — |
| `pwd` | gdzie jestem? | — |
| `ls -la` | co tu jest? (pliki + ukryte) | — |
| `cd katalog` | wejdź do katalogu | `cd /var/log` |
| `cat plik` | pokaż plik | `cat /etc/hostname` |
| `tail -f plik` | śledź plik NA ŻYWO (Ctrl+C = stop) | `tail -f /var/log/syslog` |
| `nano plik` | edytuj plik (Ctrl+O zapis, Ctrl+X wyjście) | — |

### Zdrowie serwera

| Komenda | Co robi |
|---|---|
| `htop` | „menedżer zadań" — CPU/RAM na żywo (q = wyjście) |
| `df -h` | ile dysku zostało (patrz na `/`) |
| `free -h` | ile RAM zostało |
| `uptime` | od kiedy działa + obciążenie |
| `apt update && apt upgrade -y` | zainstaluj aktualizacje |
| `reboot` | restart serwera (Coolify sam wszystko wstanie) |

### Docker (kontenery = „pudełka", w których żyją usługi)

| Komenda | Co robi |
|---|---|
| `docker ps` | jakie pudełka działają (nazwy, status, od kiedy) |
| `docker logs NAZWA --tail 100` | ostatnie 100 linii logów pudełka |
| `docker logs NAZWA -f` | logi na żywo |
| `docker restart NAZWA` | restart jednego pudełka |
| `docker stats` | które pudełko zjada CPU/RAM |
| `docker system prune -f` | posprzątaj śmieci (stare obrazy) gdy dysk pełny |

**Zasada bezpieczeństwa:** komendy, których NIE znasz, najpierw wklej do
czatu ze mną z pytaniem „co to zrobi?". Zwłaszcza wszystko z `rm`, `dd`,
`chmod -R`, `> plik` — te potrafią zrobić krzywdę.

---

## 3. Plan nauki (kolejność ma znaczenie)

### Poziom 0 — zanim klikniesz „kup serwer" (1 wieczór)

- Czym jest SSH i klucz publiczny/prywatny (masz już klucz — zrozum, czemu
  działa: prywatny NIGDY nie opuszcza Twojego Maca, publiczny leży na serwerze).
- Czym jest terminal: to nie magia, to rozmowa tekstem zamiast klikania.

### Poziom 1 — pierwszy tydzień z serwerami (uczysz się ROBIĄC przeprowadzkę)

- 20 komend ze ściągi wyżej — nie ucz się na pamięć, miej otwartą ściągę.
- Struktura Linuxa w 3 zdaniach: wszystko jest plikiem; `/etc` = konfiguracja,
  `/var/log` = logi, `/home` i `/root` = katalogi domowe; `sudo`/root =
  tryb administratora.
- Nano (edytor): otwórz, zmień, Ctrl+O, Enter, Ctrl+X.

### Poziom 2 — pierwszy miesiąc

- **Docker koncepcyjnie**: obraz = przepis, kontener = ugotowana potrawa,
  volume = spiżarnia która przeżywa restart. Nie musisz umieć PISAĆ
  Dockerfile (masz go w repo) — musisz umieć CZYTAĆ `docker ps` i logi.
- **Postgres podstawy**: co to connection string; `psql` — wejść, `\dt`
  (lista tabel), `SELECT count(*) FROM invoices;`, wyjść `\q`; jak wygląda
  dump (`pg_dump`) i restore (`psql -f`).
- **DNS i porty**: rekord A = „nazwa → IP"; port = „drzwi" (22 SSH, 80/443
  www, 5432 Postgres); firewall = lista, które drzwi są otwarte i dla kogo.

### Poziom 3 — przed launchem (luty 2027)

- Bezpieczeństwo serwera: dlaczego SSH tylko na klucz (bez haseł), fail2ban,
  zasada najmniejszych uprawnień; przećwicz scenariusz „zgubiony laptop"
  (nowy klucz z 1Password backup → podmiana na serwerach).
- Świadome czytanie metryk: co znaczy load average, co robi swap, kiedy
  wykres „dysk IO" tłumaczy wolną apkę.
- Jeden pełny **fire drill**: celowo ubij db-1 (restart) i przejdź
  procedurę z [disaster-recovery.md](../runbooks/disaster-recovery.md).

### Czego się NIE uczyć (oszczędź sobie)

- Kubernetes — na Twoją skalę to armata na wróbla; Coolify wystarczy latami.
- Bash scripting „na zapas" — skrypty piszę ja, Ty masz je rozumieć.
- Kompilowanie, konfiguracja nginx ręcznie, systemd unit files — Coolify
  robi to za Ciebie.

---

## 4. 📚 Książka z Empiku — czy warto?

**Tak, ale konkretna.** Szukaj: **„Jak działa Linux" — Brian Ward**
(wyd. Helion, tłumaczenie „How Linux Works"). To najlepsza pozycja dla
kogoś w Twojej sytuacji: tłumaczy CO SIĘ DZIEJE pod spodem (procesy, dyski,
sieć, uprawnienia) bez akademickiego zadęcia. Czytaj wybiórczo: rozdziały
o podstawach systemu, procesach, sieci i logach — ~40% książki załatwia
100% Twoich potrzeb.

**Czego unikać:** opasłych „Linux. Biblia" (1000+ stron, w większości
o rzeczach, których nigdy nie dotkniesz — konfiguracja drukarek, środowiska
graficzne, certyfikaty LPIC) oraz książek o konkretnych dystrybucjach
innych niż Ubuntu/Debian.

**Ważniejsze od książki:** te trzy nawyki —

1. Po każdej sesji na serwerze zapisz sobie jedną rzecz, którą zrobiłeś
   pierwszy raz (własna baza wiedzy urośnie szybciej niż z lektury).
2. Gdy komenda robi coś niespodziewanego — czytaj KOMUNIKAT błędu w całości.
   80% odpowiedzi jest w nim.
3. Traktuj mnie (AI) jak seniora siedzącego obok: wklejaj logi, pytaj
   „dlaczego", proś o wyjaśnienie każdej komendy, której nie rozumiesz.

Książka da Ci mapę; przeprowadzka z instrukcją obok da Ci teren. Rób oba
naraz — czytaj rozdział wieczorem, klikaj etap rano.

---

## 5. Zasady żelazne (wydrukuj sobie)

1. **Nie wyłączaj firewalla** „żeby sprawdzić, czy to on". Nigdy.
2. **Nie zmieniaj niczego na db-1 bez świeżego backupu** (Hetzner snapshot
   przed każdą grzebaniną: serwer → Snapshots → Take snapshot, ~0,01 €/GB).
3. **Sekrety tylko w 1Password i Coolify** — nigdy w plikach w repo,
   nigdy w notatkach, nigdy w czacie z kimkolwiek poza AI w tym projekcie.
4. **Jedna zmiana naraz** — zmieniłeś env? Deploy, test, dopiero kolejna.
5. **Rescale zamiast nowego serwera** — dopóki się da (patrz przeprowadzka
   §11); nowy serwer = tylko drugi app przy 10k.
6. **Po każdym etapie przeprowadzki: commit env-ów do 1Password** (nazwa
   zmiennej + skąd wzięta wartość) — przyszły Ty będzie wdzięczny.
