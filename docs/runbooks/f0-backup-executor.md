# F0 — wykonawca pełnej sekwencji, przygotowanie 10.10.2026

Aktualizacja 11.10: [prywatne podłączenie klientów](f0-backup-private-wiring.md) i [procedura okna spójności](f0-backup-consistency-window.md) opisują nową granicę: utrwalenie źródeł i potwierdzone wznowienie przed uploadem. Konfiguracja i wykonanie operacyjne nadal nie są gotowe.

**PREPARATION_ONLY, G03/G09 FAIL, F0_OPEN.** Moduły są napisane i sprawdzane
lokalnie na danych syntetycznych. Nie skonfigurowano wykonania produkcyjnego,
nie uruchomiono kopii, zadania cyklicznego ani rzeczywistego alarmu. Obowiązuje
„Tylko przygotowanie — bez zakupu i zmian”.

## Gotowe połączenia

[run-backup-sequence.mjs](../../scripts/ops/run-backup-sequence.mjs) łączy
istniejący plan, eksport S3, kontrolę rzeczywistych lokalnych plików,
referencje DB, walidator manifestu i podgląd retencji. API przyjmuje jawne
adaptery oraz tryb wywołania; import i CLI nie uruchamiają sekwencji.
`synthetic` jest oznaczeniem testu, nie techniczną izolacją sieci: testy
faktycznie przekazują klientów bez sieci. `separately-authorized` wymaga
`authorization.backup:true` i `authorization.resumeWrites:true`; są to
warunki techniczne wywołania, które nie zastępują zgody człowieka.
Tryb operacyjny wymaga Linux już przy wejściu; Windows służy wyłącznie
testom syntetycznym.

Przebieg obejmuje kolejno:

1. Jedną blokadę całego zakresu i nowy katalog przebiegu; kontrolę źródeł,
   wersji, uprawnień, miejsca, celu UE, niezależnego czytnika i escrow kluczy.
2. Dowód rozpoczęcia uzgodnionego okna bez zapisów i usunięć. Zakres obejmuje
   web, worker, crony, administratorów DB, upload/delete, lifecycle S3 i
   Supabase Storage. Biblioteka nie zatrzymuje tych usług automatycznie.
3. Dwa pełne dumpy custom (`postgres`, `_supabase`), sprawdzenie ich spisów
   przez `pg_restore --list`, globals z rolami i tablespaces oraz zaszyfrowany
   pakiet odzyskiwania. Hash powstaje z rzeczywistych bajtów pliku.
4. Eksport obu MinIO, odczyt referencji obu baz i porównanie plików. Odczyt
   referencji działa w dedykowanych transakcjach READ ONLY / REPEATABLE READ,
   z `row_security=off`, kontrolą nazwy bazy i limitami. RLS nie może po cichu
   ukryć części zakresu: brak wystarczających uprawnień daje błąd odczytu.
5. Obowiązkowe `closeSourceClients`, następnie dowód `after` tego samego
   `runId`, `windowId` i `sourceRevision`, obejmujący dokładnie siedem
   kategorii writerów, cały przedział i `sourceOperationsStopped:true`. Zamknięcie
   lokalnego klienta nie zastępuje dowodu końca operacji zdalnych.
6. Dokładną weryfikację listy i bajtów lokalnych plików oraz seal. Na Linux
   `POSIX_FSYNC` wymaga utrwalenia plików i katalogów; Windows daje jedynie
   `SYNTHETIC_ONLY`. Seal nie jest blokadą niezmienności ani gwarancją sprzętu.
   Pliki i ich prywatne katalogi nadrzędne wymagają stałej kontroli dostępu.
7. Trwały `write-resume-intent.json`, jedno wywołanie wymaganego adaptera
   `resumeWrites` i walidację jego receipt `RESUMED`. Receipt wiąże ten sam
   przebieg, okno, rewizję, hash seal i wszystkie siedem kategorii writerów;
   potwierdza zakończenie odczytów, przywrócenie stanu pierwotnego, czasy UTC
   oraz niepusty dowód dostawcy. Jest ograniczony do 64 KiB i trwale zapisany
   jako `write-resume.json` w części DB przed rozpoczęciem uploadów.
   Sam poprawny JSON nie dowodzi prawdziwości zgłoszenia.
