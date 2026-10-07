# FaktFlow — pakiet F0

Pomiar 04.10.2026 wykonano wyłącznie odczytowo w oknie 11:03–11:22 UTC.
**F0 pozostaje otwarte:** pełne kopie poza hostem i staging są niezaliczone,
a dowody runtime, kont i rzeczywistej reakcji na alarmy niepełne. Na podstawie
delegacji Igora z 07.10 przyjęto konkretne kontrakty, politykę danych i budżet
oraz wybrano cel kopii, staging i zakres narzędzi. Przyjęcie tych decyzji nie
dowodzi ich wykonania. Igor prowadzi monitoring i odbiera F0; Codex wykonuje
dostępne prace techniczne, ograniczając Bartosza do koniecznych czynności
operatorskich.

- [Inwentaryzacja i pochodzenie dowodów](runtime-inventory.md)
- [Kontrakty wyniku i korelacji](contracts.md)
- [Polityka danych](data-policy.md)
- [Bramki i plan odbioru](acceptance-plan.md)
- [Role i decyzje F0](ownership.md)
- [Bezpieczne podsumowanie pomiaru z 04.10](evidence/f0-2026-10-04.json)
- [Bezpieczny indeks odczytów z 06.10](evidence/f0-2026-10-06.json)
- [Bezpieczny indeks ustaleń z 07.10](evidence/f0-2026-10-07.json)
- [Aktualne wybory na podstawie delegacji Igora](ownership.md#wybory-na-podstawie-delegacji-igora--07102026)
- [Bezpieczny indeks wyborów i katalogu cen z 07.10](evidence/f0-decisions-2026-10-07.json)
- [Kolektor tylko do odczytu](../../scripts/ops/collect-runtime-inventory.mjs)
- [Przykład staging](../../ops/observability/environments/staging.example.yaml) / [production](../../ops/observability/environments/production.example.yaml)

Publiczny pakiet zawiera bezpieczne podsumowania, przyjęte decyzje i jawne
ograniczenia. Pełny raport operatora, sekcja `raw`, identyfikatory i szczegóły
infrastruktury pozostają prywatne poza gitem. Kolektor nie został użyty do
pomiaru z 04.10; operator wykonał go własnymi skryptami. Próba kolektora z
06.10 nie potwierdziła runtime. Odczyt katalogu cen z 07.10 nie odczytuje
kontenerów i nie jest dowodem zakupów lub wykonania kopii.

Dokumenty nie zmieniają aplikacji, serwerów ani ustawień usług. Publikacja gałęzi/PR nie oznacza zaliczenia F0, zgody na wdrożenie ani rozpoczęcia F1.

Kontynuacja 04.10.2026 zaczyna się od [aktualnych decyzji i karty odpowiedzi](ownership.md#aktualne-decyzje--przegląd-kontynuacji-04102026)
oraz [brakujących dowodów per bramka](acceptance-plan.md#brakujące-dowody-do-odbioru).
Przegląd repo i dyskusji PR nie dostarczył nowych zatwierdzeń Bartosza ani
nowego pomiaru infrastruktury. F0-D01…D10 i propozycje C22-D1…D7 są osobnymi
rejestrami; różnice proponowanych SLI wymagają uzgodnienia przed przyjęciem G04.

Aktualizacja 06.10.2026: [deklaracje przekazane przez Igora](runtime-inventory.md#deklaracje-przekazane-06102026)
podtrzymują **G03 FAIL** (brak staging) i **G09 FAIL** (brak pełnego dumpa DB
off-host i kopii MinIO). Osobno wykonano [odczyty API dostawców i próbę SSH](runtime-inventory.md#odczyty-dostawców-i-próba-ssh-06102026).
API potwierdza trzy działające maszyny w DE, przypisane reguły zapory,
siedem dostępnych obrazów backupu dysku DB oraz część metadanych Sentry/PostHog
w EU. Obrazy dysku nie dowodzą spełnienia zakresu G09 ani restore; ustawienia
replay nie dowodzą faktycznego nagrywania przez SDK. G02/G07 mają częściowe
dowody; plany, koszty i pozostałe uprawnienia nadal są niezweryfikowane.
Runtime kontenerów nie został odczytany: aktualny SHA/health i wersje Node/MinIO
pozostają nieznane. F0 i decyzje pozostają otwarte; nie wykonano zmian
serwerów ani ustawień dostawców i nie rozpoczęto F1.

Przegląd 07.10.2026: [kod i CI na `84b75ea`](runtime-inventory.md#przegląd-kodu-i-ci--07102026)
uzupełniają dowody istniejących ustawień prywatności i 11 zaliczonych kontroli
pakietu. Odczyt kodu nie jest pomiarem produkcji ani odbiorem G05/TEST-04.
[Pierwsza partia pytań do Bartosza](ownership.md#pierwsza-partia-pytań-do-bartosza--07102026)
dotyczy brakujących decyzji i dowodów bez wewnętrznych skrótów lub ponownego
żądania znanych danych. Odpowiedzi na tę partię zostały przekazane i zapisane
w [ustaleniach z 07.10](runtime-inventory.md#ustalenia-przekazane-07102026).

Aktualna organizacja pracy: **Igor — właściciel monitoringu i odbioru F0;
Codex — wykonanie dokumentacji, dostępne odczyty i ocena dowodów**. Nie kierujemy
domyślnie wszystkich pytań do Bartosza. Celowe KSeF TEST jest uzasadnione,
zakres kopii i termin staging uzgodnione, brak płatnych planów zadeklarowany,
a historyczny odbiorca alarmów i luka dyżuru zapisane. Po późniejszej
delegacji: **G04/G05/G06 PASS tylko dla przyjęcia decyzji**, G08 PARTIAL
(wybrana polityka, niezweryfikowany routing i gotowość), G01/G02/G07 PARTIAL,
**G03/G09 FAIL**. Datadog jawnie wyłączono z obecnego zakresu, wybierając
Sentry EU Developer, PostHog EU Free, Uptime Kuma i planowany Healthchecks
Hobbyist. Nowe kopie BX11 HEL1 + staging CPX32 DE mają odczytany koszt
planistyczny 39,19 EUR netto/mies., bez zamówienia. SSH Codexa jest opcją
zbierania dowodów, nie obowiązkową bramką.

Na prośbę Igora prompt do drugiego chatu powstanie po rzeczywistym odbiorze
F0, z jego dowodami i konkretną wersją materiału. F1 nie rozpoczęto.
