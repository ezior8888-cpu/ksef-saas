# F0 — plan izolowanego restore pełnego zestawu

**PRZYGOTOWANY / NIE WYKONANY. PREPARATION_ONLY, F0_OPEN, G03/G09 FAIL,
TEST-07 NOT RUN.** To plan późniejszej, osobno upoważnionej operacji.
Nie zawiera poleceń wykonania restore i nie upoważnia do tworzenia środowiska,
pobierania kopii, odszyfrowania danych, migracji, uruchamiania usług ani
wysyłania wiadomości. Nie dowodzi istnienia pełnej kopii lub dostępnych kluczy.

Plan odpowiada zakresowi [wykonawcy kopii](f0-backup-executor.md) i
[bramce G09](../observability/acceptance-plan.md#granica-odbioru-f0-i-późniejszych-testów).
Historyczny [backup-restore](backup-restore.md) nie jest procedurą pełnego
zestawu: wcześniejszy wynik jednej bazy i lista dopuszczanych tam błędów nie
przechodzą automatycznie do nowego odbioru.

## Karta przed osobną zgodą na wykonanie

Karta prywatna musi wskazywać operatora, reviewera, zakres upoważnienia,
czas oraz limit operacji, wersję narzędzi, konkretny zestaw i izolowany cel.
Nie wpisywać do repo adresów, identyfikatorów zasobów, kluczy, materiałów
klientów, pomiarów ani hashy prywatnych dowodów.

Wymagane wejścia:

- Zaufany manifest i koperta dostarczenia tego samego `runId`; pełne
  identyfikatory trzech snapshotów źródeł oraz czwartego snapshotu manifestu,
  ich repozytoria i prywatne dowody niezależnego odczytu. Aktualna sekwencja
  tworzy v2: `sourceBoundary.seal` i `sourceBoundary.resume` muszą odpowiadać
  przebiegowi, oknu i rewizji. Historyczny v1 nie dowodzi tej granicy;
  jego użycie wymaga osobnego rozstrzygnięcia zakresu, bez dopisywania
  nieistniejącego potwierdzenia wznowienia.
- Osobne pełne dumpy `postgres` i `_supabase`, spisy archiwów, globals
  obejmujące role i tablespaces, inwentarz i wersje źródeł.
- Eksport obu magazynów: każdy plik, jego długość i SHA-256, mapowanie
  obiektów, metadane, konfiguracja bucketów oraz referencje obu baz.
  Pusty magazyn nadal wymaga dowodu pełnego zakresu i konfiguracji.
- Zaszyfrowany pakiet recovery: obrazy/rozszerzenia, konfiguracja aplikacji
  i workera, auth/JWT/storage, klucze szyfrowania aplikacji, pgsodium lub
  potwierdzenie jego nieużywania, IAM/KMS obu magazynów. Potrzebne są zarówno
  ustawienia pierwotne, jak i tymczasowe z okna kopii; nie odtwarzać ustawień
  blokady jako domyślnego stanu po awarii.
- Escrow dostępne z niezależnej, upoważnionej tożsamości, bez zależności od
  utraconego źródła i bez jedynej kopii klucza wewnątrz zaszyfrowanego repo.
  Ścieżka pliku hasła ani poprawny format JSON nie dowodzą możliwości odczytu.
- Plan izolacji, pojemności i dostępu celu oraz aktualny rejestr TTL,
  holdów i wykonanych żądań usunięcia. Rejestr może zawierać zmiany późniejsze
  niż odtwarzana kopia; sama stara kopia go nie zastępuje.

**STOP:** brak któregokolwiek źródła, niezgodny przebieg, nieznana tożsamość
repo/snapshotu, niepełny lub zmieniony plik, niedostępne escrow, brak klucza
recovery, nieustalone mapowanie storage, niepotwierdzona izolacja lub miejsce.
`check-backup-set` ocenia spójność zgłoszeń, nie uwierzytelnia ich pochodzenia.
Istnienie pliku albo dawny wynik PASS nie znosi warunku STOP.

## Izolowany cel i granica danych

Cel testowego restore pozostaje oddzielony od produkcji oraz zwykłego
stagingu z danymi syntetycznymi. Odtworzenie prywatnej kopii nie upoważnia do
przekazania jej jako danych stagingu ani do podłączenia agentowi AI.

Przed dostępem do danych trzeba wykazać:

- Brak tras, współdzielonych wolumenów i poświadczeń pozwalających zapisać
  do produkcyjnych DB, kolejek, storage lub repozytoriów kopii. Repozytoria
  źródłowe nie są celami odtwarzania; test nie może ich naprawiać ani usuwać.
- Blokadę efektów wychodzących: KSeF, płatności, poczta, webhooki, OAuth,
  telemetria i inne wywołania usług. Nazwa środowiska i `KSEF_ENV=test` same
  nie stanowią izolacji. Do późniejszych kontrolowanych prób służą wyłącznie
  zatwierdzone stuby lub odbiorniki testowe.
- Oddzielne katalogi, sieć i uprawnienia operatora; prywatne dane oraz
  odszyfrowane pliki objęte ograniczonym dostępem, terminem przechowania i
  planem rozliczenia. Utrata izolacji zatrzymuje test.
- Worker, schedulery, webhooks i mechanizmy lifecycle pozostają nieaktywne,
  zanim operator oceni stan odtworzonych operacji. Uruchomienie usług może
  pisać również bez zewnętrznego ruchu.
- Wersje DB/rozszerzeń i formaty magazynów odpowiadają wymaganiom odczytanej
  kopii. Nie uruchamiać aplikacji, która przy starcie wykona nieuzgodnioną
  migrację lub bootstrap.

Konkretny dostawca izolacji, sieć, zasoby, dostęp i narzędzia mają zostać
wskazane w karcie przed wykonaniem. Ten dokument niczego nie tworzy.

## Kolejność przyszłego wykonania i dowody

Każdy etap wymaga osobnego wyniku: `NOT_RUN`, `PASS` dla ustalonego zakresu,
`FAIL` albo `BLOCKED` wraz z przyczyną. Nie przenosić PASS kontroli pliku
na powodzenie całego restore.

1. **Potwierdzić kartę i izolację.** Operator sprawdza upoważnienie, cel,
   stan istniejących danych i odcięcie efektów zewnętrznych. Dowód obejmuje
   efektywną konfigurację i kontrolę izolacji, nie tylko deklarację planu.
   Cel zawierający inne dane lub niejasne uprawnienia oznacza STOP.
2. **Odczytać wszystkie cztery snapshoty.** Potwierdzić repozytoria,
   snapshoty, manifest i komplet plików z niezależnego klienta. Zabezpieczyć
   kopertę dostarczenia, seal i receipt oraz zweryfikować bajty i hashe.
   Pełny check repo nie zastępuje porównania wszystkich plików zestawu.
   Błąd jednego snapshotu zatrzymuje próbę całego zestawu.
3. **Sprawdzić recovery i zależności.** Zweryfikować dostęp do escrow oraz
   zgodność ustawień, kluczy, wersji i rozszerzeń. Oddzielić odtworzenie
   sekretów potrzebnych do odczytu danych od zezwolenia na wywołania
   produkcyjnych usług. Brak materiału nie jest zgodą na wygenerowanie
   zamiennika i ogłoszenie pełnej odzyskiwalności.
4. **Przygotować role i obie bazy według zatwierdzonego planu.** Rozliczyć
   każdą rolę, właściciela, rozszerzenie i tablespace oraz oba archiwa.
   Plan musi uwzględniać obiekty już obecne w wybranym obrazie celu.
   Nie przyjmować stałej liczby „oczekiwanych błędów” ze starej próby:
   każdy konflikt wymaga wskazanego obiektu, uzasadnienia i oceny skutku.
   Brak schematu, ACL, właściciela lub danych oznacza brak kompletności.
5. **Odtworzyć oba magazyny i mapowania.** Zachować pełny zakres obiektów,
   treści, metadanych i ustawień. Rozliczyć IAM/KMS oraz mapowanie rekordów
   storage na fizyczne obiekty. Konfiguracja lifecycle/replikacji pozostaje
   pod kontrolą izolacji; nie uruchamiać jej na produkcyjnych endpointach.
   Same liczby obiektów nie wystarczają — potrzebna zgodność bajtów/hashów
   oraz referencji. Nierozstrzygnięte archiwum lub backend blokuje wynik.
6. **Sprawdzić auth, RLS i dostęp.** Dowody obejmują role/granty, RLS oraz
   zgodność konfiguracji auth/JWT/storage z odtworzonym zakresem.
   Późniejsza kontrolowana próba używa bezpiecznych kont testowych;
   tenant A i anon nie uzyskują dostępu do danych B. Weryfikować także
   niedozwolone operacje, nie tylko odczyt administratora.
7. **Uzgodnić referencje i kompletność.** Porównać zakres tabel, referencje
   dokumentów, obiekty i hashe z tą samą kopią. Użyć punktu odniesienia
   zamkniętego zestawu; zmieniająca się obecna produkcja nie jest
   bezwarunkowym wzorcem liczności. Sprawdzić także puste źródła i wyraźnie
   zapisać niezweryfikowane elementy. Sam `pg_restore --list` nie wykonuje
   tego odbioru.
8. **Rozstrzygnąć kolejki i efekty w toku.** Przed uruchomieniem jakiegokolwiek
   workera sklasyfikować zadania, claimy, retry, outbox i otwarte
   reconciliation. Nie usuwać ich zbiorczo ani nie odtwarzać skutku przez
   automatyczny replay. Zewnętrzny efekt mógł zajść po punkcie kopii.
   KSeF, płatności i wysyłki wymagają uzgodnienia z autorytatywnym źródłem
   w osobno dozwolonym zakresie; w izolowanym teście pozostają zablokowane.
   Dowód obejmuje zachowanie stanu i brak podwójnych efektów, nie wykonanie
   wszystkich oczekujących jobów.
9. **Ponownie zastosować zasady danych.** Przed udostępnieniem odtworzonych
   danych sprawdzić bieżące ACL, TTL, holdy oraz rejestr zrealizowanych żądań
   usunięcia. Nie przywracać dostępu do danych tylko dlatego, że istnieją
   w starej kopii. Nie wygaszać automatycznie otwartej sprawy lub holda.
   Brak aktualnego rejestru utrzymuje blokadę udostępnienia.
10. **Rozliczyć test.** Oddzielnie zapisać integralność kopii, możliwość
    odzyskania konfiguracji, działanie izolacji, referencje, uprawnienia,
    stan operacji oraz zmierzony czas etapów. Nie deklarować RTO na podstawie
    samego importu DB. Uporządkowanie celu i odszyfrowanych artefaktów wymaga
    wskazanego właściciela, zakresu i potwierdzenia; przy błędzie zachować
    potrzebne dowody prywatnie. Test nie uruchamia cutover ani ruchu produkcji.

## Stan po błędzie i zakończenie

Przy błędzie pozostawić izolację i kwarantannę. Operator rozstrzyga żywotność
procesów oraz stan częściowych danych; timeout lokalnego klienta nie dowodzi
zakończenia operacji zdalnej. Nie włączać usług, nie ponawiać niepewnego skutku
i nie usuwać materiału tylko po to, aby kolejna próba wystartowała.

Nowa próba wymaga nowego identyfikatora i rozliczonego celu. Zachować źródłowe
snapshoty i dostęp do escrow. Nie ma bezwarunkowej gwarancji rollbacku,
automatycznego cleanup ani uznania częściowego restore za pełny wynik.

Prywatny protokół wskazuje `runId` kopii, identyfikator próby, operatora,
reviewera, UTC, wersje, warunki izolacji, wynik każdego etapu, ograniczenia,
materiały dowodowe i stan końcowy danych/procesów. Publicznie można opisać
metodykę i uzgodniony status; ten plan nie zatwierdza publikacji prywatnych
dowodów lub ich pochodnych.

G09 wymaga rzeczywistej pełnej kopii oraz przygotowanej procedury restore.
Wykonanie TEST-07 pozostaje osobnym zakresem; ewentualny wymóg jego wyniku
przed odbiorem F0 zapisuje Igor. Przygotowanie tego dokumentu nie zmienia
`F0_OPEN`, `G03/G09 FAIL` ani `TEST-07 NOT RUN`. Pozostałe karty przygotowania
są w [przekazaniu F0](../observability/f0-preparation-handoff.md).
