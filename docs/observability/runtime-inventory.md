# F0 — inwentaryzacja środowisk

Stan pomiaru: **04.10.2026, 11:03–11:22 UTC; F0 nie jest domknięty**. Deklaracje przekazane 06.10.2026 są zapisane osobno poniżej i nie są nowym pomiarem serwerów. Podsumowanie jest przeznaczone do publicznego repo; szczegółowy inwentarz i surowe dowody pozostają prywatne.

## Pochodzenie i granice dowodów

| Źródło | Stan / okno | Co potwierdza |
|---|---|---|
| Lokalny historyczny checkout | `94eecc8a71aaaa6c40ea6f69a002a5d0dff6db56`, 19.08.2026 | Kontekst lokalnego development; nie aktualny kod ani produkcja |
| Audyt źródłowy z 03.10 | `ef9bb438280aed56c638a70e4404ff4faadf09a0` | Wcześniejsza analiza kodu, bez odbioru runtime |
| Pierwszy odczyt F0 | main `dcf48bad4ca63802b57f7046d8932b369cd9cfc9`; publiczny health 10:41:44 UTC | Kod i pojedyncza odpowiedź HTTP 200 z env/database/redis ok |
| Przekazany pomiar operatora | 04.10, 11:03–11:22 UTC; końcowy odczyt release 11:21 | Odczyty runtime, konfiguracji i braków w opisanym zakresie |
| Baza gałęzi publikującej pakiet | main `1f95c970c11dca1cbe4093a50e2f0b73d7c714ff` | Kod bazowy publikacji, nowszy niż pomiar; nie dowód nowego wdrożenia |
| Informacje przekazane przez Igora | 06.10.2026; deklaracja w czacie kontynuacji F0 | Podtrzymanie braku staging i pełnych kopii off-host; doprecyzowanie dostępu, bez nowego odczytu serwerów i bez akceptacji F0 |

Legenda: **P** — przekazany pomiar; **D** — deklaracja kodu, dokumentu lub użytkownika; **brak dostępu** — punkt nieodczytany. Wyniki P przypisujemy do operatora i okna pomiarowego; w tej sesji nie powtarzano połączeń z serwerami.

W trakcie pomiaru inna sesja wdrożyła `ae87bdde93a636fcb2c48aef737e57a80a3315a7`: worker 11:06–11:08, web 11:08–11:20 UTC. Stan końcowy został odczytany o 11:21. Wcześniejsze `dcf48bad` oznacza stan sprzed tego wdrożenia. Sesja zbierająca F0 nie brała udziału we wdrożeniu i nie zmieniała serwerów. SHA działającej aplikacji nie należy utożsamiać z aktualnym `main`.

Dowody publiczne: [bezpieczne podsumowanie JSON](evidence/f0-2026-10-04.json). Pełny `f0-inwentarz-2026-10-04.md` oraz `f0-runtime-2026-10-04.json` są prywatnymi referencjami operatora. Kopie robocze są w ignorowanym `.agents/f0-evidence/`; nie są częścią commita. Sekcja `raw`, identyfikatory Coolify, nazwy kontenerów, buckety, adresy infrastruktury, dane kont i szczegóły ACL nie trafiają do publicznego podsumowania.

## Deklaracje przekazane 06.10.2026

Źródło: wiadomość Igora w czacie kontynuacji F0. Jest to **deklaracja**,
nie nowe okno pomiarowe ani przyjęcie kontraktów, ról lub odbioru F0.
Historyczny JSON z 04.10 pozostaje niezmieniony.

- Staging nadal nie istnieje. Deklaracja podtrzymuje **F0-G03 FAIL**;
  nie ma podstaw do proszenia o dowód izolacji nieistniejącego środowiska.
- Pełna kopia bazy poza hostem źródłowym i kopia MinIO aplikacji poza
  jego hostem nie działają. **F0-G09 FAIL** pozostaje aktualnym ograniczeniem
  odbioru oraz ryzykiem utraty danych po utracie hosta. Deklaracja dotyczy
  kopii off-host; nie unieważnia pomiaru istniejącej lokalnej kopii bazy
  ani ograniczonego snapshotu JSON.
