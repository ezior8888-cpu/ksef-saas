# F0 — karty przygotowania i granica wykonania

**PREPARATION_ONLY, F0_OPEN, G03/G09 FAIL.** Karty porządkują pozostałe prace
lokalne i przyszłe działania wymagające osobnego zakresu. Nie zatwierdzają
zakupu, zmian serwerów lub kont, kopii, restore, stagingu, migracji, deploy,
merge, wysłania alarmów ani F1. Nie wykonano opisanych tu operacji.

Podstawą są [bramki F0](acceptance-plan.md), [role i decyzje](ownership.md),
[kontrakty](contracts.md) oraz [polityka danych](data-policy.md).
G04/G05/G06 są przyjętymi decyzjami; nie wymagają dopisywania instrumentacji,
dashboardu lub agenta w tym przygotowaniu. TEST-01–06 nadal dotyczą
późniejszego odbioru implementacji, a TEST-07 wymaga osobnego zakresu restore.
Pełne kryteria F0 pozostają bez zmian.

## Skończona lista przygotowania

1. Sprawdzony lokalnie adapter wznowienia, powiązany z konkretnym planem
   własnych zmian i dowodami wszystkich kontrolowanych writerów.
2. Kompletne kontrakty i testy dostawców preflight, dowodów spójności,
   recovery i sygnału; prywatne powiązania pozostają niezweryfikowane do
   osobno dozwolonego sprawdzenia.
3. [Plan pełnego restore](../runbooks/f0-full-restore-plan.md) obejmujący
   obie bazy, oba magazyny, odzyskiwanie konfiguracji i izolację efektów.
4. Karta zależności i izolacji stagingu poniżej, bez utworzenia środowiska.
5. Karta podstawowych monitorów i przyszłego testu telefonu, bez konfiguracji
   kanałów, instrumentacji nowego lifecycle lub wysyłki.
6. Lista dowodów prywatności, kont i dostępu oraz zakres lokalnej weryfikacji.
7. Przegląd aktualnego diff, linków i właściwych testów; zapis wersji,
   ograniczeń oraz pozostających blokad wykonania.

Ta lista ogranicza zakres przygotowania; nie otwiera kolejnego ogólnego
audytu. Każdy znaleziony brak musi wskazywać niespełniony warunek jednej
z kart. Dokumenty przygotowano, lecz **całe przygotowanie nie jest uznane
za zakończone**: nadal potrzebny jest potwierdzony komplet konkretnych
dostawców operacji, ich testów i prywatnych wejść. Same callbacki, poprawny
JSON lub syntetyczna fixture nie są konfiguracją operacyjną.

## Pola prywatnej karty wykonania

Przed prośbą o wykonanie karta wskazuje: ID i bramkę; dokładny zakres
osobnego upoważnienia; operatora, reviewera i właściciela rozstrzygnięcia
błędu; rewizję kodu/konfiguracji; wejścia oraz sposób weryfikacji ich
pochodzenia; konkretny dostawca każdej operacji; UTC, timeout i warunki STOP;
oczekiwany dowód; stan danych/usług po błędzie i warunek kolejnej próby.

Nie wpisywać `true` zamiast odwołania do sprawdzonego dowodu. Odróżniać
`NOT_RUN`, brak danych, niespełnienie warunku i ograniczenie uprawnień.
Stan kopii, stan zapisów oraz stan locka to osobne wyniki. Do repo nie
trafiają prywatne adresy, zasoby, kontakty, konfiguracje, pomiary ani ich
pochodne; karta publiczna opisuje metodę i jawnie nieustalone pola.

## Karta A — wykonawca i pierwszy pełny zestaw

**Lokalnie:** przygotować zamknięte kontrakty, testy syntetyczne i odrzucanie
braków dla [wiring](../runbooks/f0-backup-private-wiring.md).
`preflight`, `observeConsistency`, `captureRecovery`, `resumeWrites` i
`notify` potrzebują rzeczywistych dostawców. Test nie może zastępować
niezależności czytnika, escrow lub całego okna przez stałą deklarację sukcesu.

