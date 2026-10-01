# Bramka w Telegramie (B-2)

Krok 9 planu automatyzacji (1 października 2026). Bot dla operatorów, który
zastępuje ręczny `tinker` przy wdrożeniach i daje szybki podgląd produkcji.
Kod: `ops/bramka/`, baza: migracja `00100_ops_gate.sql`.

## 1. Co umie

| Polecenie | Co robi | Zabezpieczenie |
|---|---|---|
| `/status` | web i worker w Coolify, heartbeat workera, KSeF, wiek kopii, aktywne wyłączniki, ostatnia migracja | tylko odczyt |
| `/kolejki` | zaległości pg-boss (czeka / w toku / błędy 24 h), faktury utknięte w wysyłce, wstrzymane, Offline24 | tylko odczyt |
| `/wylacz ksef \| flo \| rejestracja` | natychmiast ustawia flagę „kill” | bez TOTP, bo to kierunek bezpieczny; powiadamia pozostałe osoby; wpis w `audit_logs` |
| `/wdroz` | pokazuje commit do wdrożenia, CI, listę zmian i blokady | tylko odczyt |
| `/wdroz <8 znaków SHA> <kod TOTP>` | wdraża web, potem worker, i sprawdza wynik | TOTP; SHA musi być HEAD `main`; zielone CI; wgrane migracje; brak trwającego wdrożenia |

**Czego nie umie (celowo):**
- Nie włącza z powrotem wyłączonych funkcji. Zdjęcie flagi robisz ręcznie SQL-em: `docs/runbooks/hamulce-ksef.md`.
- Nie wgrywa migracji. Pokazuje tylko, że są niewgrane, i odmawia wdrożenia.
- Nie czyta danych klientów. Rola `ops_actor` nie widzi żadnej tabeli, ma dostęp wyłącznie do 4 funkcji w schemacie `ops`.
- Nie zmienia zmiennych w Coolify. Token ma tylko prawa `read` i `deploy`.

## 2. Jak `/wdroz` pilnuje kolejności

API Coolify wdraża zawsze HEAD gałęzi, nie wskazany commit. Bramka:
1. odmawia, jeśli HEAD `main` nie zaczyna się od podanego SHA;
2. odmawia, jeśli brakuje zielonych `Typecheck + Lint + Unit tests` i `Next build`, coś jest czerwone lub w toku;
3. odmawia, jeśli w zakresie od wdrożonej wersji jest migracja, której nie ma w `schema_migrations`;
4. wdraża **web**, czeka na koniec i sprawdza, czy Coolify zbudował ten SHA;
5. ponownie sprawdza HEAD. Jeśli `main` się przesunął, **zatrzymuje się przed workerem** i ostrzega o stanie mieszanym;
6. wdraża **worker** tak samo;
7. sprawdza `/api/health` i stan obu aplikacji w Coolify, potem zapisuje wynik w `audit_logs`.

Postęp przychodzi wiadomościami. Druga osoba dostaje powiadomienie o starcie.

## 3. Konfiguracja jednorazowa (Bartosz)

Kolejność ma znaczenie.

1. **Sieć prywatna.** Hetzner Console → Networks → sieć, w której są `app-1`
   i `db-1` → *Attach server* → `ops-1`. Dziś `ops-1` jej nie ma, więc bramka
   nie dosięgnie bazy. Sprawdzenie na `ops-1`: `ip -4 addr | grep 10.0.0`.
2. **Migracja 00100** — według `AGENTS.md` (po scaleniu PR), z wpisem do
   `schema_migrations`. Bez `NOTIFY pgrst`: schemat `ops` nie jest w PostgREST.
3. **Hasło roli** na `db-1`, interaktywnie, żeby hasło nie trafiło do historii powłoki:
   ```bash
   source .agents/infra.env
   ssh -t -i $K root@$DB "docker exec -it $PGC psql -U postgres -c '\password ops_actor'"
   ssh -i $K root@$DB "docker exec $PGC psql -U postgres -c 'ALTER ROLE ops_actor LOGIN;'"
   ```