- Według deklaracji odczyt metadanych Coolify jest możliwy przez istniejący dostęp SSH;
  osobny token API nie jest warunkiem tego odczytu. Prywatnie przekazano
  sposób dostępu i identyfikację web/worker. Nie wykonano tego odczytu.
- Wskazano konta/projekty Sentry i PostHog oraz region EU intake. Nie
  przekazano dowodu aktywnych planów, produktów, retencji, limitów ani
  uprawnień. **F0-G07 pozostaje BLOCKED** dla tego zakresu. Identyfikatory
  kont i zasobów pozostają poza publicznym pakietem.

Lokalna kontrola dostępów w tej kontynuacji nie znalazła prywatnego
`infra.env` ani wskazania `FAKTFLOW_INFRA_ENV`. Nie otwarto połączenia SSH,
nie wykonano pomiaru serwerów ani zmian infrastruktury. Prywatny inventory
z aktualnymi adresami nie został dostarczony do tej kontynuacji; deklaracje
pozostają oddzielone od pomiaru.

## Środowiska i wersje produkcji

| Pozycja | Stan potwierdzony w pomiarze | Źródło / zastrzeżenie |
|---|---|---|
| Web | `ae87bdde93a636fcb2c48aef737e57a80a3315a7`, healthy; 0 restartów; target `runner` | P, stan końcowy 11:21 UTC |
| Worker | Ten sam SHA, healthy; 0 restartów; target `worker` | P, stan końcowy 11:21 UTC |
| Rejestr kolejek | Worker `/health`: 52 kolejki i 27 cronów; baza: 27 harmonogramów | P; liczba ze startupu/konfiguracji nie dowodzi poprawnego wykonania wszystkich operacji |
| Obrazy | Budowane lokalnie; brak registry; lokalne Image ID odczytane w prywatnym dowodzie | P; Image ID nie jest manifest digest z registry. Nie ma podstaw do wpisania `repo_digest` |
| Publiczny health | HTTP 200; env/database ok, Redis informacyjnie ok | P; nie jest testem pełnej wysyłki faktury, UPO ani postępu każdej kolejki |
| KSeF produkcyjnej aplikacji | `KSEF_ENV=test` w web i worker | P; środowisko aplikacji `production` i KSeF `test` są oddzielne. Zamierzony wybór wymaga decyzji właściciela |
| Staging | Nie istnieje w odczytanym Coolify: brak osobnej aplikacji, bazy i sekretów | P; FAIL dla bramki izolowanego środowiska |
| GitHub `security-staging` | Istnieje; main-only, wymagany recenzent; sekretów/zmiennych i uruchomień workflow: 0 | P; sama konfiguracja GitHub nie tworzy staging |

Prywatny pomiar zawiera również wersje usług, konfigurację hostów, health/restart, log rotation, zasoby, NTP, routing, role i zakres portów. Te szczegóły mają pozostać w prywatnym rejestrze operatora. Nie odczytano dokładnej binarnej wersji Node ani MinIO aplikacji; ruchomy tag obrazu nie zastępuje wersji uruchomionej binarki. Reguły zapory Hetznera i konfiguracja monitorów Uptime Kuma pozostają nieodczytane.

## Rozstrzygnięte rozbieżności usług

### MinIO

**P:** magazyn aplikacji obsługiwany przez `R2_*` jest na **ops-1**. Osobny MinIO na db-1 jest backendem Supabase Storage; aplikacja nie używa go jako `R2_ENDPOINT`. Poprzednia deklaracja „MinIO aplikacji na db-1” jest nieaktualna. Zmiana deklaracji, przypięcie wersji oraz healthcheck są propozycjami do osobnej decyzji, nie zmianami wykonanymi w F0.

### Redis

**P:** aplikacja używa lokalnego **`redis:7.2` + SRH na app-1**, nie usługi Upstash. Nazwy `UPSTASH_REDIS_REST_*` pozostają prawidłową konwencją konfiguracyjną i nie wskazują dostawcy. Komentarz o Upstash oraz komentarz walidatora o cache poza produkcją nie opisują zmierzonego runtime. W F0 nie zmieniono nazw zmiennych ani konfiguracji cache.

### Release i backend jobów

