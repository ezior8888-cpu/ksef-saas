# F0 — model miejsca i czasu wykonawcy

**PREPARATION_ONLY, F0_OPEN, G03/G09 FAIL.** Ten dokument opisuje właściwości
kodu i wyłącznie syntetyczne przykłady. Nie zawiera pomiarów infrastruktury,
wyboru konkretnych urządzeń ani zgody na wykonanie. Prywatne ustalenia
operatora nie są częścią repozytorium. Nie wykonano kopii, instalacji,
zakupu, freeze/resume, restore, migracji ani wdrożenia.

## Rozmiar zestawu i przestrzeń robocza

Niech `B` oznacza rzeczywistą sumę artefaktów jednego przebiegu: oba dumpy,
globals/TOC, oba eksporty obiektów, konfigurację odzyskiwania, ich metadane
oraz manifest. Rozmiar baz według `pg_database_size` ani fizyczne `du`
magazynu nie są pomiarem `B`. Kompresja dumpów oraz pełny pakiet recovery
mogą zmienić tę relację; nie przyjmować niezmierzonego współczynnika.

[Adapter restic](../../scripts/ops/backup-restic.mjs) po zapisie odczytuje
pliki snapshotu do nowych katalogów `readerRoot/read-*`. [Transport SSH](../../scripts/ops/backup-restic-reader-command.mjs)
przesyła stdout zdalnego restic do pliku **na koordynatorze**. Dlatego bieżący
przebieg wymaga około `2 × B` miejsca na artefakty, plus narzut i rezerwa.
Dysk zdalnego czytnika nie zastępuje przestrzeni koordynatora.

Przykładowa polityka planowania, wymagająca późniejszej walidacji:

`wolne miejsce przed startem ≥ 2,5 × B + rezerwa systemowa`

Dodatkowe `0,5 × B` jest marginesem projektowym, a nie zmierzonym maksimum.
Przy całkowicie syntetycznej rezerwie **8 GiB** zestaw **2 GiB** wymaga
**13 GiB** wolnego miejsca; zestaw **5 GiB** wymaga **20,5 GiB**.
Są to przykłady arytmetyczne, nie limity wdrożone w preflight ani przydział
zasobów. Pozostają osobne kontrole RAM, inodów, systemu plików, miejsca
tymczasowego, liczby obiektów i współdzielonego obciążenia.

Nie ma automatycznego usuwania starych lub częściowych katalogów run/read.
Ich zajętość już pomniejsza odczyt aktualnie wolnego miejsca; nie dodawać
jej ponownie do tego samego `df`. Kolejne przebiegi kumulują pliki.
Czytnik potrzebuje własnego RAM/tmp i narzędzi: `--no-cache` nie dowodzi
zerowego użycia dysku ani stałego małego zużycia pamięci.

## Retencja nie jest jeszcze ograniczeniem zajętości

[Planner retencji](../../scripts/ops/plan-backup-retention.mjs) przygotowuje
podgląd 7 dziennych / 4 tygodniowych / 12 miesięcznych zestawów. Kod nie
wykonuje `forget`/`prune`. Błędy historii blokują usuwanie, remisy oraz
nieznane i częściowe dane mogą zwiększać liczbę zachowanych zestawów.

Budżet repozytorium to suma wszystkich faktycznie zachowanych danych,
metadanych i częściowych zapisów plus rezerwa. Nie zakładać oszczędności
kompresji ani deduplikacji bez pomiaru. Dla stałego syntetycznego zestawu
**2 GiB** i dodatkowego narzutu **20%**:

- **23 różne zestawy:** 55,2 GiB — wyłącznie ilustracja po skutecznym,
  osobno zatwierdzonym usuwaniu; nie twardy limit retencji.
- **365 zestawów bez usuwania:** 876 GiB — ilustracja bez wzrostu danych,
  nie prognoza. Na hipotetycznym dysku 1 TB liczonym dziesiętnie jest około
  931,32 GiB, a próg 80% to około 745,06 GiB; ten scenariusz go przekracza.

Przyrost logiczny źródeł nie jest miarą zmienionych bloków repozytorium.
Dwie próbki nie wystarczą do prognozy rocznej lub obietnicy skutecznej deduplikacji.

## Cztery pełne kontrole repozytoriów

