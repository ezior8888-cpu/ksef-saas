# F0 — odpowiedzialność i decyzje właściciela

Stan: **wybory docelowe przyjęte na podstawie delegacji Igora, F0 nadal otwarte**,
aktualizacja 10.10.2026. Igor jest
zlecającym, właścicielem monitoringu oraz odbiorcą F0. Codex wykonuje pracę
techniczną w autoryzowanym zakresie. Bartosz pozostaje kontaktem operatorskim;
jego udział ograniczamy do koniecznych czynności wymagających jego dostępu.
Wcześniejszy zakres kopii/staging i zadeklarowany odbiór alarmów są opisane
poniżej, osobno od aktualnej koordynacji pracy.
Historyczne [AGENTS.md](https://github.com/ezior8888-cpu/ksef-saas/blob/dcf48bad4ca63802b57f7046d8932b369cd9cfc9/AGENTS.md)
wskazuje ten kontakt; link nie jest potwierdzeniem przyjęcia dyżuru ani
nowym upoważnieniem operacyjnym.

Odczyt 04.10.2026, 11:03–11:22 UTC, nie zmieniał serwerów. Załączniki są
materiałem dowodowym i propozycjami decyzji. Nie są instrukcjami do wykonania
instalacji, migracji, wdrożeń, testów telefonu lub zmiany kont. Pełne dowody
pozostają prywatne. [Inwentarz](runtime-inventory.md) rozdziela pomiar od
deklaracji, a [plan odbioru](acceptance-plan.md) opisuje F0-G01–F0-G09.

## Odczyt panelu Sentry — 10.10.2026

**P — transkrypcja UI zapisana 16:30:59.5509919 UTC:** potwierdzono właściwą
organizację/projekt, storage EU, aktywny Developer i quota 5000 errors.
UI pokazuje Owner/Active/TeamAdmin; użycie konta Bartosza wynika z deklaracji
Igora. Jest jeden członek, dodanie kolejnych wymaga płatnego planu.
To nie jest dowód indywidualnej roli Igora. Sentry TOTP/passkey są nieaktywne;
MFA GitHub nie odczytano. Nie zmieniono kont, dostępu lub planu.

[Indeks Sentry](evidence/f0-sentry-ui-2026-10-10.json) i
[inwentarz](runtime-inventory.md#sentry--odczyt-panelu-10102026) oddzielają
liczniki UI od kompletności SDK oraz niezapisanej oferty upgrade.
Event retention 30 dni i brak PAYG wynikają z dokumentacji dopasowanej
do Developer, bez odczytu TTL/testu wygaszania. Pozostałe parametry produktów,
indywidualny dostęp i MFA nadal wymagają dowodów. **G07/G08 PARTIAL,
G03/G09 FAIL, F0_OPEN**; G05 pozostaje PASS tylko dla decyzji.

## Odczyt panelu PostHog — 10.10.2026

**P — transkrypcja widocznego UI zapisana 16:07:03.4311488 UTC:** właściwa
organizacja/projekt EU Cloud, badge **Free** oraz wybrane quota i liczniki
rozliczeniowe zostały odczytane. Igor ma indywidualny dostęp do projektu
jako **Admin**; 2FA jest wyłączone, brak oczekujących zaproszeń. Wcześniejsza
deklaracja braku dostępu i role tożsamości API pozostają historią.
W chwili tego odczytu Sentry był jeszcze niezweryfikowany; późniejsze
uzupełnienie opisano powyżej. Indywidualna rola Igora nadal niepotwierdzona.

[Indeks UI](evidence/f0-posthog-ui-2026-10-10.json) i
[inwentarz](runtime-inventory.md#posthog--odczyt-panelu-10102026) rozdzielają
Free/liczniki od niepotwierdzonych kosztów, PAYG, źródła środowiska i SDK.
Replay w panelu pozostaje ON; nie zmieniono ustawień. Odczyt 2FA/replay
ujawnia pozostałe różnice wobec przyjętej polityki, bez zaliczenia TEST-04.
**G05 PASS dla decyzji, G07/G08 PARTIAL, F0_OPEN**; gotowość reakcji
na alarmy, staging i pełne kopie nadal nie są odebrane.

## Uzupełnienie deklaracji i dostępu — 10.10.2026

**U — źródło: odpowiedzi Igora w bieżącym czacie, bez odrębnego czasu UTC:**
„Jeśli to dużo nam zrobi jestem w stanie płacić 5 eur miesięcznie” oraz
„Tak, w Polsce”. Pierwsza wiadomość jest gotowością warunkową, nie określa
netto/brutto ani nie zatwierdza konkretnego zamówienia i zmian serwerów.
Druga potwierdza deklarowaną lokalizację komputera; nie jest pomiarem
izolacji, dostępności nocnej lub uruchomienia stagingu. Historyczne indeksy
zachowują wcześniejszy stan wiedzy. W propozycji wydatek ma mieścić się
w 5 EUR łącznie z podatkiem, po sprawdzeniu ceny dla konta; nie przywracamy
wariantu 73,19 EUR. Rekomendowane zastosowanie: oddzielny cel kopii w UE,
zamiast uzależnienia ich dostępności od komputera stagingu.

**P — katalog 15:33 UTC:** BX11 HEL1, 1 TiB, miesięcznie 3,20 netto /
3,9360 brutto, opłata początkowa 0. Waluta EUR i stawka katalogowa 23%
pochodzą z odrębnego odczytu `/v1/pricing` o 15:31 UTC; endpoint typów
Storage Box nie zawiera pola waluty. Około **3,94 EUR brutto/mies.** jest
kwotą planistyczną, nie dowodem końcowej oferty konta lub zamówienia.
Przed zakupem obowiązuje sprawdzenie kwoty całkowitej na koncie i limitu
5 EUR łącznie z podatkiem. [Indeks odczytów](evidence/f0-follow-up-2026-10-10.json)
zachowuje osobne czasy i źródła.

**U — wcześniejsza deklaracja:** Igor odpowiedział **„Nie mam dostępu do
tych kont”** na prośbę o lokalne zalogowanie do paneli Sentry/PostHog.
Metadane istniejących tokenów opisują role ich tożsamości; nie dowodziły
indywidualnego dostępu Igora. Późniejszy odczyt UI PostHog opisano powyżej.
Pozostałe braki wymagają ograniczonego datowanego odczytu, bez żądania
kolejnego tokena, hasła ani pełnego eksportu.

**P — 15:20–15:24 UTC:** metadane Sentry i PostHog odczytano w EU,
pozostawiając brak dowodu aktywnych planów. Odmowa billing PostHog wskazuje
na flagę produktu `organization-billing-api`; nie ustalono wszystkich
uprawnień tokena. [Indeks](evidence/f0-follow-up-2026-10-10.json) rozdziela
odczyt, wniosek i deklarację. **G07 PARTIAL, F0_OPEN**. Kopie, staging,
zakupy i zmiany ustawień pozostają niewykonane.

Przegląd obecnego kodu ujawnia jeszcze rozbieżność kanałów: krytyczne
`lib/alerts/slack.ts` kieruje do Slack/Telegram, a email/Telegram dotyczy
raportu dziennego. Przyjęte wcześniej docelowe email/Telegram dla krytycznych
nie opisuje obecnej implementacji. Nie potwierdzono przekierowania do Igora,
jego godzin reakcji ani zastępstwa; G08 pozostaje PARTIAL. Sam fakt posiadania
tokenu kanału nie dowodzi doręczenia i reakcji.

## Tylko przygotowanie kopii — wcześniejsza dyspozycja 10.10.2026

Igor odpowiedział **„Tylko przygotowanie — bez zakupu i zmian”** na propozycję
zakupu do 5 EUR i konfiguracji kopii. To zgoda na lokalne przygotowanie
materiału; 5 EUR nie jest zatwierdzonym limitem, a operacje i zakupy
pozostają wstrzymane. Nie znamy odrębnego czasu UTC tej odpowiedzi.
[Pakiet przygotowania](../runbooks/f0-backup-preparation.md) obejmuje
[plan JSON](../../scripts/ops/prepare-backup-plan.mjs),
[lokalną kontrolę kontraktu manifestu](../../scripts/ops/check-backup-set.mjs)
i [przykłady](../../ops/observability/backup/). Nie instaluje kopii ani nie
zastępuje istniejącego jobu. Zgodność zgłoszonego manifestu nie dowodzi
autentyczności, transportu off-host, pełnej kopii lub G09 PASS.
**F0_OPEN, G03/G09 FAIL**; brak nowego budżetu i zgody operacyjnej.

## Darmowa diagnostyka i tańsza infrastruktura — 10.10.2026

**U — aktualna dyspozycja Igora:** Sentry i PostHog mają pozostać bezpłatne;
dashboard błędów jest wymaganiem pierwszego wydania, po którym agent
deweloperski przygotowuje naprawy. Igor odrzuca wariant infrastruktury
73,19 EUR netto/mies. i wstrzymuje wcześniejszą zgodę zakupową. Nie znamy
odrębnego czasu UTC tych wiadomości. Ta sekcja zastępuje poprzedni cel
Sentry Team, rekomendację zakupu CPX42 oraz wcześniejsze limity i zgody
zakupowe. **Nie ustanawiamy nowego budżetu infrastruktury ani AI.**
Obecny zakres to plan i dostępne odczyty; zakupy, instalacje, zmiany kont
lub serwerów, wdrożenia, migracje, restore i F1 pozostają wstrzymane.

- **Diagnostyka: 0 USD nowych opłat Sentry/PostHog.** Docelowo Sentry EU
  Developer i PostHog EU Free, bez płatnego quota, PAYG, trialu przechodzącego
  w abonament lub rozszerzeń. UI PostHog potwierdziło Free, wybrane quota
  i dostęp Igora; UI Sentry potwierdziło Developer. Pozostałe parametry,
  indywidualny dostęp Sentry i MFA nadal wymagają dowodów G07.
  Decyzja i odczyt nie zmieniają aktywnej subskrypcji.
  Przekroczenie darmowego quota może ograniczyć telemetrię, więc brak danych
  musi być widoczny. Bezpłatna chmura nie zastępuje pełnej własnej historii.
- **Dashboard i agent w pierwszym planowanym wydaniu:** dashboard chronionej
  historii błędów faktur pozostaje wymagany, z błędami przed POST, retry,
  później naprawionymi i nadal otwartymi operacjami. Sukces nie usuwa historii;
  pokrycie i braki są jawne. Przyjęte retencje oraz oddzielenie audytu od
  ograniczonej telemetrii pozostają bez zmian. Następny krok agenta to
  przygotowanie propozycji napraw na podstawie zredagowanego odczytu, z osobną
  tożsamością, autoryzacją tenantów i audytem. Bez automatycznego wdrożenia,
  rozszerzenia dostępu lub zakupu usług AI. Wykonanie dashboardu i podłączenie
  agenta należą do osobnego chatu po rzeczywistym odbiorze F0; nie wykonano ich.
- **Tańszy staging: posiadany komputer jako kandydat.** Wybieramy kierunek
  osobnej lokalnej VM Linux dla syntetycznego stagingu, zamiast nowej VM
  Hetznera. Docelowy punkt startowy to 4 vCPU, 16 GiB RAM i dysk 160 GB;
  przydział wymaga zapasu dla systemu gospodarza i pomiaru całego zestawu.
  **P — lokalny odczyt 10.10, 11:57:46.742–11:57:48.169 UTC:** 31,75 GiB RAM,
  z czego tylko 10,08 GiB wolne, 12 rdzeni / 20 wątków. Obecny stan nie
  pozwala uznać VM 16 GiB za gotową; najpierw potrzebne są zwolnienie RAM
  przez właściciela i ponowny pomiar z zapasem, potem próba całego zestawu.
  Nie kończymy procesów ani nie uruchamiamy VM. Historycznie WSL2 był
  zatrzymany, działającego Docker Engine nie potwierdzono. Odczyt zasobów
  nie potwierdza uruchomienia ani izolacji środowiska.
  VM musi mieć własne DB/auth, kolejkę, Redis/SRH, storage, web/worker,
  klucze i kontrolowanych odbiorców; KSeF TEST, Stripe test, dane syntetyczne.
  Nie dostaje sekretów produkcji ani dostępu do katalogów kopii. Dev server
  i sam WSL2 nie zaliczają G03. Potrzebne są działające web/worker, dowód
  izolacji, zmierzony zapas i kontrolowana dostępność w oknach prac.
  Sen, wyłączenie lub użycie komputera do innych zadań mogą przerwać testy;
  komputer nie staje się produkcyjnym monitoringiem ani dyżurem 24/7.
- **Kopie: preferowana mała propozycja BX11 HEL1 + restic.** Dzisiejszy
  katalog z **07:20:56.151–07:20:56.777 UTC** potwierdził 1 TiB,
  **3,20 EUR netto/mies.**, setup 0; to cena propozycji, bez zakupu i nowej
  zgody na wydatek. [Indeks odczytu](evidence/f0-2026-10-10.json) i
  [oficjalny katalog typów](https://docs.hetzner.cloud/reference/hetzner#storage-box-types)
  wskazują źródło; przed ewentualnym zamówieniem cenę sprawdzamy ponownie.
  Cel Finlandia pozostaje poza hostami źródłowymi DE i poza komputerem
  stagingu. Trzy zaszyfrowane repozytoria obejmują obie bazy na db-1
  (postgres i _supabase) z globals/rolami, MinIO aplikacji i MinIO Supabase.
  Sam pg_dump bazy postgres nie obejmuje odrębnej bazy _supabase; jej
  zabezpieczenie należy do pełnego planu odzyskiwania. Zachowujemy 7/4/12, wspólny manifest,
  weryfikację referencji i odczytu off-host, osobne klucze odzyskiwania,
  harmonogram i procedurę izolowanego restore. Wspólny dostawca Hetzner
  i brak WORM pozostają ograniczeniami; B2 jest odłożoną opcją jakościową,
  nie bieżącym zakupem lub nową bramką G09.
- **Kopie bez nowego abonamentu: wariant warunkowy.** Igor wcześniej
  wskazał swój komputer, codzienną dostępność i 500 GB wolnego miejsca;
  lokalizację w Polsce potwierdził w późniejszej odpowiedzi opisanej wyżej.
  **P — odczyt dysków w tym samym oknie 11:57:46.742–11:57:48.169 UTC:**
  641,77 GiB wolne na rozważanym dysku i 185,43 GiB na systemowym. Wyciąg
  i hash źródła opisuje [nowy indeks](evidence/f0-low-cost-2026-10-10.json).
  Nie jest to nowy dowód lokalizacji
  urządzenia w UE ani codziennej dostępności. Późniejszy odczyt produkcji
  14:27–14:29 UTC potwierdza rozmiary baz i fizycznego zużycia MinIO opisane
  poniżej. Przyrost, rozmiar/kompresja dumpów i pojemność pełnej retencji
  7/4/12 pozostają niezweryfikowane; nie znamy zapasu na staging i kopie
  razem. Wariant lokalny może zastąpić propozycję BX11
  dopiero po potwierdzeniu EU, pojemności pełnego kompletu z retencją i VM
  oraz codziennych kopii z pełnym sukcesem nie starszym niż 26 h. Samo
  500 GB zadeklarowane lub 641,77 GiB chwilowo wolne tego nie dowodzi.
  Repo kopii pozostaje poza dyskami/katalogami udostępnionymi VM, z minimalnym
  dostępem, szyfrowaniem i osobną kopią kluczy offline. Wspólny komputer
  stagingu i kopii to wspólna domena utraty urządzenia, ransomware, zasilania
  i dostępności; izolacja VM nie usuwa tego ryzyka. Lokalny cel nadal musi
  spełnić pełne G09, a nie tylko przechować snapshot publicznego schematu.

Plan ogranicza nowe opłaty: staging wykorzystuje posiadany sprzęt, chmurowa
diagnostyka ma cel 0 USD, a 3,20 EUR netto za BX11 jest wyłącznie propozycją
do ewentualnej późniejszej decyzji Igora. Prąd, łącze, istniejąca produkcja
i używany plan agenta nie stają się darmowe. Nie przyjmujemy 45 EUR ani
73,19 EUR jako aktualnie zatwierdzonego limitu i nie ustalamy nowego limitu AI.
Nie pojawiły się nowe dowody uruchomienia stagingu lub pełnych kopii:
**G03/G09 FAIL, G07 PARTIAL, F0_OPEN**, testy NOT RUN. Granica 31.10 dla
stagingu pozostaje wcześniejszym celem planowania, nie dowodem wykonania
ani nową obietnicą operatora. Igor nadal koordynuje i odbiera F0.

## Odczyt SSH i rozmiarów produkcji — 10.10.2026

**P — uwierzytelniony odczyt 14:23 UTC:** SSH jako root działa na app-1,
ops-1 i db-1; klucze hostów ED25519 zgadzają się z odciskami przekazanymi przez Bartosza z jego historycznego known_hosts.
Konto root ma pełne uprawnienia techniczne; ograniczenie do odczytu wynika
z uzgodnionego zakresu działań, nie z technicznej roli read-only. Sam dostęp
nie nadaje upoważnienia do kopii, zmian serwerów, migracji, wdrożeń, restore lub F1.
Wcześniejsze nieudane próby SSH pozostają datowanymi dowodami historycznymi,
nie bieżącą przeszkodą dostępu.

**P — odczyty rozmiarów 14:27–14:29 UTC:** baza postgres zajmuje
190 346 031 B; potwierdzono obecność schematów auth i storage. Osobna baza
_supabase zajmuje 676 049 711 B w odczycie 14:29 UTC; razem obie bazy
866 395 742 B. Suma odczytana o 14:27 wynosiła 866 379 358 B; odczyty mają
różne chwile pomiaru i nie stanowią dowodu stałego przyrostu. Fizyczne zużycie
katalogów danych MinIO: aplikacja na ops-1 — 774 144 B, Supabase na db-1 —
139 264 B. To pomiar du zweryfikowanych mountów, odrębny od logicznej sumy
payloadów S3. Nie jest to rozmiar kopii, wynik backupu ani dowód pokrycia
referencji DB.

**P — logiczne metadane S3 14:32 UTC:** obie instalacje mają COMPLETE dla
odczytu bucketów, bieżących obiektów, wszystkich wersji i ustawienia versioning
(wszystkie cztery flagi kompletności true).

- Supabase na db-1, **14:32:17.121–14:32:17.165 UTC**: 1 bucket, 0 bieżących
  obiektów / 0 B, 0 wersji / 0 B, 0 delete markers; versioning unversioned.
- Aplikacja na ops-1, **14:32:19.474–14:32:19.562 UTC**: 1 bucket,
  31 bieżących obiektów / 378 638 B; wszystkie wersje 31 / 378 638 B,
  0 delete markers; versioning unversioned.

Wszystkie wersje zawierają bieżące obiekty: nie dodawać 378 638 B drugi raz.
Fizyczne zużycie 774 144 B / 139 264 B obejmuje inny zakres niż logiczne
payloady; nie dodawać go do logicznej sumy S3. COMPLETE oznacza tutaj
zakończenie listowania metadanych, bez odczytu treści obiektów i bez dowodu
backupu. Mapowanie referencji DB do obiektów, multipart uploads oraz
spójność między odczytami nadal niezweryfikowane.

**P — wersje binarek MinIO odczytane 10.10:** aplikacja na ops-1:
RELEASE.2025-09-07T16-13-09Z; Supabase na db-1:
RELEASE.2025-10-15T17-29-55Z. Nie wykonywano aktualizacji. Rozmiary, wersje
i zakres dowodu zapisuje [nowy indeks](evidence/f0-runtime-size-2026-10-10.json);
pełny materiał pozostaje prywatny. Pełny plan odzyskiwania obejmuje obie bazy
postgres i _supabase oraz globals/role, oba MinIO i wymagane materiały
odzyskiwania. Przyrost, dumpy/kompresja, pełna retencja 7/4/12 i wykonanie
kopii nadal niezweryfikowane. **G03/G09 FAIL, F0_OPEN**; brak zmian kosztów,
ról, odbioru stagingu lub pełnych kopii.

## Aktualne decyzje — przegląd kontynuacji 04.10.2026

W pakiecie opublikowanym w [PR #225](https://github.com/ezior8888-cpu/ksef-saas/pull/225)
na `6399ff9df0b2dc0874e4411983d3543c7dee5f70`, jego dyskusji oraz wcześniejszych
czatach F0 nie znaleziono nowych zatwierdzeń Bartosza. Ostatnie odczytane
wcześniejsze zlecenie Igora dotyczyło włączenia pomiaru i publikacji pakietu,
przy zachowaniu otwartego F0. Obecna kontynuacja wymaga domykania decyzji i
brakujących dowodów, bez czynności operacyjnych i bez rozpoczęcia F1.
To granica sprawdzonych źródeł, nie twierdzenie, że decyzje nie
istnieją w innych miejscach. D01–D10 i nieprzyjęte role pozostają PENDING.

**Aktualizacja 06.10.2026:** Igor przekazał informacje o dostępie oraz
podtrzymał brak staging, pełnego dumpa DB off-host i kopii MinIO. Są zapisane jako
[deklaracje](runtime-inventory.md#deklaracje-przekazane-06102026), osobno od
pomiaru z 04.10. Według deklaracji odczyt Coolify przez istniejący dostęp
SSH nie wymaga osobnego tokenu API. Na etapie tej wiadomości prywatny plik
inventory nie był jeszcze dostarczony. Później wskazano go i zweryfikowano
lokalnie; nie oznacza to uzyskania uwierzytelnionego odczytu runtime.
Podane identyfikatory kont nie potwierdzają planów ani retencji.
Wiadomość nie zatwierdza proponowanych kontraktów, polityki danych,
budżetów lub ról, nie rozstrzyga D01–D10 i nie jest odbiorem F0.

**Odczyty techniczne 06.10.2026:** [pomiar API i próba SSH](runtime-inventory.md#odczyty-dostawców-i-próba-ssh-06102026)
oraz [bezpieczny indeks](evidence/f0-2026-10-06.json) są osobnymi źródłami.
API Hetznera potwierdza VM, przypisane reguły zapory i siedem obrazów backupu
dysku DB; API Sentry/PostHog daje częściowe dowody metadanych EU i ustawień.
Nie potwierdzono pełnego zakresu backupu DB/MinIO ani restore, planów/kosztów
i wszystkich produktów. SSH nie dostarczył odczytu runtime. Właściciel klucza
odblokowuje go lokalnie; haseł kluczy nie przekazuje się w czacie. Zaufane
klucze hostów wymagają niezależnej weryfikacji, bez wyłączania jej kontroli.
Odczyt ustawień replay nie zatwierdza polityki danych i nie dowodzi aktywnego
nagrywania w aplikacji. G02/G07 mają częściowe dowody; G03/G09 pozostają FAIL,
G04/G05/G06/G08 PENDING. Nie przyjęto nowych ról, decyzji ani odbioru F0;
nie zmieniono serwerów lub ustawień dostawców i nie rozpoczęto F1.

## Decyzje i deklaracje przekazane 07.10.2026

Źródło: odpowiedzi przekazane przez Igora na pięć pytań do Bartosza oraz
doprecyzowanie Igora, że godziny dotyczą **Europe/Warsaw**. Materiałem
odniesienia jest pakiet `4a0113a`. Data dotyczy otrzymania odpowiedzi;
nie znamy odrębnego czasu UTC podjęcia decyzji. Nie wykonano nowego pomiaru.

- **KSeF TEST — decyzja:** celowe użycie przez aplikację produkcyjną.
  Według deklaracji produkt jest przed startem i nie ma prawdziwych klientów.
  Przełączenie TEST → PROD jest osobnym zadaniem go-live F1 (W15/S13) z
  [planu faktur](../koordynacja/PLAN-ZERO-ZGUBIONYCH-FAKTUR.md#blok-f--go-live-m4-m8).
  To osobna numeracja od F1 observability. Żadnego z tych zadań nie rozpoczęto.
- **Pełne kopie — decyzja o zakresie i odpowiedzialności:** wdraża i odpowiada
  Bartosz. Codzienny pełny `pg_dump`, w tym schematy auth i storage, oraz kopie
  obu MinIO (aplikacji i Supabase); zaszyfrowany zapis na zewnętrzny cel w UE
  poza hostami źródłowymi. Retencja: **7 kopii dziennych, 4 tygodniowe,
  12 miesięcznych**. Raz w miesiącu próbne odtworzenie. Termin uruchomienia,
  konkretny cel, reviewer i dowody wykonania nie zostały wskazane w pierwotnej
  odpowiedzi. Późniejsze ustalenie przypisuje przegląd dostępnych dowodów Codexowi.
- **Staging — decyzja o zakresie i odpowiedzialności:** przygotowuje Bartosz,
  **do 31.10.2026**, po kopiach i przed Closed Alpha. Osobne DB, kolejka,
  storage i klucze; KSeF TEST oraz Stripe test. W pierwotnej odpowiedzi nie
  wskazano reviewera; późniejsze ustalenie przypisuje dostępny przegląd Codexowi.
  Dowody uruchomienia i rzeczywistej izolacji pozostają otwarte.
- **Sentry/PostHog — deklaracja:** brak płatnych planów. Nie przypisujemy
  konkretnej nazwy darmowego planu ani kosztu 0; retencje, limity i brakujące
  uprawnienia nadal wymagają dowodów. Odczyty API z 06.10 pozostają osobnym źródłem.
- **Alarmy — zadeklarowany odbiorca i organizacja:** krytyczne przez Slack
  i Telegram; codzienny raport o **06:00 Europe/Warsaw** przez email i Telegram.
  Odbiera Bartosz w miarę możliwości **08:00–22:00 Europe/Warsaw**. Formalnego
  dyżuru i zastępstwa nie ma; dostępność w tym oknie nie jest gwarantowana.
  To jawna luka G08. Prywatne oznaczenia kanałów i bota pozostają poza gitem.

Przyjęty zakres kopii/staging nie jest dowodem wykonania; **G03/G09 nadal FAIL**.
Na etapie tych pierwszych odpowiedzi G08 pozostawało PENDING z zapisanym
odbiorcą alarmów i jawną luką. Nie zatwierdzono wtedy całych G04/G05/G06/G07 ani
odbioru F0. Comiesięczny restore jest uzgodnioną przyszłą czynnością operatora;
nie uruchamiamy go w tej kontynuacji, podobnie jak zmian serwerów lub F1.

**Dalsza decyzja Igora z 07.10 — aktualna organizacja pracy:** Igor przejmuje
całość prowadzenia monitoringu FaktFlow i odpowiedzialność za domykanie F0,
w tym decyzję o jego formalnym odbiorze. Codex sam przygotowuje dokumentację,
sprawdza dostępne źródła i zbiera dowody; do Igora kieruje tylko decyzje lub
braki, których nie może rozstrzygnąć sam. Bartosz nie jest domyślnym adresatem
pytań ani osobą zatwierdzającą każdy element F0. Jego wcześniejsze wskazanie
jako wykonawcy kopii/staging pozostaje kontekstem operatorskim; dalszy zakres
koniecznych czynności uzgadnia Igor. Nie jest to zgoda na zmiany serwerów.

Ta decyzja nie zmienia automatycznie konfiguracji odbiorców alarmów:
zadeklarowany odbiór przez Bartosza pozostaje opisem otrzymanej informacji,
bez dowodu przekierowania do Igora. Własność monitoringu nie ustanawia
formalnego dyżuru ani nie usuwa luki G08. Przyjęcie roli odbiorcy F0 nie jest
jeszcze odbiorem wyników; wszystkie bramki nadal wymagają własnych dowodów.

[C-22](../koordynacja/CLAUDE-DO-CODEXA.md) przekazuje prośbę Bartosza o kontekst
centrum dowodzenia. Sekcja 11 [briefu](../koordynacja/CENTRUM-DOWODZENIA-BRIEF-DLA-CODEXA.md)
zawiera osobne propozycje D1–D7. W odpowiedziach używamy oznaczeń **F0-D01…D10**
oraz **C22-D1…D7**, zachowując dotychczasowe ID w tych dokumentach. Przyjęcie
jednego zestawu nie zatwierdza drugiego. Rekomendacja Datadog EU także nie
jest potwierdzonym wyborem właściciela ani dowodem dostępności produktów.

Aktualny zakres kontynuacji obejmuje dokumentację i lokalne poprawki pakietu.
Nie obejmuje migracji, wdrożeń, restore ani zmian serwerów. Wskazanie w briefie,
że jego fazy 0–2 mogą się rozpocząć, nie uchyla zakazu rozpoczęcia F1 przed
odbiorem F0. Numeracja faz briefu i etapów observability ma oddzielne znaczenie.

## Wybory na podstawie delegacji Igora — 07.10.2026

**Zapis historyczny:** wybory zakupowe i kwoty w tej sekcji nie są aktualną
zgodą ani limitem. Obowiązuje [najnowszy kierunek](#darmowa-diagnostyka-i-tańsza-infrastruktura--10102026);
przyjęty zakres kopii, izolacji, kontraktów i retencji pozostaje wymagany.

Źródło upoważnienia: wiadomość Igora **„Wybierz wszystko co uważasz za
najlepsze”**, po przedstawieniu pełnej checklisty F0. Codex wybiera poniższy
pakiet w imieniu właściciela; nie prosimy ponownie o zatwierdzenie tych samych
wyborów. Bazą przeglądu jest `1712ff27006a8afb67f2e3d7bdc16a1c73582746`.
Zapis nie oznacza formalnego odbioru wyników F0, zobowiązania osoby trzeciej,
zakupu ani upoważnienia do zmian serwerów, kont, migracji, wdrożeń, restore,
realnych alarmów lub F1. Oryginalne deklaracje powyżej pozostają historyczne.
Pełne warunki i indeks decyzji są w [planie](acceptance-plan.md) i
[rejestrze wyborów](evidence/f0-decisions-2026-10-07.json).

### Kopie i staging

- **Cel kopii:** Hetzner Storage Box **BX11, HEL1, Finlandia**, 1 TiB według
  odczytanego katalogu, z restic i szyfrowaniem po stronie klienta. Trzy osobne
  repozytoria/subkonta: pełna DB, MinIO aplikacji, MinIO Supabase. Region jest
  odrębny od zmierzonych źródeł DE; dostawca pozostaje wspólny. Nie zakładamy
  WORM ani odporności na awarię całego Hetznera. [Oferta i protokoły](https://www.hetzner.com/storage/storage-box/bx11/)
  potwierdzają dostępne lokalizacje, subkonta i restic; rzeczywisty zakup i
  pojemność pozostają niepotwierdzone.
- **Klucze:** osobne sekrety szyfrowania repozytoriów, przechowywane przez Igora
  poza serwerami w menedżerze haseł i kopii odzyskiwania offline. Prywatny
  zaszyfrowany pakiet odzyskiwania zawiera wymagane klucze aplikacji, ich
  historię i konfigurację. Źródłowe MinIO czytane minimalnymi uprawnieniami;
  produkcja nie dostaje administratora panelu backupu. Subkonto SFTP do restic
  nadal może zmieniać/usuwać swój katalog — nie jest technicznym append-only.
- **Wykonanie:** planistyczny cel pierwszego pełnego kompletu **09.10.2026,
  16:00 Europe/Warsaw**; start codziennych kopii **00:30 UTC**, zakończenie do
  **03:30 UTC**. Nie jest to obietnica Bartosza ani wykonanego zadania.
  Sukces wspólnego uruchomienia wymaga dumpa, globalnych ról, obu zestawów
  obiektów, manifestu i sprawdzenia referencji/hashów. Porażka alarmuje od razu;
  wiek ostatniego pełnego sukcesu >26 h jest krytyczny. Retencja 7/4/12 już
  przyjęta; próbne odtworzenie docelowo pierwszy roboczy dzień miesiąca o
  **10:00 Europe/Warsaw**, w osobno upoważnionym izolowanym zakresie.
- **Spójność i retencja:** runbook pierwszej pełnej kopii przewiduje kontrolowane
  okno stabilizacji zapisów i usuwania oraz sprawdzenie, że każdy obiekt
  referowany przez dump ma odpowiadające mu zweryfikowane bajty. Sam pg_dump
  zapewnia spójność jednej bazy, nie wspólną transakcję DB/MinIO; globalne
  role i ACL mają osobny zaszyfrowany zakres. Manifest zawiera wspólny run ID,
  trzy referencje repo, liczby/rozmiary, SHA-256, czasy UTC, wersje narzędzi,
  pokrycie ról/auth/storage/stanu operacji i wymaganej konfiguracji. Niepełny
  upload daje partial/failed, nigdy pełny sukces. Prune poza oknem kopii,
  dopiero po weryfikacji i z podglądem wybranych punktów 7/4/12; niczego
  nie kasowano tutaj. Runbook restore blokuje skutki produkcji i stosuje
  ponownie ACL/TTL/hold, bez replay płatności lub KSeF.
- **Pojemność:** ostrzeżenie 70%, pilne działanie 80% oraz prognoza przekroczenia
  80% w 30 dni. Rozmiar i przyrost mierzy pierwszy komplet; nie zakładamy
  z góry współczynnika deduplikacji. Retencję sprawdza podgląd konfiguracji;
  nie czekamy 12 miesięcy na zgromadzenie wszystkich miesięcznych punktów.
- **Staging:** osobna VM x86 w DE, osobny projekt/sieć i pełny własny zestaw
  DB, kolejki, Redis/SRH, storage, web/worker oraz sekretów. Wybrany typ:
  **CPX32, 4 vCPU / 8 GiB RAM / 160 GB SSD**, na podstawie wskaźnika
  dostępności aktualnego katalogu EU. Planistyczny limit VM z IPv4:
  **40 EUR netto/miesiąc**. Cena z odczytu 07.10: **35,99 EUR netto** z IPv4.
  Tańszy CX43 (8 vCPU / 16 GiB / 160 GB, 16,49 EUR netto z IPv4) ma
  available=false we wszystkich odczytanych regionach EU; nie wybieramy go
  jako dostępnego. Katalog nie gwarantuje zakupu. Obrazy budowane kolejno;
  przed odbiorem zmierzyć RSS i headroom całego zestawu, chroniąc DB limitami
  oraz planując 8 GiB swap dla buildów. Swap nie jest dowodem wystarczającej
  wydajności. Jeśli zestaw nie mieści się z zapasem, G03 nadal niezaliczone;
  nie uruchamiać PoC kosztem bazy i nie kupować większego typu automatycznie.
- **Izolacja i termin:** dane syntetyczne, KSeF TEST, Stripe test, kontrolowani
  odbiorcy, zero produkcyjnych kluczy i połączeń do skutków produkcji. Cel
  gotowości **23.10**, granica **31.10.2026**, po odebraniu pełnego kompletu
  kopii i przed Closed Alpha. Darmowy PostHog ma jeden projekt, więc staging
  używa lokalnego odbiornika testowego albo wyłączonego eksportu; nie kopiuje
  klucza produkcji. Lokalny test nie dowodzi działania chmurowego ingest.

### Kontrakty, dane i budżet

Przyjmujemy konkretną wybraną wersję [kontraktów](contracts.md),
[polityki danych](data-policy.md) oraz [budżetu i metody OFF/ON](acceptance-plan.md#wybrany-budżet-instrumentacji--f0-g06).
Te dokumenty opisują cały wybór, w tym kwalifikację populacji, limity plików,
deadline, retencję audytu/source maps i ograniczenia bufora. G04/G05/G06
zaliczają wyłącznie przyjęcie ich kryteriów decyzyjnych; implementacja i
TEST-01…TEST-05 nadal nie zostały odebrane. KSeF TEST pozostaje celowym wyborem.

### Narzędzia i koszty

- Wybrany zakres: istniejący **Sentry EU Developer**, **PostHog EU Free**,
  **Uptime Kuma** oraz planowany **Healthchecks.io Hobbyist** jako zewnętrzny
  watchdog heartbeatów platformy i sukcesu kopii. Wybór darmowego tier nie
  dowodzi aktywnego tier konta. Trace/RUM w Sentry wyłącznie w potwierdzonym
  zakresie i quota; centralne logi, replay i płatne rozszerzenia poza zakresem.
- **Datadog EU/DBM/APM/RUM/On-Call nie jest wybrany w obecnym pakiecie.**
  To jawna decyzja właściciela na podstawie delegacji, zastępująca wcześniejszą
  propozycję zakresu G07. Nie usuwamy historycznego braku dowodu ani nie
  opisujemy niewybranych produktów jako PASS. Można do nich wrócić w osobnym
  uzgodnieniu po F0.
- Budżet subskrypcji wybranych SaaS: **0 USD**, bez on-demand, trial przechodzącego
  w abonament i zwiększania płatnego quota. Odczyt aktywnych kont nadal wymagany;
  gdy konto nie pozwala na taki zakres, eksport danej funkcji pozostaje
  zablokowany do rozstrzygnięcia ograniczenia. Nie uznajemy no-data za zdrowie.
  Alarm zużycia przy 80% faktycznego quota; limity dostawcy nie zastępują
  pełnego własnego journal/audit.
- Świeży odczyt katalogu Hetznera 07.10, **17:27:36–17:29:06 UTC**:
  BX11 HEL1 3,20 EUR netto/mies., CPX32 35,49 EUR netto i IPv4 0,50 EUR
  netto. Łącznie wybrane kopie + staging: **39,19 EUR netto/miesiąc**,
  około **48,20 EUR brutto** przy zwróconym VAT 23%; budżet planistyczny
  tych nowych zasobów **45 EUR netto/miesiąc**. Nie obejmuje istniejącej
  produkcji ani dodatkowego transferu/rozszerzeń. Nie złożono zamówienia.
  Ceny, region i dostępność ponownie sprawdzić przed zakupem. Źródła GET:
  [server_types](https://docs.hetzner.cloud/reference/cloud#server-types),
  [pricing](https://docs.hetzner.cloud/reference/cloud#pricing),
  [storage_box_types](https://docs.hetzner.cloud/reference/hetzner#storage-box-types).
  [Changelog](https://docs.hetzner.cloud/changelog) opisuje nowy schemat
  dostępności; usunięty endpoint datacenters nie jest źródłem bieżącego stanu.
- [PostHog Free](https://posthog.com/pricing) opisuje jeden projekt, roczną
  retencję analytics i zatrzymanie przy darmowym limicie; nie przyjmujemy
  30 dni dla zwykłych zdarzeń product analytics. [Healthchecks Hobbyist](https://healthchecks.io/pricing/)
  opisuje 20 checks i 100 wpisów historii/check. To publiczne możliwości,
  osobne od dowodów naszych kont.
- Healthchecks dostaje tylko niejawny identyfikator kontroli i stan, bez body,
  logów, UUID klientów ani innych danych domenowych. [FAQ](https://healthchecks.io/faq/)
  wskazuje hosting DE; [polityka prywatności](https://healthchecks.io/privacy/)
  wymienia również AWS backups i możliwe przetwarzanie poza EEA. Nie
  przypisujemy całemu łańcuchowi gwarancji EU lub niezależności od Hetznera.
  Przed aktywacją potrzebny jest prywatny odbiór konta, regionu i metadanych
  operatora; zakaz eksportu danych klientów obowiązuje także dla heartbeatów.

### Reakcja, dostęp i utrzymanie

- **Igor** prowadzi monitoring i jest głównym docelowym odbiorcą. Krytyczne:
  Telegram + email; Slack dodatkowo roboczo. Raport email/Telegram o **06:00
  Europe/Warsaw**. To wybór routingu, bez potwierdzonej zmiany odbiorców.
  Bartosz nie staje się automatycznym zastępcą. Brak gwarantowanych godzin
  reakcji i zastępcy pozostaje jawny; nie tworzymy deklaracji dyżuru 24/7.
- Lifecycle docelowy: ACK do **15 min**, przypomnienie po **15 min**, email
  fallback po **30 min** bez ACK; potwierdzenie wygasa po **60 min**, gdy
  incydent nadal trwa. Recovery wymaga świeżych danych i trzech kolejnych
  udanych pomiarów. No-data daje UNKNOWN. Stan głównej ścieżki i watchdog mają
  odrębne potwierdzenia, nie kasują wzajemnie incydentów bez uzgodnienia.
- Watchdog platformy: heartbeat co **60 s**, grace **180 s**. Pełne kopie:
  heartbeat tylko po kompletnym sukcesie, okres **24 h**, grace **2 h**.
  Healthchecks nie zapewnia sam 15/30-minutowych reminderów i ACK; jego
  [email reminders](https://healthchecks.io/docs/configuring_notifications/)
  są odrębną funkcją. Wybrany lifecycle wymaga późniejszego odbioru głównej
  ścieżki. Nie zakładamy SMS/voice, Pushover ani fizycznego testu telefonu.
- Przygotowanie przyszłego TEST-06: odbiorca Igor, 30-minutowe okno w dzień
  roboczy **10:00–16:00 Europe/Warsaw**, dokładny slot po potwierdzeniu jego
  obecności i urządzenia. Wybór okna nie wysyła alarmu. Nadal brak dowodu
  doręczeń, reakcji człowieka i niezależności telefonu/internetu: G08 PARTIAL.
- Dostęp: osobne tożsamości, minimalne uprawnienia, MFA tam, gdzie dostępne;
  przegląd co **30 dni**. Nowy tymczasowy dostęp do dowodów maks. **24 h**.
  Codex korzysta z już przyznanego odczytu, Bartosz z koniecznych czynności
  operatorskich; nie przyznajemy dodatkowego współpracownika ani roli
  zastępcy. Darmowe plany nie są dowodem SSO/custom RBAC.
- Redis/SRH pozostaje na app-1, MinIO aplikacji na ops-1 i odrębne MinIO
  Supabase na db-1 według historycznego pomiaru. Docelowo przypinamy odczytane
  wersje/obrazy, z osobnym health każdej usługi; nie wybieramy numeru wersji
  z pamięci. `UPSTASH_*` i `R2_*` zachowują znaczenie zgodne z aplikacją.
- Kolejność utrzymania: **P0** pełne kopie i sprawdzenie pokrycia; **P1**
  izolacja staging, uzupełnienie dowodów dostępu/zasobów/monitorów; **P2**
  kontrolowane aktualizacje Coolify/systemu/usług i porządkowanie starszych
  ustawień/ACL. Bez automatycznych aktualizacji produkcji. Przegląd co miesiąc;
  zwykłe okno zmian wtorek **10:00–12:00 Europe/Warsaw**, po kopii i próbie
  na staging, z osobnym runbookiem/rollback. Potwierdzona krytyczna luka:
  triage do 24 h i osobny pilny plan naprawy, bez domyślnego wdrożenia tutaj.
- SSH jest preferowaną możliwością samodzielnego odczytu, gdy klucz jest
  odblokowany lokalnie i zweryfikowano klucze hostów; nie stanowi osobnej
  bramki. Datowane dowody operatora/panelu mogą zastąpić odczyt Codexa.
  Nie kopiujemy klucza prywatnego do repo/chmury i nie wyłączamy host checks.

## Wariant bez nowego abonamentu — ocena 07.10.2026

**Ocena historyczna:** pomiary sprzętu i deklaracje pozostają źródłami z 07.10.
Aktualny wybór lokalnego stagingu i warunków kopii opisano
[na początku dokumentu](#darmowa-diagnostyka-i-tańsza-infrastruktura--10102026).

**D — deklaracja:** po pytaniu „czy dałoby się to zrobić żeby było za darmo”
Igor potwierdził urządzenie w UE dostępne codziennie, **500 GB wolnego miejsca**
i że jest to komputer z Codexem. Nie jest to pomiar czasu dostępności ani
zobowiązanie do działania 24/7. Nie podano czasu UTC wiadomości źródłowych.

**P — odczyt lokalny**, 07.10 **19:01:06–19:01:08 UTC**: około 31,7 GiB RAM,
13,4 GiB dostępnego RAM w tej chwili, 12 rdzeni fizycznych / 20 wątków oraz
około 641,9 GiB wolnego miejsca na rozważanym dysku. Prywatny wyciąg jest poza
Git; SHA-256: `b91b41875f18af3943b0a62116110598e76952d930ce3cf4f26baa118c10c2f1`.
Nie uruchomiono Linuxa, kontenerów ani staging. Nie potwierdzono działającego
Docker Engine; istniejący Ubuntu WSL2 był zatrzymany. Nie odczytano produkcji.

**Wybrany kierunek dalszego przygotowania:** najpierw wariant **0 nowych
abonamentów**, zamiast zamówienia BX11/CPX32. Istniejąca produkcja, prąd,
łącze i sprzęt pozostają kosztami; nie jest to zerowy koszt całego projektu.
Poprzednia cena 39,19 EUR netto opisuje wariant zakupowy, a historyczny indeks
decyzji pozostaje niezmieniony. Nie zamówiono ani nie anulowano usług.

- Kopie: trzy szyfrowane repozytoria restic na posiadanym urządzeniu, bez
  publikowania plików, pełna DB/globals oraz oba MinIO. Utrzymujemy 7/4/12,
  manifest, spójność referencji, osobne klucze i odzyskiwanie. Najpierw
  zmierzyć pełny komplet, przyrost i zapas miejsca; 500 GB nie gwarantuje
  zmieszczenia całej retencji. Potwierdzić dostępność w porze kopii, wiek
  sukcesu do 26 h, alarm braku kopii i brak usypiania podczas przebiegu.
  Lokalny cel poza hostami produkcji nie jest WORM ani odporny na utratę
  urządzenia/ransomware; sekret odzyskiwania musi mieć osobną kopię offline.
- Staging: osobna lokalna VM Linux z własnymi DB/kolejką/storage/kluczami,
  danymi syntetycznymi, KSeF TEST i Stripe test. Sprzęt jest kandydatem;
  alokację i zapas zasobów przyjąć po pomiarze pełnego zestawu, nie samego
  Supabase. VM nie dostaje produkcyjnych sekretów ani dostępu do repo kopii
  przez współdzielone dyski/katalogi. Sam dev server lub istniejący WSL2
  nie zalicza G03: potrzebny działający web/worker i dowody izolacji.
- Monitoring: wcześniej wybrany darmowy zakres bez płatnych rozszerzeń;
  rzeczywiste plany, quota i dostęp nadal wymagają dowodów G07. Publiczne
  oferty nie zmieniają niezweryfikowanych kont w PASS.

To plan do przygotowania. **G03/G09 FAIL, F0_OPEN** pozostają bez zmian.
Nie wykonano instalacji, kopii, wdrożenia, restore, zmian serwerów ani F1.
Przygotowanie lokalnego wariantu nie uchyla zakazu czynności operacyjnych
w tej sesji. Zakup nowych zasobów nie jest samodzielną bramką F0.

## Płatny wariant i pełna historia błędów — 10.10.2026

**Wariant zastąpiony późniejszą dyspozycją z tego samego dnia.** Sentry Team,
CPX42 i wydatek 73,19 EUR nie są aktualnym wyborem ani zgodą zakupową.
Wymaganie pełnej historii błędów i przyszłego ograniczonego odczytu agenta
pozostaje aktualne; [bieżący plan](#darmowa-diagnostyka-i-tańsza-infrastruktura--10102026)
wykorzystuje darmową diagnostykę i lokalny staging jako kandydat.

**U — decyzja Igora w tym wcześniejszym wariancie:** „jeszcze robimy tą wersje płatną”, „musi być
jak najlepsza”, po wymaganiu dashboardu wszystkich błędów faktur i odczytu
dla agenta deweloperskiego. Wiadomości nie mają dostarczonego czasu UTC.
W ramach wcześniejszej delegacji Codex przyjmuje poniższy kierunek jakościowy.
Ocena lokalnego wariantu z 07.10 pozostaje historyczna. Nie jest to zakup,
zmiana aktywnych kont lub upoważnienie do czynności operacyjnych; poprzedni
limit infrastruktury 45 EUR netto nie zostaje automatycznie podniesiony.

- **Historia i agent:** źródłem dashboardu jest chroniona historia domenowa,
  bez próbkowania wymaganych wpisów. Zawiera błędy przed POST, ponowienia,
  później odzyskane i nadal otwarte operacje; sukces nie usuwa wcześniejszych
  błędów. Widok ujawnia pokrycie, świeżość i luki historyczne. Minimalny wpis
  każdego błędu zachowuje audyt faktury przez 10 lat według polityki projektu;
  szczegóły diagnostyczne 90 dni, journal SLI 13 miesięcy. Nie odtwarzamy
  zdarzeń nigdy niezapisanych. [Kontrakt](contracts.md) i [polityka danych](data-policy.md)
  opisują zakres. Przyszły agent otrzymuje osobną tożsamość i zredagowany
  odczyt z autoryzacją tenantów oraz audytem; bez sekretów, service-role,
  SQL, SSH i operacji na fakturach. Implementacja dashboardu i podłączenie
  agenta dopiero po rzeczywistym odbiorze F0, w osobnym chacie. Nie przyznano
  dostępu ani nie wysłano wiadomości do agenta lub operatora.
- **Sentry Team EU — wybrany cel:** początkowo miesięcznie, **29 USD/mies.**
  bez podatków; rocznie 312 USD płatne z góry. Wielu użytkowników, 50 tys.
  błędów/mies., API/integracje i 20 dashboardów poprawiają współpracę.
  Błędy do 90 dni; spans/transactions 30 dni. Team nie zwiększa bazowych
  5 mln spanów względem Developer. [Cennik](https://sentry.io/pricing/),
  [rozliczenie miesięczne/roczne](https://sentry.zendesk.com/hc/en-us/articles/26365105087643-The-price-on-the-Manage-Subscription-page-differs-from-what-is-shown-on-the-Pricing-Page-why)
  i [retencja Team](https://www.sentry.help/en/articles/13965032-how-is-my-team-plan-changing-august-27-2025),
  sprawdzone 10.10. Business 89 USD/mies. nie zwiększa bazowej liczby błędów;
  nie wybieramy go bez potrzeby dodatkowych funkcji. Aktywny plan pozostaje
  niezweryfikowany. Docelowo PAYG wyłączony / budżet nadwyżek 0 USD do pomiaru
  zużycia i alarm przy 80% quota; po wyczerpaniu quota dane Sentry mogą być
  odrzucane, co wymaga jawnego wskaźnika braków. Płatny plan nie zastępuje
  audytu. [PAYG](https://www.sentry.help/en/articles/13964878-how-does-pay-as-you-go-work)
  może być domyślnie włączony przy zakupie; ustawienie wymaga późniejszego odbioru.
  Replay, profilowanie, Seer i centralne logi SaaS pozostają osobnymi,
  niewybranymi rozszerzeniami. [EU FAQ](https://www.sentry.help/en/articles/13964378-sentry-s-eu-region-faq)
  rozróżnia zdarzenia/kopie we Frankfurcie od części metadanych w USA.
- **Pozostałe narzędzia:** PostHog EU Free dla analityki produktu, istniejący
  Kuma i planowany Healthchecks dla heartbeatów w dotychczasowym ograniczonym
  zakresie. Nie kupujemy płatnej analityki, aby zastąpić historię błędów.
  Datadog pozostaje poza zakresem. Cały lifecycle alarmów i jego niezależność
  nadal wymagają dowodów G02/G08; sam abonament nie zapewnia reakcji Igora.
- **Kopie:** główny BX11 HEL1/restic, pełna DB/globals i oba MinIO, zasady
  spójności, kluczy i retencji 7/4/12 z 07.10 bez zmian. Planistyczny termin
  pierwszej kopii 09.10 upłynął; brak dowodu jej wykonania i brak nowej
  obietnicy operatora. Rekomendowany dodatkowy niezależny cel **B2 EU Central
  (Amsterdam), szyfrowanie klienta i Object Lock COMPLIANCE**: odtwarzalne
  zaszyfrowane paczki całego zestawu z manifestem i jawną datą retencji.
  Nie nakładamy blokady na aktywne repo restic bez testu zgodności locks/prune.
  Samo włączenie Object Lock nie blokuje każdego obiektu; COMPLIANCE chroni
  zablokowane wersje do daty, także przed usunięciem przez administratora.
  Upload ma oddzielny klucz ograniczony do celu bez delete/bypass/admin;
  odzyskiwanie i maintenance osobno u Igora. Region konta wybrać przy zakładaniu;
  retencję/hold/delete i możliwości odzyskania sprawdzić przed blokadą.
  [Object Lock](https://www.backblaze.com/docs/cloud-storage-object-lock),
  [regiony](https://www.backblaze.com/docs/cloud-storage-data-regions),
  [uprawnienia](https://www.backblaze.com/docs/cloud-storage-s3-compatible-app-keys).
  Publiczna stawka 10.10: **6,95 USD/TB/mies.**, pierwsze 10 GB darmowe;
  egress do 3× średniego storage bez opłaty, potem 0,01 USD/GB.
  [Cena](https://www.backblaze.com/cloud-storage/pricing) nie wyznacza kosztu
  naszej retencji bez pomiaru rozmiarów. Dodatkowy cel jest rekomendacją
  jakościową, nie nowym automatycznym warunkiem G09 ani istniejącą kopią.
- **Staging jakościowy:** rekomendowany **CPX42 NBG1, x86, 8 vCPU / 16 GiB /
  320 GB**, zamiast wcześniejszego CPX32 8 GiB. Pełny zestaw musi mieć zmierzony
  zapas RAM/CPU/dysku; 16 GiB nie jest gwarancją wydajności. Izolacja i cel
  23.10 / granica 31.10 po pełnych kopiach pozostają bez zmian. Odczyt katalogu
  10.10: CPX42 69,49 EUR netto + IPv4 0,50 + BX11 3,20 = **73,19 EUR netto/mies.**
  Tańszy CX43 8 vCPU / 16 GiB / 160 GB dałby 19,69 EUR netto z IPv4 i BX11,
  ale ma available=false w każdej odczytanej lokalizacji EU. Żaden dostępny,
  nieprzestarzały wariant x86 ≥4 vCPU / 16 GiB nie mieści się w dotychczasowym
  limicie 45 EUR. Pozyskanie VM pozostaje **BLOCKED — budżet/dostępność**;
  przed zamówieniem potrzeba osobnego rozstrzygnięcia wyższego limitu albo
  nowego pomiaru dostępności CX43. Nie złożono ani nie zarezerwowano zamówienia.

**P — źródła odczytu:** katalog Hetznera 10.10 **07:20:56.151–07:20:56.777 UTC**,
cztery GET 200, 26 typów bez dalszej strony; wskaźnik dostępności nie jest
rezerwacją. [Indeks](evidence/f0-2026-10-10.json) zawiera hash prywatnego wyciągu.
Osobno kolektor 07:18:59 UTC nie uzyskał runtime; lokalna kontrola wykazała
zablokowany klucz, brak tożsamości agenta SSH i wpisów known_hosts app/ops.
SSH Codexa nadal jest opcjonalnym sposobem zbierania dowodów, z alternatywą
datowanego odczytu uprawnionego operatora/panelu. Nie obchodzimy tych kontroli.

G01/G02/G07/G08 PARTIAL, G03/G09 FAIL, G04/G05/G06 PASS wyłącznie dla przyjętych
decyzji, z uzupełnieniami kontraktu/polityki 10.10. TEST-01…07 NOT RUN.
F0_OPEN: wybór płatnej wersji, aktualny katalog i zielone CI nie są odbiorem F0.

## Role i odpowiedzialność

| Rola | Osoba / stan | Zakres i wymagany dowód przyjęcia |
|---|---|---|
| Właściciel monitoringu, koordynacja i publikacja F0 | Igor — wskazany 07.10 | Prowadzenie całości monitoringu i domykanie decyzji; przyjęcie roli nie zatwierdza automatycznie kontraktów ani następnego etapu. |
| Przygotowanie i techniczna weryfikacja F0 | Codex — zakres obecnego zadania | Dokumentacja, odczyty dostępnych źródeł i ocena dowodów; samodzielna praca bez zmian serwerów, migracji, wdrożeń, restore lub F1. |
| Runtime / infrastruktura | Igor — koordynacja; Bartosz — konieczny kontakt operatorski | Wcześniej wskazano Bartosza jako wykonawcę kopii/staging; dalsze czynności operatorskie uzgadnia Igor. Codex zbiera dostępne dowody i wskazuje braki; aktualny zakres nie pozwala na realizację serwerową. |
| Produkt / kontrakty | Igor — właściciel; wybór delegowany Codexowi 07.10 | Przyjęta konkretna wersja [contracts](contracts.md), G04 PASS dla decyzji; implementacja nieodebrana. |
| Dane / prywatność | Igor — właściciel; wybór delegowany Codexowi 07.10 | Przyjęta [data-policy](data-policy.md), G05 PASS dla decyzji; aktywne retencje, redakcja i dostęp wymagają odrębnych dowodów. |
| Budżet i warunki odbioru | Igor — właściciel; wybór delegowany Codexowi 07.10 | Przyjęty budżet i metoda, G06 PASS dla decyzji; bez pomiaru narzutu i bez całego odbioru F0. |
| Konta / koszty dostawców | Igor — właściciel; Codex — dostępne odczyty | Dowody produktów EU, aktywne limity, koszty i uprawnienia; deklaracja o braku płatnych planów nie zamyka G07. |
| Incydent / telefon | Igor — wybrany docelowy odbiorca; rzeczywisty routing i dyżur niezweryfikowane | Brak gwarantowanych godzin i zastępcy. Historyczny Bartosz best effort 08:00–22:00 nie staje się fallbackiem; G08 PARTIAL, TEST-06 NOT RUN. |
| Formalny odbiór F0 / przegląd kopii i staging | Igor — odbiór; Codex — przegląd dostępnych dowodów | Decyzja Igora po sprawdzeniu pełnych kryteriów. Faktyczna kompletność kopii i izolacja wymagają dowodów, których sam przegląd dokumentów nie dostarcza. |
| Migracje / wdrożenie / restore | Bartosz — kontakt operacyjny | Osobno upoważnione czynności poza F0, według obowiązujących instrukcji repo. Publikacja dokumentów nie autoryzuje ich wykonania. |

Przyjęcie roli zapisuje osobę, zakres, datę UTC, dostępność i zastępstwo lub
jawny brak zastępstwa. Nazwy kont, prywatne dane kontaktowe i loginy nie trafiają
do publicznego rejestru.

## Dziesięć decyzji F0

To bezpieczne streszczenia tematów z prywatnego inwentarza, uzupełnione
odpowiedziami z 07.10 i bieżącą dyspozycją z 10.10. Stany rozdzielają
uzgodnienie zakresu od wykonania;
opis wskazuje materiał do zatwierdzenia, nie polecenie wykonania.
Zlecona przez Igora publikacja bieżącego pakietu nie przesądza docelowej
organizacji odpowiedzialności i prywatnych dowodów.

| ID / bramka | Decyzja i konkretny materiał | Stan |
|---|---|---|
| D01 / G01–G02 | Publicznie uzgodniony wyciąg; pełne odczyty i surowe odpowiedzi poza gitem, przegląd przez Codex, odbiór przez Igora. | GRANICA I ORGANIZACJA BIEŻĄCEGO PAKIETU USTALONE przez Igora; dowody nadal pozostają prywatne. |
| D02 / G09 | Pełne kopie obu baz postgres i _supabase z globals/rolami oraz obu MinIO, 7/4/12, osobne repo/klucze, 00:30 UTC, comiesięczny izolowany restore. Sam pg_dump postgres nie obejmuje _supabase. BX11 HEL1 + restic za 3,20 EUR netto jest propozycją do osobnej zgody; lokalny cel bez abonamentu wymaga dowodów EU, łącznej pojemności i regularnych pełnych kopii. B2 odłożone. | ZAKRES KOPII PRZYJĘTY; zakup wstrzymany, lokalna gotowość nieudowodniona. G09 FAIL. |
| D03 / G03 | Kandydat: osobna VM Linux na posiadanym komputerze, punkt startowy 4 vCPU / 16 GiB / 160 GB. Aktualnie wolne 10,08 GiB RAM nie potwierdza gotowości. Własne DB/auth/kolejka/storage/klucze, KSeF TEST i Stripe test, dane syntetyczne; po kopiach, granica planistyczna 31.10. | KIERUNEK LOKALNY WYBRANY 10.10; wymaga zwolnienia RAM, pomiaru pełnego zestawu, uruchomienia i dowodu izolacji w osobno autoryzowanym zakresie. Zakupy chmurowe wstrzymane, wcześniejszy limit 45 EUR nie obowiązuje. G03 FAIL. |
| D04 / G01–G02 | Istniejący lokalny Redis/SRH na app-1, docelowo przypięte odczytane wersje/obrazy i osobny health; znaczenie `UPSTASH_*` bez zmiany. | POLITYKA PRZYJĘTA; odczyt 10.10 14:26 UTC: Redis 7.2.15 healthy, SRH działa bez skonfigurowanego healthchecka. Pozostała konfiguracja wymaga odbioru, G01/G02 PARTIAL. |
| D05 / G01–G02 | Dwa odrębne MinIO: aplikacja ops-1, Supabase db-1. Odczyt 10.10 potwierdza wersje binarek RELEASE.2025-09-07T16-13-09Z oraz RELEASE.2025-10-15T17-29-55Z i fizyczne zużycie odpowiednio 774 144 B / 139 264 B. Logiczne S3 COMPLETE: aplikacja 31 obiektów / 378 638 B, Supabase 0 / 0 B; po 1 buckecie, unversioned, brak delete markers. Wszystkie wersje zawierają bieżące i nie zwiększają tych sum. | POLITYKA PRZYJĘTA; nowe wersje/rozmiary są datowanym pomiarem, nie dowodem backupu. Mapowanie DB–obiekty i multipart uploads niezweryfikowane; MinIO aplikacji działa bez healthchecka, MinIO Supabase healthy; pozostałe obrazy/digesty i pokrycie pełną kopią wymagają właściwych dowodów, bez zmian istniejących identyfikatorów. |
| D06 / G02/G08 | Miesięczny przegląd, kontrolowane aktualizacje po kopii/staging, brak auto-upgrade; MFA i minimalny dostęp administracyjny, przegląd co 30 dni. | POLITYKA PRZYJĘTA; aktywna konfiguracja i gotowość osób wymagają dowodów. |
| D07 / G01/G04 | KSeF TEST w aplikacji produkcyjnej jest celowy na etapie przed startem; TEST → PROD pozostaje osobnym zadaniem go-live W15/S13. | INTENCJA ROZSTRZYGNIĘTA 07.10; bez przełączenia środowiska i bez odbioru całego G04. |
| D08 / G07 | Bieżący cel 10.10: Sentry EU Developer i PostHog EU Free, 0 USD nowych opłat, bez PAYG i płatnych rozszerzeń; pełna historia faktur we własnym chronionym audycie. Kuma i planowany Healthchecks bez nowych zmian; Datadog poza zakresem. | DARMOWY KIERUNEK PRZYJĘTY; zastępuje wcześniejszy Sentry Team, bez zmiany kont. Dowody aktywnych tier/retencji/quota/dostępu nadal niepełne. G07 PARTIAL. |
| D09 / G02/G06 | P0 pełne kopie; P1 staging i dowody dostępu/zasobów/monitorów; P2 kontrolowane utrzymanie systemu, usług, ACL i starszych ustawień. Instrumentacja F1 osobno. | PRIORYTETY PRZYJĘTE; nie wykonano zmian utrzymaniowych ani F1. |
| D10 / G08 | Bez dodatkowego upoważnienia współpracownika lub zastępcy; nowe tymczasowe dostępy maks. 24 h, role indywidualne i minimalne. | ZAKRES PRZYJĘTY; aktualne role do prywatnego odczytu, brak zastępcy pozostaje jawny. |

Dziesięć tematów operacyjnych nie zastępuje dowodów bramek. Kontrakty G04,
politykę G05 i budżet G06 przyjęto w ramach delegacji; realny dyżur/doręczenia
G08, pomiary infrastruktury, konta, staging i kopie nadal nie są odebrane.

## Dyżur i niezależny kanał

Odpowiedź z 07.10 wskazuje Bartosza jako odbiorcę alarmów krytycznych Slack
i Telegram oraz raportu email/Telegram o 06:00 Europe/Warsaw. Dostępność
08:00–22:00 Europe/Warsaw jest best effort, bez formalnego dyżuru i zastępcy.
Nie potwierdzono doręczeń, kanału niezależnego ani gwarantowanego coverage.
Po delegowanym wyborze opisanym powyżej G08 ma stan PARTIAL: przyjęte zasady,
niezweryfikowane wykonanie i jawne `coverage_gap`.

ACK potwierdza reakcję, nie naprawę. Resolve wymaga świeżego dowodu recovery;
no-data nie jest recovery. Kanał niezależny i główny mają osobne stany
ACK/expiry/resolve oraz procedurę uzgodnienia po awarii platformy.
**TEST-06 pozostaje NOT RUN**: fizyczne urządzenie, brak ACK, DND/blokada,
fallback i awaria głównego monitoringu nie były testowane.

Push → SMS → voice i Pushover nie są wybrane. Healthchecks Hobbyist jest
wybranym przyszłym watchdogiem w ograniczonym zakresie metadanych; nie opisuje
odebranej konfiguracji. Nowa decyzja określa docelowe kanały, lecz ich nie
przekierowuje. Niezależność, rzeczywisty lifecycle i doręczenia wymagają
dowodów. W F0 nie aktywowano kanałów ani nie wysłano alarmów.

## Zapis zatwierdzenia

Każda decyzja zawiera: ID, właściciela, datę UTC, wersję/commit materiału,
przyjęty zakres, wyjątki, dowód i zależny etap. Zmiana kontraktu, retencji,
regionu, budżetu lub odpowiedzialności otwiera właściwą decyzję ponownie.
Sam commit, przykład konfiguracji i udział w repo nie zatwierdzają polityki.

## Karta odpowiedzi i odbioru

Odpowiedzi można przekazać partiami. Zakres kopii/staging, intencję KSeF TEST,
deklarację planów i historyczny odbiór alarmów zapisano 07.10. Późniejsza
delegacja przyjmuje wybrane G04/G05/G06 i zasady G08, bez odbioru wykonania.
Pozostają dowody i przegląd ich kompletności, w tym realna gotowość G08.
Pozostałe decyzje domykają zastrzeżenia
runtime i kolejkę utrzymania. Ta kolejność jest propozycją organizacji pracy,
nie poleceniem wykonania zmian.

Każda odpowiedź powinna zawierać:

- **ID i rozstrzygnięcie:** przyjęte, odrzucone albo do wyjaśnienia, z konkretną
  treścią wyboru; sama odpowiedź „OK” bez zakresu nie zmienia bramki.
- **Kto i kiedy:** osoba podejmująca decyzję, data i czas UTC, źródło odpowiedzi.
- **Materiał:** commit/wersja dokumentu, przyjęte wartości, wyjątki i warunki.
- **Wykonanie i przegląd:** osoba przyjmująca zadanie, reviewer, termin lub
  jawny brak terminu; wskazanie osoby jest propozycją do jej przyjęcia.
- **Dowód:** prywatna referencja i bezpieczny publiczny wyciąg zgodny z D01;
  bez adresów, loginów, nazw zasobów, danych kontaktowych i sekretów.
- **Skutek:** powiązana bramka, zależny etap oraz osobny zakres czynności
  operacyjnych. Zgoda na rozwiązanie nie jest dowodem jego wykonania.

Nie dopisano fikcyjnych odpowiedzi ani dat akceptacji. Lista potrzebnych
odczytów i artefaktów jest w [planie odbioru](acceptance-plan.md#brakujące-dowody-do-odbioru).
Zamknięcie F0 wymaga osobnego zapisu odbioru wszystkich F0-G01–G09 ze źródłami
i datą, przez przyjętego odbiorcę. Publikacja kolejnego commita, zielone testy
kolektora i decyzja o późniejszych pracach nie zastępują tego zapisu.

## Przekazanie do drugiego chatu po F0

Po rzeczywistym odbiorze F0 Codex przygotuje na zlecenie Igora prompt dla
drugiego chatu: odbierający SHA/PR, karty dowodów i decyzje, przyjęty zakres
F1, ograniczenia oraz pierwszy dopuszczony krok. Nie tworzymy tu nowego
chatu ani nie rozpoczynamy F1. Dopóki F0_OPEN, prompt uruchamiający F1 nie
jest materiałem do wykonania; samo zamknięcie wyborów nie spełnia warunku.

## Pierwsza partia pytań do Bartosza — 07.10.2026

Nie wymagają znajomości wewnętrznych oznaczeń decyzji. Brak staging i pełnych
kopii, lokalizacje usług, dane dostępu oraz granica publikacji bieżącego
pakietu są już zapisane. **Odpowiedzi otrzymano 07.10 i zapisano
[powyżej](#decyzje-i-deklaracje-przekazane-07102026).** Poniżej pozostaje
historyczna treść pytań; nie prosimy ponownie o udzielone odpowiedzi:

1. Czy używanie KSeF TEST przez aplikację produkcyjną jest celowym wyborem?
   Chodzi o intencję konfiguracji z historycznego pomiaru, bez jej zmiany.
2. Kto przyjmie odpowiedzialność za pełne kopie bazy i plików, a kto sprawdzi
   ich kompletność? Jaką retencję i termin proponujesz Igorowi do zatwierdzenia?
   Obecne backupy dysku DB nie pokrywają całego wymaganego zakresu dowodowego.
3. Kto przyjmie przygotowanie osobnego stagingu i sprawdzenie jego izolacji?
   Jaki termin można zaproponować? Uzgodnienie odpowiedzialności nie uruchamia
   prac na serwerach w tej kontynuacji.
4. Czy możesz dostarczyć prywatny, datowany odczyt aktywnych planów i kosztów
   Sentry/PostHog oraz retencji Sentry i brakujących uprawnień produktów?
   Ceny publiczne i metadane już sprawdzono; API nie ujawniło aktywnych planów.
   Hasła, klucze prywatne i wartości tokenów nie są potrzebne w odpowiedzi.
5. Kto rzeczywiście odbiera alarmy, w jakich godzinach i czy ma zastępstwo?
   Kto ma przyjąć końcowy odbiór F0? Kontakt operacyjny nie oznacza dyżuru.

To pierwsza partia, nie zastępstwo całego rejestru. Kontrakty biznesowe,
politykę danych, budżet narzutu i zakres docelowych produktów zatwierdza Igor;
Codex przygotowuje materiał samodzielnie, ograniczając udział Bartosza do
koniecznych czynności operatorskich. Odpowiedzi domykają wskazane zakresy,
bez automatycznego przyjęcia pozostałych ról lub całego F0.
Pytania nie są poleceniami zmian serwerów, testu telefonu ani rozpoczęcia F1.