**Przed osobną zgodą:** prywatna karta łączy źródła, oba magazyny, trzy repo,
czwarty snapshot manifestu, czytnik, klucze/escrow, pełny recovery, wersje,
uprawnienia, pojemność i dwa budżety czasu: okno źródeł i całą sekwencję.
Dołączyć plan czasowego wstrzymania i odtworzenia ustawień oraz dostawcę
obserwacji. Zgodność czasu/release i pełny inwentarz są aktualnym warunkiem,
nie cechą utrwaloną na zawsze w kodzie.

**Zakres resume:** siedem kategorii writerów nie jest listą siedmiu
kontenerów. Konkretny plan musi obejmować wszystkie zmienione kontrole,
np. ingress, prawa dostępu, stan usług/restartów, harmonogramy i lifecycle.
Wcześniej wyłączona usługa ma pozostać wyłączona. Stan tymczasowy musi
odpowiadać temu oknu; obca zmiana blokuje automatyczne przywrócenie.
`WORKER_DISABLE_SCHEDULES` przy starcie usuwa trwałe harmonogramy
([worker](../../lib/jobs/worker.ts)); sama zmiana flagi na false nie
odtwarza dowolnego stanu pierwotnego.

**STOP i błąd:** nieznany writer, brak dowodu drenażu, niesprawdzona operacja
odtworzenia ustawień, niepewny proces lub niekompletny seal/receipt.
[Procedura spójności](../runbooks/f0-backup-consistency-window.md) określa
`HELD`, `FREEZE_UNKNOWN`, `RESUME_UNKNOWN` oraz `RESUMED`; bez automatycznego
retry wznowienia i bez usuwania locka w celu wymuszenia kolejnej próby.
Po potwierdzonym resume późny błąd kopii nie uruchamia go ponownie.

**Dowód późniejszego wykonania:** pełny manifest, niezależny odczyt wszystkich
plików i manifestu, potwierdzenie wznowienia, wynik sygnału oraz osobny stan
locka. Harmonogram, kontrola braku sukcesu i retencja wymagają oddzielnego
dowodu konfiguracji; podgląd 7/4/12 nie wykonuje usuwania.

## Karta B — pełny restore

**Lokalnie:** przygotowany [plan](../runbooks/f0-full-restore-plan.md).
Nie wykonywać historycznych instrukcji pojedynczej bazy jako próby
całego zestawu.

**Wejścia i dostawca:** operator/reviewer, zaufany kompletny zestaw,
niezależny dostęp do escrow, osobny izolowany cel oraz narzędzia zgodne
z wersjami i formatami kopii. To nie jest zwykły staging z danymi syntetycznymi.

**STOP i błąd:** niespójny zestaw, brak kluczy, niewykazana izolacja,
nieznane referencje lub stan operacji. Cel pozostaje w kwarantannie;
brak automatycznego uruchomienia workerów, replay, cleanup lub cutover.

**Dowód:** zgodność obu baz/globals i obu magazynów, auth/RLS/ACL,
referencje/hash, rozliczenie TTL/hold i kolejki bez produkcyjnych efektów.
TEST-07 pozostaje NOT RUN; nie wpisywać zmierzonego RTO lub PASS przed próbą.

## Karta C — staging bez efektów produkcyjnych

[Przykład stagingu](../../ops/observability/environments/staging.example.yaml)
jest dokumentem, nie plikiem uruchamiającym środowisko. Plan pozostaje
do wykonania po pełnych kopiach i osobnym upoważnieniu. Nie tworzy VM,
sieci, kluczy, bazy ani DDL pg-boss.

**Wejścia i zależności do przypięcia prywatnie:**

- Wybrany Linux, granice sieci, kontrola dostępu, zasoby i okna dostępności.
  Oddzielne wolumeny, klucze i konta; brak dostępu do repozytoriów kopii lub
  sekretów produkcji przez współdzielone katalogi.
- Oddzielne DB/auth, kolejki pg-boss, Redis/SRH i magazyny; dopiero na nich
  web i worker z przypiętych obrazów/release. Stan gotowości każdej
  zależności musi być sprawdzalny przed startem kolejnej.
- Przejrzany plan bootstrapu pustego schematu i kolejki, właściciel oraz
  osobny zakres wykonania migracji. Lista plików SQL nie jest zgodą na ich
  uruchomienie; brak stagingu nie uzasadnia użycia produkcyjnej bazy.
