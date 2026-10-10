# F0 — przygotowanie pełnych kopii

Stan 10.10.2026: **PREPARATION_ONLY, G09 FAIL, F0_OPEN**. Wcześniejsza odpowiedź
Igora: **„Tylko przygotowanie — bez zakupu i zmian”**. Późniejsza deklaracja
gotowości płacenia do 5 EUR miesięcznie jest warunkowa; nie precyzuje VAT
ani nie zatwierdza konkretnego zamówienia i zmian. Lokalizacja komputera
w Polsce została zadeklarowana. [Bieżący zapis](../observability/ownership.md#uzupełnienie-deklaracji-i-dostępu--10102026)
rozdziela te odpowiedzi od wykonania. Ten pakiet przygotowuje późniejsze wykonanie;
nie kupuje miejsca, nie łączy się z serwerami, nie wykonuje kopii i nie
instaluje harmonogramu. Restore, migracje, wdrożenia i F1 pozostają wyłączone.
Igor koordynuje i odbiera F0; przygotowanie nie jest jego odbiorem.

## Co jest gotowe lokalnie

- [Generator planu](../../scripts/ops/prepare-backup-plan.mjs) przyjmuje
  [konfigurację JSON](../../ops/observability/backup/preparation.example.json)
  i wypisuje opis przyszłych poleceń. Nie ma wykonawcy ani opcji `--execute`.
- [Walidator manifestu](../../scripts/ops/check-backup-set.mjs) sprawdza
  formalną kompletność i spójność zgłoszonego zestawu. Nie czyta kopii,
  nie oblicza hashy rzeczywistych artefaktów i nie uwierzytelnia dowodów.
- [Szablon manifestu](../../ops/observability/backup/manifest.example.json)
  zawiera puste/niewykonane pola. Musi zostać odrzucony przez walidator.
  Poprawne sztuczne manifesty istnieją wyłącznie w testach.
- Testy offline obejmują brak elementów, przerwany eksport, niepełne
  listowanie, różne przebiegi, błędne czasy i niepełny snapshot restic.

- [Biblioteka eksportu S3](../../scripts/ops/export-backup-s3.mjs) przyjmuje
  jawnie przekazanego klienta; nie buduje klienta produkcyjnego i nie ma CLI
  wykonującego kopię. Testy odczytują sztuczne odpowiedzi S3 i zapisują pliki
  wyłącznie w lokalnych katalogach testowych.
- [Kontrola referencji](../../scripts/ops/check-backup-references.mjs) porównuje
  znormalizowane odwołania do plików z manifestami obu magazynów. Publiczna
  [mapa kodu](../../ops/observability/backup/storage-reference-map.json) opisuje
  źródła i nierozstrzygnięte mapowania; nie jest odczytem danych produkcji.
- [Adapter lokalnego eksportu](../../scripts/ops/prepare-backup-reference-input.mjs)
  łączy dwa katalogi eksportera z przygotowanymi wcześniej referencjami DB.
  Czyta i sprawdza długości oraz SHA-256 rzeczywistych lokalnych plików;
  nie eksportuje danych bazy i nie potwierdza ich pochodzenia.
- [Plan retencji](../../scripts/ops/plan-backup-retention.mjs) wybiera wspólne
  zestawy 7/4/12. Nie usuwa snapshotów ani nie generuje poleceń usuwania;
  poprawność zgłoszonego manifestu nie uwierzytelnia rzeczywistej kopii.

To **pakiet przygotowawczy, nie gotowy automatyczny system kopii**.
Połączenie biblioteki z autoryzowanym klientem S3, rzeczywisty eksport
referencji DB, konfiguracja odzyskiwania, wykonawca całej sekwencji, blokada
równoległych przebiegów, harmonogram i alarmy nadal wymagają przygotowania
oraz testów przed osobno uzgodnionym uruchomieniem. Selekcja retencji jest
lokalnym podglądem; uwierzytelnienie wejścia i usuwanie nie są zaimplementowane.
Opis polecenia w JSON nie upoważnia do jego wykonania.

Bezpieczny podgląd przykładu z katalogu repo, Node.js 22:

```powershell
node scripts/ops/prepare-backup-plan.mjs --config ops/observability/backup/preparation.example.json --run-id planned-20261010-001
node scripts/ops/check-backup-set.mjs --help
node --test scripts/ops/prepare-backup-plan.test.mjs scripts/ops/check-backup-set.test.mjs scripts/ops/export-backup-s3.test.mjs scripts/ops/check-backup-references.test.mjs scripts/ops/plan-backup-retention.test.mjs scripts/ops/prepare-backup-reference-input.test.mjs
```

Generator zwraca `PREPARATION_ONLY`, `executable:false`, upoważnienia `false`
i listę braków nawet po uzupełnieniu kontenera. Nie odczytuje `infra.env`,
plików haseł ani środowiska aplikacji. Prywatną konfigurację i wynik z
rzeczywistymi identyfikatorami przechowuje się poza Git. Nigdy nie uruchamiać
konfiguracji przez `source`, `eval` ani interpreter powłoki.

## Zakres danych i serwery

1. **db-1 — repo `postgresql`** (`kind:database` w manifeście): osobne pełne
   dumpy `postgres` i `_supabase`, globals z rolami i tablespaces, inwentarz
   źródeł oraz zabezpieczony pakiet konfiguracji odzyskiwania. Bez filtrów
   schematów, tabel, ACL lub właścicieli. `postgres` obejmuje między innymi
   `auth`, `storage`, pg-boss i historię migracji.
2. **ops-1 — repo `app-minio`** (`kind:application`): wszystkie buckety
   aplikacji, treści obiektów, metadane i konfiguracja bucketów, manifest
   obiektów z SHA-256 oraz raport referencji.
3. **db-1 — repo `supabase-minio`** (`kind:supabase`): ten sam pełny zakres
   dla niezależnego MinIO Supabase. Pusty magazyn nadal wymaga dowodu
   kompletnego listowania i zachowania konfiguracji.

`pg_dump` obejmuje jedną bazę. Generator opisuje dwa dumpy w formacie custom,
używając `supabase_admin` zgodnie z istniejącą procedurą; faktyczne uprawnienia
i zgodność wersji klienta trzeba sprawdzić przed wykonaniem. `pg_restore
--list` sprawdza spis archiwum, bez odtwarzania bazy. Globals obejmują role
i tablespaces; samo `--roles-only` nie wystarcza.
[PostgreSQL: pg_dump](https://www.postgresql.org/docs/15/app-pgdump.html),
[pg_dumpall](https://www.postgresql.org/docs/15/app-pg-dumpall.html).

Pomiar 10.10, 14:27–14:32 UTC: obie bazy razem 866 395 742 B (odczyt
14:29), MinIO aplikacji 31 bieżących obiektów / 378 638 B, MinIO Supabase
0 obiektów / 0 B; oba buckety Unversioned. Są to
[pomiary źródeł](../observability/evidence/f0-runtime-size-2026-10-10.json),
nie rozmiary kopii, sprawdzenie referencji lub prognoza retencji.
Fizyczne zużycie katalogów MinIO i logiczne bajty obiektów to różne wielkości.

## Dostęp, konfiguracja i klucze do późniejszego wykonania

Adresy źródeł i bieżący `PGC` pozostają w prywatnym `infra.env` oraz odczycie
runtime. Do tego przygotowania dostęp SSH nie jest potrzebny. Późniejszy
wykonawca będzie potrzebował dostępu do db-1 i ops-1; ustalenie wszystkich
procesów zapisujących obejmuje również web i worker na app-1. Obecny klucz
Igora umożliwia pełny root; nie jest technicznym kontem tylko do odczytu.

Przed instalacją należy przygotować prywatnie:

- osobne minimalne poświadczenia do **celu kopii**, niezależne od klucza
  root serwerów; osobny klucz SSH dla każdego wykonawcy oraz zweryfikowany
  klucz hosta celu (`StrictHostKeyChecking=yes`), bez automatycznej akceptacji;
- trzy pliki `postgresql.repository`, `app-minio.repository`,
  `supabase-minio.repository` ze wskazaniem trzech repozytoriów oraz osobne
  pliki o tych samych nazwach z rozszerzeniem `.password`; wszystkie poza Git,
  z minimalnym ACL, katalog 0700 i pliki 0600 na Linux;
- uprawnienia do odczytu baz i pełnego eksportu S3 z obu MinIO, obejmujące
  listowanie bucketów/obiektów/wersji/multipart oraz metadane i ustawienia;
  sekretów nie umieszczać w argumentach poleceń ani logach;
- pakiet odzyskiwania: konfiguracje web/workera i Supabase, JWT/auth/storage,
  klucze szyfrowania aplikacji (w tym `KSEF_CREDENTIALS_ENCRYPTION_KEY`),
  klucz pgsodium, jeżeli używany, ustawienia/polityki obu MinIO, wersje
  obrazów i rozszerzeń. Odczyt wszystkich potrzebnych ustawień nie został
  jeszcze potwierdzony; nie zakładać, że istnieją wyłącznie w bazie aplikacji;
- niezależną kopię kluczy/haseł odzyskiwania poza hostami źródłowymi i poza
  samym zaszyfrowanym repo. Repo, którego jedyny klucz jest w środku,
  nie zapewnia odzyskiwania. Zaszyfrowany pakiet konfiguracji i escrow
  muszą być dostępne z osobnego klienta.

Generator pokazuje referencje plików, nie ich zawartość. Docelowy katalog
`/etc/faktflow-backup` jest przykładem, nie istniejącą konfiguracją.
Nie przygotowano nowych kluczy, kont ani plików sekretów na serwerach.

BX11 HEL1 pozostaje propozycją odrębnego celu w UE. Publiczna dokumentacja
opisuje natywne repo restic przez SFTP oraz ograniczony SSH port 23;
ustawienia dostępu wymagają późniejszej konfiguracji konta. Nie zakładać
zwykłej powłoki z pipe lub uruchamianiem skryptów na Storage Box.
[Hetzner: SSH i restic](https://docs.hetzner.com/storage/storage-box/access/access-ssh-rsync-borg/).
Alternatywa na posiadanym urządzeniu wymaga potwierdzenia UE, pojemności,
dostępności i separacji od stagingu; bieżący pakiet nie wybiera zakupu.

## Zakres przygotowanych modułów

`exportBackupS3()` wymaga jawnie przekazanego klienta AWS SDK; CLI pokazuje
wyłącznie pomoc. Nowy prywatny katalog zawiera `payloads/`, `objects.ndjson`,
`bucket-config.ndjson` i `export-summary.json`. Klucze S3 pozostają w mapie,
nie stają się ścieżkami na dysku. Eksporter sprawdza paginację, długość
pobranych danych, SHA-256 i powtórny inwentarz; nie ustanawia wspólnego
punktu DB/S3. Podsumowanie sukcesu zostaje opublikowane dopiero po zapisie,
synchronizacji i zamknięciu pliku tymczasowego. Błąd pozostawia materiał
częściowy, którego nie wolno zaliczyć do pełnej kopii.

Profil MinIO ma jawną listę obsługiwanych getterów S3. Nie obejmuje całości
IAM, konfiguracji serwera, KMS ani materiału odzyskiwania. Dlatego
`payloadComplete` i `supportedBucketProfileComplete` nie ustawiają
`bucketConfigurationComplete` ani `overallRecoveryComplete` na true.
Zgodność profilu z odczytanymi wersjami OSS MinIO wymaga późniejszego
sprawdzenia. Testy używają sztucznego klienta, nie tych instalacji.

Mapa referencji rozdziela przygotowywaną rewizję PR od kodu produkcji
`face09c57f7de756546e58d092dbe6d280f93c91`, odczytanego 10.10. Zawiera także
ścieżki archiwum Glacier i nierozstrzygnięte mapowanie fizycznego S3 dla
`storage.objects`. Istnienie takich gałęzi w kodzie nie potwierdza danych
w tych backendach. Niepuste, nierozstrzygnięte odwołanie blokuje kompletność;
nie wolno przypisać go automatycznie do MinIO aplikacji. Wywołujący musi
wyeksportować pełny zakres odwołań, właściwe liczności i oba manifesty
obiektów. Pola `complete` pozostają zgłoszeniem, nie dowodem odczytu DB.
Lokalny adapter czyta dwa katalogi eksportera i wcześniej przygotowany
JSON odwołań. Strumieniowo sprawdza bajty oraz SHA-256 plików danych,
manifestu NDJSON i konfiguracji bucketów, a następnie wywołuje checker.
Klucze obiektów nie sterują ścieżką odczytu: plik danych ma wyłącznie
liczbowy identyfikator nadany przez eksporter. Odczyt ma limity rozmiaru
i liczności; większy zestaw wymaga zmiany i przeglądu limitów, nie cichego
pominięcia obiektów. API zwraca prywatne wejście checkera i bezpieczny raport;
CLI pokazuje tylko pomoc. Zgodność lokalnych plików nie potwierdza
kompletnego eksportu DB, autentyczności źródła ani odczytu kopii off-host.

Planner retencji przyjmuje `{schemaVersion:1, asOfUtc, manifests:[...]}`.
Wybiera sumę ostatnich kompletnych przebiegów z 7 niepustych dni,
4 niepustych tygodni ISO (poniedziałek) i 12 niepustych miesięcy UTC.
Ochrona obejmuje trzy snapshoty źródeł i osobny snapshot manifestu.
Niepełny, nieprawidłowy lub konfliktowy wpis blokuje propozycję usuwania
oraz chroni całe wejście. CLI wypisuje tylko liczności i kody; API zwraca
prywatne identyfikatory do przeglądu. Nie odczytuje repozytoriów ani nie
uwierzytelnia wejścia. Krótka historia nie potwierdza rocznej retencji,
a świeżość ostatniego pełnego przebiegu jest oddzielnym wynikiem.

## Sekwencja po ewentualnym rozszerzeniu zakresu

**Wszystkie poniższe operacje są niewykonane.** Nie ma tu automatycznego
wstrzymywania zapisów ani kopiowania katalogów MinIO podczas ich pracy.

1. Odświeżyć inwentarz hostów, kontenerów, baz i bucketów, wersje, uprawnienia,
   wolne miejsce oraz wszystkie backendy wskazywane przez dokumenty.
   Jeśli przybyła baza lub magazyn, rozszerzyć zakres przed kopią.
2. Uzgodnić krótkie okno spójności: wszystkie zapisy/usuwania, joby, crony,
   lifecycle i uploady muszą mieć kontrolowany stan. Sam dump transakcyjny
   nie zapewnia wspólnego punktu DB/S3 ani dwóch baz. Dokumentować granice
   UTC i sposób wykluczenia zmian; nie zaznaczać `mutationsExcluded:true`
   na podstawie samej deklaracji „brak klientów”.
3. W nowym prywatnym katalogu przebiegu przygotować dwa dumpy, globals,
   konfigurację i logiczny eksport obu S3. Wykonawca ma wymuszać pojedynczy
   przebieg, limit czasu, tworzenie nowych plików, odrzucenie symlinków,
   sprawdzone miejsce i brak ponownego użycia plików po błędzie. Dane
   przejściowe mogą być jawne na źródle; potrzebują ACL i kontrolowanego
   sprzątania dopiero po potwierdzeniu kompletnej kopii.
4. Eksporter S3 musi obsługiwać pełną paginację, pobranie każdego obiektu,
   SHA-256 pobranych bajtów, wszystkie potrzebne metadane i ustawienia
   bucketów. Klucze obiektów mogą zawierać `/`, `..` lub znaki specjalne:
   nie odwzorowywać ich bezpośrednio na ścieżki plików; użyć bezkolizyjnych
   identyfikatorów i mapy kluczy. ETag nie jest ogólnym SHA-256 treści.
   Wersja v1 kontraktu dopuszcza tylko Unversioned i zero multipart uploads;
   Enabled/Suspended, delete markers lub niepełny listing zatrzymują odbiór.
5. Uzgodnić referencje z baz ze zbiorem eksportowanych obiektów. Zakres
   obejmuje wszystkie używane ścieżki XML/PDF/UPO/archiwów, importów,
   wydatków/załączników i `storage.objects`; listę wyprowadzić z aktualnego
   schematu i kodu, nie tylko z jednej tabeli. Nieznany backend/ścieżka,
   brak pliku lub rozbieżność hashy blokują pełny zestaw.
6. Dopiero po kompletności źródeł wykonać upload do trzech zaszyfrowanych
   repo. Wspólny `runId` łączy snapshoty i manifesty. Kod zakończenia
   każdego producenta i restic musi być 0; kod 3 restic oznacza częściowy
   snapshot, nawet jeżeli powstał jego identyfikator.
   [Restic: wyniki backupu](https://restic.readthedocs.io/en/stable/040_backup.html#exit-status-codes).
7. Odczytać właściwe snapshoty i porównać komplet artefaktów/hashy, także
   z niezależnego klienta. Opisany w planie `check --read-data` czyta
   dane repo; zwykły `check` sprawdza strukturę. Żaden z nich sam nie
   stwierdza zgodności zestawu z DB ani dostępności escrow z innego klienta.
   Odczyt pełnego repo może trwać i zużywa transfer — zmierzyć go przed
   ustaleniem pracy cyklicznej.
   [Restic: kontrola integralności](https://restic.readthedocs.io/en/stable/045_working_with_repos.html#checking-integrity-and-consistency).
8. Po sprawdzeniu wszystkich trzech snapshotów zapisać końcowy manifest
   poza źródłami. Dowód dostarczenia manifestu stanowi osobną kopertę;
   dokument nie może zawierać własnego końcowego hasha. Walidator czyta
   zgłoszenie z referencją do tego artefaktu, a nie poświadcza jego istnienia.
   Manifest otrzymuje późniejszy osobny snapshot w jednym z trzech repo;
   nie jest dopisywany do już zamkniętego snapshotu źródeł. Retencja musi
   zachować również ten snapshot dostarczenia i jego dowód odczytu.
   Pełny sukces i heartbeat dopiero po całej sekwencji, nigdy po samym dumpie.

Przerwanie dowolnego kroku daje niepełny przebieg. Zachować ostatni
zweryfikowany komplet, nie przesuwać czasu ostatniego pełnego sukcesu
i nie kasować poprzednich kopii. Nie uruchamiać automatycznego naprawiania
repozytorium, odblokowania blokad, restore lub zmian danych źródłowych.

## Retencja, harmonogram i granice odbioru

Wybrana polityka: codziennie 00:30 UTC, oczekiwane zakończenie do 03:30 UTC,
alarm braku pełnego sukcesu starszego niż 26 h. To konfiguracja planowana,
bez aktywnego zadania lub wysłanego alarmu. Harmonogram UTC nie przesuwa się
przy zmianie czasu w Polsce.

Retencja 7 dziennych / 4 tygodniowe / 12 miesięcznych dotyczy **całych
wspólnych przebiegów**. Wybierać sumę najnowszych kompletnych przebiegów
w odpowiednich okresach kalendarzowych UTC; jeden przebieg może spełniać
kilka okresów. Historia krótsza niż rok nie dowodzi 12 miesięcy kopii.
Trzy niezależne polityki usuwania mogą zostawić snapshoty z różnych dni.
Potrzebny jest wspólny podgląd wyboru i ochrona wszystkich snapshotów
zachowywanego zestawu oraz manifestu.

Restic domyślnie grupuje retencję według hosta i ścieżek. Ścieżki zawierające
`runId` nie mogą tworzyć osobnej grupy dla każdej kopii. Plan opisuje
stabilne grupowanie `host` dla wyszukiwania poprzednich backupów, a retencję
pozostawia do osobnego wykonawcy wspólnych zestawów. Nie generuje poleceń
`forget` lub `prune`; usuwanie wymaga późniejszego podglądu i osobnej
kontroli skutków. [Restic: retencja i grupowanie](https://restic.readthedocs.io/en/stable/060_forget.html).

G09 wymaga rzeczywistych dowodów kopii, odczytu off-host, harmonogramu,
retencji i dostępności odzyskiwania. Poprawny JSON, testy offline i plan
poleceń nie zaliczają tej bramki. Comiesięczny izolowany restore pozostaje
planowany; TEST-07 nie został wykonany i wymaga oddzielnego zakresu.
Staging G03 również pozostaje FAIL. Pełne kryteria opisuje
[plan odbioru F0](../observability/acceptance-plan.md).

Historyczny [backup-restore](backup-restore.md) i
[db-backup.sh](../../scripts/hetzner/db-backup.sh) dotyczą starszego zakresu:
jednej bazy, innej retencji i opcjonalnego transportu off-host. Nie zostały
uruchomione ani zmienione przez ten pakiet. Ich lokalny sukces lub historyczny
restore jednej bazy nie dowodzi pełnego zestawu dwóch baz i obu MinIO.
