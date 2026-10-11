# F0 — procedura okna spójności kopii, 11.10.2026

**PRZYGOTOWANA / NIE WYKONANA. PREPARATION_ONLY, F0_OPEN, G03/G09 FAIL.**
Ten dokument nie udziela zgody na zatrzymanie ruchu, zmianę konfiguracji,
wykonanie kopii, zakup, instalację, deploy, migrację, restore ani F1.
Opisuje warunki przyszłej, osobno zatwierdzonej operacji. Nie potwierdza
istnienia gotowego narzędzia blokującego wszystkie zapisy ani gwarancji powrotu.

Zakres kopii i odbioru pozostaje w [przygotowaniu F0](f0-backup-preparation.md)
i [opisie wykonawcy](f0-backup-executor.md): obie bazy `postgres` i `_supabase`,
globals/role, konfiguracja i klucze odzyskiwania, MinIO aplikacji na ops-1 oraz
MinIO Supabase na db-1. Sam `pg_dump` nie tworzy wspólnej transakcji dwóch baz
oraz S3. Odczyt referencji w READ ONLY / REPEATABLE READ także jej nie tworzy.

## Granica wykonawcy i procedury zewnętrznej

[runBackupSequence](../../scripts/ops/run-backup-sequence.mjs) wymaga adaptera
`observeConsistency` z fazami `before` i `after`. Adapter dostarcza dowody;
nie ma automatycznie ustanawiać ani zdejmować blokad. Prywatne podłączenie
klientów również nie wykonuje automatycznego freeze/resume. Zewnętrzną
procedurę, jej operatora i obserwatora trzeba przypiąć do karty wykonania.
Sama funkcja zwracająca `true` nie stanowi dowodu wykluczenia mutacji.

Blokada katalogu koordynatora wyklucza równoległe przebiegi w tym samym
zakresie. Nie blokuje web, kolejki, administratorów ani MinIO i nie obejmuje
drugiego niezależnego koordynatora. Nie utożsamiać jej z blokadą zapisów źródeł.

Sekwencja zapisuje koniec przedziału spójności dopiero po powrocie z `after`.
Nie udostępnia osobnego callbacku zwolnienia blokad po utrwaleniu źródeł.
Dlatego podstawowy wariant tej procedury utrzymuje blokady do rozstrzygnięcia
sekwencji i kontroli jej procesów, również podczas transferu i niezależnego
odczytu. To może wydłużyć przerwę. Nie zdejmować blokad wewnątrz `after` ani
zakładać, że obecne API zapewnia krótsze okno tylko na dump i eksport.
Skrócenie okna wymaga osobno zaprojektowanej, sprawdzonej granicy zakończenia
odczytów źródeł; ten dokument jej nie implementuje.

## Źródła zapisów, które trzeba objąć kontrolą

Kontrakt wymaga dokładnie siedmiu kategorii `REQUIRED_WRITERS`. Każda musi
mieć prywatną listę wszystkich faktycznych procesów, klientów, wejść i osób;
siedem nazw nie jest kompletnym inwentarzem runtime.

- **`web`:** Server Actions, API, publiczne formularze, logowanie, panel
  operatora i webhooki. [Proxy Supabase](../../lib/supabase/middleware.ts)
  sprawdza sesję przed `maintenanceMode`; odświeżenie sesji może zapisywać auth.
  Flaga obejmuje panel i prywatne API, ale przepuszcza strony publiczne,
  logowanie, `/admin`, publiczne webhooki oraz inne jawne wyjątki.
  [Odczyt flagi](../../lib/feature-flags/maintenance.ts) ma cache 30 s na proces
  i przy błędzie zachowuje poprzednią wartość, domyślnie false. To pomoc dla
  użytkownika, nie pełna blokada zapisów. Samo odrzucanie POST/PUT/DELETE także
  nie wystarczy: [GET PDF](../../app/api/invoices/%5Bid%5D/pdf/route.ts)
  może przez [generator PDF](../../lib/pdf/invoice-pdf.ts) i
  [magazyn PDF](../../lib/pdf/pdf-storage.ts) zapisać cache S3. Publiczny
  [share-target](../../app/share-target/route.ts) wywołuje akcję uploadu.
- **`worker`:** wszystkie instancje [workera pg-boss](../../lib/jobs/worker.ts),
  w tym ewentualne lokalne procesy przez tunel. [Bieżący kod backendu](../../lib/jobs/config.ts)
  obsługuje wyłącznie pg-boss; historyczny opis przełączania na Inngest nie jest
  instrukcją powrotu. Aktywne joby mogą zapisywać DB/S3 i wywoływać KSeF,
  płatności lub pocztę. [Wrapper retry](../../lib/jobs/run-job.ts) zapisuje
  przebiegi i może kolejować ponowienia. [Shim kroków](../../lib/jobs/step-shim.ts)
  nie memoizuje całego handlera przy retry.