**D:** aktualny kod ma pg-boss; odłączenie Inngest w kodzie nie dowodzi usunięcia historycznych zmiennych środowiskowych. **P:** worker i harmonogramy pg-boss są obecne w pomiarze. Obecność konfiguracji, zielony health i liczba kolejek nadal nie są dowodem biznesowego sukcesu. Źródło wyniku definiuje [kontrakt operacji](contracts.md).

## Kopie zapasowe

| Warstwa | Wynik pomiaru | Znaczenie dla odbioru |
|---|---|---|
| Nocny pełny `pg_dump` z rolami | Skonfigurowany na hoście bazy; ostatni poprawny wynik 04.10 01:30 UTC | P; istniejąca kopia lokalna nie zapewnia ochrony przed utratą hosta |
| Pełna kopia bazy poza jej hostem | **Brak** | P; F0-G09 FAIL |
| Snapshot JSON aplikacji | Istnieje w MinIO na drugim hoście; obejmuje tylko `public`, bez `auth`/pg-boss | P; nie jest pełną kopią Supabase ani dowodem możliwości restore |
| Kopia MinIO aplikacji | **Brak** | P; F0-G09 FAIL |
| Archiwizacja WAL / PITR | Nie skonfigurowana | P; nie jest wymaganiem narzuconym automatycznie przez samo F0 |
| Snapshoty/backupy hostów Hetzner | Nieodczytane | Brak dostępu; nie uznawać za istniejące ani nieistniejące |
| Storage Box / docelowy transport off-host | Kod/propozycja istnieje; konfiguracja nie jest wdrożona | D + P rozdzielone; decyzja i wykonanie poza tym pakietem |

Nie pisać „brak jakiejkolwiek kopii na drugim hoście”: ograniczony snapshot JSON istnieje. Nie uznawać go jednak za pełną kopię off-host. W pomiarze F0 nie wykonywano backupu ani restore. Historyczny test odtworzenia nie zastępuje odbioru bieżącej pełnej kopii.

## Staging i organizacje EU

**P:** w odczytanym Coolify istnieje wyłącznie środowisko produkcyjne. `security-staging` w GitHub ma puste sekrety i zmienne, bez wykonania workflow. Wszystkie cztery wymagane `STAGING_*` są nieobecne. Staging ma status **FAIL**, nie samo NOT RUN. Utworzenie środowiska i zasady zatwierdzania pozostają decyzją właściciela; przykład YAML nie oznacza uruchomienia.

**P:** skonfigurowane intake Sentry i PostHog wskazują EU. **Brak dostępu:** plany, produkty, retencje, limity, role i umowy nie zostały odczytane. Region intake nie dowodzi wszystkich miejsc przetwarzania ani dostępności funkcji. Pomiar istniejącego Sentry/PostHog nie potwierdza organizacji Datadog EU, DBM/APM/RUM/On-Call ani niezależnego paging.

## Mapowanie bramek pomiaru na pakiet F0

Statusy: `PASS` — wymagany dowód; `PARTIAL` — odczyt z jawnymi zastrzeżeniami; `FAIL` — zaobserwowane niespełnienie; `BLOCKED` — brak dostępu do konkretnego dowodu; `PENDING` — decyzja właściciela; `NOT RUN` — niewykonany test.

| Bramka z przekazanego raportu | Odpowiednik tutaj | Stan po włączeniu pomiaru |
|---|---|---|
| G1 — runtime | F0-G01 i F0-G02 | PARTIAL: operator zaliczył z zastrzeżeniami; pozostają dokładne wersje Node/MinIO, reguły zapory i monitory |
| G2 — MinIO/Redis | Rozbieżności F0-G01 | PASS dla rozstrzygnięcia lokalizacji/dostawcy; nie zamyka wszystkich odczytów runtime |
| G3 — kopie poza hostem | F0-G09 | FAIL: pełna baza off-host i kopia MinIO nie istnieją |
| G4 — izolacja staging | F0-G03 | FAIL: staging nie istnieje |
| G5 — istniejące regiony EU | Część F0-G07 | PASS dla skonfigurowanych intake Sentry/PostHog; cała bramka pozostaje PARTIAL/BLOCKED |
| G5 — produkty i plany | F0-G07 | BLOCKED: brak dostępu; nie wywodzić entitlements z regionu |
| G6 — kontrakty/prywatność/budżety/role | F0-G04/G05/G06/G08 | PENDING |
| G7 — dokumenty i kolektor w repo | Dostarczenie pakietu | Udostępnione w pakiecie gałęzi/PR; publikacja nie oznacza zaliczenia F0 |