- Wyłącznie syntetyczne tenanty/dokumenty, m.in. fikcyjny NIP `1234567890`.
  KSeF TEST, Stripe test, zweryfikowany testowy odbiornik poczty/webhooków
  lub blokada wysyłki; pozostałe integracje jako kontrolowane stuby.
  Zaplanować odmowę dostępu do produkcyjnych endpointów i poświadczeń.
- Istniejące SDK muszą mieć eksport wyłączony albo skierowany do
  kontrolowanego odbiornika testowego. Nie używać kluczy produkcyjnego
  projektu do uzyskania pozornej gotowości stagingu.

**Znana granica konfiguracji:** przykład zachowuje ochronne
`NEXT_PUBLIC_APP_ENV=production`, ale obecny browser Sentry używa tej samej
zmiennej jako tagu ([inicjalizacja](../../instrumentation-client.ts)).
`APP_ENV=staging` serwera nie naprawia tagu przeglądarki. Karta wymaga jawnego,
sprawdzonego rozwiązania przed eksportem; nie wyłączać zabezpieczeń tylko
dla poprawnego tagu. Zmiana nowej instrumentacji należy do późniejszego F1.

**Kontrola offline:** przygotowany [checker](../../scripts/ops/check-staging-preparation.mjs)
przyjmuje wyłącznie tekst JSON przez `checkStagingPreparation(jsonText)`
(maks. 64 KiB); CLI pokazuje tylko pomoc. Nie parsuje przykładu YAML,
nie czyta plików/env, nie rozwiązuje referencji i nie uruchamia klientów.
[Testy syntetyczne](../../scripts/ops/check-staging-preparation.test.mjs)
zawierają pełny przykład kontraktu: dokładnie DB, auth, kolejkę, cache,
oba storage, web i worker; jawne zależności i referencje prób gotowości,
przypięty wspólny release web/worker, obrazy oraz rewizję konfiguracji.

Checker wymaga rozłącznych zbiorów referencji produkcji i stagingu dla
zasobów, tożsamości, kluczy i wolumenów, także między różnymi rolami.
Współdzielenie infrastruktury wewnątrz stagingu pozostaje możliwe;
równość lub różnica ciągów nie dowodzi rzeczywistych granic zasobów.
Wymaga danych syntetycznych, planu odmowy dostępu do produkcji i sekretów
kopii, bezpiecznych trybów wszystkich integracji i istniejących SDK,
ochronnych env, `migrations:NOT_AUTHORIZED` i `bootstrap:NOT_RUN`.
Każda referencja wskazuje prywatne mapowanie do późniejszego przeglądu;
format identyfikatora nie jest wykrywaczem sekretów ani dowodem autentyczności.

Wynik `STRUCTURAL_PLAN_READY` dotyczy tylko kompletności dokumentu;
`operationalReady`, `g03Passed` i `evidenceVerified` pozostają `false`.
To ocena planu, nie dowód izolacji działającej sieci, wersji serwera,
wykonania prób gotowości, uprawnień lub zgoda na utworzenie stagingu.

**STOP i stan po błędzie:** nieznana tożsamość zasobu, wspólne klucze,
wyjście do produkcji, automatyczny bootstrap, niekontrolowany odbiorca
lub brak zasobów. Nie uruchamiać usług; częściowy cel pozostaje odizolowany.

**Przyszły dowód G03:** działające web/worker z odczytanym SHA/obrazami,
odrębne zależności, próby odmowy produkcyjnych efektów, dane syntetyczne
i zmierzony zapas zasobów. Sam YAML, WSL, dev server lub HTTP 200 nie zalicza G03.

## Karta D — podstawowe monitory i sygnały F0

Dla każdej kontroli przygotować prywatny wpis: monitorowana usługa/źródło,
konkretny dostawca obserwacji, interwał, timeout/grace, warunek awarii,
świeżość, zależności wspólne z monitorowanym systemem, route odbiorcy,
sposób weryfikacji dostarczenia oraz stan po braku danych.

Zakres skończonej listy kontroli:

- Dostępność web i osobno workera, DB, obu magazynów oraz cache/interfejsu
  cache. Zaznaczyć, czy sprawdzany jest proces, zależność czy efekt.
  Health i liczba zarejestrowanych kolejek nie dowodzą postępu faktur/jobów.
  Nie dopisywać tutaj nowej instrumentacji domenowej.
