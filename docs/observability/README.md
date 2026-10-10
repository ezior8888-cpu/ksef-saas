# FaktFlow — pakiet F0

Pomiar 04.10.2026 wykonano wyłącznie odczytowo w oknie 11:03–11:22 UTC.
**F0 pozostaje otwarte:** pełne kopie poza hostem i staging są niezaliczone,
a dowody runtime, kont i rzeczywistej reakcji na alarmy niepełne. Na podstawie
delegacji Igora z 07.10 przyjęto konkretne kontrakty, politykę danych i budżet
oraz wybrano cel kopii, staging i zakres narzędzi. Przyjęcie tych decyzji nie
dowodzi ich wykonania. Igor prowadzi monitoring i odbiera F0; Codex wykonuje
dostępne prace techniczne, ograniczając Bartosza do koniecznych czynności
operatorskich.

**Najnowsze uzupełnienie 10.10:** Igor potwierdził, że komputer znajduje się
w Polsce, oraz zadeklarował gotowość płacenia do 5 EUR miesięcznie, jeśli
przyniesie to istotną korzyść. To warunkowa deklaracja budżetowa; nie określa
VAT ani nie zatwierdza konkretnego zamówienia lub wznowienia zmian po
wcześniejszym „Tylko przygotowanie — bez zakupu i zmian”. Rekomendowanym
zastosowaniem jest odrębny cel pełnych kopii. Lokalny pakiet przygotowania
nie wykonuje backupów, a **G03/G09 nadal FAIL, F0_OPEN**.