- **`crons`:** [harmonogram pg-boss](../../lib/jobs/queues.ts), jego nadzór,
  heartbeat, retry i wszystkie zewnętrzne cron/systemd lub ręczne skrypty.
  Do mutujących zadań należą m.in. archiwizacja, retencja/GDPR, snapshot JSON,
  sprzątanie starych kopii, odbiór faktur i uzgadnianie stanów KSeF. Webowy
  [klient pg-boss](../../lib/jobs/boss.ts) nie prowadzi schedule/supervise,
  lecz nadal może dodawać zadania. `WORKER_DISABLE_SCHEDULES=true` działa
  podczas startu workera i usuwa zapisane harmonogramy; nie jest live-pause
  ani blokadą wykonania już zakolejkowanych zadań. Istniejący
  [skrypt hostowej kopii](../../scripts/hetzner/db-backup.sh) wymaga osobnego
  sprawdzenia pod kątem faktycznego uruchamiania i kolizji zasobów.
- **`database-admin`:** sesje SQL, Studio/Meta, automaty administracyjne,
  deploy i operatorzy. Także [bramka Telegrama](bramka-telegram.md) może
  wyłączyć flagę, zapisać audyt lub uruchomić deploy; funkcje `ops.disable`
  i `ops.log` są w [migracji 00100](../../supabase/migrations/00100_ops_gate.sql).
  W przeszukanych migracjach repo nie znaleziono `pg_cron`/`pg_net` ani
  `cron.schedule`; nie dowodzi to ich braku w runtime. Osobno trzeba
  sklasyfikować wewnętrznych klientów obu baz, m.in. Analytics/Logflare,
  Vector, Realtime i pooler, jeśli faktycznie zapisują dane objęte kopią.
- **`s3-upload-delete`:** oba endpointy MinIO, ich konsole/admin API,
  aplikacja, worker, skrypty i niezależne klienty. Kod obejmuje
  [XML/UPO i zwykłe uploady](../../lib/storage/r2.ts),
  [zdjęcia kosztów](../../lib/storage/expenses.ts),
  [importy](../../lib/import/file-storage.ts),
  [eksporty](../../lib/jobs/runners/exports-generate.ts),
  [snapshoty JSON i ich usuwanie](../../lib/backup/r2-backup-client.ts),
  [usuwanie plików faktur](../../lib/retention/invoice-files.ts) i
  [Glacier](../../lib/storage/glacier.ts). Występujący w `r2.ts` presign dotyczy
  GET; brak znalezionego presigned PUT w tym helperze nie wyklucza innych
  klientów lub aktywnych multipart uploads. Wyłączenie web nie odbiera już
  wydanych uprawnień S3.
- **`s3-lifecycle`:** reguły wygaszania/przenoszenia, replikacja i inne
  autonomiczne mechanizmy zmieniające dane lub konfigurację. Odebranie prawa
  zapisu klientowi nie dowodzi zatrzymania mechanizmów wewnątrz serwera.
  [Eksporter S3](../../scripts/ops/export-backup-s3.mjs) czyta lifecycle i
  replikację, ale ich nie zatrzymuje. Zgodne listingi/config przed i po
  oznaczają obserwowaną stabilność, nie wykluczenie mutacji całego przedziału.
- **`supabase-storage`:** bezpośrednie wejście przez Kong/Auth/PostgREST/Storage
  i wszystkie wewnętrzne procesy objęte kopią, także poza aplikacją Next.js.
  Zamknięcie panelu FaktFlow nie blokuje bezpośredniego API Supabase. Trzeba
  przypiąć faktyczne endpointy i procesy do [inwentarza](../observability/runtime-inventory.md),
  odróżnić MinIO Supabase na db-1 od MinIO aplikacji na ops-1 oraz potwierdzić
  mapowanie `storage.objects` na fizyczne obiekty. Dawny pusty listing nie
  dowodzi, że ten magazyn pozostanie pusty w nowym oknie.

[Hamulce KSeF/FLO/rejestracji](hamulce-ksef.md) nie zastępują powyższego zakresu.
`killAllKsefSubmissions` może zmienić stan już zakolejkowanych faktur na
`failed`/`KSEF_PAUSED`; nie traktować go jako neutralnego zamrożenia pracy.

## Karta przed operacją — warunki dopuszczenia

Przed osobną prośbą o wykonanie przygotować następujące konkretne informacje:

