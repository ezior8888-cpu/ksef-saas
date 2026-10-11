# F0 — prywatne podłączenie wykonawcy, 11.10.2026

Aktualny [konkretny adapter wznowienia usług i kontrakty dostawców](f0-backup-service-resume.md) są przygotowane i testowane lokalnie; prywatny plan oraz rzeczywisty observer nadal wymagają sprawdzenia.

**PREPARATION_ONLY, F0_OPEN, G03/G09 FAIL.** Przygotowano kompozycję klientów,
sprawdzenie konfiguracji offline i procedurę okna spójności. Nie wykonano
kopii, instalacji, zakupu, zmian kont lub serwerów, freeze/resume ani alarmu.
Dotychczasowa zgoda „Tylko przygotowanie — bez zakupu i zmian” pozostaje w mocy.

## Co jest połączone

[backup-wiring.mjs](../../scripts/ops/backup-wiring.mjs) składa istniejący
wykonawcę, adapter DB/SSH, klientów dwóch baz i dwóch S3 oraz restic z osobnym
czytnikiem SSH. Prywatny JSON jest danymi: nie jest wykonywany jako moduł,
nie ładuje `.env` i nie uruchamia powłoki.

- `checkBackupWiring(config)` sprawdza strukturę bez klientów, plików i sieci.
  Poprawna struktura nadal zwraca `operationalReady:false` oraz
  `evidenceVerified:false`; nie potwierdza adresów, haseł ani dowodów.
- `readBackupPrivateConfig(absolutePath)` odczytuje ograniczony rozmiar JSON
  przez otwarty deskryptor, odrzuca symlinki/niestandardowe pliki i sprawdza
  uprawnienia POSIX. Windows wymaga osobnego potwierdzenia ACL; syntetyczne
  testy nie są dowodem ochrony pliku produkcyjnego.
- `createBackupWiring(config, { operations, command?, sourceConstructors? })`
  buduje adaptery bez połączeń. `operations` wymaga rzeczywistych dostawców
  `preflight`, `observeConsistency`, `captureRecovery`, `resumeWrites` i `notify`.
  Nie ma domyślnych funkcji zwracających `true`.
- Dopiero jawne `run({ runId, authorization:{backup:true,resumeWrites:true}, ... })`
  w trybie operacyjnym może wykonywać operacje. Oba pola autoryzacji są
  warunkami technicznymi wywołania, nie zgodą człowieka. W tej kontynuacji wywołano wyłącznie testy z fikcyjnymi klientami.
  Tryb `synthetic` sam nie izoluje sieci; izolację zapewniają testowe adaptery.

CLI ma tylko pomoc i sprawdzenie offline:

```text
node scripts/ops/backup-wiring.mjs --check ABSOLUTNA_SCIEZKA_PRYWATNEGO_JSON
```

Kod wyjścia 0 oznacza poprawną strukturę; 1 brak konfiguracji lub bezpieczny
błąd odczytu; 2 nieobsługiwane argumenty. `--execute` jest odrzucane. Wyjście
zawiera zamknięte kody braków, bez adresów, identyfikatorów, haseł i ścieżek.

## Konkretny dostawca sygnału pełnej kopii