**Najnowszy odczyt kont 10.10 — PostHog:** właściwa organizacja/projekt
EU Cloud, badge Free, wybrane quota i indywidualny dostęp Igora jako Admin
potwierdzono w UI; 2FA jest wyłączone. Zapis transkrypcji: 16:07:03.4311488 UTC,
bez instrumentowanego okna obserwacji. [Indeks UI](evidence/f0-posthog-ui-2026-10-10.json)
i [szczegóły](runtime-inventory.md#posthog--odczyt-panelu-10102026) oddzielają
liczniki rozliczeniowe i ustawienia replay od działania SDK oraz faktycznych
kosztów. PostHog został odczytany; odczyt właściwego panelu Sentry
pozostaje do wykonania.
**G07/G08 PARTIAL, F0_OPEN**; bez zmian kont, kopii, stagingu lub F1.

**Odczyty 10.10 po 15:20 UTC:** web i worker healthy na `face09c57f7de756546e58d092dbe6d280f93c91`;
Sentry/PostHog zwróciły metadane kont, lecz ten odczyt nie potwierdził planów
i kosztów. Ówczesna deklaracja braku dostępu Igora do paneli jest historyczna;
późniejszy odczyt PostHog opisano powyżej.
[Nowy indeks](evidence/f0-follow-up-2026-10-10.json) i
[szczegóły odczytów](runtime-inventory.md#uzupełnienie-odczytów-po-1520-utc--10102026)
zachowują historię wcześniejszych wyników. Błąd CodeQL lokalnego walidatora
kopii poprawiono; skan dla `6b1a972` przeszedł, bez wdrożenia tej sesji.

**Nowy pomiar 10.10, tylko odczyt:** od 14:23 UTC potwierdzono SSH do
trzech hostów i zgodność ich kluczy ED25519. Klucz daje pełne uprawnienia;
zakres tylko do odczytu jest ograniczeniem pracy, nie uprawnień technicznych.
O 14:26 UTC web i worker były healthy na
`43091e725d845084e11ac73af32750ace349bc02`, Node 22.23.3. Odczytano również
wydania obu MinIO oraz rozmiary baz i fizycznych katalogów danych MinIO.
To nowe [dowody runtime i rozmiarów](runtime-inventory.md#odczyt-runtime-i-rozmiarów--10102026)
z [osobnym indeksem](evidence/f0-runtime-size-2026-10-10.json), bez
nadpisywania wcześniejszych pomiarów. Kompletny listing S3 o 14:32 UTC:
MinIO aplikacji 31 obiektów / 378638 B; MinIO Supabase 0 obiektów / 0 B.
Oba buckety Unversioned. Wersje obejmują bieżące obiekty i nie są dodatkową
sumą. Nie pobierano treści; referencje DB, multipart uploads, przyrost
i pełna retencja pozostają niezweryfikowane. Odczyty nie są kopią.
**G03/G09 FAIL, F0_OPEN**;
bez zmian serwerów, migracji, wdrożeń, kopii, restore lub F1.

**Aktualny kierunek 10.10: darmowa diagnostyka i tańsza infrastruktura.**
Igor odrzucił wariant 73,19 EUR netto/mies.; zakupy i czynności operacyjne
pozostają wstrzymane. Wybór: Sentry Developer EU i PostHog Free EU z budżetem
nowych abonamentów tych narzędzi 0 USD. PostHog Free potwierdzono w UI;
plan Sentry pozostaje do odczytu.
Dashboard ma pomóc podczas pierwszego release: grupować błędy, pokazywać
wpływ na faktury, retry/recovery i regresje, zachowując pełną minimalną
historię we własnym audycie. Przyszły agent korzysta ze zredagowanych dowodów
i historii zweryfikowanych napraw, przygotowuje test, poprawkę oraz PR;
nie otrzymuje automatycznie prawa wdrożenia produkcji.

Staging: kandydat na posiadanym komputerze, w osobnej VM Linux, z danymi
syntetycznymi. Kopie: rekomendowany osobny BX11 HEL1/restic, około 3,20 EUR
netto/mies. według odczytu katalogu z 10.10; zakup niezatwierdzony. Wariant
bez nowego abonamentu ma potwierdzoną przez Igora lokalizację w Polsce;
wymaga jeszcze dowodów pojemności, dostępności i izolacji kopii od stagingu. Nie obniża G03/G09.
[Aktualne warunki](ownership.md#darmowa-diagnostyka-i-tańsza-infrastruktura--10102026)
i [nowy indeks decyzji](evidence/f0-low-cost-2026-10-10.json) mają pierwszeństwo
przed wcześniejszym płatnym wariantem. **F0_OPEN**; wykonanie dashboardu i
podłączenie agenta pozostają w osobnym F1 po odbiorze F0.

- [Inwentaryzacja i pochodzenie dowodów](runtime-inventory.md)
- [Kontrakty wyniku i korelacji](contracts.md)
- [Polityka danych](data-policy.md)
- [Bramki i plan odbioru](acceptance-plan.md)
- [Konkretna karta wykonania brakujących prac F0](acceptance-plan.md#karta-wykonania-brakujących-prac-f0--10102026)
- [Role i decyzje F0](ownership.md)
- [Bezpieczne podsumowanie pomiaru z 04.10](evidence/f0-2026-10-04.json)
- [Bezpieczny indeks odczytów z 06.10](evidence/f0-2026-10-06.json)
- [Bezpieczny indeks ustaleń z 07.10](evidence/f0-2026-10-07.json)
- [Aktualne wybory na podstawie delegacji Igora](ownership.md#wybory-na-podstawie-delegacji-igora--07102026)
- [Bezpieczny indeks wyborów i katalogu cen z 07.10](evidence/f0-decisions-2026-10-07.json)
- [Historyczny płatny wariant i odczyty z 10.10](evidence/f0-2026-10-10.json)
- [Aktualny wariant oszczędny i zakres agenta](evidence/f0-low-cost-2026-10-10.json)
- [Nowy odczyt runtime i rozmiarów z 10.10](evidence/f0-runtime-size-2026-10-10.json)
- [Lokalne przygotowanie kopii F0](../runbooks/f0-backup-preparation.md) / [przykłady](../../ops/observability/backup/)
- [Plan JSON bez wykonania](../../scripts/ops/prepare-backup-plan.mjs) / [kontrola kontraktu manifestu](../../scripts/ops/check-backup-set.mjs)
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
W odczycie z 06.10 runtime kontenerów nie został odczytany: SHA/health
i wersje Node/MinIO pozostawały nieznane. Uzupełnia je osobny pomiar 10.10
opisany wyżej. F0 i decyzje pozostają otwarte; nie wykonano zmian
serwerów ani ustawień dostawców i nie rozpoczęto F1.

Przegląd 07.10.2026: [kod i CI na `84b75ea`](runtime-inventory.md#przegląd-kodu-i-ci--07102026)
uzupełniają dowody istniejących ustawień prywatności i 11 zaliczonych kontroli
pakietu. Odczyt kodu nie jest pomiarem produkcji ani odbiorem G05/TEST-04.
[Pierwsza partia pytań do Bartosza](ownership.md#pierwsza-partia-pytań-do-bartosza--07102026)
dotyczy brakujących decyzji i dowodów bez wewnętrznych skrótów lub ponownego
żądania znanych danych. Odpowiedzi na tę partię zostały przekazane i zapisane
w [ustaleniach z 07.10](runtime-inventory.md#ustalenia-przekazane-07102026).

Organizacja przyjęta 07.10, nadal obowiązująca: **Igor — właściciel monitoringu i odbioru F0;
Codex — wykonanie dokumentacji, dostępne odczyty i ocena dowodów**. Nie kierujemy
domyślnie wszystkich pytań do Bartosza. Celowe KSeF TEST jest uzasadnione,
zakres kopii i termin staging uzgodnione, brak płatnych planów zadeklarowany,
a historyczny odbiorca alarmów i luka dyżuru zapisane. Po późniejszej
delegacji: **G04/G05/G06 PASS tylko dla przyjęcia decyzji**, G08 PARTIAL
(wybrana polityka, niezweryfikowany routing i gotowość), G01/G02/G07 PARTIAL,
**G03/G09 FAIL**. Historyczny wybór z 07.10 wyłączał Datadog, wybierając
Sentry EU Developer, PostHog EU Free, Uptime Kuma i planowany Healthchecks
Hobbyist. BX11 HEL1 + staging CPX32 DE miały odczytany koszt
planistyczny 39,19 EUR netto/mies., bez zamówienia. Kierunek narzędzi/staging
zastąpiła opisana wyżej aktualizacja 10.10; pomiar cen 07.10 pozostaje
historyczny. SSH Codexa jest opcją
zbierania dowodów, nie obowiązkową bramką.

Po pytaniu Igora o wariant darmowy oceniono historycznie
[wariant bez nowych abonamentów](ownership.md#wariant-bez-nowego-abonamentu--ocena-07102026):
kopie na posiadanym urządzeniu i lokalny izolowany staging. Igor zadeklarował
500 GB miejsca i codzienną dostępność; odczyt lokalny potwierdził zasoby
komputera, bez pomiaru produkcji lub wykonania kopii. Cena 39,19 EUR dotyczy
wcześniejszego wariantu zakupowego; zakup nie jest warunkiem samym w sobie.
Pojemność pełnej retencji i działający staging pozostają niezweryfikowane;
G03/G09 nadal FAIL. Wcześniejsze wiadomości z 10.10 przywróciły płatny
wariant chmurowy, następnie Igor odrzucił koszt 73,19 EUR. Obecny kierunek
darmowej diagnostyki i lokalnego stagingu opisano na początku dokumentu;
żaden z wyborów nie jest dowodem wykonania.

Na prośbę Igora prompt do drugiego chatu powstanie po rzeczywistym odbiorze
F0, z jego dowodami i konkretną wersją materiału. F1 nie rozpoczęto.