4. **Token Coolify.** Settings → Advanced → włącz *API Access*. Keys & Tokens →
   nowy token z uprawnieniami **tylko `read` i `deploy`** (bez `write` i `root`).
5. **Bot.** Ten sam bot co alerty (`TELEGRAM_BOT_TOKEN` z
   `telegram-heartbeat.md`) albo nowy z @BotFather.
6. **TOTP.** Lokalnie: `node ops/bramka/totp-setup.mjs`. URI dodaj w aplikacji
   uwierzytelniającej, a sekret wklej w Coolify (krok 7). Potem wyczyść terminal.
7. **Aplikacja w Coolify** (serwer `localhost` = `ops-1`): to samo repo, gałąź
   `main`, Build Pack *Dockerfile*, Base Directory `/ops/bramka`, Dockerfile
   `/Dockerfile`, **bez domeny i bez portów**, healthcheck wyłączony.
   Zmienne (`is_preview = false`):

   | Zmienna | Wartość |
   |---|---|
   | `TELEGRAM_BOT_TOKEN` | token bota |
   | `BRAMKA_USERS` | `twoje_from_id:Bartosz,from_id_Igora:Igor` (pkt 8) |
   | `BRAMKA_TOTP_SECRET` | sekret z kroku 6 |
   | `OPS_DATABASE_URL` | `postgresql://ops_actor:HASŁO@10.0.0.2:5432/postgres` |
   | `COOLIFY_API_URL` | `http://coolify:8080/api/v1` (sieć Dockera `coolify` na `ops-1`) |
   | `COOLIFY_API_TOKEN` | token z kroku 4 |
   | `COOLIFY_APP_WEB`, `COOLIFY_APP_WORKER` | UUID aplikacji id=1 i id=2 (z adresu strony aplikacji w Coolify) |
   | `GITHUB_TOKEN` | opcjonalnie: fine-grained, tylko odczyt repo (bez niego limit 60 zapytań/h) |

8. **Identyfikatory osób.** Wdróż z samym swoim ID (np. z @userinfobot) i napisz
   cokolwiek do bota. Wiadomości spoza listy są ignorowane, a w logach bramki
   pojawia się `odrzucono wiadomość od from.id=…`. Stamtąd weź ID Igora, dopisz
   go do `BRAMKA_USERS` i wdróż bramkę ponownie.
9. **Sprawdzenie.** Po starcie każdy z listy dostaje „🟢 Bramka uruchomiona”.
   Sprawdź `/status`, `/kolejki` i `/wdroz` (bez argumentów).

## 4. Awarie i bezpieczeństwo

| Sytuacja | Co zrobić |
|---|---|
| Zgubiony telefon | usuń osobę z `BRAMKA_USERS`, wygeneruj nowy sekret TOTP, wdróż bramkę |
| Wyciek tokenu bota | @BotFather → `/revoke`, nowy token w Coolify (bramka i aplikacja, jeśli wspólny) |
| Bramka ma natychmiast przestać działać | Coolify → aplikacja bramki → Stop |
| 5 błędnych kodów TOTP | blokada na 15 min (licznik w pamięci; restart bramki go zeruje) |
| Bramka wdrożyła tylko web | wiadomość „stan mieszany”; uruchom `/wdroz` ponownie albo wdroż worker ręcznie (`AGENTS.md`) |
| Zmiana kodu bramki | wdrażasz ją ręcznie w Coolify — `/wdroz` obejmuje tylko web i worker |

Bramka działa na **long polling**: nie ma publicznego adresu ani otwartego
portu. Po wdrożeniu bramki przez kilka sekund mogą działać dwie kopie. Telegram
odpowiada wtedy błędem 409, a bramka ponawia próbę z rosnącą przerwą.
