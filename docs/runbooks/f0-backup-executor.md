# F0 — wykonawca pełnej sekwencji, przygotowanie 10.10.2026

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
jawnego pola autoryzacji; pole nie zastępuje zgody człowieka.

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
5. Dowód utrzymania tego samego okna przez cały eksport. Przed uploadem
   wcześniejsze hashe dumpów, dowodów, indeksów i sprawdzonych payloadów muszą pasować
   do konkretnych plików. Podmieniony plik blokuje przebieg.
6. Trzy osobne snapshoty restic; kod 3 jest błędem. Niezależny transport
   czytający sprawdza ID repo, snapshot, tagi, dane repo i każdy plik przez
   `restic dump`, porównując faktyczne SHA-256 i liczbę bajtów.
7. Końcowy manifest jako osobny, czwarty snapshot; jego niezależny odczyt,
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

## Błędy, limity i ponowienia

Domyślny limit całej sekwencji wynosi 3 godziny, kroku 30 minut. Kontrola
lokalnych plików działa w osobnym workerze, aby synchroniczne hashowanie
nie blokowało licznika czasu koordynatora. Eksporter S3 przyjmuje przerwanie
również podczas żądania, strumienia i przed publikacją podsumowania.
Procesy mają limity wyjścia, TERM/KILL i oczekiwanie zamknięcia; produkcyjny
runner jest przeznaczony na Linux. Wyniki Windows nie potwierdzają POSIX
ACL, symlinków ani obsługi grup procesów Linux.

Niepełny przebieg zachowuje pliki częściowe i poprzednie kopie. Ponowienie
wymaga nowego runId i nowego katalogu. Brak automatycznego usuwania częściowych
wyników, snapshotów, blokad albo napraw repozytorium. Zwykły zakończony błąd
zwalnia własną blokadę; przerwanie, timeout albo niepewny proces zdalny ją
zachowują. Zamknięcie lokalnego SSH nie dowodzi zatrzymania `pg_dump` na
serwerze. Operator musi najpierw potwierdzić brak procesu lokalnego/zdalnego,
obejrzeć częściowe artefakty i dopiero osobno dopuścić kolejny przebieg.

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
oraz kanał sygnałów. Nie zastępować tych adapterów funkcjami zwracającymi
same `true`. Testowa fixture nie jest szablonem konfiguracji produkcji.

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
  pozyskania źródeł, dodatkowy odczyt dysków i transfer. Czas okna,
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
