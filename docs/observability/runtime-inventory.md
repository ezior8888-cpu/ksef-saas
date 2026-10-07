# F0 — inwentaryzacja środowisk

Stan: **F0 nie jest domknięty**. Historyczny pomiar runtime pochodzi z 04.10.2026, 11:03–11:22 UTC. Odczyty API i próba SSH z 06.10 oraz decyzje/deklaracje z 07.10 mają osobne źródła; nie potwierdzają aktualnego runtime kontenerów. Igor prowadzi monitoring i odbiera F0, a Codex wykonuje dostępne prace techniczne. Podsumowanie jest przeznaczone do publicznego repo; szczegółowy inwentarz i surowe dowody pozostają prywatne.

## Delegowane wybory i katalog cen — 07.10.2026

**U — wybór:** po checklistcie Igor polecił „Wybierz wszystko co uważasz za
najlepsze”. Przyjęto konkretny kontrakt, politykę danych i budżet oraz wybrano
BX11 HEL1/restic dla kopii, osobny staging CPX32 DE i darmowy zakres
Sentry/PostHog/Kuma z planowanym zewnętrznym watchdogiem Healthchecks.
Datadog jawnie wyłączono z obecnego zakresu. [Pełny wybór](ownership.md#wybory-na-podstawie-delegacji-igora--07102026)
i [indeks decyzji](evidence/f0-decisions-2026-10-07.json) nie dowodzą wykonania.
G04/G05/G06: PASS tylko dla decyzji; G08 PARTIAL, pozostałe bramki pomiarowe
otwarte, G03/G09 FAIL. Nie dokonano formalnego odbioru F0.

**P — katalog dostawcy:** osobne GET-y 07.10, **17:27:36–17:29:06 UTC**,
odczytały publiczne parametry, ceny i wskaźnik dostępności. BX11 HEL1 1 TiB:
3,20 EUR netto/mies., setup 0; CPX32 NBG1 4 vCPU/8 GiB/160 GB:
35,49 EUR netto/mies., IPv4 0,50. Suma nowych wybranych zasobów:
39,19 EUR netto, około 48,20 brutto przy zwróconym VAT 23%. CPX32 ma
available=true w odczytanych lokalizacjach EU; CX43 ma available=false.
Wskaźnik nie jest rezerwacją, a ceny nie są fakturą naszego konta.
Usunięty endpoint datacenters zwrócił 410; dostępność pochodzi z nowego
schematu server_types.locations, zgodnie z [changelogiem](https://docs.hetzner.cloud/changelog).
Bezpieczne pola i źródła są w nowym indeksie; pełny wyciąg roboczy poza gitem.

Nie odczytano nowych kontenerów, nie zakupiono ani nie utworzono zasobów,
nie wykonano kopii/restore, migracji, wdrożeń lub F1. Historyczne indeksy
04.10/06.10/pierwszych ustaleń 07.10 pozostają bez zmian. SSH jest opcją
pozyskania aktualnych dowodów; datowany odczyt uprawnionego operatora może
go zastąpić. Na prośbę Igora prompt do drugiego chatu powstanie po odbiorze F0.

## Pochodzenie i granice dowodów

| Źródło | Stan / okno | Co potwierdza |
|---|---|---|
| Lokalny historyczny checkout | `94eecc8a71aaaa6c40ea6f69a002a5d0dff6db56`, 19.08.2026 | Kontekst lokalnego development; nie aktualny kod ani produkcja |
| Audyt źródłowy z 03.10 | `ef9bb438280aed56c638a70e4404ff4faadf09a0` | Wcześniejsza analiza kodu, bez odbioru runtime |
| Pierwszy odczyt F0 | main `dcf48bad4ca63802b57f7046d8932b369cd9cfc9`; publiczny health 10:41:44 UTC | Kod i pojedyncza odpowiedź HTTP 200 z env/database/redis ok |
| Przekazany pomiar operatora | 04.10, 11:03–11:22 UTC; końcowy odczyt release 11:21 | Odczyty runtime, konfiguracji i braków w opisanym zakresie |
| Baza gałęzi publikującej pakiet | main `1f95c970c11dca1cbe4093a50e2f0b73d7c714ff` | Kod bazowy publikacji, nowszy niż pomiar; nie dowód nowego wdrożenia |
| Informacje przekazane przez Igora | 06.10.2026; deklaracja w czacie kontynuacji F0 | Podtrzymanie braku staging i pełnych kopii off-host; doprecyzowanie dostępu, bez nowego odczytu serwerów i bez akceptacji F0 |
| Próba kolektora z publikowanego pakietu | 06.10, 20:45:46 UTC; kod `80db8b49300cd41854114582cc869f5276aa6943` | Wszystkie hosty `unverified`; ograniczenia SSH, bez nowego pomiaru runtime |
| API Hetzner | 06.10, odczyty 20:48:15–20:54:29 UTC | Metadane VM, region, przypisane zapory i dostępne obrazy backupu; nie health kontenerów ani zawartość kopii |
| API Sentry/PostHog EU | 06.10, 20:49:23–20:49:55 UTC | Metadane kont/projektów i część retencji/uprawnień; ograniczenia planów i rozliczeń pozostają jawne |
| Odpowiedzi i instrukcje przekazane przez Igora | 07.10.2026; czat kontynuacji F0 | Decyzje o KSeF TEST, zakresie kopii/staging i organizacji pracy; deklaracje planów i odbioru alarmów, bez nowego pomiaru |
| Delegacja wyborów Igora | 07.10.2026; osobna wiadomość po checklistcie | Przyjęcie konkretnych wyborów kontraktów/polityki/budżetu i zakresu docelowego, bez formalnego odbioru F0 |
| API katalogu Hetzner | 07.10, 17:27:36–17:29:06 UTC | Ceny/parametry publicznych typów i wskaźnik dostępności; nie zakup, runtime lub zawartość kopii |

Legenda: **P** — pomiar z podanym źródłem i oknem; **D** — deklaracja kodu, dokumentu lub użytkownika; **U** — uzgodniona decyzja lub zakres; **brak dostępu** — punkt nieodczytany. Historyczne wyniki P przypisujemy operatorowi i oknu z 04.10. Odczyty API z 06.10 mają osobne źródła; nieudana próba SSH nie odświeża historycznego runtime.

W trakcie pomiaru inna sesja wdrożyła `ae87bdde93a636fcb2c48aef737e57a80a3315a7`: worker 11:06–11:08, web 11:08–11:20 UTC. Stan końcowy został odczytany o 11:21. Wcześniejsze `dcf48bad` oznacza stan sprzed tego wdrożenia. Sesja zbierająca F0 nie brała udziału we wdrożeniu i nie zmieniała serwerów. SHA działającej aplikacji nie należy utożsamiać z aktualnym `main`.

Dowody publiczne: [bezpieczne podsumowanie JSON](evidence/f0-2026-10-04.json). Pełny `f0-inwentarz-2026-10-04.md` oraz `f0-runtime-2026-10-04.json` są prywatnymi referencjami operatora. Kopie robocze są w ignorowanym `.agents/f0-evidence/`; nie są częścią commita. Sekcja `raw`, identyfikatory Coolify, nazwy kontenerów, buckety, adresy infrastruktury, dane kont i szczegóły ACL nie trafiają do publicznego podsumowania.

Osobny [wyciąg odczytów z 06.10](evidence/f0-2026-10-06.json) zawiera
bezpieczne pola i skróty prywatnych dowodów. Pełne nowe odpowiedzi API,
prywatna konfiguracja i reguły zapór pozostają poza repo.

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

W chwili zapisu deklaracji prywatny `infra.env` nie był jeszcze dostarczony
i nie wykonano własnego odczytu serwerów. Późniejsze przekazanie pliku
umożliwiło próby dostępu opisane poniżej; nie zmienia deklaracji na pomiar.

## Odczyty dostawców i próba SSH 06.10.2026

**P — dostęp lokalny i SSH:** dostarczony plik został odczytany jako dane,
bez wykonywania jego treści. Próba opublikowanego kolektora z 20:45:46 UTC
zakończyła się `unverified` dla trzech hostów. Brakuje zaufanych kluczy hostów
dla części połączeń; lokalny klucz użytkownika jest chroniony hasłem i nie
jest odblokowany w agencie. Nie rozstrzygnięto akceptacji klucza przez
serwery. Nie potwierdzono aktualnego SHA, health ani wersji Node/MinIO.
Potrzebne są zaufane dane hostów i lokalne odblokowanie klucza; hasła
oraz klucze prywatne nie są materiałem do publikacji ani do wklejania w czat.

**P — API Hetzner:** odczyty metadanych, przypisanych zapór i obrazów
backupów zwróciły HTTP 200. Trzy wskazane VM mają stan `running` i lokalizację
DE; nie jest to status kontenerów web/worker. Reguły zapór przypisanych
do wszystkich trzech VM zachowano prywatnie. Odczyt konfiguracji Hetznera
nie potwierdza reguł systemowych, realnego ruchu ani monitorów Uptime Kuma.

Na db-1 włączone są backupy hosta; API zwróciło **7 obrazów `available`**,
ostatni z **06.10.2026, 02:43:59 UTC**. Dla app-1 i ops-1 ta funkcja jest
wyłączona i odczyt nie zwrócił obrazów backupu tych hostów. Wynik dotyczy
funkcji Hetznera, nie wszystkich możliwych mechanizmów kopii. Obrazy db-1
nie potwierdzają zawartości i spójności pełnego dumpa, pokrycia MinIO,
uzgodnionej retencji ani wykonanego restore. **G09 pozostaje FAIL** według
historycznego pomiaru i aktualnej deklaracji o brakujących kopiach.

**P — Sentry/PostHog:** odczyty organizacji i projektów w EU zwróciły
HTTP 200. Sentry udostępniło metadane i flagi dostępności funkcji;
nie odczytano aktywnej subskrypcji, limitów ani retencji. Flagi nie są
dowodem planu ani działania instrumentacji w aplikacji.

PostHog zwrócił projektowe ustawienia replay: opt-in włączone, retencja
`30d`, heatmaps włączone. Uprawnienia organizacji wskazują retencję
Product Analytics, Feature Flags i Surveys po **1 roku**, replay
**1 miesiąc**, limit **5 alerts** i **2 destinations Error Tracking**.
Wartości projektowe i organizacyjne mają osobne zakresy; nie wywodzimy
z nich automatycznie efektywnej retencji wszystkich danych. Ustawienia
replay nie dowodzą nagrywania przez SDK ani zatwierdzenia eksportu z G05.
Odczyty billing/features i billing/limits zwróciły **403**, bez ustalonej
przyczyny; nazwa aktywnego planu i limity budżetu pozostają niezweryfikowane.
**G07 ma nowe częściowe dowody, ale nie jest zaliczone.**

**P — katalog cen:** odczyt oficjalnych typów i cen Hetznera z
20:52:37–20:53:00 UTC zwrócił BX11 (1 TiB), **3,20 EUR netto/miesiąc**,
**3,936 EUR brutto przy zwróconym VAT 23%**, bez opłaty startowej.
To wycena katalogowa, nie dowód zakupu ani konfiguracji kopii.

Odczyty nie uruchamiały usług, testów biznesowych, alertów, migracji,
wdrożeń ani restore i nie zmieniały kont lub serwerów. F0 pozostaje otwarte,
a historyczny pomiar i JSON z 04.10 pozostają niezmienione.

## Przegląd kodu i CI — 07.10.2026

**D — kod repo, nie pomiar produkcji:** przegląd dotyczy niezmiennego
`84b75eaf76ad6421395a031951e39ad57e3d36d5`. W
[inicjalizacji PostHog](https://github.com/ezior8888-cpu/ksef-saas/blob/84b75eaf76ad6421395a031951e39ad57e3d36d5/lib/analytics/init-posthog-browser.ts)
ustawiono `disable_session_recording: true`, `autocapture: false` oraz
`capture_heatmaps: false`. Inicjalizacja przeglądarkowa wymaga consent, a cofnięcie zgody
zatrzymuje nagrywanie i capture. Provider używa tego samego singletona;
w przejrzanych źródłach nie znaleziono wywołania startu nagrywania lub
nadpisania tych ustawień. Flagi projektu odczytane przez API z 06.10
opisują osobny zakres konfiguracji.

Inicjalizacje Sentry browser/Node/Edge/worker używają wspólnych
[opcji prywatności](https://github.com/ezior8888-cpu/ksef-saas/blob/84b75eaf76ad6421395a031951e39ad57e3d36d5/lib/observability/scrub.ts):
`sendDefaultPii: false`, wyłączony eksport logów i redakcja błędów,
transakcji, spanów oraz breadcrumbs. Mechanizm redakcji nie klasyfikuje dowolnego
PII lub wolnego tekstu; jego obecność nie dowodzi kompletnej redakcji.
Odczyt kodu nie potwierdza wdrożonego bundle, skutecznej retencji ani
rzeczywiście wysłanych danych. **G05 pozostaje PENDING, TEST-04 NOT RUN**.

**P — kontrole pakietu:** odczyt GitHub z 07.10 potwierdził **11/11 SUCCESS**
dla `84b75ea`, w tym
[typy/lint/unit, build i izolację RLS](https://github.com/ezior8888-cpu/ksef-saas/actions/runs/37620979505)
oraz [CodeQL i skan sekretów](https://github.com/ezior8888-cpu/ksef-saas/actions/runs/37620979524).
Wyniki dotyczą wskazanego commita i środowiska CI; nie są odbiorem
infrastruktury, polityki danych ani całego F0.

## Ustalenia przekazane 07.10.2026

Źródło: odpowiedzi i późniejsze instrukcje Igora w tej kontynuacji, na bazie
pakietu `4a0113a`. Szczegóły decyzji są w [ownership](ownership.md#decyzje-i-deklaracje-przekazane-07102026),
a bezpieczny zapis w [indeksie ustaleń](evidence/f0-2026-10-07.json).
To nie jest nowe okno pomiaru serwerów lub kont dostawców.

- **U — KSeF TEST:** celowy wybór przed startem produktu. Informacja o braku
  prawdziwych klientów jest deklaracją. TEST → PROD pozostaje osobnym go-live
  z planu faktur (F1/W15/S13), bez realizacji w tym czacie.
- **U — pełne kopie:** codzienny pełny `pg_dump` z auth/storage, oba MinIO,
  szyfrowanie i cel UE poza źródłami; 7 kopii dziennych, 4 tygodniowe,
  12 miesięcznych oraz miesięczne próbne odtworzenie. **G09 FAIL** — zakres
  uzgodniony, bez dowodu wykonania i bez restore w tej kontynuacji.
- **U — staging:** osobne DB/kolejka/storage/klucze, KSeF TEST i Stripe test;
  do 31.10.2026, po kopiach i przed Closed Alpha. **G03 FAIL** — plan i termin
  nie są dowodem istniejącego środowiska.
- **D — konta:** brak płatnych planów Sentry/PostHog. Nie ustalono przez to
  nazwy darmowego planu, całkowitego kosztu ani brakujących limitów/retencji.
  G07 nadal ma częściowe dowody; odczyt API z 06.10 pozostaje historyczny.
- **D — alarmy:** zadeklarowano Slack/Telegram i raport email/Telegram o 06:00;
  odbiór przez Bartosza best effort 08:00–22:00. Igor potwierdził Europe/Warsaw.
  Formalnego dyżuru/zastępstwa i dowodu doręczeń nie ma; luka G08 pozostaje.
- **U — prowadzenie F0:** Igor przejmuje monitoring, koordynację decyzji i
  końcowy odbiór; Codex wykonuje dostępne prace techniczne. Udział Bartosza
  ograniczamy do koniecznych czynności operatorskich. To nie przekierowuje
  automatycznie alarmów do Igora i nie zatwierdza wyników F0.

Stare indeksy z 04.10 i 06.10 pozostają niezmienione. Nie uruchomiono
konfiguracji kopii/staging, zmian dostawców, migracji, wdrożeń, restore ani F1.

## Środowiska i wersje produkcji

Poniższa tabela opisuje wyłącznie pomiar runtime z **04.10.2026**.
Próba SSH z 06.10 nie dostarczyła jego aktualizacji.

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

Prywatny pomiar zawiera również wersje usług, konfigurację hostów, health/restart, log rotation, zasoby, NTP, routing, role i zakres portów. Te szczegóły mają pozostać w prywatnym rejestrze operatora. Nie odczytano dokładnej binarnej wersji Node ani MinIO aplikacji; ruchomy tag obrazu nie zastępuje wersji uruchomionej binarki. W pomiarze z 04.10 reguły zapory Hetznera były nieodczytane; odczyt API z 06.10 uzupełnia tę część. Konfiguracja monitorów Uptime Kuma pozostaje nieodczytana.

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

Tabela opisuje pomiar z 04.10. Nowy odczyt API backupów hosta db-1 i jego
ograniczenia są w [sekcji odczytów z 06.10](#odczyty-dostawców-i-próba-ssh-06102026).

Nie pisać „brak jakiejkolwiek kopii na drugim hoście”: ograniczony snapshot JSON istnieje. Nie uznawać go jednak za pełną kopię off-host. W pomiarze F0 nie wykonywano backupu ani restore. Historyczny test odtworzenia nie zastępuje odbioru bieżącej pełnej kopii.

## Staging i organizacje EU

**P — 04.10:** w odczytanym Coolify istnieje wyłącznie środowisko produkcyjne. `security-staging` w GitHub ma puste sekrety i zmienne, bez wykonania workflow. Wszystkie cztery wymagane `STAGING_*` są nieobecne. Staging ma status **FAIL**, nie samo NOT RUN. Utworzenie środowiska i zasady zatwierdzania pozostają decyzją właściciela; przykład YAML nie oznacza uruchomienia.

**P — 04.10:** skonfigurowane intake Sentry i PostHog wskazują EU. W tym pomiarze plany, produkty, retencje, limity, role i umowy nie zostały odczytane przez brak dostępu. Częściowy odczyt kont z 06.10 jest opisany osobno powyżej. Region intake nie dowodzi wszystkich miejsc przetwarzania ani dostępności funkcji. Pomiar istniejącego Sentry/PostHog nie potwierdza organizacji Datadog EU, DBM/APM/RUM/On-Call ani niezależnego paging.

## Mapowanie bramek pomiaru na pakiet F0

Statusy: `PASS` — wymagany dowód; `PARTIAL` — odczyt z jawnymi zastrzeżeniami; `FAIL` — zaobserwowane niespełnienie; `BLOCKED` — brak dostępu do konkretnego dowodu; `PENDING` — decyzja właściciela; `NOT RUN` — niewykonany test.

Tabela mapuje statusy historycznego raportu z 04.10. Nowe częściowe dowody
z 06.10 są uwzględnione w aktualnym [planie odbioru](acceptance-plan.md).

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

Pełne kryteria i przyjęty budżet: [acceptance-plan.md](acceptance-plan.md).
Rejestr decyzji i aktualny rozdział ról: [ownership.md](ownership.md).
Statusy propozycji rozstrzygają zapisane odpowiedzi, nie sam załącznik;
nie wykonano jego rekomendacji jako instrukcji.

## Kolektor i komplet pakietu

Przekazany pomiar z 04.10 został wykonany skryptami operatora, **nie tym kolektorem**: wówczas nie był opublikowany w repo. Pakiet udostępnia teraz [collect-runtime-inventory.mjs](../../scripts/ops/collect-runtime-inventory.mjs) i testy, pięć dokumentów F0, bezpieczne indeksy oraz przykłady [staging](../../ops/observability/environments/staging.example.yaml) i [production](../../ops/observability/environments/production.example.yaml).

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

**Kolejny krok:** Igor rozstrzyga pozostałe decyzje z ownership na podstawie
materiału przygotowanego przez Codex. Osobno upoważnione prace i dowody
domykają kopie/staging; Bartosz uczestniczy tylko w koniecznym zakresie
operatorskim. F1 nie został rozpoczęty.