1. Operator i zastępstwo/eskalacja, `runId`, `windowId`, źródłowa rewizja,
   UTC i sprawdzona zgodność zegarów, koordynator Linux oraz niezależny czytnik.
   Przegląd mapy źródeł, schematu, wersji i uprawnień musi odpowiadać runtime;
   przypięta w kodzie rewizja nie odświeża się samoczynnie.
2. Dla każdej kategorii writerów: aktualne identyfikatory procesów/usług,
   drogi dostępu, właściciel, konkretny sposób blokady, drenażu i obserwacji
   oraz sposób sprawdzenia, że usługa nie została automatycznie wznowiona.
   Brak kompletnej listy lub gotowego, sprawdzonego mechanizmu oznacza STOP.
3. Zatwierdzony zakres niedostępności i osobny limit czasu okna. Domyślne
   3 h sekwencji i 30 min kroku nie są obietnicą ani zgodą na tak długą przerwę.
   Nie oszacowano jeszcze czasu rzeczywistego dumpa, eksportu i deep read.
4. Prywatny zapis konfiguracji **pierwotnej** oraz planowanej **tymczasowej**:
   ingress, polityki restartu/deploy, flagi, harmonogramy, prawa klientów,
   lifecycle/replikacja i inne zmieniane ustawienia. Zapisać właściciela
   zmiany i warunek bezpiecznego przywrócenia. Nie zastępować poprzedniego
   stanu domyślnym `false`/`on` ani bezwarunkowym rollbackiem.
5. Pełny pakiet odzyskiwania, w tym konfiguracja i klucze obu MinIO/IAM/KMS,
   oraz miejsce na dumpy, oba eksporty, pakiet recovery, odczyty kontrolne
   i margines. Przekazany w tej kontynuacji odczyt tylko do odczytu z 11.10
   wskazuje brak hostowych `node` i `restic` na wszystkich trzech hostach
   oraz wolne miejsce na filesystemach Dockera: app-1 około 19 GiB,
   ops-1 około 23 GiB, db-1 około 10 GiB. Nie potwierdza gotowości koordynatora,
   zainstalowania narzędzi, miejsca dla pełnego zestawu ani pojemności retencji.
   Nie wynika z niego zgoda na instalację lub wybór hosta wykonawczego.
6. Zewnętrzny obserwator niezależny od zatrzymywanego workera, planowana
   obsługa jego braku heartbeat oraz kontrola niedostarczonego sygnału.
   Nie wysyłać sztucznych pingów sukcesu. Sprawdzić zachowanie i możliwość
   późniejszego uzgodnienia dostaw [Stripe](../../app/api/stripe/webhook/route.ts)
   i [Resend](../../app/api/email/resend-webhook/route.ts) podczas niedostępności;
   sam kod endpointu nie potwierdza ustawień retry dostawcy.

Sekrety, adresy, nazwy prywatnych zasobów, pełne wyniki SQL i treści klientów
pozostają poza Git. Publiczny indeks może zawierać czas, zakres, bezpieczne
wyniki kontroli i hashe dowodów, bez ich wrażliwej zawartości.

## Kolejność przyszłego wykonania

1. **Utrwalić stan początkowy.** Potwierdzić kartę i osobne upoważnienie,
   wyłączność koordynatora, stan obu baz/S3, poprzednią pełną kopię, konfigurację
   pierwotną i stan aktywnych operacji. Wstrzymać konkurencyjne deploy,
   zmiany adminów, restarty automatyczne i skrypty, zanim zacznie się drenaż.
   Każda zmiana przygotowawcza poprzedza właściwy przedział kopii.
2. **Zamknąć dopływ nowych operacji.** Użyć wcześniej sprawdzonej kontroli
   wszystkich wejść do origin web oraz bezpośrednich API Supabase/S3,
   z uwzględnieniem tras wewnętrznych, konsol, istniejących połączeń i klientów.
   Ekran przerwy powinien być obsługiwany bez wykonywania aplikacyjnych
   mutacji. Webhook otrzymuje odpowiedź tymczasowej niedostępności, nie
   pozorne 2xx. Blokada tylko przeglądarki, DNS lub metod HTTP nie wystarcza.
   Pozostawić zależności dostępne dla kontrolowanego zakończenia operacji
   już przyjętych; nie odcinać im DB/S3 w środku zapisu.
3. **Zakończyć pracę w toku.** Zatrzymać pobieranie nowych jobów i tworzenie
   nowych przebiegów cron, a potem poczekać na rozliczenie aktywnych żądań,
   uploadów i handlerów. Repo nie udostępnia osobnego endpointu drain ani
   gotowej operacji rozdzielającej ten proces na fazy. Wybrany mechanizm
   wymaga wcześniejszego sprawdzenia. Zero nowych wejść nie oznacza zero
   pracy już rozpoczętej. Zachować kolejki, retry i trwałe claimy.