8. Po wznowieniu: trzy osobne snapshoty restic; kod 3 jest błędem. Dokładna
   lista i hashe lokalnych plików są sprawdzane ponownie przed i po uploadzie.
   Niezależny transport sprawdza ID repo, snapshot, tagi, całe dane repo przez
   `check --read-data` i każdy plik przez `dump`, porównując SHA-256 i bajty.
9. Końcowy manifest jako osobny, czwarty snapshot; jego niezależny odczyt,
   formalną kontrolę koperty dostarczenia, prywatne potwierdzenie lokalne,
   podgląd wspólnej retencji, a dopiero potem sygnał zakończenia.

[Adapter DB/SSH](../../scripts/ops/backup-database-command.mjs) dopuszcza
wyłącznie pięć operacji z generatora planu, jawny kontener i host `db-1`.
Wymusza zaufany known_hosts, `StrictHostKeyChecking=yes`, wyłącza konfigurację
SSH użytkownika i forwarding. Nie ładuje `infra.env` przez powłokę.
Pliki credentials są sprawdzane przez otwarty deskryptor; SSH następnie
otwiera je ponownie po ścieżce. Prywatne pliki i ich katalogi muszą więc
pozostać zaufane i stabilne przez całą operację.
[Adapter restic](../../scripts/ops/backup-restic.mjs) nie ma init, restore,
forget, prune, repair ani unlock. Czytnik i zapisujący mają osobne jawne
transporty oraz identyfikatory. Różne identyfikatory nie dowodzą fizycznej
niezależności klientów; trzeba ją potwierdzić przed użyciem.

[Ekstraktor referencji](../../scripts/ops/export-backup-db-references.mjs)
obejmuje 17 zakresów z istniejącej mapy przypiętej do `face09c57f7de756546e58d092dbe6d280f93c91`.
Zapytania dotyczące referencji są w `postgres`; w `_supabase` sprawdzany jest
również katalog relacji/kolumn i tożsamość bazy. Nie jest to dowód, że na
produkcji nie istnieją inne odwołania. Heurystyki nowych kolumn i członów
JSON służą wykrywaniu braków, nie zastępują przeglądu bieżącego schematu.
Nieznane backendy, niepuste Glacier i nieustalone fizyczne mapowanie
`storage.objects` pozostają blokadą. Transakcje DB same nie zapewniają
wspólnego punktu dumpów dwóch baz i S3.

## Granica źródeł i wersja manifestu

Nowa sekwencja tworzy manifest v2 z `sourceBoundary.seal` i
`sourceBoundary.resume`. Artefakty seal i receipt są członkami snapshotu DB
i jego niezależnego odczytu; osobny manifest jest także dostarczany poza
źródła i odczytywany. [Walidator](../../scripts/ops/check-backup-set.mjs)
odrzuca niezgodne powiązania i kolejność czasów. Nadal przyjmuje historyczny
v1, ale v1 nie potwierdza nowej granicy źródeł ani wznowienia i nie może
uzyskać tych twierdzeń przez dopisanie pól v2.

Okno zapisów obejmuje dumpy i ich inspekcję, recovery, eksporty, referencje,
zamknięcie klientów, końcowy dowód, weryfikację plików, `fsync` i wznowienie.
Upload i pełne kontrole historii zaczynają się po potwierdzonym resume.
Blokada całego zakresu backupu nadal obejmuje wszystkie etapy. Koszt historii
wpływa na czas wykonania i lock, ale nie na prawidłowo zakończone okno źródeł.
[Model czasu](f0-backup-capacity-model.md) rozdziela te dwa budżety;
przygotowany mechanizm nie dowodzi krótkiej rzeczywistej przerwy.

## Błędy, limity i ponowienia