[Adapter Healthchecks](../../scripts/ops/backup-notification-healthchecks.mjs)
realizuje wcześniej wybrany kierunek z [ownership](../observability/ownership.md#narzędzia-i-koszty).
Fabryka `createBackupHealthchecksNotification({ checkUuid, mode, authorization, fetch?, persist? })`
zwraca funkcję do `operations.notify`. Import i konstrukcja nie wykonują
połączeń. UUID kontroli jest prywatnym poświadczeniem: nie trafia do Git,
dziennika ani komunikatu błędu. Nie jest kluczem zarządzania kontem.

- `synthetic` wymaga jawnej atrapy `fetch`; testy nie używają sieci.
  Sama wstrzyknięta funkcja jest zaufanym kodem, nie piaskownicą.
- `separately-authorized` wymaga Linuxa i osobnego
  `authorization.sendNotifications:true` w fabryce. Flaga jest warunkiem
  technicznym, nie zgodą człowieka na wysyłkę ani dowodem odbioru konta.
- Sukces całej sekwencji używa stałego HTTPS UUID endpointu; niepowodzenie
  kopii lub zwolnienia locka używa jego `/fail`. Nie ma body, query, danych
  domenowych, runId, logów, automatycznego tworzenia kontroli, redirect lub retry.
- Według [Pinging API](https://healthchecks.io/docs/http_api/) status 200
  występuje także dla nieistniejącej kontroli i ograniczenia częstotliwości.
  Dlatego adapter przyjmuje wyłącznie 200 z dokładnymi dwoma bajtami `OK`.
  Odpowiedź dostawcy nie dowodzi doręczenia człowiekowi.

Przed wysyłką powstaje prywatny, trwale zapisany
`notification-healthchecks-<event>-intent.json`. Po potwierdzeniu dostawcy
powstaje osobny receipt `notification-healthchecks-<event>.json`;
zwracany hash dotyczy tego pliku. Istniejący zamiar odrzuca ponowienie tego
samego eventu w tym samym katalogu przebiegu, również po awarii procesu.
Nie usuwać go w celu odświeżenia starego sukcesu. To nie jest globalna
deduplikacja dostawcy; drugi koordynator i podmiana katalogów pozostają
zabronione przez procedurę całego przebiegu.

Budżet adaptera to mniejsza z wartości: pozostały timeout kroku i 30 s.
Timeout/abort przerywa oczekiwanie, anuluje transport/strumień i zachowuje
lock również wtedy, gdy nadal trwa zapis zamiaru przed wysyłką. Spóźniony
wynik nie uruchamia kolejnego kroku i nie staje się receipt zwróconym
sekwencji. Istnienie pliku po przerwanym zapisie nie jest potwierdzeniem
wykonania. Niepewny wynik lub błąd zapisu wymaga uzgodnienia, bez retry.

Wynik sekwencji zachowuje osobno `notification` po błędzie kopii oraz
`cleanupNotification` po błędzie zwolnienia locka. Błąd sygnału ma status
`UNCONFIRMED` i zamknięty kod `NOTIFICATION_STEP_FAILED`; brak próby przed
utworzeniem katalogu przebiegu ma `NOT_ATTEMPTED`. Przyjęcie sygnału ma
`PROVIDER_ACCEPTED`, zawsze `deliveryVerified:false`. Alarm cleanup nie
wymazuje wyniku ukończonej kopii; błąd sygnału nie wymazuje pierwotnego błędu.

[Testy adaptera](../../scripts/ops/backup-notification-healthchecks.test.mjs)
i [pełnej sekwencji](../../scripts/ops/backup-notification-sequence.test.mjs)
sprawdzają m.in. brak sygnału sukcesu przed niezależnym odczytem manifestu,
utratę odpowiedzi, nieistniejącą kontrolę, limity, replay, trwały zapis i
oddzielne wyniki alarmów. Nie skonfigurowano kontroli, routingu, odbiorcy,
harmonogramu ani konta. Potrzebne pozostają osobny monitor braku sukcesu,
prywatne UUID i odbiór konta/metadanych oraz osobno dozwolona próba sygnału.
Nie ustawiono monitorów i nie wysłano rzeczywistego pingu.

## Pliki i połączenia

[Publiczny wzór](../../ops/observability/backup/private-runtime.example.json)
ma celowo puste wartości wymagające uzupełnienia. Prywatna konfiguracja,
identyfikatory, pomiary i dobór urządzeń pozostają poza Git. Przykładowe
ścieżki nie dowodzą istnienia katalogów ani instalacji narzędzi. Poprawny
JSON nie potwierdza gotowości źródeł, repozytoriów lub operacji wznowienia.

[Fabryka źródeł](../../scripts/ops/backup-source-clients.mjs) używa dwóch
osobnych klientów `pg.Client`, bez uruchamiania pg-boss i bez migracji.
`pg` 8.23.0 jest bezpośrednio zadeklarowany; ta sama wersja była już w lockfile.
Nazwy baz to dokładnie `postgres` i `_supabase`; użytkownik, hasło, host,
port i TLS są jawne. Domyślna transakcja jest read-only, a ekstraktor nadal
sprawdza RLS, tożsamość bazy, katalog, zakres mapy i limity.

S3 dostaje jawny endpoint, region i credentials, `forcePathStyle:true`,
jeden attempt i własne ograniczone połączenia. Nie korzysta z domyślnego
łańcucha haseł środowiska. TLS weryfikuje certyfikat względem skonfigurowanego
hosta. Alternatywa `loopback-tunnel` dopuszcza wyłącznie literalny localhost
`127.0.0.1` lub `::1`; nie tworzy ani nie poświadcza tunelu SSH.
Prywatny endpoint HTTP nie staje się automatycznie bezpiecznym
połączeniem: trzeba przypiąć zweryfikowany transport, nie wyłączać TLS.

Połączenia źródeł otwierają się leniwie przy pierwszym odczycie, po zdobyciu
blokady całego przebiegu. Obowiązkowy `closeSourceClients` zamyka je po
ekstrakcji i sprawdzeniu referencji, **przed** `observeConsistency(after)`,
seal i wznowieniem zapisów. Niepewny timeout lub niepełne zamknięcie
zatrzymuje przebieg i zachowuje blokadę. Zamknięcie lokalnego klienta nie
dowodzi końca procesów zdalnych; `after` musi osobno potwierdzić
`sourceOperationsStopped:true` i wykluczenie mutacji przez cały przedział.
Sprzątanie klientów po błędzie nie uruchamia `resumeWrites`.

## Osobny czytnik repozytorium

Restic przyjmuje odrębne `repositories` i `readerRepositories`. Ścieżki
reader wskazują pliki na wybranym hoście czytnika, writer na koordynatorze.
[Transport czytnika](../../scripts/ops/backup-restic-reader-command.mjs)
dopuszcza wyłącznie `cat config`, `snapshots --json`, `check --read-data`
i `dump`. Nie ma backup/init/restore/prune/unlock ani dowolnego polecenia.

Zewnętrzne SSH wymaga jawnego klucza, zaufanego known_hosts i strict checking.
Zdalne środowisko jest czyszczone; dopuszcza tylko wskaźniki plików
`HOME`, `AWS_SHARED_CREDENTIALS_FILE`, `AWS_CONFIG_FILE`. Hasła nie trafiają
do argumentów poleceń. `readerEnv` pozostaje puste. Dla SFTP wewnętrzny klient
SSH restic wymaga osobno sprawdzonego prywatnego HOME, klucza i known_hosts;
zewnętrzne SSH tego nie weryfikuje. Repozytorium może wymagać zapisu blokad
przy `check`; zakres konta czytnika wymaga potwierdzenia dla wybranego backendu.

Bajty `dump` wracają strumieniem do nowego prywatnego pliku koordynatora i
są tam hashowane. Różne nazwy hostów i identyfikatory nadal nie dowodzą
fizycznej niezależności. Obecny `restic.read` odczytuje także konfigurację
writer w toku kopii: to przygotowanie niezależnej kontroli trwającego przebiegu,
nie gotowy test odzyskania po utracie koordynatora.

## Okno spójności i brakujące decyzje wykonawcze

[Procedura okna](f0-backup-consistency-window.md) obejmuje wszystkie wejścia
web/Supabase, workera i crony, operatorów/deploy, lifecycle/replikację S3
oraz pracę w toku. Sam maintenanceMode nie zatrzymuje wszystkich zapisów;
GET PDF i odświeżanie sesji również mogą pisać. Kod 0 po SIGTERM workera nie
potwierdza zakończenia aktywnych jobów. Trzeba zachować pierwotny oraz
czasowy stan konfiguracji i uzgodnić skutki zewnętrzne przerwanych operacji.

Wrapper nie ustanawia blokad zapisów. Dostawca `observeConsistency` nadal
dostarcza dowody zewnętrznej procedury i nie może zdejmować blokad w `after`.
Nowe wymagane `operations.resumeWrites` jest osobną operacją: sekwencja
wywołuje ją raz dopiero po zamknięciu źródeł, weryfikacji całego okna,
dokładnym seal plików oraz trwałym zapisie zamiaru wznowienia.
Produkcyjnego callbacku ani pipeline nie zainstalowano.

Seal wiąże rzeczywiste pliki i ich hashe z przebiegiem, oknem i rewizją.
Linux wymaga `POSIX_FSYNC` plików i katalogów; Windows dopuszcza wyłącznie
`SYNTHETIC_ONLY` w testach. Nie jest to gwarancja niezmienności ani zastępstwo
kontroli uprawnień i innych procesów zapisujących lokalne pliki.

`resumeWrites` ma przywrócić zapisany stan pierwotny i zwrócić ograniczony
receipt `RESUMED` związany z tym samym `runId`, `windowId`, `sourceRevision`
i `sealSha256`. Wymaga wszystkich siedmiu writerów, zakończenia odczytów,
potwierdzenia przywrócenia stanu, czasów UTC i niepustego dowodu dostawcy.
Pełny [kontrakt wznowienia](f0-backup-consistency-window.md#kolejność-przyszłego-wykonania)
nie jest uwierzytelniany przez samą poprawność JSON.
Po walidacji receipt jest trwale zapisywany w części DB. Dopiero potem
ruszają uploady oraz pełne kontrole repozytoriów; lock obejmuje je nadal.

Błąd przy aktywnym lub niepewnym oknie zachowuje lock i stan `HELD`,
`FREEZE_UNKNOWN` lub `RESUME_UNKNOWN` do ręcznego uzgodnienia. Nie ma
automatycznego retry ani resume w `finally`. Po potwierdzonym `RESUMED`
późne błędy nie wznawiają usług ponownie; błąd utrwalenia receipt przez sekwencję po odebraniu wyniku adaptera zatrzymuje
upload i zachowuje lock, lecz raport nadal wskazuje `RESUMED`.

Karta pierwszego uruchomienia nadal wymaga konkretnego koordynatora i osobnego
czytnika, potwierdzonej pojemności, bezpiecznych tras połączeń i kont, celu kopii,
escrow, pełnego pakietu odzyskiwania, sprawdzonego dostawcy resume oraz
dowodów całego okna i kanału alarmów.
Nie należy kupować zasobu ani wyłączać usług na podstawie samego poprawnego JSON.
Cena BX11 3,20 EUR netto/mies. pozostaje obserwacją publicznej oferty z 10.10,
nie ceną końcową konta ani zgodą zakupu; szczegóły w [poprzednim runbooku](f0-backup-executor.md).

Wyniki lokalne i zakres odczytów: [indeks dowodów 11.10](../observability/evidence/f0-private-wiring-2026-10-11.json). Wynik CI nowego HEAD należy czytać w PR #225.

Czytnik przyjmuje jawny całkowity port SSH 1–65535 (również port istniejącego przekierowania). Brak wartości domyślnej i konwersji stringów. Known_hosts musi odpowiadać hostowi i portowi; zmiana parametru nie tworzy tunelu ani nie dowodzi jego bezpieczeństwa lub niezależności czytnika.