[Wykonawca](../../scripts/ops/run-backup-sequence.mjs) działa kolejno:
zapis i odczyt DB, aplikacji, Supabase, następnie osobnego manifestu w repo DB.
Każdy odczyt [adaptera restic](../../scripts/ops/backup-restic.mjs) uruchamia
`check --read-data` całego repozytorium, a potem `dump` każdego pliku snapshotu.
Są więc **cztery pełne kontrole**, w tym **dwie kontrole repo DB**. Mały
manifest nie oznacza małego ponownego checku. Oficjalna [dokumentacja restic](https://restic.readthedocs.io/en/stable/045_working_with_repos.html#checking-integrity-and-consistency)
potwierdza, że `--read-data` pobiera wszystkie pliki pack repozytorium.

Każdy plik ma osobny proces SSH/restic i ponowny lokalny hash. Eksporty,
repozytoria i odczyty plików są obsługiwane kolejno; restic może stosować
własną wewnętrzną współbieżność. [Inspekcja dumpów](../../scripts/ops/prepare-backup-plan.mjs)
przekazuje je do zdalnego `pg_restore --list`, co także kosztuje czas
transferu. Wymagana ilość odczytu na tym etapie nie jest z góry równa
rozmiarowi całego archiwum.

## Wzór okna i przykłady syntetyczne

`T_okna = T_drenaż + T_sekwencja + T_ocena_zakończenia_i_wznowienie`

Przybliżenie części transferowej, z rozmiarami w MiB, szybkościami w MiB/s
oraz wynikiem w minutach:

`T ≈ T_fixed + [B/u + (R_DB_przed + R_app + R_supabase + R_DB_po)/c + B/p] / 60`

`u` oznacza upload, `c` odczyt kontroli repo, a `p` przepustowość potoku
repo → czytnik → koordynator, ograniczoną najwolniejszym odcinkiem,
dyskiem lub hashowaniem. Odcinki potoku nie są naiwnie dodawane jako dwa
kolejne pełne transfery. `T_fixed` obejmuje pozostałe prace: drenaż,
pozyskanie źródeł, dump/eksport, inspekcje, hashe, metadane, starty procesów,
sygnalizację i wznowienie. Musi zostać zmierzone, nie zadeklarowane jako dowód.

Poniższe **syntetyczne** rachunki zakładają bieżący zestaw 2 GiB, dominujące
repo DB, pomijalną historię pozostałych repo, `T_fixed = 20 min` i tę samą
szybkość wszystkich trzech etapów. To model wrażliwości, nie prognoza
sukcesu ani długości przerwy:

- Repo DB **2 GiB**, szybkość **5 MiB/s**: około **47,31 min** całości;
  pierwszy odczyt DB około **13,65 min** przed dodatkowym narzutem.
- Repo DB **2 GiB**, szybkość **2 MiB/s**: około **88,27 min**;
  pierwszy odczyt DB około **34,13 min**, przekraczający limit kroku.
- Repo DB **8 GiB**, szybkość **5 MiB/s**: również około **88,27 min**;
  pierwszy odczyt DB około **34,13 min**, także ponad limit kroku.
- Repo DB **46 GiB**, szybkość **5 MiB/s**: około **347,68 min**;
  pierwszy odczyt DB około **163,84 min**. Scenariusz przekracza oba limity.

Domyślny limit kroku `read` wynosi **30 min na check i wszystkie pliki
łącznie**, a maksymalny czas sekwencji **3 h**. Rachunek powyżej limitu
opisuje przebieg, który w obecnym kodzie zostanie przerwany, a nie kopię
kończącą się później. Zwiększenie timeoutu nie rozwiązuje kosztu historii.
Wynik poniżej limitu też nie dowodzi powodzenia: nie uwzględnia wszystkich
niezmierzonych narzutów i zmian obciążenia.

Zgodnie z [procedurą spójności](f0-backup-consistency-window.md) podstawowe
okno obejmuje **całą sekwencję**, wraz z uploadem i pełnymi kontrolami repo.
`closeSourceClients` zamyka sesje źródeł; nie jest granicą bezpiecznego resume.
Limit sekwencji nie ogranicza zewnętrznego drenażu ani wznowienia. Timeout
nie dowodzi zatrzymania procesów zdalnych i może wymagać zachowania locka.

## Co trzeba przygotować przed wykonaniem

- Ustalić rzeczywiste `B`, recovery, rozmiary repo, RAM/tmp i inody oraz
  trwałą przepustowość wszystkich tras. Krótki transfer z pamięci nie
  mierzy dysków, dumpa, repozytorium ani pracy nocnej.
- Zweryfikować oddzielną tożsamość i dostęp do czytnika. Obecny
  [adapter SSH](../../scripts/ops/backup-restic-reader-command.mjs) wymaga
  portu 22; inny port lub tunel wymaga osobnego przygotowania i testów.
- Przygotować kontrolowane sprzątanie lokalnych artefaktów i skuteczną
  retencję, zachowując dowody oraz niepełne przebiegi do rozstrzygnięcia.
- Rozdzielić koszt kontroli bieżącej kopii od pełnego przeglądu historii
  oraz przygotować sprawdzoną granicę wznowienia zapisów po utrwaleniu
  źródeł. To następna zmiana kodu/procedury, nie istniejąca funkcja.
- Dopiero na zweryfikowanych warunkach przygotować kartę pierwszego
  kontrolowanego przebiegu i osobno ustalić maksymalną dopuszczalną przerwę.

Żaden scenariusz nie zastępuje dowodu działającej kopii, odtworzenia,
spójnego okna ani odbioru F0. [Prywatne podłączenie](f0-backup-private-wiring.md)
pozostaje przygotowaniem.