Domyślny limit całej sekwencji wynosi 3 godziny, kroku 30 minut. Porównanie
referencji i plików działa w osobnym workerze, aby synchroniczne hashowanie
porównania nie blokowało licznika czasu koordynatora. Seal czyta pliki
asynchronicznie, porcjami, w koordynatorze. Eksporter S3 przyjmuje przerwanie
również podczas żądania, strumienia i przed publikacją podsumowania.
Procesy mają limity wyjścia, TERM/KILL i oczekiwanie zamknięcia; produkcyjny
runner jest przeznaczony na Linux. Wyniki Windows nie potwierdzają POSIX
ACL, symlinków ani obsługi grup procesów Linux.

Niepełny przebieg zachowuje pliki częściowe i poprzednie kopie. Ponowienie
wymaga nowego runId i nowego katalogu. Brak automatycznego usuwania wyników,
snapshotów, blokad albo napraw repozytorium. Przed potwierdzonym wznowieniem
stany `HELD`, `FREEZE_UNKNOWN` i `RESUME_UNKNOWN` zachowują lock i wymagają
ręcznego uzgodnienia. Nie ma ponownego wywołania `resumeWrites` w obsłudze
błędu ani w `finally`. Jedno wywołanie w przebiegu nie gwarantuje jednorazowego
skutku zewnętrznego po utracie odpowiedzi.

Po zweryfikowanym receipt stan zapisów pozostaje `RESUMED` mimo późniejszego
błędu kopii. Nieudany trwały zapis receipt zatrzymuje upload i zachowuje lock,
ale raportuje `RESUMED`; nie wolno z tego powodu wznawiać usług drugi raz.
Błąd transferu lub odczytu również nie zmienia tego stanu. Rozstrzygnięty
błąd bez niepewnych operacji może zwolnić lock; przerwanie, timeout i niepewny
proces go zachowują.

Zamknięcie lokalnego SSH nie dowodzi zatrzymania procesu na serwerze.
Operator musi sprawdzić procesy i częściowe artefakty oraz osobno rozstrzygnąć
stan zapisów i dopuszczenie kolejnego backupu. Limity 3 h/30 min nie obejmują
zewnętrznego drenażu i nie są zgodą na tak długą przerwę; krok resume mieści
się w pozostałym budżecie sekwencji.

Blokada obejmuje jeden skonfigurowany katalog jednego koordynatora, a nie
wszystkie możliwe instalacje. Drugi koordynator nie może działać równolegle.
Przejęcie po awarii wymaga sprawdzenia starego hosta i procesów. Prywatne
katalogi rodziców muszą pozostać zaufane i niezmieniane podczas operacji;
portable Node nie daje tu izolacji katalogów przez `openat`.

Po trwałym zapisie wyniku wysyłany jest sygnał. Błąd dostarczenia jest
osobnym niepowodzeniem operacyjnym; lokalny `sequence-complete.json` jawnie
nie potwierdza dostarczenia sygnału. Błąd zwolnienia blokady po wykonanej
kopii zachowuje fakt wykonania oraz dodaje `lockRetained` i osobny alarm.
Zewnętrzny monitor musi obserwować także brak sygnału, bo wyłączony
koordynator nie wyśle własnego alarmu. Do sygnałów trafiają tylko zamknięte
kody etapów/błędów; prywatne wyniki i dowody zostają poza Git.

## Harmonogram i retencja

[Plan JSON](../../ops/observability/backup/schedule.example.json) opisuje
00:30 UTC, zakończenie do 03:30 UTC i alarm po 26 godzinach od ostatniego
pełnego sukcesu. [Czysta funkcja polityki sygnałów](../../scripts/ops/check-backup-signal.mjs)
rozróżnia błąd, brak historii, niedotrzymanie dziennego terminu, stary sukces
i problem dostarczenia. Nowy start nie odmładza ostatniej pełnej kopii.
Odbiorcą jest Igor; kanał, rzeczywiste dostarczenie i dyżur wymagają odbioru.
Nie wybrano ani nie uruchomiono nowego płatnego monitoringu.

Retencja nadal oznacza wspólne zestawy 7 dziennych / 4 tygodniowe /
12 miesięcznych, w tym osobny snapshot manifestu. Wynik zawiera również
`deletionPlanBlocked`: błąd historii chroni wcześniejsze dane i wymaga
przeglądu. Sukces nowej kopii nie zatwierdza usuwania lub rocznej retencji.
Nie zaimplementowano usuwania i nie uwierzytelniono historycznych zgłoszeń.