Pełne kryteria i proponowane budżety: [acceptance-plan.md](acceptance-plan.md). Dziesięć decyzji Bartosza i rozdział ról: [ownership.md](ownership.md). Wszystkie propozycje z załącznika pozostają niezatwierdzone; nie wykonano ich jako instrukcji.

## Kolektor i komplet pakietu

Przekazany pomiar został wykonany skryptami operatora, **nie tym kolektorem**: wówczas nie był opublikowany w repo. Pakiet udostępnia teraz [collect-runtime-inventory.mjs](../../scripts/ops/collect-runtime-inventory.mjs) i testy, pięć dokumentów F0, bezpieczny indeks oraz przykłady [staging](../../ops/observability/environments/staging.example.yaml) i [production](../../ops/observability/environments/production.example.yaml).

Kolektor wyszukuje dane wejściowe kolejno: jawne `--infra`, `FAKTFLOW_INFRA_ENV`, `.agents/infra.env` w repo i w głównym checkoucie worktree. Czyta je jako dane; nie wykonuje instrukcji powłoki. Wymaga istniejącego klucza SSH, zaufanych kluczy hostów i zdalnego `python3`. Filtruje pola na hoście i lokalnie, bez eksportu wartości sekretów, adresów i nazw kontenerów. Nie uruchamia aplikacji, migracji, alertów ani testów biznesowych.

Przykładowe uruchomienie na maszynie z dostępem, z nowym prywatnym plikiem:

```sh
node scripts/ops/collect-runtime-inventory.mjs --output .agents/f0-runtime-next.json
```

Kod 0 oznacza tylko pobranie metadanych, 2 częściowy odczyt, 1 błąd lokalnych danych wejściowych/wyjściowych. Żaden kod nie oznacza akceptacji F0. Dokładne reguły zapory, ACL dostawców, kopie off-host i działanie staging wymagają osobnych dowodów.

Kontynuacja po publikacji `6399ff9` zabezpiecza lokalny odczyt i zapis kolektora:
plik wejściowy jest sprawdzany i czytany przez ten sam otwarty uchwyt, a nowy
plik wyniku rezerwowany wyłącznie przed pierwszym połączeniem SSH. Zapis używa
zachowanego uchwytu. Istniejący cel jest odrzucany, a wykryta podmiana ścieżki
wyniku kończy się błędem. Po lokalnym błędzie może pozostać pusty lub niepełny
plik; nie jest dowodem udanego odczytu. Kolejne uruchomienie wymaga nowej
prywatnej ścieżki. Pliki nie są automatycznie usuwane po błędzie, ponieważ
podmieniona ścieżka może należeć do innego procesu. To poprawka narzędzia,
bez powtórzenia pomiaru serwerów i bez zmiany statusów bramek.

Weryfikacja publikowanego pakietu: 13/13 testów syntetycznych kolektora (0 pominiętych), kontrola składni, typecheck i lint przeszły. Sprawdzono 38 linków względnych, dwa YAML i JSON oraz brak 49 wybranych prywatnych identyfikatorów w publikowanych plikach. Niezależny przegląd treści i kolektora nie wykazał blokad publikacji. Pełny Vitest: 5645 PASS, 6 FAIL, 28 SKIP; 443 pliki PASS, 4 FAIL, 4 SKIP. Sześć błędów dotyczy niezmienionych testów i plików bazowych: dwóch wyjątków ścieżek z ukośnikami Windows oraz czterech dopasowań oczekujących LF zamiast CRLF. Nie zmieniano tych plików w pakiecie F0. Build nie był wymagany, ponieważ aplikacja nie została zmieniona. Wyniki testów narzędzia nie potwierdzają działania środowiska ani realizacji dziesięciu decyzji operatora.

**Kolejny krok:** Bartosz rozstrzyga decyzje z ownership; osobne prace domykają kopie, staging i dowody produktów. F1 nie został rozpoczęty.