- Niezależny watchdog platformy: wybrane w [ownership](ownership.md#reakcja-dostęp-i-utrzymanie)
  heartbeat co 60 s i grace 180 s. Ustalić faktyczny generator i odbiornik;
  kontrola zależna wyłącznie od zatrzymanego workera nie jest niezależna.
- Pełna kopia: sygnał tylko po całym zestawie, termin 03:30 UTC, wiek pełnego
  sukcesu maks. 26 h. [Polityka sygnału](../../scripts/ops/check-backup-signal.mjs)
  rozróżnia błąd, brak historii, przekroczony termin i błąd doręczenia.
  Sygnał samego dumpa lub pomocniczego JSON snapshotu nie zastępuje G09.
- Brak danych i błąd uwierzytelnienia: osobne wyniki, bez zdrowego zera,
  bez automatycznego recovery i bez sztucznego odświeżania ostatniego sukcesu.

**Obecny kod a kierunek:** [kanał krytyczny](../../lib/alerts/slack.ts)
obsługuje Slack/Telegram; [raport](../../lib/jobs/runners/daily-summary-email.ts)
korzysta z email i Telegrama. Przyjęty kierunek to Igor jako główny odbiorca,
Telegram/email dla krytycznych, Slack roboczo i raport 06:00 Europe/Warsaw.
Kod nie dowodzi rzeczywistego routingu ani zmiany odbiorcy. Nie przypisywać
Bartoszowi zastępstwa lub godzin dyżuru i nie wpisywać kontaktów do repo.

**Lokalnie:** sprawdzić schemat kart i testy czystej polityki sygnału oraz
symulowane błędy transportu. Nowy lifecycle ACK/reminder/expiry jest
wymaganiem późniejszej implementacji, nie dodatkowym zadaniem F0.

**Przed wysyłką:** potrzebne osobne upoważnienie, zweryfikowany odbiorca,
obecność testującego i konkretny kanał/dostawca. STOP przy braku tych danych,
nadmiarowym payloadzie lub nieustalonych kosztach. Po błędzie zapisać
niedostarczenie i coverage gap; nie wysyłać automatycznie do innej osoby.
Przygotowanie karty nie wysyła wiadomości i nie konfiguruje monitorów.

## Osobne sesje przyszłego TEST-06

Wybrane 30-minutowe okno w dzień roboczy 10:00–16:00 Europe/Warsaw dotyczy
krótkiej próby odbioru na fizycznym telefonie, ACK oraz warunków DND/blokady.
Dokładny slot i obecność Igora nadal wymagają potwierdzenia. Taka sesja
**nie potwierdza 60-minutowego expiry** i sama nie zalicza całego TEST-06.

Po przygotowaniu właściwej implementacji zaplanować osobną sesję lifecycle,
obejmującą pełne 60 min od ACK i czas potrzebny na obserwację dalszego stanu.
Rozliczyć przypomnienie po 15 min, fallback po 30 min bez ACK, expiry po
60 min trwającego incydentu, trzy świeże udane pomiary recovery i UNKNOWN
przy no-data. Uzgodnić także osobny scenariusz awarii głównej ścieżki oraz
niezależnego kanału. Nie zmieniać progów tylko po to, aby zmieścić się w sesji.

Test ze sztucznym zegarem może lokalnie sprawdzić logikę, lecz nie dowodzi
opóźnień dostawcy, routingu, telefonu ani zachowania człowieka. Każda sesja
ma własne upoważnienie, wynik i zamknięcie testowego incydentu. Wszystkie
rzeczywiste scenariusze pozostają NOT RUN.

## Karta E — prywatność, konta i dostęp

**Lista dowodów kont, bez zmian kont:** dla każdego wybranego produktu
potwierdzić indywidualną tożsamość i rolę, skuteczne MFA, region konkretnej
klasy danych, aktywny plan, quota/API, koszty, retencję i workflow usuwania.
Oddzielić odczyt panelu od dokumentacji oferty i od testu faktycznej retencji.
Nie powtarzać pełnego przeglądu już udokumentowanych pól bez potrzeby;
uzupełnić brakujące. Nowa rola, zaproszenie, MFA lub zmiana planu wymaga
osobnego zakresu. Brak SSO/custom RBAC nie jest dowodem ich dostępności w Free.

Dostęp minimalny, osobne tożsamości, przegląd co 30 dni i nowe tymczasowe
dostępy do dowodów maks. 24 h pozostają polityką z [ownership](ownership.md).
Dostęp administracyjny lub klucz root nie staje się technicznie read-only
przez opis zadania. Nie zakładać istnienia zastępcy ani recovery dostępu.

**Lista kontroli danych do przyszłego TEST-04:**

- Zredagowane stdout/log/trace/error i SQL bez bind values; bez dokumentów,
  auth headers, cookies, sekretów, promptów lub surowych odpowiedzi SDK.
- RUM/analytics tylko po consent; cofnięcie zgody zatrzymuje eksport.
  Replay, autocapture i heatmaps wymagają potwierdzenia efektywnej
  konfiguracji, nie tylko ustawienia w kodzie albo w panelu.
- Minimalna historia błędów/audit pozostaje oddzielna od próbkowanej
  diagnostyki; quota/expiry nie tworzy dowodu braku błędu.
- Source maps odpowiadają rzeczywistemu SHA i pozostają prywatne.
  Upload map nie dowodzi symbolikacji ani wymaganej retencji archiwum.
- Tenant A i anon nie odczytują operacji B; operacja/trace ID nie przyznaje
  dostępu. Przyszły agent otrzymuje osobny zredagowany read-only zakres,
  bez sekretów lub mutacji; samo opisanie zakresu nie nadaje dostępu.
- TTL, hold, ślad usunięcia i ponowne zastosowanie zasad po restore muszą
  mieć właściciela, wynik i dowód; decyzja w [polityce](data-policy.md) nie
  jest implementacją cleanup.

**Znana nierozstrzygnięta ścieżka:** [identify](../../components/analytics/analytics-identify.tsx)
przekazuje user UUID i tenant group; [allowlist](../../lib/analytics/privacy.ts)
dopuszcza identyfikatory tenantów. Polityka domyślnie pomija tenant w SaaS.
Test usunięcia email lub tokenu nie rozstrzyga tej różnicy. Wymaga ona
osobnego rozstrzygnięcia/zmiany eksportu i późniejszego odbioru, bez cichego
uznania bieżącego SDK za zgodne lub rozpoczęcia nowej instrumentacji F1.

**Lokalnie, 11.10.2026:** 67/67 PASS w sześciu istniejących plikach:
[telemetry](../../tests/unit/telemetry-privacy.test.ts),
[analytics browser](../../tests/unit/analytics-privacy.test.ts),
[analytics server](../../tests/unit/analytics-server-privacy.test.ts),
[błędy audytu](../../tests/unit/audit-failure-privacy.test.ts),
[bramki środowiska](../../tests/unit/security-environment.test.ts) oraz
[przykład env](../../tests/unit/env-przyklad.test.ts).
Uruchomiono tylko te pliki przez `pnpm exec vitest run`; SDK/DB były
mockowane, konfiguracja testów nie ładowała `.env.local`.
Przy odbiorze przypiąć wynik do finalnej rewizji; późniejsza zmiana kodu
wymaga właściwej ponownej kontroli. Wynik unit testu nie zalicza wdrożonego
bundle, rzeczywiście wysłanego payloadu, retencji, konta ani TEST-04.
Przy brakach zachować `NOT_RUN`/ograniczenie, nie zastępować ich deklaracją.

## Przekazanie i warunek zatrzymania przygotowania

Wynik lokalnego pakietu wskazuje dokładne pliki i rewizję, wykonane kontrole,
ich ograniczenia oraz brakujące konkretne wejścia/dostawców. Nie przesuwa
bramek na PASS przez sam zapis dokumentu. Igor pozostaje odbiorcą F0.

Po domknięciu siedmiu pozycji lokalnych następny krok wynika z brakującej
karty: aktualny dozwolony odczyt, decyzja lub osobne upoważnienie do operacji.
Nie zastępować tej granicy kolejnym ogólnym ulepszaniem frameworka.

W szczególności nadal wymagane są rzeczywiste dowody runtime/monitorów
G01/G02, kont i gotowości odbiorcy G07/G08, pełnej kopii G09 oraz działającego
izolowanego stagingu G03. Dokumenty nie tworzą dowodów tych zdarzeń.
TEST-07, nowe instrumentowanie, dashboard, agent i F1 pozostają w swoich
osobnych zakresach; samo przygotowanie nie upoważnia do merge lub deploy.