4. **Potwierdzić zatrzymanie wszystkich writerów.** Sprawdzić procesy,
   połączenia i transakcje DB, w tym oczekujące/nieuzgodnione transakcje,
   aktywne joby i S3 requests. Objąć klientów wewnętrznych Supabase,
   administratorów i bramkę Telegrama. Postgres i MinIO pozostają działające
   dla odczytów; nie kopiować katalogów MinIO podczas pracy jako zamiennika
   logicznego eksportu. Nie wymagać nieruchomego WAL jako dowodu braku
   mutacji logicznych — stan liczników lub chwilowy brak zapytań nie stanowi
   kompletnej blokady przyszłych zapisów.
5. **Domknąć mechanizmy autonomiczne.** Dla obu MinIO udokumentować brak
   aktywnych reguł zmieniających dane albo ich wcześniej zatwierdzone,
   skuteczne wstrzymanie. Tak samo potraktować cron/systemd i ewentualne
   zadania wewnątrz DB. Zapisać efektywną konfigurację tymczasową. Eksporter
   v1 wymaga Unversioned, braku delete markers i multipart oraz pełnych
   listingów. Nie naprawiać niezgodności automatycznym usuwaniem, zmianą
   versioningu czy abort multipart; niespełnienie warunku blokuje kopię.
6. **Otworzyć przedział dowodowy.** Dopiero po zakończeniu powyższych kontroli
   uruchomić osobno zatwierdzoną sekwencję. `before` potwierdza ten sam
   `windowId`, `runId` i wszystkie kategorie writerów na podstawie aktualnych
   dowodów. Brak dowodu choć jednego kontrolowanego klienta oznacza odmowę.
   Blokady i ich obserwacja trwają nieprzerwanie podczas dumpów obu baz,
   globals, captureRecovery, eksportu obu MinIO oraz ekstrakcji i porównania
   referencji. Konfiguracja odzyskiwania musi zawierać pierwotny i tymczasowy
   stan: eksport wykonany po wyłączeniu reguły widzi właśnie stan tymczasowy.
7. **Zamknąć przedział dowodowy.** `after` sprawdza ciągłość tych samych
   kontroli, brak dodatkowych writerów/restartów/deploy i zmian konfiguracji.
   Dołącza dowody całego przedziału, nie tylko drugi chwilowy odczyt. Brak
   obserwacji albo utrata blokady oznacza niekompletność. Zgodne sumy/liczby
   obiektów nie zastępują tej kontroli. W podstawowym wariancie blokady nadal
   pozostają aktywne podczas uploadu, odczytów kontrolnych i manifestu.
8. **Ocenić wynik przed wznowieniem.** Odróżnić kompletność kopii, dostarczenie
   sygnału, stan procesów i wynik obsługi blokady koordynatora. Formalne
   `SEQUENCE_COMPLETE_REQUIRES_ACCEPTANCE` nie zamyka G09 ani TEST-07.
   Zweryfikować, czy nie pozostał niepewny proces lokalny lub zdalny.
9. **Przywrócić wyłącznie własne zmiany.** Przy nadal zamkniętym ingress
   porównać ustawienia z zapisanym stanem tymczasowym i `windowId`. Nie
   nadpisywać późniejszej obcej zmiany. Przywrócić potrzebne zależności i
   kontrolowane mechanizmy według stanu pierwotnego; sprawdzić ich działanie.
   Następnie wznowić web/worker i sprawdzić stan przy zamkniętym ingress,
   a dopiero potem otworzyć ruch. Uruchomienie workera samo może zmieniać
   harmonogramy/kolejki i wznowić retry, więc następuje już poza oknem kopii.
   Konkretną kolejność zależności trzeba ustalić z rzeczywistego inwentarza;
   repo nie daje gwarancji automatycznego odtworzenia konfiguracji.
10. **Uzgodnić zaległości i zakończyć obsługę.** Sprawdzić zaległe webhooki,
    joby, uploady, stan KSeF i dostarczenie sygnałów. Nie uznawać przejściowego
    health 200 za dowód przetworzenia zaległości. Zapisać osobny wynik
    wznowienia usług i wynik kopii, także częściowe błędy. Kolejne uruchomienie
    backupu wymaga nowego `runId` i nowego katalogu.

## Drenaż, timeout i powrót po błędzie