## Pozostałe elementy konkretnego uruchomienia

Gotowy kod nie oznacza gotowej konfiguracji operacyjnej. Prywatny program
uruchamiający musi dostarczyć klientów DB/S3, transporty zapisu i niezależnego
odczytu, inwentarz, faktyczne dowody spójności, pełny pakiet odzyskiwania
oraz sprawdzoną operację `resumeWrites` i kanał sygnałów. Produkcyjnego
callbacku wznowienia ani pipeline nie zainstalowano. Nie zastępować adapterów
funkcjami zwracającymi same `true`. Testowa fixture nie jest szablonem konfiguracji produkcji.

Do dalszej karty wykonania przyjęto następujący zakres, bez zgody na wykonanie:

- **Gdzie i co:** jeden wyznaczony koordynator Linux, trzy repo restic poza
  hostami źródłowymi w UE; pełne źródła db-1 oraz ops-1. Koordynator, klient
  niezależnego odczytu i prywatne ścieżki są jeszcze do przypięcia do
  zweryfikowanego inwentarza, przed instalacją.
- **Koszt:** publiczna strona [BX11](https://www.hetzner.com/storage/storage-box/bx11/?country=pl)
  odczytana 10.10 pokazuje 1 TB, FSN1/HEL1, 3,20 EUR/mies. bez VAT oraz
  0 EUR setup. To oferta publiczna, nie zamówienie ani cena konta Igora.
  Przy założeniu 23% VAT arytmetyczny koszt wynosi 3,936 EUR (~3,94 EUR).
  Faktycznego naliczenia VAT/kwoty końcowej konta nie potwierdzono.
  BX11 HEL1 pozostaje propozycją; warunkowe ~5 EUR nie jest zgodą zakupu.
- **Wpływ:** uzgodnione wstrzymanie wszystkich zapisów/usunięć na czas
  pozyskania i utrwalenia źródeł oraz zweryfikowanego wznowienia;
  dodatkowy odczyt dysków i transfer trwają później. Czas okna,
  wolne miejsce, tempo transferu oraz przyrost retencji nie zostały
  zmierzone przez uruchomienie kopii. Nie podawać wymyślonej długości przerwy.
- **Odbiór:** pierwsza rzeczywista pełna kopia, niezależny odczyt wszystkich
  artefaktów i manifestu, sprawdzona obsługa błędu oraz braku sygnału,
  dostęp do kluczy. Restore i staging pozostają osobnym zakresem;
  ten kod nie zalicza TEST-07 ani G03/G09.

Przed prośbą o wykonanie należy uzupełnić powyższe konkretne brakujące
parametry i dowody. Na tym etapie nie prosi się o ogólne „lecisz” ani
ponownie o już udzieloną zgodę na lokalne przygotowanie.

## Weryfikacja i odczyty tej kontynuacji

Nowe testy wykonują prawdziwe lokalne operacje na sztucznych plikach,
syntetyczne procesy Node i jawne sztuczne odpowiedzi DB/S3/restic. Obejmują
pełną sekwencję, każdy etap błędu, częściowy restic, nieznane referencje,
niepuste payloady, zmianę dumpa/payloadu oraz obu indeksów NDJSON po
sprawdzeniu, timeout wykryty po opóźnieniu timera, konkurencyjne runId,
przerwania, spóźniony strumień S3, prywatność błędów i odrębny manifest.
Testy są w istniejącym CI Linux/Node 22. Szczegółowe wyniki są w opisie PR
oraz datowanym indeksie dowodów; lokalnych pominięć Windows nie opisujemy
jako wykonanych kontroli Linux.

Ponowny odczyt SSH potwierdził dostęp do app-1, ops-1, db-1 z zapisanymi
zaufanymi kluczami hostów. Wykonano jedynie stały komunikat potwierdzenia,
bez treści bazy/S3, pomiaru wersji lub zmiany infrastruktury. Root nadal
ma pełne uprawnienia: tylko odczyt jest ograniczeniem zadania.
