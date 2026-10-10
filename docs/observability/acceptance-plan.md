# F0 — plan odbioru i status bramek

Pomiar runtime: 04.10.2026, 11:03–11:22 UTC, przekazany przez Igora.
Pomiar z 04.10 był wyłącznie odczytem. W tym oknie inna sesja wdrożyła produkcję;
końcowy odczyt web/worker z 11:21 UTC jest stanem zmierzonym, a nie dowodem
wdrożenia wykonanego przez F0. Źródła i bezpieczne ustalenia są w
[inwentarzu](runtime-inventory.md) oraz [wyciągu dowodów](evidence/f0-2026-10-04.json).
Surowe załączniki pozostają prywatne.

Aktualizacja 06.10.2026: [deklaracje przekazane przez Igora](runtime-inventory.md#deklaracje-przekazane-06102026)
podtrzymują brak staging, pełnego dumpa DB off-host i kopii MinIO, czyli **G03 i G09 FAIL**.
Osobno wykonano [odczyty API dostawców i próbę SSH](runtime-inventory.md#odczyty-dostawców-i-próba-ssh-06102026),
zapisane w [indeksie z 06.10](evidence/f0-2026-10-06.json). Runtime kontenerów
nie został odczytany; G02/G07 mają częściowe dowody, a plany i uprawnienia
do pozostałych produktów nadal są niezweryfikowane.

Aktualizacja 07.10.2026: [przekazane odpowiedzi Bartosza](#odpowiedzi-przekazane-07102026)
rozstrzygają intencję KSeF TEST i docelowe ustalenia kopii oraz staging.
Źródłem jest wiadomość Igora; nie jest to nowy pomiar ani pełny odbiór F0.

**F0 jest niezamknięty.** Staging i pełne kopie zapasowe są niezaliczone;
dowody runtime i produktów EU są niepełne. Na podstawie delegacji Igora
„Wybierz wszystko co uważasz za najlepsze” z 07.10 przyjęto konkretne
kontrakty, politykę danych i budżet; ich wdrożenie nie zostało odebrane.
Wybrano też cel kopii, staging, zakres narzędzi i zasady reakcji. Aktualne
wybory są w [ownership](ownership.md#wybory-na-podstawie-delegacji-igora--07102026)
oraz [indeksie decyzji](evidence/f0-decisions-2026-10-07.json). Igor jest właścicielem
monitoringu, koordynacji i odbiorcą F0; przyjęcie tej roli nie zalicza bramek.
Dokument jest samodzielnym planem.
TEST-01…TEST-07 poniżej są lokalnymi identyfikatorami przyszłych testów;
nie odsyłają do innych raportów.

**Aktualizacja 10.10 po zmianie budżetu:** darmowe Sentry Developer EU
i PostHog Free EU, staging na posiadanym komputerze jako kandydat oraz
rekomendowany osobny cel kopii BX11. [Aktualne warunki](ownership.md#darmowa-diagnostyka-i-tańsza-infrastruktura--10102026)
zastępują płatny kierunek. Igor odrzucił 73,19 EUR netto/mies. po wcześniejszym
wstrzymaniu zgody; nie traktować tej kwoty jako aktywnego upoważnienia.
G04/G05 obejmują kontrakt v1.2/politykę z 10.10, z priorytetem dashboardu
release i późniejszego agenta przygotowującego naprawy. Wykonanie i testy
nie są zaliczone. [Nowy indeks](evidence/f0-low-cost-2026-10-10.json) rozdziela
decyzje, odczyt lokalny i wcześniejsze dowody; F0 pozostaje otwarte.

**Nowy pomiar 10.10:** SSH do trzech hostów potwierdzone od 14:23 UTC,
wszystkie klucze ED25519 zgodne z odciskami przekazanymi przez Bartosza
z jego historycznego `known_hosts`.
Pełny klucz root nie zapewnia technicznego read-only; odczyt jest granicą
autoryzowanego zakresu. O 14:26 web/worker healthy na
`43091e725d845084e11ac73af32750ace349bc02`, Node 22.23.3; odczytano wydania
obu MinIO. Pomiar rozmiarów 14:27 i osobny breakdown DB
14:29:01.792858–14:29:02.064051 UTC mają własne wyniki, opisane w
[inwentarzu](runtime-inventory.md#odczyt-runtime-i-rozmiarów--10102026)
i [nowym indeksie](evidence/f0-runtime-size-2026-10-10.json). Kompletny listing
S3 o 14:32 UTC: MinIO aplikacji 31 obiektów / 378638 B, MinIO Supabase
0 obiektów / 0 B; oba buckety Unversioned. Wersje obejmują bieżące obiekty,
więc nie dodajemy ponownie ich bajtów. Nie pobierano treści ani nie badano
referencji DB → obiekty i multipart uploads. Zajętość źródeł i listing
nie są rozmiarem dumpów, atomowym snapshotem DB/S3 ani dowodem całej retencji.
G03/G09 nadal FAIL, F0_OPEN; bez kopii, zmian serwerów, migracji, wdrożeń,
restore lub F1. Wstrzymanie zakupów pozostaje bez zmian.

**Wcześniejsza dyspozycja 10.10:** Igor wybrał **„Tylko przygotowanie — bez
zakupu i zmian”** na propozycję zakupu do 5 EUR i konfiguracji kopii.
[Lokalny pakiet przygotowania](../runbooks/f0-backup-preparation.md) zawiera
[generator planu JSON](../../scripts/ops/prepare-backup-plan.mjs),
[kontrolę kontraktu manifestu](../../scripts/ops/check-backup-set.mjs) oraz
[przykłady](../../ops/observability/backup/). Nie wykonuje ani nie instaluje
kopii i nie zastępuje działającego jobu. Wynik kontroli manifestu sprawdza
zgłoszoną strukturę/warunki, bez dowodu autentyczności lub G09 PASS.
Późniejsza odpowiedź Igora wyraża gotowość wydania do 5 EUR miesięcznie,
jeśli rozwiąże to istotną lukę; nie precyzuje VAT ani nie zatwierdza konkretnego
zamówienia i zmian. Lokalizacja komputera w Polsce jest potwierdzoną deklaracją.
[Uzupełnienie](ownership.md#uzupełnienie-deklaracji-i-dostępu--10102026)
i [nowy indeks](evidence/f0-follow-up-2026-10-10.json) zapisują również odczyty
runtime/kont po 15:20 UTC i ówczesną deklarację braku dostępu Igora do paneli.
**F0_OPEN, G03/G09 FAIL** bez zmian; późniejszy odczyt PostHog opisano niżej.

**Późniejszy odczyt UI PostHog 10.10:** transkrypcja zapisana
16:07:03.4311488 UTC potwierdza właściwą organizację/projekt EU Cloud,
badge Free, wybrane quota i dostęp Igora jako Admin. 2FA jest wyłączone,
replay w panelu ON; nie zmieniono ustawień. [Indeks UI](evidence/f0-posthog-ui-2026-10-10.json)
rozdziela te dowody od źródła środowiska, SDK, kosztów i retencji wszystkich
produktów. Odczyt właściwego panelu Sentry i potwierdzenie indywidualnej
roli Igora pozostają do wykonania.
**G07/G08 PARTIAL, G03/G09 FAIL; G05 PASS wyłącznie dla decyzji, F0_OPEN.**

Statusy: `PASS` wymaga dowodu pełnego kryterium; `PARTIAL` to niepełny dowód;
`FAIL` stwierdzone niespełnienie; `BLOCKED` brak dostępu do sprawdzenia;
`PENDING` nierozstrzygnięta decyzja; `NOT RUN` niewykonany test. Operator
określił odczyt runtime jako „PASS z zastrzeżeniami”; w szerszych kryteriach
F0-G01/F0-G02 mapujemy go na PARTIAL. Nie zmieniamy warunku bramki po pomiarze.
Biblioteka, przykład konfiguracji i zdrowy HTTP nie są odbiorem funkcji.

## Karta wykonania brakujących prac F0 — 10.10.2026

**Przygotowany zakres, niewykonany.** Zakupy i czynności operacyjne są
wstrzymane. Obecne zlecenie obejmuje lokalny plan kopii, przykłady i kontrolę
kontraktu manifestu, bez zakupu, instalacji kopii lub VM, zmian serwerów,
bootstrapu baz lub F1. Wykonanie
wymaga dostępu i wznowienia odpowiedniego zakresu. Karta nie jest dowodem
wykonania. Igor koordynuje; Codex przygotowuje materiał i sprawdza dowody.
Bartosz nie jest automatycznym wykonawcą ani adresatem nowych zleceń.

1. **Dostęp i odczyt przed zmianami.** Dostęp do app-1, ops-1 i db-1
   zgodnie z prywatnym `infra.env` i zweryfikowanymi kluczami hostów;
   istniejący klucz wskazany przez `K`.
   `APP`, `OPS`, `DB`, `PGC`, `RESTC`, `APP_PREFIX`, `WORKER_PREFIX` pochodzą
   z tego pliku i odczytu; wartości pozostają poza Git. Dostęp i niezależną
   weryfikację kluczy hostów potwierdzono 10.10 od 14:23 UTC. Klucz ma pełne
   uprawnienia root; ograniczenie do odczytu jest umową zakresu pracy.
   Nie przesyłać hasła ani klucza do czatu. Alternatywa: datowany odczyt
   uprawnionego operatora. Przed osobno upoważnionym wykonaniem odświeżyć
   bieżące kontenery/obrazy, SHA, health, wersje, rozmiary źródeł i listing S3
   z pomiaru 10.10 oraz uzupełnić wolne miejsce, referencje dokumentów,
   multipart uploads i dostępność konfiguracji/kluczy odzyskiwania. Nazw z
   historycznego runbooka nie używać jako aktualnych parametrów wykonania.
2. **G09: pełne kopie; proponowany cel BX11 HEL1 (Finlandia, 1 TiB).** Trzy oddzielne
   repozytoria restic: pełna baza na db-1 wraz z wymaganymi globals/rolami;
   MinIO aplikacji na ops-1; MinIO Supabase na db-1. Dump bez filtrów
   schematów obejmuje m.in. auth, storage, pg-boss i historię migracji.
   Osobno opisać zabezpieczenie i odtwarzanie drugiej odczytanej bazy
   `_supabase`: `pg_dump postgres` jej nie zawiera. Manifest nie może
   przedstawiać dumpa jednej bazy jako kompletu obu baz.
   Szyfrowanie po stronie klienta, osobne minimalne poświadczenia oraz
   zaszyfrowany pakiet konfiguracji i kluczy odzyskiwania przechowywany
   niezależnie. Harmonogram 00:30 UTC, retencja 7 dziennych / 4 tygodniowe /
   12 miesięcznych. Pierwszy spójny zestaw wymaga kontrolowanego okna
   stabilizacji zapisów/usuwania; transakcja pg_dump nie obejmuje S3.
   Okno i wpływ na aplikację ustala się przed jego wykonaniem. Nie kasować
   danych źródłowych. Nie zaliczać sukcesu samego lokalnego dumpa. Alternatywą
   bez nowego abonamentu jest urządzenie Igora, zadeklarowane jako znajdujące się
   w Polsce: nadal wymaga dowodów dostępności w porze kopii, miejsca na pełną retencję
   i odseparowania kopii od VM stagingu. Rozmiary DB i fizyczne katalogi
   MinIO oraz kompletny listing obiektów/wersji mają nowy pomiar 10.10;
   przyrost, rozmiary archiwów i pokrycie referencji DB nadal wymagają dowodów.
   Wolny dysk nie dowodzi pojemności 7/4/12.
3. **Dowód G09.** Prywatny manifest wspólnego przebiegu: zakres, UTC,
   wersje, rozmiary i SHA-256 dumpa/globals, liczby i rozmiary obiektów obu
   MinIO, kompletność obiektów referowanych z DB, trzy snapshoty off-host,
   wynik odczytu/weryfikacji kopii i dostępność materiałów odzyskiwania
   z niezależnego klienta. Do tego harmonogram, reguły retencji oraz
   procedura izolowanego restore. Sygnał pełnego sukcesu dopiero po
   wszystkich elementach. TEST-07 restore pozostaje osobnym wykonaniem.
4. **G03 po pełnych kopiach: lokalna VM Linux na komputerze Igora.**
   Własna sieć, DB/auth, pg-boss, Redis/SRH, magazyny, web/worker, klucze
   i odbiorcy. Sprzęt jest kandydatem: około 32 GiB całkowitego RAM i
   około 642 GiB wolnego miejsca na drugim dysku, ale w odczycie 10.10
   dostępne tylko około 10 GiB RAM. Najpierw zwolnić pamięć i zmierzyć
   cały zestaw wraz z zapasem dla hosta; nie zaliczać G03 na podstawie
   samej specyfikacji komputera. Wyłącznie dane syntetyczne,
   KSeF TEST, Stripe test i kontrolowana wysyłka. Przygotowanie wymaga
   bootstrapu schematu pustej bazy **wyłącznie stagingu**, w tym DDL pg-boss,
   oraz uruchomienia web/workera. Nie wgrywać produkcyjnej DB ani kluczy.
   VM nie dostaje produkcyjnych sekretów ani repozytoriów kopii przez
   współdzielone katalogi. Wskazać okna dostępności; wyłączony komputer
   nie jest całodobowym stagingiem ani awarią produkcji. Dowód: datowany
   SHA/obrazy, działający web/worker, rozdzielenie zasobów i integracji,
   zmierzony zapas zasobów. Sam WSL lub dev server nie zalicza G03.
5. **G01/G02/G07/G08 i odbiór.** Zachować nowy datowany runtime 10.10,
   uzupełnić pozostałe kryteria pochodzenia obrazów, konfigurację
   sieci/Kuma/checków oraz rzeczywiste konto/plan/retencję/quota/uprawnienia.
   Dla podstawowego monitorowania F0 odczytać bieżący routing i potwierdzić
   docelowy odbiór przez Igora; brakujące ustawienia kanałów/checków wymagają
   objęcia zakresem operacyjnym. Nowej instrumentacji faktur i lifecycle
   alarmów nie implementować w tej karcie. Jawnie pozostawić brak
   gwarantowanego dyżuru i zastępstwa. Po komplecie dowodów Igor odbiera F0;
   dopiero wtedy powstaje prompt do osobnego chatu F1.

**Nowy plan kosztów:** narzędzia Sentry/PostHog 0 USD nowych abonamentów
w potwierdzonym darmowym zakresie; staging na posiadanym sprzęcie 0 EUR
nowego abonamentu. Rekomendowany BX11 to **3,20 EUR netto/mies.** według
odczytu katalogu z 10.10, bez zamówienia. Wariant kopii lokalnej może mieć
0 EUR nowego abonamentu po spełnieniu wskazanych warunków. Nie obejmuje to
istniejącej produkcji, prądu, łącza, ewentualnego sprzętu/licencji ani
pracy agenta AI. Budżet AI i nowy limit zakupów nie są ustalone. Nie
uruchamiać płatnego trial, PAYG, Sentry Team, CPX42 ani dodatkowego B2.
Historyczny pakiet 73,19 EUR był kosztem stagingu i kopii, nie dashboardu;
został odrzucony. Publiczna oferta nie dowodzi aktualnych kosztów konta.

**Przeszkoda w starej procedurze:** [backup-restore](../runbooks/backup-restore.md)
opisuje wcześniejsze rclone/14 dumpów i nie obejmuje pełnego wspólnego
zestawu obu MinIO. [db-backup.sh](../../scripts/hetzner/db-backup.sh) pomija
transport off-host przy pustym `RCLONE_REMOTE`, po czym może wysłać heartbeat
sukcesu. To wynik przeglądu kodu `686a465`, nie dowód aktualnego uruchomienia
na serwerze. Procedury nie można przyjąć bez dostosowania jako wykonania
G09; historyczny restore samej DB z 01.10 nie zalicza pełnego zestawu.
Produkcja nie otrzymuje w tej karcie migracji ani wdrożenia aplikacji;
restore i F1 pozostają poza zakresem.

## Bramki F0-G01–F0-G09

| ID | Warunek odbioru | Stan, źródło i ograniczenie |
|---|---|---|
| F0-G01 | Inwentarz env/usług ze źródłem, timestamp i punktem odczytu; rzeczywisty SHA web/worker, wersje i tożsamość obrazów; lokalizacja MinIO. | **PARTIAL.** Historyczny pomiar 04.10: web/worker healthy na `ae87bdde93a636fcb2c48aef737e57a80a3315a7` o 11:21 UTC. Osobny odczyt 10.10 o 14:26 UTC: web/worker healthy na `43091e725d845084e11ac73af32750ace349bc02`, Node 22.23.3, MinIO aplikacji na ops-1 wydanie 2025-09-07, MinIO Supabase na db-1 wydanie 2025-10-15. Redis na app-1: 7.2.15, healthy; SRH działa bez healthchecka. MinIO aplikacji działa bez healthchecka, MinIO Supabase healthy. Pełne pochodzenie obrazów i pozostałe kryteria inwentarza nadal wymagają dowodów. Lokalne image ID nie są digestami registry; nie tworzymy fikcyjnego digestu. |
| F0-G02 | Health/restart/startup, limity, routing, log rotation, zegary oraz zakres read-only dołączone do inventory; konfiguracja kontroli dostępu udokumentowana prywatnie. | **PARTIAL.** Pomiar zasobów i usług z 04.10 jest przekazany prywatnie. API Hetznera z 06.10 potwierdza reguły zapory i przypisanie do trzech hostów. SSH do wszystkich hostów i zgodność kluczy ED25519 potwierdzono 10.10 od 14:23 UTC; pełny klucz root nie jest technicznie read-only. Nowy health web/worker jest pojedynczym odczytem, nie ciągłością dyżuru. Routing/ACL, reguły systemowe, limity i niezależny monitoring nadal wymagają odbioru. Szczegóły dostępu pozostają prywatne. |
| F0-G03 | Działający staging z osobną DB/kolejką/storage i kluczami, syntetycznymi danymi, KSeF TEST, Stripe test oraz kontrolowanymi odbiorcami. Web i worker bez dostępu do produkcyjnych efektów. | **FAIL — staging nie istnieje.** Pomiar 04.10 i deklaracja 06.10 nie zostały zastąpione dowodem wykonania. W pierwotnej odpowiedzi z 07.10 wskazano Bartosza jako wykonawcę staging do 31.10.2026; obecnie koordynuje Igor, po pełnych kopiach i przed Closed Alpha, z oddzielnymi DB/kolejką/storage/kluczami, KSeF TEST i Stripe TEST. Termin i przyjęty zakres nie dowodzą działania ani izolacji; fault injection i aktywne PoC pozostają zablokowane. |
| F0-G04 | Zatwierdzone wyniki, korelacja, deadline, kwalifikacja populacji i klasy plików z [contracts](contracts.md). | **PASS — przyjęcie kontraktu na podstawie delegacji Igora 07.10, uzupełnienie v1.2 z 10.10.** Wybrana wersja rozstrzyga populację, terminy, klasy wejścia, różnice C-22, pełną historię zarejestrowanych błędów faktur i priorytet dashboardu release z późniejszym przygotowaniem napraw przez agenta. Nie zalicza implementacji ani TEST-01/TEST-02, które pozostają NOT RUN. |
| F0-G05 | Zatwierdzone klasy danych, retencja, audit/source maps/holds/delete, tenant_ref, consent i uprawnienia z [data-policy](data-policy.md). | **PASS — przyjęcie polityki na podstawie delegacji Igora 07.10, uzupełnienie z 10.10.** Zasady obejmują kopie 7/4/12 oraz minimalny wpis każdego błędu w audycie faktury i ograniczony odczyt diagnostyki przez agenta. Aktywna konfiguracja, możliwości kont, zgodność eksportu i TEST-04 nie są zaliczone; TEST-04 NOT RUN. Nie uruchomiono nowego eksportu. |
| F0-G06 | Przyjęty budżet narzutu, limity zasobów i metoda OFF/ON; baseline i klasy obciążenia określone. | **PASS — przyjęcie budżetu i metody na podstawie delegacji Igora 07.10.** Runtime ma nowy pomiar 10.10; konkretne obrazy/limity i warunki przyszłego porównania wymagają pozostałych dowodów G01/G02 oraz gotowego stagingu. Odczyt nie upoważnia testu obciążenia. Baseline i TEST-05 pozostają NOT RUN. |
| F0-G07 | Dowód regionu istniejących usług oraz, osobno, rzeczywistego konta docelowego, planów/produktów, retencji/ingest/API, kosztów i uprawnień. | **PARTIAL.** Metadane EU/API 06.10 i historyczna deklaracja braku płatnych planów są częściowymi dowodami. Aktualny cel po odrzuceniu kosztownego wariantu 10.10: Sentry Developer EU, PostHog EU Free, Kuma i planowany Healthchecks; Datadog poza zakresem. Budżet nowych abonamentów diagnostycznych 0 USD. UI PostHog 10.10 potwierdziło właściwą organizację/projekt EU Cloud, badge Free, wybrane quota, replay 30d i indywidualny dostęp Igora jako Admin; 2FA disabled. Liczniki billing nie dowodzą źródła środowiska lub SDK, a „no spend data” nie dowodzi zerowej faktury. PAYG i pozostałe retencje/limity wymagają potwierdzenia; odczyt właściwego panelu Sentry pozostaje do wykonania. Wcześniejsze billing 403 wskazuje na wymaganą flagę API produktu; nie dowodzi zbyt wąskiego tokena. Role tożsamości API pozostają osobnym dowodem. Nie przypisywać Free uprawnień Team ani aktywnego PostHog Error Tracking na podstawie publicznego cennika. Publiczna oferta i katalog cen nie zastępują dowodów kont/usług ani zakupu. |
| F0-G08 | Przyjęte role, realny dyżurny, godziny i coverage gaps; odbiorca oraz okno testu telefonu; decyzja o niezależnym lifecycle alarmu. | **PARTIAL — decyzje przyjęte, realna gotowość i routing niezweryfikowane.** Igor wybrany jako główny docelowy odbiorca; Docelowo wybrano Telegram/email dla krytycznych i raport 06:00 Europe/Warsaw, lecz obecny kod krytycznych używa Slack/Telegram; email jest w raporcie dziennym. Rozbieżność i faktyczne przekierowanie do Igora pozostają otwarte. Brak gwarantowanych godzin reakcji i zastępcy pozostaje jawny. Lifecycle, watchdog i okno przyszłego testu zapisano w ownership, bez konfiguracji kont lub potwierdzonego dyżuru. Historyczny Bartosz 08:00–22:00 best effort nie staje się fallbackiem. TEST-06 NOT RUN. |
| F0-G09 | Pełna kopia bazy i wymaganych obiektów poza hostem źródłowym; harmonogram, ostatni artifact/hash, retencja i procedura izolowanego restore obejmująca auth/storage oraz stan operacji. | **FAIL.** Pomiar 04.10 i deklaracja 06.10 wskazują brak pełnego pg_dump off-host i kopii MinIO aplikacji. Odpowiedź przekazana 07.10 przyjmuje docelowo codzienny dump całej DB, w tym auth/storage, kopie obu MinIO, szyfrowany zewnętrzny cel EU poza hostami źródłowymi, retencję 7 dziennych / 4 tygodniowe / 12 miesięcznych i comiesięczny test restore; wcześniej wskazano Bartosza jako wykonawcę, obecnie koordynuje Igor. Nie ma nowego dowodu wykonania. Siedem obrazów backupu dysku DB odczytanych 06.10 nie dowodzi pełnego zakresu, spójności ani restore. TEST-07 NOT RUN. |

Wyjście F0 wymaga wszystkich bramek oraz zamknięcia zastrzeżeń potrzebnych do
następnego etapu. Zapis dokumentów i publikacja kolektora nie zmieniają statusu
na COMPLETE. Samodzielne planowanie pozostaje możliwe; F1 i czynności operacyjne
wymagają osobnego uzgodnienia zakresu po rozstrzygnięciu blokad.

## Odpowiedzi przekazane 07.10.2026

Źródło: wiadomość Igora z 07.10.2026 przekazująca odpowiedzi przypisane
Bartoszowi oraz późniejsze doprecyzowanie Igora dotyczące strefy godzin.
Zapisujemy przyjęty docelowy zakres i deklaracje, osobno od wykonania.
Nie uzyskano niezależnego odczytu wdrożenia ani formalnego odbioru całego F0.
Najnowsza wiadomość Igora przypisuje mu monitoring, koordynację i odbiór F0.
Codex przygotowuje dokumentację, zbiera i przegląda dostępne dowody w
autoryzowanym zakresie; Bartosz jest potrzebny do koniecznych czynności
operatorskich. Nie zleca się mu automatycznie nowych pytań ani zadań.

- **KSeF:** TEST jest celowym wyborem; według przekazanej odpowiedzi produkt
  jest przed startem i nie ma prawdziwych klientów. Przełączenie na PROD
  pozostaje osobnym zadaniem go-live: punkt F1 (W15/S13) w
  [Bloku F planu](../koordynacja/PLAN-ZERO-ZGUBIONYCH-FAKTUR.md#blok-f--go-live-m4-m8).
  Ten identyfikator jest odrębny od F1 obserwowalności; nie rozpoczęto
  żadnego z tych zakresów. Potwierdzenie intencji nie przyjmuje całego G04.
- **Pełne kopie:** we wcześniejszej odpowiedzi wskazano Bartosza jako wykonawcę; obecnie koordynuje Igor. Docelowo codzienny
  pg_dump całej DB, w tym auth/storage, oraz kopie obu MinIO: aplikacji
  i Supabase. Szyfrowany zewnętrzny cel w EU, poza hostami źródłowymi;
  retencja 7 dziennych / 4 tygodniowe / 12 miesięcznych, comiesięczny test
  restore. To wcześniejszy zadeklarowany zakres przyszłych czynności
  operatorskich Bartosza, koordynowany przez Igora. Codex przegląda dostępne
  dowody; dowody pierwszego sukcesu i wykonania restore pozostają nieprzekazane.
  G09 FAIL, TEST-07 NOT RUN.
- **Staging:** wcześniej wskazano Bartosza jako wykonawcę; koordynuje Igor. Termin 31.10.2026, po pełnych kopiach
  i przed Closed Alpha. Osobne DB, kolejka, storage i klucze; KSeF TEST
  oraz Stripe TEST. Utworzenie i izolacja nie zostały wykazane; G03 FAIL.
- **Sentry/PostHog:** zadeklarowano brak płatnych planów. Nie wybieramy
  na tej podstawie nazwy planu Free ani kosztu 0; metadane z 06.10 są osobnym
  dowodem. Brakujące retencje, koszty i uprawnienia utrzymują G07 PARTIAL.
- **Alarmy i raport:** zadeklarowano Slack/Telegram dla krytycznych oraz
  email/Telegram dla codziennego raportu o 06:00. Bartosz odbiera w godzinach
  08:00–22:00 w miarę możliwości, bez formalnego dyżuru i zastępcy — to
  wcześniejsza deklaracja. Igor doprecyzował strefę obu godzin jako
  Europe/Warsaw, a następnie przyjął monitoring, koordynację i odbiór F0.
  Nie przenosimy wcześniejszych godzin na formalny dyżur Igora. Nie ma
  gwarantowanego coverage ani dowodu działania kanałów/lifecycle.
  Na etapie tych odpowiedzi, przed późniejszą delegacją: G08 PENDING,
  TEST-06 NOT RUN; odbiór F0 nie został dokonany.

W tej kontynuacji zapisano ustalenia; nie wykonano zmian serwerów,
konfiguracji kont, wdrożeń, migracji, alertów ani restore. Przyjęty termin
i retencja nie zastępują artefaktów i odbioru. Na etapie pierwszych odpowiedzi
G04/G06 były PENDING, G05 otwarte poza polityką kopii. Późniejsza delegacja
przyjmuje ich pełne wybrane wartości, zgodnie z aktualną tabelą bramek.

## Odczyty uzupełniające 06.10.2026

Źródła i granice: [inwentarz](runtime-inventory.md#odczyty-dostawców-i-próba-ssh-06102026)
oraz [bezpieczny indeks](evidence/f0-2026-10-06.json). Są to nowe odczyty API,
osobne od deklaracji użytkownika i historycznego runtime z 04.10.

- Hetzner, 20:48:15–20:49:14 UTC: trzy VM running w DE; siedem dostępnych
  obrazów backupu dysku DB, najnowszy z 2026-10-06T02:43:59Z. Dla app/ops
  funkcja backupu Cloud jest wyłączona, a API zwróciło zero obrazów backupu.
  Nie przesądza to o wszystkich innych mechanizmach kopii.
- Hetzner, 20:54:29 UTC: pełne reguły zapory i przypisanie do trzech hostów
  odczytane; szczegóły prywatne. Nie jest to test rzeczywistego ruchu.
- Sentry/PostHog, 20:49:23–20:49:55 UTC: GET 200 dla metadanych EU.
  Sentry nie ujawnił w tych odpowiedziach planu ani retencji. PostHog
  zwrócił projektowe replay opt-in=true, heatmaps=true i retencję replay
  30 dni; organizacyjne retencje analytics/feature flags/surveys 1 rok,
  replay 1 miesiąc, limit alertów 5 i error-tracking destinations 2.
  Zakresy tych pól są oddzielne; nie wyznaczają same efektywnej retencji
  ani wszystkich uprawnień planu. Billing PostHog: 403, przyczyna nieustalona.
- Kolektor, 20:45:46.237 UTC: runtime trzech hostów unverified. Wskazany
  klucz SSH jest lokalnie zaszyfrowany i nieodblokowany, a dla części hostów
  brakuje zaufanych kluczy hosta. Nie uzyskano bieżącego SHA/health ani wersji
  Node/MinIO; brak odczytu nie jest dowodem braku usług.

Konfiguracja replay/heatmaps nie dowodzi faktycznego nagrywania przez SDK
ani przyjęcia consent/polityki danych. Lokalizacja metadanych lub intake EU
nie dowodzi wszystkich miejsc przetwarzania. Odczyty nie zmieniły serwerów
ani ustawień dostawców i nie rozpoczęły F1.

## Brakujące dowody do odbioru

Przegląd dokumentacji i przekazane odpowiedzi nie są nowym pomiarem serwerów.
Poniższa lista precyzuje materiał potrzebny według istniejących warunków
bramek; nie obniża kryteriów. Wcześniejsze odpowiedzi z 07.10 wskazują
Bartosza dla przyszłych czynności operatorskich pełnych kopii i staging.
Monitoring i koordynację prowadzi Igor, który jest też odbiorcą F0; Codex
przegląda dowody w dostępnym zakresie zgodnie z [ownership](ownership.md).
Role same nie zastępują przyjęcia wartości G04/G05/G06 ani pełnego odbioru
i nie tworzą formalnego dyżuru. Późniejsza delegacja Igora domknęła wybory
opisane poniżej jako przyjęte; pozostałe punkty nadal wymagają pomiarów.
Dowody kont/planu zbieramy samodzielnie
w granicach dostępnego, autoryzowanego odczytu.

- **G01 — runtime:** SHA/health web i worker, Node oraz wydania obu MinIO
  mają osobny pomiar 10.10. Pozostają pozostałe kryteria inwentarza i prywatne
  powiązanie procesów, SHA oraz obrazów. Przy lokalnym buildzie brak registry
  digestu zapisujemy jako ograniczenie pochodzenia, bez tworzenia fikcyjnego
  digestu. Nowy odczyt ma własne okno i release, nie zastępuje pomiaru 04.10.
- **G02 — infrastruktura i monitoring:** odczyt reguł Hetznera i ich
  przypisania z 06.10 jest wykonany, ze szczegółami zachowanymi prywatnie.
  Pozostają przegląd kompletności routingu/ACL i reguł systemowych oraz
  konfiguracja monitorów Uptime Kuma i niezależnych checków: zakres,
  interwał, warunek awarii, świeżość, kanał i luki. Publicznie tylko wynik
  i bezpieczna referencja. Brak dowodu nie oznacza braku konfiguracji.
- **G03 — staging:** dowód istniejących i działających web/worker oraz
  oddzielnej DB, kolejek, storage, kluczy i odbiorców; syntetyczne dane,
  KSeF TEST i Stripe test. Operator wykazuje izolację od produkcyjnych
  efektów. Utworzenie środowiska jest osobnym zadaniem; YAML i puste
  `security-staging` nadal nie zaliczają bramki.
  Brak staging pozostaje niezależny od przyjętego 07.10 terminu 31.10.2026
  i zakresu Bartosza. Dowód wykonania oraz izolacji nadal jest potrzebny;
  nie żądamy odczytu nieistniejącego środowiska jako sposobu zaliczenia G03.
- **G04 — kontrakty, wybór domknięty:** konkretna wersja wyników, korelacji,
  populacji, deadline, klas plików i terminów Flo/cron oraz rozdzielenie SLI
  C-22 są przyjęte w [contracts](contracts.md). Źródło delegacji i wersja
  materiału w indeksie decyzji. Implementacja i TEST-01/02 nie są zaliczone.
- **G05 — dane, wybór domknięty:** przyjęto klasy, audit/source maps,
  hold/delete, tenant_ref, consent/RBAC oraz limity. Nie uruchomiono nowego
  eksportu. Aktywne retencje/uprawnienia kont są brakującym dowodem G07;
  redakcja i zgodność wdrożonego SDK mają przyszły TEST-04. Replay/heatmaps
  odczytane w panelu nie dowodzą nagrywania ani skutecznego wyłączenia.
- **G06 — narzut, wybór domknięty:** przyjęte wartości i klasy obciążenia,
  metoda OFF/ON oraz plan baseline poniżej. Obrazy i limity do porównania
  wymagają pozostałych dowodów G01/G02; nowy SHA/health i wersje z 10.10
  nie zastępują pełnego pochodzenia obrazów i limitów. Wykonanie TEST-05
  następuje w osobnym odbiorze.
- **G07 — konta i produkty:** datowany prywatny odczyt rzeczywistego konta,
  organizacji, regionów, aktywnych planów i wymaganych produktów; retencje,
  limity ingest/API, koszty i uprawnienia. Sentry/PostHog i wybrany zewnętrzny
  watchdog mają osobne dowody. Datadog wyłączono jawnie z obecnego zakresu
  na podstawie delegacji Igora; historycznie jego produkty pozostają
  niezweryfikowane, bez przypisywania PASS. Publiczna oferta nie dowodzi
  uprawnień konkretnego konta. Odczyt metadanych z 06.10 dostarcza części
  dowodów kont/regionu i ustawień; nadal potrzebne są plan/koszty, retencja
  Sentry i brakujące uprawnienia. Deklarację braku płatnych planów z 07.10
  już zapisano; nie potwierdza konkretnego tier, zerowego kosztu ani wszystkich
  uprawnień. Billing 403 nie rozstrzyga przyczyny odmowy. Nowy zakres nie
  zastępuje dowodów kont i nie ustanawia płatnej subskrypcji.
- **G08 — role i alarmy:** właścicielem monitoringu, koordynacji i odbiorcą
  F0 jest Igor; Codex przegląda dostępne dowody. Wcześniejsze odbieranie
  przez Bartosza 08:00–22:00 Europe/Warsaw było zadeklarowane w miarę możliwości,
  bez formalnego dyżuru i zastępcy; raport o 06:00 Europe/Warsaw. Pozostają
  dowód konfiguracji i realnego coverage. Docelowy odbiorca Igor, okno
  przyszłego TEST-06 i lifecycle ACK/expiry/recovery są wybrane w ownership;
  nie ustanawiają realnego dyżuru ani potwierdzonych doręczeń. Prywatne dane
  kontaktowe zostają poza repo.
  Test telefonu nadal NOT RUN; przyjęcie roli nie dokonuje odbioru F0.
- **G09 — backup:** dowód rzeczywistej pełnej kopii DB poza hostem źródłowym
  i kopii wymaganych obiektów; ostatni sukces UTC, artefakt/hash, zakres,
  harmonogram i przyjęta retencja. Manifest ma wyjaśniać pokrycie ról/auth,
  danych aplikacji, stanu operacji i powiązań storage, rozróżniając MinIO
  aplikacji oraz Supabase Storage. Dołączona procedura izolowanego restore
  obejmuje ACL i blokadę produkcyjnych efektów. Snapshot `public` i sam
  plan transportu off-host nie wystarczają. Obrazy backupu Hetznera są
  odczytane 06.10: siedem dla DB, zero dla app/ops. Ich metadane nie dowodzą
  spójności pełnej bazy, pokrycia MinIO ani restore.
  Docelowa polityka przekazana 07.10 obejmuje pełny dump DB, w tym
  auth/storage, obie instalacje MinIO, szyfrowany cel EU poza hostami
  źródłowymi, 7 kopii dziennych / 4 tygodniowe / 12 miesięcznych oraz
  comiesięczny test restore; koordynuje Igor, wcześniej wskazano Bartosza jako wykonawcę. Brak nowego dowodu wykonania
  utrzymuje G09 FAIL. Metadane obrazów i przyjęty plan nie zaliczają G09;
  uruchomienie pełnych kopii i odbiór ich zakresu wymagają osobnego zadania.

Karta dowodu zawiera bramkę, rodzaj źródła (**pomiar**, **decyzja** lub
**deklaracja**), wykonawcę/reviewera, UTC odczytu, środowisko i wersję materiału,
oczekiwany zakres, wynik, ograniczenia oraz prywatną referencję z bezpiecznym
wyciągiem. Status zmienia się dopiero po sprawdzeniu pełnego kryterium.
Historyczny JSON z 04.10 pozostaje zapisem historycznego pomiaru.

## Granica odbioru F0 i późniejszych testów

Warunki wyjścia F0 są w tabeli F0-G01–G09. G04/G05/G06/G08 wymagają przyjętych
decyzji i przygotowania odbioru; TEST-01…TEST-06 weryfikują późniejszą
implementację. Ich NOT RUN nie oznacza akceptacji ani nie uzasadnia
rozpoczynania F1 dla domknięcia dokumentacji. Czternaście dni baseline jest
warunkiem kalibracji SLO, nie automatycznym warunkiem zakończenia samego F0.

G09 wymaga istniejących kopii i procedury restore. Wykonanie TEST-07 jest
osobną czynnością; w tej kontynuacji obowiązuje zakaz restore. Jeżeli odbiorca
wymaga wyniku TEST-07 przed akceptacją F0, zapisuje to jako dodatkowy otwarty
warunek do osobno upoważnionego wykonania. Nie oznaczamy testu jako PASS.
F1 może rozpocząć się dopiero po jawnym odbiorze F0 i uzgodnieniu jego zakresu.

## Wybrany budżet instrumentacji — F0-G06

Wartości przyjęte w ramach delegacji Igora 07.10, bez gwarancji i bez wykonanego testu. Mierzyć te
same obrazy, limity i syntetyczną populację, oddzielnie web, worker i collector.
Porównać OFF/ON po warm-up w co najmniej trzech porównywalnych przebiegach na
idle, normal i peak. Kontrola liczby operacji/outcomes zapobiega pozornej
poprawie przez pomijanie pracy. p95/p99 wymagają próbki, nie średniej percentyli.

| Efekt / zasób | Wybrany limit i metoda |
|---|---|
| CPU aplikacji | Przyrost CPU-sekund na tę samą zakończoną pracę ≤5% przy normal/peak; także core-seconds i narzut idle, bez dzielenia przez bliską zeru bazę. |
| RAM aplikacji | Przyrost szczytowego RSS ≤128 MiB na web/worker; łączny RSS ≤80% rzeczywistego limitu kontenera. Heap/RSS/OOM osobno. |
| Latency CRUD | Przyrost p95 ≤większa z 5% baseline lub 25 ms; p99 ≤większa z 10% lub 50 ms. Upload/stream osobno. |
| Job execution | Przyrost p95 ≤większa z 5% lub 100 ms; queue wait osobno. Deadline kontraktowe nadal obowiązują. |
| Agent/Collector | Maks. 0,25 CPU i 256 MiB RSS na host, mieszczące się w wolnych zasobach po G02; gdy brak zapasu, nie uruchamiać collectora bez nowego zakresu/odbioru. Osobny limit od aplikacji. |
| Bufor intake | Cel 30 min przy zmierzonym peak bytes/s ×1,5, ale twardy limit 64 MiB RAM i 256 MiB dysku/host, wiek 30 min. Jeśli wyliczony bufor przekracza limit, jawnie raportować krótsze pokrycie i uzgodnić zmianę przed wdrożeniem. Required journal/audit poza buforem; refused/drop/lag osobno. |
| Wynik domenowy | Zero dodatkowych podwójnych efektów, błędów domenowych, OOM i synchronicznej zależności od SaaS; spadek coverage nie poprawia wyniku testu. |

Jeżeli rzeczywiste zasoby nie mieszczą celu, zmienić i zatwierdzić budżet przed
testem. Profilowanie wymaga osobnego OFF/ON i odbioru.

Wybrane klasy syntetycznego obciążenia do przyszłego pomiaru: **idle** bez
operacji, **normal** 1 request/s i 1 przyjęty job/min, **peak** 5 request/s i
10 przyjętych jobów/min; po 10 syntetycznych tenantów. Każda aktywna rodzina
kontraktów ma tę samą mieszankę operacji i klas plików w OFF/ON. Zależności
zewnętrzne są sandboxem lub kontrolowanym stubem; to ograniczenie pomiaru,
nie odczyt produkcji. Warm-up 5 min, okno co najmniej 30 min i trzy
porównywalne przebiegi na profil/stan. Dla p95/p99 wymagane co najmniej 1000
próbek danej klasy; przy mniejszej liczbie przedłużyć zbieranie lub pozostawić
wynik niezaliczony, bez zastępowania średnią. To startowe profile prelaunch,
nie przewidywanie rzeczywistego ruchu. Wszystkie obrazy, SHA i limity są
odczytane z przyjętego G01/G02 przed testem; brak tych danych blokuje test.

## Kolejność przyszłego odbioru

1. Rozstrzygnąć decyzje F0 i potwierdzić izolację staging. Dane wyłącznie
   syntetyczne, NIP `1234567890`; bez kopii dokumentów produkcyjnych.
2. Po zgodzie na następny etap: TEST-01 request/job/error w rzeczywistych
   obrazach, jeden provider spanów i source map zgodny z SHA.
3. TEST-02…TEST-05: korelacja, integracje, redakcja i narzut; każda rodzina
   kontraktu ma happy path, partial/failure, retry/replay i brak postępu.
4. Po potwierdzeniu obecności Igora i konkretnego okna: TEST-06 fizycznego
   telefonu i niezależnego kanału.
   TEST-07 izolowanego restore wymaga pełnego backupu. Co najmniej 14 dni
   reprezentatywnego baseline przed kalibracją SLO; czas bez ruchu nie wystarcza.

Awaria KSeF/Stripe w testach pochodzi z mocka lub sandboxa. Unknown po możliwym
efekcie wymaga uzgodnienia; alarm nie wykonuje replay/refund. Powyższy plan
nie jest poleceniem migracji, wdrożenia, wysłania realnego alertu ani restore.

## Rejestr testów — wszystkie NOT RUN

| ID | Scenariusze | Wymagany rezultat |
|---|---|---|
| TEST-01 — runtime/SDK | Request, pg-boss, startup/error/source maps i różne wersje web/worker. | Jeden provider, brak podwójnych spanów, działające source maps i jawny rzeczywisty SHA każdego procesu. |
| TEST-02 — wynik/korelacja | Stabilna intencja, retry/redelivery, odrzucenie nieobsługiwanego envelope, dedup/outbox, partial/unknown, deadline i historia bez trace. | Populacja nie rośnie przez replay, brak podwójnego efektu; outcome zgodny z domeną. |
| TEST-03 — integracje | PostgREST/pg, normalized SQL, exportery i harmonogramy. | Jawny zakres korelacji i luk; query error nie staje się zerem, brak postępu jest widoczny. |
| TEST-04 — prywatność/RBAC | Canary w stdout/log/trace/error/SQL/RUM/alert/AI; tenant A/B i anon; dowód produktów i planów. | Zakazane dane nie są wysyłane, izolacja działa, uprawnienia i entitlements potwierdzone. |
| TEST-05 — narzut/utrata | OFF/ON, bounded buffer, awaria intake i błąd auth. | Przyjęty budżet zachowany; lag/refused/drop jawne; błąd auth odróżniony od no-data. |
| TEST-06 — telefon | Fizyczne urządzenie, ACK/expiry/recovery, brak ACK, DND/blokada, fallback i awaria głównego monitoringu. | Odbiór i realny lifecycle potwierdzone; no-data nie jest recovery, coverage gap nie jest ukryty. |
| TEST-07 — restore | Pełna kopia bazy/storage na izolowany cel, role/auth i stan operacji; odtworzenie bez zewnętrznych efektów. | Dane i referencje spójne, RLS/dedup działają, brak produkcyjnych maili/płatności/KSeF i powtórzenia efektów. |

Uzupełnienie scenariuszy 10.10 dla późniejszej implementacji: TEST-02 obejmuje
błąd przed POST, kilka retry, sukces po błędzie i nadal otwartą operację;
dashboard pokazuje wszystkie minimalne wpisy bez ich nadpisania, zakres dat,
pokrycie i braki także po utracie telemetrycznego zdarzenia. TEST-04 sprawdza
osobną tożsamość agenta, brak dostępu do innych tenantów/dokumentów/sekretów,
odrzucenie mutacji, audyt odczytów i ignorowanie instrukcji w treści błędu.
To kryteria **NOT RUN**, bez podłączenia agenta lub rozpoczęcia F1.

Karta wykonania zawiera: ID, wykonawcę/reviewera, env/KSeF env, SHA web/worker,
rewizję konfiguracji i obrazy, UTC start/stop, izolację, dane syntetyczne,
oczekiwany/obserwowany wynik, źródło, bezpieczne dowody, status, cleanup/rollback
i zamknięcie testowego incydentu. Publiczna karta nie zawiera danych prywatnych.
PASS odnosi się wyłącznie do konkretnej karty i zakresu.