[stopBoss](../../lib/jobs/boss.ts) wywołuje `stop({ graceful: true, close: true })`
bez jawnego timeoutu. Odczyt lokalnego pakietu pg-boss 12.27.0, zgodnego z
[pnpm-lock.yaml](../../pnpm-lock.yaml), wykazał w `dist/index.js` domyślne
30 000 ms oczekiwania, a następnie `manager.failWip()`; `dist/manager.js`
oznacza pozostałą aktywną pracę jako failed i abortuje workerów biblioteki.
Kod [workera aplikacji](../../lib/jobs/worker.ts) kończy proces przez
`process.exit(0)` w `finally`. **Log graceful i exit 0 nie dowodzą opróżnienia.**
Trzeba sprawdzić także rzeczywistą wersję obrazu, timeout zatrzymania kontenera
oraz zasady restartu Coolify. Repo [Dockerfile](../../Dockerfile) nie ustala
produkcyjnego `stop_grace_period`. Limity jobów wynoszące do 4 h nie wydłużają
tego 30-sekundowego oczekiwania. Nie polegać na samym SIGTERM do długiego joba.

Jeżeli przekroczono limit drenażu, wymuszono zabicie procesu lub wynik efektu
zewnętrznego jest nieznany, nie otwierać okna kopii jako spójnego. Przerwać
próbę, zabezpieczyć dowody i uzgodnić stan. Ponowienie całego handlera może
ponowić skutki uboczne; dotyczy to zwłaszcza KSeF i płatności. Istniejące
[hamulce i uzgadnianie KSeF](hamulce-ksef.md) pomagają obsłużyć konkretny stan,
ale nie są gwarancją powrotu wszystkich jobów do stanu sprzed zatrzymania.

Jeżeli błąd wystąpi po otwarciu okna, kopia pozostaje `INCOMPLETE`, a poprzedni
pełny sukces nie zmienia czasu. Prywatny operator ocenia zakończenie źródłowych
odczytów i ryzyko pozostałych procesów przed kontrolowanym wznowieniem. Timeout
lokalnego SSH nie dowodzi zakończenia procesu zdalnego. Niepewnego procesu nie
uznawać za zakończony tylko dlatego, że Promise zwrócił błąd.

Wznowienie dostępności i zwolnienie blokady backupu są osobnymi decyzjami:
po uzgodnieniu stanu można przywrócić usługi, pozostawiając kopię niekompletną
oraz blokadę przebiegu do przeglądu. Nie wykonywać bezwarunkowego resume w
`finally`, automatycznego usuwania locka, porzuconych artefaktów ani snapshotów.
Przekroczenie dopuszczalnego okna eskalować operatorowi wraz ze stanem;
nie przedłużać niedostępności bez końca w oczekiwaniu na pełny sukces kopii.

## Minimalny pakiet dowodowy i warunki odmowy

Prywatny pakiet powinien powiązać `runId`/`windowId`, operatora i obserwatora,
UTC, rewizję/inwentarz, wszystkich writerów, stan pierwotny i tymczasowy,
potwierdzenia blokad i drenażu, przebieg obserwacji całego przedziału oraz
wynik wznowienia. Załączniki muszą mieć hashe i kontrolę dostępu. Nie wpisywać
payloadów webhooków, treści zapytań klientów lub sekretów do raportu publicznego.

Wynik `before`/`after` zgodny strukturalnie z API nie uwierzytelnia dostawcy
dowodów. Dostawca musi odrzucić obcy/stary `runId` lub `windowId`, niepełny
zakres, brak ciągłości obserwacji i niepotwierdzony stan procesu. Dopiero wtedy
może zadeklarować `mutationsExcluded`; `entireIntervalVerified` w `after`
dotyczy całego uzgodnionego przedziału, nie zgodności dwóch próbek.

Brak gotowego mechanizmu blokady, nieznany writer, aktywna/nieuzgodniona praca,
restart/deploy podczas okna, zmiana kontroli, przerwana obserwacja, aktywne
multipart, nieobsługiwany profil S3, nieznane referencje, Glacier poza mapą,
brak konfiguracji/kluczy recovery albo niesprawdzona pojemność oznaczają STOP.
Nie zastępować tych warunków deklaracją operatora bez dowodów technicznych.
Wymagane są też wcześniejsze kontrole z [karty wykonawcy](f0-backup-executor.md),
nie tylko warunki okna zapisów.

Na etapie 11.10.2026 nie wykonano tej procedury, nie potwierdzono jej drenażu,
ciągłości blokad, czasu przerwy ani skutecznego wznowienia. Przygotowanie
prywatnych klientów i tego runbooka nie zmienia **F0_OPEN ani G03/G09 FAIL**.
