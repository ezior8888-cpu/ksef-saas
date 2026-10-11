# F0 — prywatne podłączenie wykonawcy, 11.10.2026

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
  `preflight`, `observeConsistency`, `captureRecovery` i `notify`.
  Nie ma domyślnych funkcji zwracających `true`.
- Dopiero jawne `run({ runId, authorization:{backup:true}, ... })` może
  wykonywać operacje. Pole autoryzacji jest warunkiem technicznym, nie zgodą
  człowieka. W tej kontynuacji wywołano wyłącznie testy z fikcyjnymi klientami.
  Tryb `synthetic` sam nie izoluje sieci; izolację zapewniają testowe adaptery.

CLI ma tylko pomoc i sprawdzenie offline:

```text
node scripts/ops/backup-wiring.mjs --check ABSOLUTNA_SCIEZKA_PRYWATNEGO_JSON
```

Kod wyjścia 0 oznacza poprawną strukturę; 1 brak konfiguracji lub bezpieczny
błąd odczytu; 2 nieobsługiwane argumenty. `--execute` jest odrzucane. Wyjście
zawiera zamknięte kody braków, bez adresów, identyfikatorów, haseł i ścieżek.

## Pliki i połączenia

[Publiczny wzór](../../ops/observability/backup/private-runtime.example.json)
ma celowo puste wartości wymagające uzupełnienia. Prywatny szkic tej sesji
oraz odczyty kontrolne są w ignorowanym `.agents/f0-20261011/`, poza Git.
Przypięto istniejące hosty, kontener DB i zaobserwowane metadane adresów.
Ścieżki Linux we wzorze są propozycją; nie utworzono ich na serwerach.
Nie kopiowano haseł ani tokenów z usług. Szkic zwraca
`SOURCE_CLIENTS_INCOMPLETE` i `REPOSITORY_TRANSPORT_INCOMPLETE`.

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
Zaobserwowany prywatny endpoint HTTP nie staje się automatycznie bezpiecznym
połączeniem: trzeba przypiąć zweryfikowany transport, nie wyłączać TLS.

Połączenia źródeł otwierają się leniwie przy pierwszym odczycie, po zdobyciu
blokady całego przebiegu. Są zamykane przed pierwszym uploadem, również
w ścieżce błędu przed zwolnieniem blokady. Niepewny timeout lub niepełne
zamknięcie zatrzymuje przebieg i zachowuje blokadę. Zamykanie w `finally`
jest dodatkowym zabezpieczeniem, a nie późnym sposobem unieważniania sukcesu.
Zamknięcie lokalnego klienta nie dowodzi końca procesów na serwerze.

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

Wrapper nie zatrzymuje i nie wznawia usług. `closeSourceClients` zamyka
wyłącznie jego sesje DB/S3; nie jest zezwoleniem na zdjęcie blokad zapisów.
Zewnętrzny operator/procedura musi utrzymać zweryfikowane okno do bezpiecznego
rozstrzygnięcia przebiegu. Nie wolno zdejmować blokad w `observeConsistency(after)`.

W odczycie 11.10 potwierdzono zaufane SSH trzech hostów, ich listy usług,
metadane połączeń oraz zgodność tagów obrazów web/worker z przypiętym
`face09c57f7de756546e58d092dbe6d280f93c91`. Nie wykonano zapytań do bazy,
odczytu faktur/obiektów ani aktualizacji mapy schematu. Na hostach nie znaleziono
hostowych Node/restic; nie jest to inwentaryzacja wszystkich obrazów kontenerów.
Wolne miejsce systemu plików Docker: app-1 około 19 GiB, ops-1 około 23 GiB,
db-1 około 10 GiB. Nie zmierzono rozmiaru zestawu, przyrostu ani czasu kopii.

Karta pierwszego uruchomienia nadal wymaga konkretnego koordynatora i osobnego
czytnika, potwierdzonej pojemności, bezpiecznych tras połączeń i kont, celu kopii,
escrow, pełnego pakietu odzyskiwania oraz dowodów całego okna i kanału alarmów.
Nie należy kupować zasobu ani wyłączać usług na podstawie samego poprawnego JSON.
Cena BX11 3,20 EUR netto/mies. pozostaje obserwacją publicznej oferty z 10.10,
nie ceną końcową konta ani zgodą zakupu; szczegóły w [poprzednim runbooku](f0-backup-executor.md).

Wyniki lokalne i zakres odczytów: [indeks dowodów 11.10](../observability/evidence/f0-private-wiring-2026-10-11.json). Wynik CI nowego HEAD należy czytać w PR #225.
