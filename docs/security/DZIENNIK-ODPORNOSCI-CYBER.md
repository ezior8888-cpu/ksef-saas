# Dziennik odporności cybernetycznej — FaktFlow / KSeF SaaS

## Zasady kontynuacji dla ludzi i AI

Ten dziennik śledzi realizację [planu odporności cybernetycznej](PLAN-ODPORNOSCI-CYBER.md). Jest osobnym etapem po [wcześniejszych naprawach Astry](DZIENNIK-NAPRAW-ASTRA.md) i [audytach Claude](DZIENNIK-AUDYT.md). Nie zastępuje ich ani nie zmienia historycznych wyników.

- Aktualna dyspozycja Igora z 2026-09-16: kontynuować po wczorajszym zakończeniu. PR #11 / a8dd109 ma potwierdzone CI i Security PASS; alert #1 rozliczono po jawnej zgodzie. Nowy lokalny pakiet CYB-F03-16…19 na codex/security-access-continuation opisuje [odzyskiwanie hasła, TOTP i przekierowania](FAZA-03-ODZYSKIWANIE-HASLA-I-DOSTEP.md). Bez zgody na merge do main, produkcję, SQL i rotacje.
- Hosting właściwej aplikacji: Hetzner/Coolify. Historyczne statusy Vercel nie dowodzą wdrożenia na własnym serwerze. Aktualny opis zmian operatora jest w [odpowiedzi Bartka](ODPOWIEDZ-BARTEK-2026-09-14.md) i [planie wydania GDPR](PLAN-WYDANIA-GDPR.md); nie powtarzać dawnych list jako bieżącego stanu.
- [Sesje, API i challenge](FAZA-03-SESJE-I-CHALLENGE.md) opublikowano jako [PR #10](https://github.com/ezior8888-cpu/ksef-saas/pull/10). CI i Security dla dc7806a przeszły 15.09 (1700 testów Vitest). Pełny odbiór środowiska i odzyskiwanie MFA pozostają otwarte.

- Przed pracą przeczytaj aktualne instrukcje projektu i zgodę z rozmowy, sprawdź gałąź oraz cudze niezapisane zmiany.
- Dopisuj datowane wpisy. Korekty starszych wniosków opisuj jako korekty, z przyczyną i nowym dowodem.
- Oddzielaj: zaplanowane, w kodzie/konfiguracji, sprawdzone na testach, wdrożone, potwierdzone w nazwanym środowisku. Przywrócenie problemu otwiera wpis ponownie.
- Zamknięcie wymaga wyniku testu odnoszącego się do konkretnego ryzyka; brak zgłoszeń, pusty zbiór danych lub zielony skaner nie dowodzą izolacji.
- Repo jest publiczne. Nie zapisuj kluczy, danych klientów, surowych dumpów, tokenowych URL ani szczegółów dostępu operacyjnego. Dowody wrażliwe przechowuj poza repo; tutaj identyfikator i bezpieczne podsumowanie.
- Dla każdego przekazania podaj pliki/commit, status środowiska, ograniczenia, zależności od Bartka/Igora i konkretny następny krok. Nie przypisuj AI wdrożenia wykonanego przez operatora.

## 2026-09-13 — Przygotowanie własnego planu

**Autor:** Astra; równoległy odczyt repo przez agentów do izolacji/CI i infrastruktury/odtwarzania.

**Zlecenie:** zastąpić przekazaną listę tematów własnym, uporządkowanym planem gotowości na zagrożenia cybernetyczne. Zachowano wcześniejsze ograniczenie do planowania i obowiązek prowadzenia dziennika.

**Punkt odniesienia:** kod `d49e8aebdf7fe74e392f6e33d90dd2549b53e93c`. Poprzedni [draft PR #1](https://github.com/ezior8888-cpu/ksef-saas/pull/1) przy sprawdzeniu był otwarty, niepołączony. Dokumenty nowego etapu powstają na osobnej lokalnej gałęzi `codex/security-preparedness-plan`. Nie zakładamy, że kod starego PR działa na produkcji.

**Wykonano:**
- Odczytano istniejące dzienniki, rejestr ustaleń, migracje 00068/00069, propozycje GDPR, workflow, skrypty audytowe oraz wybrane granice uprawnień, backupy, Dockerfile, limiter i runbooki.
- Zweryfikowano dokumentację pierwotną Supabase, GitHub, OWASP, NIST, KSeF, RODO i RFC 9116. Źródła są przy odpowiednich punktach planu.
- Opracowano dziewięć faz z celami, właścicielami, zależnościami, warunkami odbioru i bramką uruchomienia.
- Utworzono [plan](PLAN-ODPORNOSCI-CYBER.md) i ten dziennik. Towarzyszący lokalny widok faz w Codex jest skrótem; źródłem dla kolejnych AI pozostają dokumenty w repo.

**Korekty założeń i ryzyka do późniejszej weryfikacji:**
- 78 to historyczna liczba miejsc do przeglądu spośród 305 zapytań service_role; nie liczba potwierdzonych luk. Nowego skanu nie wykonano.
- CI już ma audit zależności produkcyjnych i dependency review; CSP już jest egzekwowane w kodzie. Konfiguracja wymaganych kontroli GitHub i stan nagłówków produkcji pozostają niepotwierdzone.
- Eksport przez REST nie daje dowodu spójnego pełnego backupu. Pomija część stanu, a runbook odtwarzania jest częściowo historyczny. Nie oceniono rzeczywistych kopii i szyfrowania na Hetzner/MinIO.
- Guard administracji nie wymusza samodzielnie MFA; zaufanie do IP wymaga ponownej oceny po migracji hostingu, limiter dopuszcza ruch podczas awarii, a obraz workera wymaga przeglądu uprawnień i zależności.
- Skrypty audit-* zapisują raporty, lecz trafienie nie musi kończyć ich błędem. Część łączy się z usługami; run-prod-verify wywołuje mutujące RPC. Nie wolno uznać ich za bezpieczny gotowy zestaw CI bez adaptacji.
- Istnieją alerty dostępności, ale potrzeba dowodu doręczenia i reakcji także przy utracie głównej aplikacji.

**Decyzje planistyczne:**
- Odtwarzanie i integralność faktur mają priorytet obok izolacji firm.
- MFA obejmuje administrację aplikacji i konta operatorów; potrzebny jest działający dostęp awaryjny.
- FLO wymaga osobnego modelu zagrożeń oraz kontroli narzędzi, zgody, kosztów i izolacji danych.
- Domknięcie techniczne GDPR, decyzja o retencji i wymagania wobec dostawców są oddzielnymi warunkami.
- Cele RPO ≤ 1 h i RTO podstawowej obsługi ≤ 4 h są propozycją do zatwierdzenia i pomiaru. Nie opisują obecnych możliwości.
- Pentest zewnętrzny i ćwiczenie odzyskania usługi należą do warunków odbioru, nie do dekoracyjnego dodatku po starcie.

**Stan faz:** F01–F09 mają przygotowany zakres. Nie wykonano odbioru rzeczywistego środowiska ani żadnej z zaplanowanych zmian. Analiza przygotowawcza kodu nie zamyka F01.

**Nie wykonano:** zmian kodu aplikacji/workflow/Dockera, SQL i migracji, uruchamiania audit-*.ts, testów aplikacji, skanów sieci/produkcji, odczytu wartości sekretów, rotacji, zmian infrastruktury, wdrożenia, wysyłania wiadomości ani zamówienia pentestu. Nowy etap nie został opublikowany na zdalnej gałęzi.

**Weryfikacja dokumentacji:** przegląd spójności przez drugiego agenta bez istotnych uwag; sprawdzono komplet dziewięciu faz, poprawność kodowania oraz 21 lokalnych odnośników w obu dokumentach. Sprawdzenie typów lokalnego widoku faz zakończyło się powodzeniem po dopasowaniu elementów do SDK. To kontrole dokumentacji i jej prezentacji, nie nowe testy bezpieczeństwa aplikacji.

**Otwarte zależności:**
- Bartek: potwierdzenie schematu i wdrożonego kodu, dostęp do bezpiecznych testów, kopie i restore, infrastruktura, operacyjne procedury rotacji.
- Igor: zgoda na rozpoczęcie realizacji, priorytety biznesowe, cele odtwarzania, administratorzy, obsada alarmów, budżet i zakres pentestu.
- Igor/prawnik: retencja, role dostawców i dokumenty, ocena obowiązków przy naruszeniu.
- Kolejne AI: po rozpoczęciu realizacji odświeżyć stan repo, potwierdzić zależności i prowadzić osobny dowód dla każdej kontroli.

**Następny krok po zgodzie na realizację:** wykonać odbiór stanu z F01, ustalić bezpieczne środowisko i pierwsze ćwiczenie odtwarzania; równolegle przygotować przegląd krytycznej autoryzacji oraz bramki CI. Na etapie samego planu zatrzymujemy się na dokumentacji.

## 2026-09-13 — Rozpoczęcie realizacji: bezpieczne CI i cel testów

**Zgoda:** Igor zlecił rozpoczęcie stopniowego wdrażania planu; po przerwie związanej z limitem wznowił pracę. Zakres tego pakietu to repo i testy lokalne, bez produkcji i SQL.

**Gałąź:** `codex/security-foundations`, utworzona z planu `cc4fa9a`, który bazuje na wcześniejszych poprawkach `d49e8ae`. Zdalne main nadal wskazywało `13a7d81b`, a gałąź poprzednich poprawek `d49e8ae` podczas odczytu. Stan wdrożenia aplikacji i schematu pozostaje niepotwierdzony.

**Wykonane zmiany:**
- `a29a1de`: testy RLS dopuszczają jedynie numeryczny loopback i jawne potwierdzenie jednorazowej lokalnej bazy. Blokują zdalne cele, ścieżki proxy i konflikt z obecną konfiguracją aplikacji. [Instrukcja i ograniczenia](../../tests/README-RLS.md).
- `7d9a01c`: uprzywilejowane E2E wydzielono z PR do ręcznego main z osobnymi nazwami sekretów staging i środowiskiem security-staging. Usunięto automatyczną publikację raportów/trace, które mogłyby zawierać sesje lub dane.
- CI ogranicza uprawnienia tokenu, nie zachowuje poświadczeń checkout i korzysta z przypiętych SHA Actions. Zachowano audit zależności i dependency review.
- Dodano Gitleaks 8.30.1 z weryfikacją SHA256 pobranego narzędzia, pełnym maskowaniem oraz sprawdzaniem historii i własnej skuteczności.
- Dodano CodeQL dla JS/TS oraz Actions bez budowania aplikacji, z bramką wysokich/krytycznych wyników i błędów raportu. Skrypt bramki nie wypisuje treści ustaleń.
- Dodano [instrukcję odbioru CI](CI-SECURITY.md), w tym zakres wymagający ustawień właściciela GitHub.

**Trafienia skanera:** pierwszy skan historii wykazał trzy false positives. Dwa są porównaniami odrzucającymi placeholder Stripe, trzecie komentarzem z identyfikatorem modelu Claude. Oceniono kontekst w konkretnych commitach. Wyjątki obejmują tylko trzy historyczne fingerprinty w .gitleaksignore, bez wyłączania całych plików lub reguł. Kolejny skan historii i przygotowanych zmian: zero niewyjątkowanych trafień.

**Weryfikacja lokalna:**
- Vitest: **82 pliki, 1313 testów PASS**, w tym 31 testów guardu RLS; integracyjne RLS były wyłączone.
- Bramka CodeQL: **16/16 PASS**, w tym rzeczywiste procesy CLI z exit 0/1/2 i test braku ujawniania treści.
- Gitleaks: czyste tymczasowe repo przechodzi; wygenerowany sztuczny token blokuje; usunięcie go z najnowszego pliku nadal blokuje przez historię; błędna konfiguracja nie przechodzi; token nie trafia do wyjścia.
- Actionlint 1.7.12: trzy workflow bez błędów. Oba pobrane narzędzia Windows sprawdzono przez SHA256 oficjalnych wydań.
- Typecheck, lint zmienionych skryptów/testów i diff --check: PASS.
- Bieżący audit zależności produkcyjnych: brak znanych podatności.
- Niezależny agent nie zgłosił potwierdzonej istotnej luki w pakiecie. Trzy wyjątki Gitleaks potwierdził osobno autor na podstawie zamaskowanego kontekstu.

**Stan odbioru:** F02 — zaimplementowana ochrona celu testów, bez wykonania testu na bazie lub restore. F04 — pierwszy pakiet lokalnie zweryfikowany; rzeczywisty CodeQL/GitHub i wymagane kontrole pozostają do potwierdzenia. F01 — sprawdzony stan repo, ale stan serwerów wymaga odczytu przez operatora. Pozostałe fazy pozostają zaplanowane.

**Istotne ograniczenia:** loopback nie rozpoznaje bazy ukrytej za tunelem; zabronione jest kierowanie tych testów przez proxy/tunel do produkcji. Ochrona environment i wymagane statusy nie powstają przez sam wpis YAML. Właściciel musi ograniczyć istniejące sekrety repo/organizacji i skonfigurować dedykowany staging. SARIF sprawdzono na syntetycznych raportach; publiczna próbka testowa CodeQL Action zawiera historyczne nazwy narzędzi, więc nie potwierdza formatu obecnego skanu aplikacji.

**Nie wykonano:** mutujących testów RLS/E2E, migracji, połączeń do bazy, rotacji, deploy/restartów, zmian ustawień GitHub ani aktualizacji serwerów. Nie odczytywano wartości sekretów środowiskowych. Skany obejmowały lokalne pliki Git; zamaskowane raporty pozostały w katalogu tymczasowym poza repo.

**Publikacja:** próba wysłania wyłącznie gałęzi codex/security-foundations została odrzucona przez automatyczny przegląd uprawnień. Wskazany powód: brak wyraźnej zgody na konkretny zestaw zmian i cel GitHub. Użytkownik otrzymał pytanie określające publiczne repo, gałąź i zakres draft PR. Do czasu odpowiedzi zmiany pozostają lokalne; nie zastosowano obejścia.

**Następny krok:** po zatwierdzeniu publikacji utworzyć osobny draft PR względem poprzednich poprawek, potwierdzić rzeczywiste przebiegi CI/CodeQL i zapisać ich wynik. Odbiór kontynuować z właścicielem GitHub oraz przygotowaniem środowiska i odtwarzania z Bartkiem.

## 2026-09-13 — Publikacja zatwierdzona i pierwszy odbiór GitHub

**Zgoda i publikacja:** Igor odpowiedział „zatwierdzam” na konkretny zakres i publiczny cel. Wysłano codex/security-foundations (d19c45a) i utworzono [draft PR #2](https://github.com/ezior8888-cpu/ksef-saas/pull/2) względem codex/security-leak-fixes. Wcześniejszy wpis o oczekiwaniu na zgodę jest historyczny. PR #1 pozostaje osobną zależnością. Nie połączono żadnego PR ani nie wdrożono aplikacji.

**Rzeczywiste wyniki pierwszego przebiegu:**
- [Security 34775088182](https://github.com/ezior8888-cpu/ksef-saas/actions/runs/34775088182): Secret scan PASS, oba zadania CodeQL wykonały analizę, ale lokalna bramka odrzuciła strukturę raportu. Analizy 1769122107 (JS/TS) i 1769121037 (Actions) dotyczyły testowego merge a66d921359304e170bb298364069be58a95003be, nie samego commita gałęzi.
- Pobrane raporty CodeQL nie zawierały wyników. Analiza PR korzysta z pr-diff-range: zero wyników w tym przebiegu nie stanowi pełnego audytu całej aplikacji.
- [CI 34775088117](https://github.com/ezior8888-cpu/ksef-saas/actions/runs/34775088117): typecheck i lint przeszły (lint z istniejącymi ostrzeżeniami); cztery testy XML nie przeszły z powodu braku systemowego xmllint. Dependency review zgłosił wyłączony Dependency graph.
- Użyte konto ma push, ale nie admin/maintain. Ustawienie Dependency graph wymaga właściciela GitHub; nie usunięto ani nie złagodzono kontroli.

**Korekty przygotowane na podstawie dowodów:**
- CI instaluje libxml2-utils przed testami i sprawdza obecność xmllint.
- Bramka SARIF akceptuje pominiętą tablicę rules w sterowniku i pakietach bibliotecznych CodeQL. Nadal odrzuca rules:null, nieznaną regułę, niepoprawny raport i ustalenia wysokie/krytyczne.
- Dodano cztery testy regresji odwzorowujące układ rzeczywistych raportów, bez zapisywania ich treści w repo.
- Uzupełniono CI-SECURITY.md o potwierdzoną zależność od administratora.

**Weryfikacja korekt:** bramka 20/20 PASS; oba rzeczywiste raporty po korekcie przechodzą (2 pliki, 2 przebiegi, 0 wyników). Lokalne testy XML po udostępnieniu xmllint: 66/66 PASS. Actionlint trzech workflow PASS. Korekty wymagają jeszcze nowego przebiegu GitHub.

**Status:** F04 ma działający rzeczywisty skan sekretów i wykonane analizy CodeQL; pełny odbiór CI oraz ustawienia wymaganych kontroli nadal otwarte. Migracje, baza, staging i produkcja nie były zmieniane.

## 2026-09-13 — Ponowny odbiór CI i cztery trafienia CodeQL

**Wysłana korekta:** 30f5a797d3542f1b88771e9d65c87db2b4aadef0, nadal zatwierdzony draft PR #2. [CI 34775777543](https://github.com/ezior8888-cpu/ksef-saas/actions/runs/34775777543) potwierdził PASS całego zadania Typecheck + Lint + Unit tests, auditu zależności i 20 testów bramki. Dependency review nadal blokuje brak Dependency graph u właściciela.

**[Security 34775777627](https://github.com/ezior8888-cpu/ksef-saas/actions/runs/34775777627):** Secret scan i CodeQL Actions PASS. Raport JS/TS na runnerze zawiera 4 wyniki high; bramka poprawnie kończy się exit 1 przy inputErrors=0. Nie jest to kolejny błąd parsera. GitHub API analizy 1769145714 dla testowego merge c429db8ef4a1106cb82b2724081dc47db53937e5 pokazuje 0 wyników w przetworzonym zakresie PR. Nie wolno z tego wyciągać wniosku o czystym surowym raporcie ani osłabiać bramki.

**Diagnostyka:** przygotowano osobny skrypt print-codeql-locations.mjs i krok workflow. Wypisuje wyłącznie zwalidowane identyfikatory reguł, względne ścieżki repo i numer początkowej linii. Nie publikuje wiadomości, fragmentów kodu, przepływów ani surowych raportów. Błędne metadane i ponad 100 rekordów kończą się błędem bez częściowego wyjścia; próg blokowania CodeQL pozostaje bez zmian. Testy hermetyczne sprawdzają także brak ujawnienia syntetycznej prywatnej treści.

**Status:** lokalizacja i ocena czterech trafień otwarte do kolejnego przebiegu; to nie cztery potwierdzone podatności. Ustawienia GitHub wymagają Bartka. Zmiany aplikacji i kolejna inwentaryzacja przygotowywane są osobno na lokalnej gałęzi codex/security-audit-inventory.

## 2026-09-13 — Ocena i poprawki czterech ustaleń CodeQL

**Dowód:** [Security 34776188655](https://github.com/ezior8888-cpu/ksef-saas/actions/runs/34776188655), JS/TS job 103774620437. Ograniczona diagnostyka podała cztery reguły i lokalizacje. Nie publikowano surowego SARIF ani jego treści. Źródło różnicy względem licznika API: [przypięty CodeQL Action filtruje przesyłane wyniki według zakresu PR](https://github.com/github/codeql-action/blob/b96794f015dfd88f77b49b1c93e0fa7110f94c63/src/upload-lib.ts#L976); bramka nadal sprawdza surowy raport z runnera.

**Ocena i zmiany:**
- js/biased-cryptographic-random, lib/auth/backup-codes.ts: alfabet ma 32 znaki, więc modulo bajtu przez 32 NIE powodowało nierównomiernego losowania. Pierwsza hipoteza o 31 znakach była błędna i została skorygowana przez deterministyczny test. Zastosowano randomInt(ALPHABET.length), poprawne także przy zmianie długości alfabetu. Zachowano znaki, format i sposób weryfikacji już wydanych kodów. To wzmocnienie konstrukcji, nie dowód słabości wcześniejszych kodów.
- js/double-escaping, lib/gus/client.ts: sekwencyjne dekodowanie rozwijało &amp;lt; aż do znacznika przed właściwym parserem XML. Nowy decodeSoapXml dekoduje tylko jedną warstwę. Test z prawdziwym XMLParser potwierdza, że zakodowany tekst nazwy nie staje się dodatkowymi polami rekordu. Nie wykonywano zapytań GUS.
- js/incomplete-sanitization, scripts/security/audit-client-bundle.ts: fragment otoczenia maskował tylko bieżące trafienie i mógł zawierać sąsiedni lub powtórzony sekret. Usunięto snippety; pozostają nazwa zmiennej, plik, offset UTF-16 i liczniki. Metadane raportu są kodowane. Helper przetestowano bez uruchamiania skryptu audytu, builda i odczytu .env.
- js/user-controlled-bypass, app/api/email/unsubscribe/route.ts: ręczny przegląd nie potwierdził obejścia; zapis już wymagał zweryfikowanego HMAC. Weryfikacja wykonuje się teraz przed rozróżnieniem brakującego tokenu. Zachowano odpowiedzi GET/POST i zakres tokenu. Testy korzystają z prawdziwego podpisu/weryfikatora oraz atrapy zapisu i potwierdzają odmowę dla braku, podmiany, wygaśnięcia i niedostępnego klucza.

**Weryfikacja celowana:** 12 testów recovery/GUS, 14 testów tokenu oraz 4 testy metadanych raportu PASS; lint zmienionych plików PASS. Niezależny przegląd zmiany unsubscribe bez uwag. Workflow Security uruchamia testy bezpiecznej diagnostyki i redakcji. Nowy CodeQL jest konieczny do potwierdzenia zamknięcia czterech sygnałów; wysyłka 4041868 została później zatrzymana przez automatyczny przegląd (opis poniżej).

**Granice:** audit-client-bundle pozostaje skryptem operatorskim poza zwykłym CI; stary tryb build wymaga osobnego przeglądu wyjścia procesu i zmiennych. Żaden z tych testów nie odczytywał sekretów aplikacji ani nie korzystał z prawdziwych kont, bazy lub usług. Poprawki administracji i inwentaryzacji pozostają osobnym pakietem lokalnym.

## 2026-09-13 — Drugi pakiet: kontrola dostępu przy danych i powtarzalny spis

**Fazy:** F01, F03, F04. **Zakres:** lokalny kod i hermetyczne testy na gałęzi codex/security-audit-inventory; bez migracji, prawdziwej bazy, usług i wdrożenia. Podstawa opublikowana w PR #2 to 7182579. Lokalny commit 4041868 zawiera osobne poprawki czterech sygnałów CodeQL i czeka na publikację.

**Ręczny przegląd czterech początkowych ścieżek:**
- Audyt administracyjny: searchAuditLogs tworzył service_role bez własnego requireAdmin, polegając na app/admin/layout.tsx. Potwierdzono brak kontroli na granicy odczytu; nie wykonywano dowodu wycieku przez HTTP. Autoryzacja musi być przy danych, ponieważ layout nie zapewnia takiej granicy dla komponentów potomnych. [Dokumentacja Next.js](https://nextjs.org/docs/app/guides/authentication).
- Tworzenie faktur: plik wejściowy przekazuje eksporty; rzeczywiste akcje sprawdzają użytkownika i korzystają z klienta sesji. Nie potwierdzono obejścia. Potwierdzenie wdrożonych polityk RLS pozostaje po stronie środowiska.
- Pobranie XML przez księgową: token jest wyszukiwany po hash, sprawdzane są ważność, cofnięcie i poziom dostępu. Faktura oraz metadane pliku są wiązane z firmą tokenu; ścieżka i suma pliku są weryfikowane. Nie potwierdzono obejścia przez samą podmianę invoiceId.
- Newsletter: publiczny zapis nie ujawnia listy subskrybentów ani faktur. Alarm o braku strażnika nie dowodzi wycieku. Ryzyko spamu przez zaufanie do X-Forwarded-For i zachowanie limitera przy awarii Redis pozostaje osobnym zadaniem zależnym także od proxy.

**Naprawy granicy dostępu (pięć operacji):**
- requireAdmin jest oczekiwany przed utworzeniem klienta w searchAuditLogs, listAdminUsers, getAdminUserDetail i listUserPayments. Ostatnia funkcja jest eksportowaną Server Action; layout nie chroni jej bezpośredniego wywołania.
- getAdminOverviewMetrics jest chronionym wrapperem. Wewnętrzny kolektor przeniesiono do lib/analytics/platform-metrics.ts. Korzysta z niego wrapper oraz zaufany daily-analytics-digest, bez przełącznika skipAuth.
- Nie zmieniono obliczeń metryk, formatów wyników, harmonogramów ani obu backendów jobów. Kolektor nie służy do bezpośredniego użycia w obsłudze żądań.
- Helpery są oznaczone server-only. Poprawiono komentarze sugerujące wystarczalność layoutu.
- Strony audytu i szczegółów użytkownika nie przechwytują już przekierowania odmowy jako pustej listy. Błąd odczytu trafia do granicy błędu strony zamiast udawać brak danych.

**Commity lokalne:** 9d1b03f — pięć granic dostępu i testy joba; c046ad0 — bezpieczna inwentaryzacja, testy i osobny job CI. 4041868 pozostaje odrębnym pakietem ustaleń CodeQL.

**Narzędzia audytu:**
- Wyłącznie audit-service-role.ts i inventory-entrypoints.ts otrzymały wymagany --output-dir do nowego katalogu. Blokowane są URL/UNC, historyczny docs/security/audyt (także przez junction) i nadpisanie istniejących raportów. Nie czytają .env i nie wykonują kodu aplikacji.
- Osobny job Offline security inventory testuje helper i generuje spisy w RUNNER_TEMP, bez instalowania zależności aplikacji i publikacji artefaktów. Exit 0 oznacza wygenerowanie spisu, nie brak luk.
- Korekta inwentarza: strażnik layoutu jest wyłącznie kontekstem. Strona polegająca tylko na nim dostaje zadanie prześledzenia odczytu; silniejsze sygnały zachowują pierwszeństwo.
- Świeży spis końcowy: 305 zapytań service_role (12 średnich, 76 do przeglądu, 217 heurystyczne ok) oraz 100 wejść (37 z flagą: 1 krytyczne, 3 wysokie, 4 średnie, 29 do przeglądu). Są to etykiety skryptów, NIE potwierdzone podatności.
- 23 dodatkowe flagi wejść wynikają z korekty założenia o layoucie. Spis nie śledzi wywołań między plikami, dlatego także strona z już chronionym helperem może wymagać ręcznego potwierdzenia. Nie uznajemy 76 lub 37 za licznik ukończenia audytu.
- Raporty pozostały poza repo w tymczasowym katalogu security-offline-final-omrNpj. SHA-256 czterech historycznych raportów przed/po są identyczne.

**Weryfikacja całego lokalnego stanu:**
- Vitest: **88 plików / 1373 testy PASS**, w tym 34 testy kontroli administracji i działania kolektora/jobu oraz 26 testów recovery/GUS/unsubscribe.
- Narzędzia Node: **52/52 PASS** (20 bramki CodeQL, 10 ograniczonej diagnostyki, 18 inwentaryzacji, 4 metadanych raportu pakietu).
- Typecheck, lint zmienionych plików, Actionlint trzech workflow i kontrola diffu PASS.
- Gitleaks przygotowanych poprawek CodeQL i administracji: brak trafień. Testy XML 66/66 i rzeczywisty główny job CI potwierdzono wcześniej w tym wpisie dziennym; generator i walidator FA(3) nie były dalej zmieniane.
- Testy administracji uruchamiają prawdziwy requireAdmin z atrapą sesji i bazy: odmowa dla braku sesji, zwykłego użytkownika, usuniętej allowlisty oraz błędu weryfikacji; brak klienta w trakcie oczekiwania; zachowane wyniki administratora. Test prawdziwego runDailyAnalyticsDigest wykorzystuje kolektor, atrapę bazy i wysyłki, a próba użycia sesji powodowałaby błąd.
- Niezależne przeglądy helpera raportów i poprawki searchAuditLogs bez istotnych uwag; uwaga o przechwytywaniu przekierowania została uwzględniona.

**Publikacja i zależności:** automatyczny przegląd uprawnień odrzucił wysyłkę nowych poprawek aplikacji/raportowania do publicznego ezior8888-cpu/ksef-saas, wskazując brak wystarczającej zgody dla konkretnego publicznego celu i zestawu. Nie ponowiono zapisu do GitHub ani nie użyto obejścia. Commity i dziennik przygotowano lokalnie; następna zgoda ma obejmować 4041868 do codex/security-foundations (PR #2) oraz drugi pakiet na codex/security-audit-inventory jako draft PR względem foundations. Taka publikacja nie oznacza merge ani deploy.

**Stan odbioru:** kod i testy lokalne powyższych kontroli gotowe; nowy przebieg CodeQL oraz Offline security inventory czeka na publikację. Pełne F01/F03/F04 pozostają otwarte. Właściciel GitHub musi włączyć Dependency graph i ustawić wymagane kontrole; Bartek odpowiada za środowisko, wdrożone RLS, backup/restore i pozostałą infrastrukturę. MFA, pozostałe miejsca service_role, runtime i ćwiczenia incydentu nie zostały ukończone w tym pakiecie.

## 2026-09-13 — Wyjaśnienie maili GitHub i ujawnione automatyczne preview Vercel

**Zlecenie:** Igor, przed zatwierdzeniem kolejnej publikacji, przekazał treść powiadomień i poprosił o ich sprawdzenie. To NIE jest zgoda na push ani wdrożenie. W tej kontroli odczytano załącznik, wyniki/logi GitHub i komentarze PR; nie zmieniano ustawień ani nie otwierano aplikacji preview.

**Powiadomienia:** w załączniku jest sześć maili o wynikach trzech wersji PR (d19c45a, 30f5a79, 7182579), po dwa zestawy kontroli CI/Security, oraz dwa komentarze botów. GitHub Code Scanning informuje o uruchomieniu skanera; Vercel informuje o podglądzie.

**Potwierdzony stan ostatniej opublikowanej wersji 7182579:**
- [CI 34776188642](https://github.com/ezior8888-cpu/ksef-saas/actions/runs/34776188642): główne testy PASS (job 103774620194); dependency-review FAIL (103774620349), z jawnym komunikatem o konieczności włączenia Dependency graph.
- [Security 34776188655](https://github.com/ezior8888-cpu/ksef-saas/actions/runs/34776188655): Secret scan PASS, CodeQL Actions PASS, CodeQL JS/TS blokuje cztery ustalenia opisane wyżej. Ich poprawki w 4041868 są nadal lokalne.
- Pierwsze niepowodzenia parsera SARIF i brak xmllint były problemami odbioru konfiguracji CI; poprawiono je w 30f5a79. Późniejsze czerwone powiadomienia nie oznaczają nowych niezależnych incydentów.

**Nowy fakt wymagający korekty wcześniejszych deklaracji:** [komentarz Vercel w PR #2](https://github.com/ezior8888-cpu/ksef-saas/pull/2#issuecomment-5655251921) został zaktualizowany do Ready o 18:59:09 UTC; status Vercel dla 7182579 również ma success. Zatem publikacja PR wyzwoliła AUTOMATYCZNE wdrożenie wersji podglądowej przez istniejącą integrację. Wcześniejsze określenie „bez wdrożenia” było zbyt szerokie: nie wykonano polecenia deploy, merge ani operacji na Hetzner/Coolify, lecz automatyczny preview powstał.

**Źródło automatyzacji:** sprawdzone workflowy nie wywołują Vercel CLI/API/hooków. Repo zachowuje vercel.json, a dokument migracji dopuszcza Vercel jako zapas. To jest zgodne z istniejącą integracją GitHub–Vercel, która uruchamia preview po aktualizacji gałęzi/PR ([dokumentacja Vercel](https://vercel.com/docs/git/vercel-for-github)). Nie odczytano ustawień konta Vercel.

**Nierozstrzygnięte:** jakie dane, sekrety i usługi są przypisane do preview oraz czy taka integracja jest nadal zamierzona. Etykieta Preview nie dowodzi izolacji od produkcyjnej bazy. Przed kolejną publikacją należy z Bartkiem potwierdzić ten zakres i ewentualnie ograniczyć/wyłączyć automatyzację w oddzielnym zatwierdzonym działaniu. Nie obiecywać, że kolejny push „nie wdraża”: przy obecnym stanie może uruchomić następny preview.

**Status:** nie wysłano kolejnych commitów, nie zmieniono powiadomień ani integracji, nie wykonano restartów czy migracji. Zatwierdzenie opisane w poprzednim wpisie pozostaje oczekujące, teraz z ujawnionym skutkiem automatycznego preview. Aktualizacja dziennika wyłącznie lokalna.

## 2026-09-13 — Zatwierdzona publikacja i zamknięcie dzisiejszego zakresu

**Dyspozycja Igora:** po wyjaśnieniu maili i Vercel Preview zatwierdził publikację przygotowanego pakietu; wyraźnie zabronił rozpoczynania kolejnej fazy i poprosił o listę dla Bartka. Poprzednie wpisy o oczekiwaniu na zgodę są historyczne.

**Wykonano:** wysłano 40418689c301e53a11612f05e34fb5a9b8e6b556 do codex/security-foundations, aktualizując draft PR #2. Powstała [lista czynności dla Bartka](PRZEKAZANIE-BARTEK-2026-09-13.md). Drugi pakiet z 9d1b03f i c046ad0 oraz dziennik przygotowano na codex/security-audit-inventory względem foundations.

**Odbiór publikacji:** PR #2 uruchomił [CI 34777397347](https://github.com/ezior8888-cpu/ksef-saas/actions/runs/34777397347) i [Security 34777397329](https://github.com/ezior8888-cpu/ksef-saas/actions/runs/34777397329). Dla PR #2 potwierdzono PASS głównego zadania CI, skanu sekretów i obu CodeQL. Surowy raport JS/TS: results=0, high=0, critical=0, inputErrors=0 (job 103777902691). Dependency-review nadal FAIL z powodu wyłączonego Dependency graph. Wynik ostatniego commita drugiego pakietu należy sprawdzić w jego PR; nie zakładać powodzenia przed zakończeniem kontroli.

**Pozostało Bartkowi:** Dependency graph, wymagane kontrole/review, potwierdzenie konfiguracji Vercel Preview, chroniony odizolowany staging i zakres sekretów, zgodność faktycznie wdrożonego kodu/workera/schematu. Instrukcja rozróżnia te czynności od późniejszych faz.

**Granice zgody i zakończenie:** zatwierdzenie uwzględnia ujawnione automatyczne preview po publikacji; nie wykonano merge, polecenia deploy, zmian na Hetzner/Coolify, migracji, restartów ani rotacji. Nie wysyłano wiadomości Bartkowi. Nie rozpoczynamy dalszej fazy ani pracy w tle. Kolejne prace wymagają wznowienia przez użytkownika.

## 2026-09-14 — F03: MFA administratorów i dodatkowe granice dostępu

**Dyspozycja:** Igor wznowił stopniową realizację następnej fazy. Potwierdził w rozmowie, że Bartek nie wykonał jeszcze wczorajszego przekazania. Dzisiejszy zakres to kod, lokalne testy i dziennik. Poprzednia zgoda na publikację dotyczyła poprzedniego pakietu; nie wykonano dziś push, merge, wdrożenia, operacji na serwerach, migracji, rotacji ani testów prawdziwych usług.

**Stan początkowy:** worktree flo-agent-interface-04fab0, czysty kod na 2649cd0. Utworzono lokalną gałąź codex/security-admin-mfa. Root repo i jego zastane zmiany .gitignore/AGENTS/.codex/.mcp pozostały nietknięte. Odczyt GitHub potwierdził otwarty draft PR #3 z tym samym headem, ostatni Security PASS i CI FAIL (znana konfiguracja Dependency graph); nowych przebiegów nie było. To nie jest wynik GitHub dla dzisiejszych zmian.

**Wykonano:** pełny opis i scenariusze odbioru w [FAZA-03-ADMIN-MFA.md](FAZA-03-ADMIN-MFA.md).

- **CYB-F03-01:** centralny guard wymaga allowlisty, potwierdzonego emaila, zweryfikowanego AAL2 i aktualnego TOTP. getUser(token) i getClaims(token) odnoszą się do jednego tokenu, a sub musi odpowiadać użytkownikowi. Cookies/metadata nie są źródłem decyzji. Pierwszy enrollment i challenge mają odrębne ścieżki; brak/błąd nie przyznaje dostępu.
- **CYB-F03-02:** jedenaście dodatkowych odczytów flags/support/system/backups chronionych przed klientem uprzywilejowanym. Cztery strony, w tym FLO, wymagają guarda przed rozpoczęciem pracy. Usunięto catch na stronach support/system połykający odmowę; nie zmieniano starych fallbacków wewnętrznych statystyk.
- **CYB-F03-03:** regeneracja kodów i wyłączenie MFA wymagają AAL2 przy samej akcji. Sprawdzenie hasła używa izolowanego klienta, nie obniża sesji przeglądarki; zamyka wyłącznie nową tymczasową sesję, z potwierdzeniem wyniku.
- **CYB-F03-04:** warunkowe zużycie recovery code po id + user_id + used_at IS NULL; sukces wymaga jednego zapisanego rekordu. Dwie równoległe próby nie uzyskują dwóch sukcesów.
- **CYB-F03-05:** usunięcie konta bierze pod uwagę wyłącznie aktywne właścicielstwo. Były właściciel z historycznym role=owner/status=revoked nie wyłącza dawnej organizacji. Błędy odczytu i zapisów zatrzymują dalsze kroki; retencja i wieloetapowość bez transakcji pozostają oddzielne.
- **CYB-F03-06, ograniczenie skutków:** usunięto błędne signOut(UUID). Niedostępne wymuszenie wylogowania jawnie odmawia po autoryzacji. Zawieszenie potwierdza tylko ban i oznacza odwołanie sesji jako niepotwierdzone. Właściwy mechanizm odwołania po ID pozostaje otwarty dla właściciela.

**Korekta podczas dodatkowego przeglądu:** zwykłe SDK auth.signOut ukrywa HTTP 401/403/404. Trzy hermetyczne testy z prawdziwym SDK wykazały błędny sukces pierwszej wersji reauth. Zastąpiono wyłącznie cleanup przez auth.admin.signOut z JWT świeżej sesji i scope local, bez service_role. Po poprawce wszystkie odmowy blokują operację. Nie zastępowano tokenu JWT identyfikatorem ani tokenem innego użytkownika.

**Commity kodu:**
- 3b44695312db85e14cb2f82df79b5da38af0bf07 — izolowana reautoryzacja i potwierdzony cleanup.
- 3351c93b1c008d36f760bdeee8b843650419b2e5 — atomowe zużywanie recovery code.
- 1c7428b2ff4eec7cadd0b5606fb3a86f24a55c18 — zakres usuwania konta i uczciwy status sesji.
- f59297974c7c7511e02c81371fb721a4d02cf660 — obowiązkowe MFA i brakujące granice administracji.

**Końcowa walidacja lokalna kodu:**
- Vitest: **96 plików / 1506 testów PASS**. W tym 21 reauth (rzeczywisty SDK, atrapa HTTP), 13 konsumpcji recovery z barierą współbieżności, 10 zakresu GDPR, 8 statusu odwołania sesji, 30 bocznych odczytów i scenariusze guarda/MFA/ustawień/routingu.
- Typecheck i lint wszystkich 27 zmienionych/nowych plików TS/TSX PASS; diff check PASS.
- Izolowana kompilacja Next.js 16.3.4 webpack w trybie compile PASS. Kopia źródeł bez plików .env, jawna lista zmiennych procesu i syntetyczna konfiguracja Supabase (loopback port 1). Zgodność bajtowa wszystkich 17 zmienionych plików aplikacji z końcowym kodem: PASS. Artefakt lokalny: faktflow-security-compile-YtCv5P. To nie pełny build z generowaniem stron ani test przeglądarkowy/produkcyjny; Sentry zgłosił ostrzeżenie o niepełnym wsparciu trybu compile.
- Gitleaks przygotowanego kodu PASS. Jedno wcześniejsze trafienie dotyczyło sztucznego tokenu dopisanego do testu reauth; zastąpiono go oczywistym krótkim placeholderem. Nie dodano wyjątku ani pominięcia skanera.
- Gitleaks całej osiągalnej historii do f592979: **210 commitów / 9,48 MB, brak trafień**; historyczne trzy dokładne wyjątki pozostały bez zmian.
- Dodatkowe przeglądy agentów potwierdziły kolejność guardów i poprawkę cleanup. To przegląd w obrębie tego zespołu AI, nie zewnętrzny pentest.
- Nie ma zmian pod supabase, lib/jobs ani lib/inngest. Testy nie korzystały z .env, prawdziwej bazy, kont, maili, płatności, KSeF ani kluczy.

**Otwarte warunki odbioru:** Bartek musi potwierdzić działające TOTP w rzeczywistym GoTrue; lokalny config wyłącza enrollment/verification. Trzeba przećwiczyć enrollment/operatora bez membership, stare sesje, odzyskiwanie MFA i zmianę hasła przy secure_password_change. Istniejące recovery codes nie podnoszą AAL do AAL2 — jednorazowość kodu nie naprawia kompletnego odzyskiwania. Brak sprawdzonej ścieżki odzyskania blokuje uznanie obowiązkowego MFA za odebrane. Nadal otwarte: odwołanie sesji po ID, pełne MFA zwykłych kont/API/RLS, pozostała inwentaryzacja oraz retencja i transakcyjność GDPR.

**Publikacja i dalszy krok:** kod jest wyłącznie lokalny, do review jako kolejny draft względem codex/security-audit-inventory (PR #3) w ezior8888-cpu/ksef-saas. Istniejący Vercel Preview może uruchomić się po publikacji. Osobna zgoda ma dotyczyć dokładnie tej gałęzi/pakietu i tego skutku. Wydanie na Hetzner/Coolify wymaga odrębnego uzgodnienia oraz odbioru Bartka. Pełna F03 pozostaje otwarta; nie ustawiono automatyzacji ani pracy w tle.

## 2026-09-14 — Zgoda na publikację pakietu F03

Po przedstawieniu wyników, zakresu gałęzi codex/security-admin-mfa i skutku automatycznego Vercel Preview Igor odpowiedział „zatwierdzam lecisz dalej”. Zgoda obejmuje wysłanie przygotowanego pakietu do ezior8888-cpu/ksef-saas i roboczy PR względem codex/security-audit-inventory (PR #3). Nie oznacza merge ani operacji na Hetzner/Coolify, zmian schematu, rotacji lub odbioru produkcji.

Stan kodu zatwierdzony do wysyłki: f9d3183 (kod aplikacji f592979). Niniejszy wpis jedynie zapisuje zgodę przed publikacją. Wyniki kontroli dla opublikowanego commita oraz faktyczny status publikacji zostaną umieszczone w opisie PR, aby kolejne dopiski dokumentacyjne nie uruchamiały ponownie CI i podglądów. Poprzednie wpisy o oczekiwaniu na zgodę są historyczne.

## 2026-09-14 — Sprostowanie hostingu: własny serwer, pozostała integracja Vercel

**Źródło:** Igor po odbiorze PR #4 doprecyzował, że nie używamy Vercela, a aplikacja działa na własnym serwerze. Jest to zgodne z aktualnymi instrukcjami projektu: Hetzner + Coolify. Wcześniejszy raport zbyt mocno eksponował wynik Vercela bez przypomnienia tej różnicy.

**Rozróżnienie dowodów:** GitHub zgłosił status Vercel SUCCESS dla opublikowanych commitów c409bd6 i 6046db2. To wynik istniejącej integracji, nie potwierdzenie hostingu produkcji ani wdrożenia poprawek na Hetzner/Coolify. Nie odczytano ustawień konta Vercel, dlatego konfiguracja danych i sekretów tego podglądu pozostaje niezweryfikowana.

**Dalsze raportowanie i odbiór:** gotowość aplikacji odnosimy do własnego serwera, faktycznie wdrożonego kodu, workera i schematu. Wpisy o Vercelu dotyczą uporządkowania pozostałości po migracji. Właściciel integracji powinien sprawdzić i odłączyć nieużywane automatyczne podglądy oraz zbędny dostęp, po potwierdzeniu ich konfiguracji. Samo sprostowanie nie stanowi zlecenia wyłączenia integracji.

**Wykonano:** doprecyzowano zasady tego dziennika i dokument F03. Wyłącznie lokalna korekta dokumentacji; bez push, ponownego uruchamiania CI, zmian integracji, migracji i operacji na serwerze.

## 2026-09-14 — Kontynuacja F03: sesje, API, limity i uczciwy stan recovery

**Dyspozycja:** Igor zatwierdził dotychczasowe prace („zatwierdzam wszystko i leć dalej”) i ponownie polecił kontynuować. Właściwy hosting to Hetzner/Coolify. Nowy pakiet powstał w osobnym worktree security-mfa-continuation-20260914, na gałęzi codex/security-mfa-challenge od 9b1e43d; cudzy, równolegle edytowany DZIENNIK-AUDYT.md w poprzednim worktree pozostał nietknięty.

**Ustalenia i poprawki CYB-F03-07…12:** odrzucono AAL1 z aktywnym MFA w prywatnym API, wspólnych granicach danych i wrażliwych operacjach konta. Usunięto zaufanie middleware do czynników w cookies. Dodano wspólny limit pięciu operacji MFA/300 s na konto, atomowy EVAL oraz odmowę przy awarii. Kod ratunkowy nie jest już konsumowany bez odzyskania sesji, a UI/akcje nie generują nieczynnych kodów. Setup administratora jest poza layoutem firmy i nie wymaga organizacji. Zweryfikowany czynnik inny niż TOTP także wymusza challenge przy AAL1. Szczegóły, ścieżki i warunki odbioru: [FAZA-03-SESJE-I-CHALLENGE.md](FAZA-03-SESJE-I-CHALLENGE.md).

**Commity kodu:**
- 0b914e6 — MFA przed dostępem do firmy i operacjami na koncie.
- 2aed9f1 — challenge, limiter, brak pozornego recovery oraz setup operatora.

**Końcowe dowody lokalne:** 103 pliki / **1700 testów PASS**; pełny typecheck PASS; lint 25 plików TS/TSX bez ostrzeżeń PASS. Izolowana kompilacja Next.js webpack w trybie compile PASS (nie pełne generowanie stron ani E2E); 14 zmienionych plików aplikacji jest bajtowo zgodnych z kopią kompilacji. Brak .env i prawdziwych kluczy w kopii, konfiguracja syntetyczna z loopback. Raporty: faktflow-mfa-final-checks-jnI7iq, kopia faktflow-security-compile-F1Oshv.

Gitleaks sprawdzono kontrolnym sztucznym sekretem, również historycznym i z redakcją wyniku: PASS. Skan 29 przygotowanych plików kodu/testów/dokumentacji: **brak trafień**, bez dodawania wyjątków. Dodatkowe przeglądy wykryły utratę odświeżonych cookies przy odmowie API (test najpierw czerwony) i obejście przez inny typ czynnika; oba poprawiono przed końcowym przebiegiem. Ostatni przegląd nie znalazł kolejnych pewnych usterek w tym zakresie; to nie zewnętrzny pentest.

**Inwentaryzacja offline:** nadal 305 zapytań service_role, 77 do przejrzenia i 12 średnich; 101 wejść, 35 sygnałów. Porównano z 9b1e43d: dodatkowa pozycja to nieużywany countRemainingRecoveryCodes; dwa dodatkowe sygnały wynikają z nierozpoznania getVerifiedMfaState przez heurystykę w plikach akcji ustawień. Nie zmieniano klasyfikatora dla poprawienia liczników. Skuteczność granic potwierdzają osobne testy; sam spis nie jest dowodem braku podatności.

**Otwarte:** rzeczywisty EVAL/TTL na SRH/Valkey, GoTrue i konfiguracja TOTP, UI w przeglądarce, pełne odzyskiwanie, bezpośredni Auth/PostgREST i polityki MFA/RLS, wszystkie pozostałe wejścia, odwołanie sesji po ID oraz nonce zmiany hasła. Testy limitera korzystają z atrapy odpowiedzi EVAL, nie wykonały Lua. MFA zwykłych kont bez czynnika pozostaje opcjonalne; nieobsługiwane czynniki przy AAL1 odmawiają dostępu. Obciążenie dodatkowych odczytów Auth wymaga pomiaru na stagingu.

**Stan wydania:** niniejszy wpis jest zapisem lokalnego odbioru przed roboczą publikacją. Konkretne wyniki GitHuba będą zapisane przy opublikowanym commicie w opisie PR, aby same aktualizacje statusu nie uruchamiały ponownie CI. Brak merge, migracji, zmian kluczy, operacji na Hetzner/Coolify i wiadomości do osób trzecich. Pozostała integracja Vercel może nadal uruchomić podgląd; nie jest właściwym hostingiem aplikacji ani dowodem wdrożenia na własnym serwerze. Pełna F03 pozostaje otwarta.

## 2026-09-14 — Odbiór końcowy i blokada roboczej publikacji

**Kod gotowy:** 0b914e6 + 2aed9f1, dokumentacja 52909db. Pobranie aktualnej bazy PR #4 wykazało równoległy commit ef113ae, zmieniający wyłącznie nagłówek DZIENNIK-AUDYT.md. Włączono go lokalnym merge 5dd0106, bez zmian kodu aplikacji. Zachowano pracę Claude’a.

**Potwierdzenie historii:** Gitleaks dla 52909db przeskanował 217 commitów / 9,59 MB bez trafień. Po dołączeniu już opublikowanej korekty dziennika końcowy skan jest osobnym dowodem. Raport skanu źródeł potwierdził bajtową zgodność wszystkich 14 zmienionych plików aplikacji z kompilacją. Testy, typy i lint dotyczą końcowego kodu (1700 PASS, 25 plików lint).

**Publikacja nie nastąpiła:** automatyczny przegląd uprawnień odrzucił git push nowej gałęzi. Pierwszy powód: niezweryfikowany cel i brak wyraźnej zgody na konkretny pakiet. Odczyt konfiguracji potwierdził dokładnie jeden cel push: https://github.com/ezior8888-cpu/ksef-saas.git, zgodny z dotychczasowym repo i PR. Po wykazaniu tego oraz zachowaniu aktualnej bazy ponowna próba została odrzucona: ogólna zgoda na kontynuację nie wystarcza do wysłania tego pakietu i historii do zewnętrznego repo. Nie wykonano kolejnych prób ani obejścia innym kanałem.

**Do decyzji Igora:** publikacja przygotowanego pakietu z tego worktree na codex/security-mfa-challenge w ezior8888-cpu/ksef-saas, jako draft względem codex/security-admin-mfa (PR #4), przy użyciu istniejącego logowania GitHub i, jeśli potrzebne, oficjalnego API. Repo jest publiczne; pozostała integracja podglądów może uruchomić się po wysłaniu gałęzi. Właściwy hosting nadal Hetzner/Coolify. Nie jest to zgoda na merge, migracje ani działania na serwerze.

Pełny opis do przeglądu: [sesje, API i challenge](FAZA-03-SESJE-I-CHALLENGE.md). Kontrole GitHub tego nowego pakietu nie uruchomiły się, ponieważ gałąź nie została wysłana. Stan lokalny i zatwierdzenie publikacji to odrębne etapy; nie wpisywać sukcesu zdalnego na podstawie lokalnych testów.

## 2026-09-15 — Publikacja PR #10 i lokalna integracja prac zespołu

**Zgoda i publikacja:** po wyraźnej akceptacji konkretnego dc7806a, celu i sposobu publikacji powstał roboczy PR #10 względem PR #4. Wcześniejsze wpisy o blokadzie push są historyczne. [CI 34994437965](https://github.com/ezior8888-cpu/ksef-saas/actions/runs/34994437965) oraz [Security 34994438036](https://github.com/ezior8888-cpu/ksef-saas/actions/runs/34994438036): SUCCESS. 103 pliki / 1700 Vitest, 66 XML, 30 testów narzędzi CodeQL; typy, lint, audit produkcyjnych zależności, dependency-review i offline inventory przeszły. CodeQL JS/TS i Actions po 0 wyników oraz 0 błędów wejścia; Gitleaks 219 commitów bez trafień. To odbiór PR na jego bazie, nie produkcji.

**Aktualizacja źródeł:** Igor poprosił sprawdzić zadania Bartka. Odczytano PR #7 (8f2a37f), PR #9 (4d8fda4), bieżące kontrole GitHuba i main b9c3703. Raport operatorski i plan GDPR dołączono poniższymi merge. Stan środowiska w tych dokumentach pochodzi od Bartka; AI nie wykonywało ponownie kontroli żywej bazy. Bieżący dependency-review działa; nie traktować dawnej blokady Dependency graph jako nadal otwartej. Migracje mają numerację właściciela, odrębną od wcześniejszych propozycji.

**Lokalna integracja, po kolejnym poleceniu kontynuacji:** nowy worktree security-account-continuation-20260915 chroni gałęzie PR #4 i #10 oraz cudze zmiany. Commity:
- 2ac6280 — main b9c3703: nowy panel mobilny połączony z aktualnymi granicami MFA.
- 788257c — PR #7: odpowiedź właściciela, uporządkowanie instrukcji dostępu i usunięcie przestarzałego vercel.json. Istniejące 00068/00069 były już identyczne.
- a1f0927 — PR #9: istniejące pliki 00070/00071/00072 i plan skoordynowanego wydania, bez zmian treści i bez wykonania SQL.

**Konflikt zależności:** main zmieniał wyłącznie wersje bezpośrednie Next i xmldom, które nasz pakiet już uwzględniał. Zachowano sprawdzony manifest i lockfile dc7806a (Next 16.3.4, xmldom ^0.9.12, Vitest ^4.1.11), bez regeneracji zależności przechodnich lub cofania poprawek. Nowe funkcje main nie wprowadzają dodatkowych pakietów. Typecheck po merge main PASS.

**Regresja integracji:** sześć nowych scenariuszy łączy rzeczywisty middleware z przełącznikiem mobilnym. On/allowlist nadal wymagają MFA przed stroną; żaden tryb telefonu nie wyłącza ochrony API; AAL2 przechodzi, a odmowa zachowuje odświeżone cookies. Zestaw middleware/mobile/responsive-table: 3 pliki / 48 testów PASS. Auth jest atrapą, więc nie jest to test przeglądarki ani rzeczywistego serwera.

**Stan dalszych prac:** przygotowanie kontroli bootstrapu/zaproszeń i zmiany hasła jest w toku. Końcowy zakres i wyniki zostaną dopisane po testach. Nowa gałąź pozostaje lokalna; integracja nie scala PR-ów na GitHubie i nie oznacza wydania aplikacji/workera. 00072 zachowuje warunki wydania określone przez Bartka.

## 2026-09-15 — Odbiór lokalny: onboarding, zaproszenia i zmiana hasła

**Zakres:** po poleceniu kontynuacji przygotowano CYB-F03-13 (MFA na bootstrapie, zaproszeniach i importach) oraz CYB-F03-14 (potwierdzenie zmiany hasła), wraz z kontrolą czterech akcji formularza faktury po integracji main. [Opis pakietu i odbiór](FAZA-03-ONBOARDING-I-HASLO.md). Konta bez MFA nadal przechodzą zwykły onboarding; konta z aktywnym czynnikiem kończą challenge przed danymi i operacjami. Hasło i nonce nie trafiają do URL ani dzienników.

**Commity:**
- 034cb2a — wspólny guard bez wymogu organizacji, onboarding, zaproszenia, GUS i importy.
- e19fbca — nonce/current_password, formularz, oddzielne limity prób oraz wysyłki.
- 1cfbf4b — wspólna kontrola MFA i aktywnego membership w akcjach formularza faktury.
- 986a2cd — sześć dodatkowych regresji łączących panel mobilny z MFA.

**Weryfikacja końcowego kodu:** 110 plików / **1915 Vitest PASS**, 0 nieudanych i 0 pominiętych; 66 XML PASS; pełny typecheck i lint PASS; 48 testów narzędzi audytu PASS. Wyniki w lokalnym faktflow-account-checks-zujDlC (JSON + logi). Izolowany Next.js webpack compile: PASS, faktflow-account-compile-s4oC5L; konfiguracja syntetyczna, bez .env i kluczy aplikacji. Zgodność bajtowa wszystkich 13 zmienionych plików aplikacji z kopią kompilacji: PASS. Nie jest to pełne generowanie stron ani odbiór runtime. Nowe zależności nie były instalowane.

**Przegląd i regresje:** security-review nie wykazał potwierdzonej podatności w nonce, limiterze i publicznych osłonach. Wstępne P1 o publicznym wywołaniu prefill wycofano po sprawdzeniu workerów Next; nie używać tego jako potwierdzonego exploita. Wzmocnienie helpera faktur jest dodatkową kontrolą bezpośrednią; osobny końcowy przegląd dwóch plików nie wykazał usterki. Testy odmawiają AAL1/TOTP/phone/WebAuthn i awarii Auth przed skutkami, zachowują poprawny bootstrap bez org, AAL2, membership/tenant i kontrakty akcji. Prawdziwy SDK testowany z atrapą HTTP potwierdza zachowanie oryginalnej sesji. Hermetyczny komponent w headless Edge: wymagany kod → jawne wysłanie → błędny kod → sukces, pola zachowane przy błędach, wyczyszczone po sukcesie, 0 żądań sieciowych. To nie przeglądarkowy E2E z GoTrue.

**Sekrety i inwentaryzacja:** Gitleaks kopii 24 przygotowanych plików: 0 trafień; wszystkie 20 plików kodu/testów zgodne z kopią skanu. Historia do 986a2cd: 231 commitów / 9,83 MB, 0 trafień. Bez nowych wyjątków. Offline inventory nadal 305 zapytań (0 krytycznych, 0 wysokich, 12 średnich, 77 do przejrzenia, 216 ok) oraz 101 wejść / 35 sygnałów. Nie zmieniano heurystyk dla poprawy liczników; nie oznaczają one liczby potwierdzonych luk ani domknięcia wszystkich zapytań.

**Pozostałe działania:** zgodnie z opisem pakietu odbiór wersji i konfiguracji GoTrue, dostarczenia/wygaśnięcia nonce, działania EVAL/TTL i awarii SRH/Valkey, pełnych przepływów MFA/RLS na stagingu. Pełne recovery i odwołanie sesji po ID nadal otwarte. Własna sesja nie wykonała SQL, restartów, rotacji, wysyłki prawdziwych maili ani wdrożenia. Pliki 00070–00072 zachowano identyczne jak w PR #9; 00072 podlega skoordynowanemu planowi właściciela.

**Publikacja:** cała nowa gałąź codex/security-account-continuation pozostaje lokalna, po bazie PR #10. Wyniki lokalne nie są wynikiem CI GitHuba tej gałęzi. Pakiet i dziennik są przygotowane do oddzielnej akceptacji publikacji w publicznym repo; opis publicznego PR ma być zwięzły i pozbawiony surowych danych operacyjnych. Nie dopisywać nowych szczegółów bezpieczeństwa do publicznego PR na podstawie samej zgody na wcześniejszy pakiet. Pełna F03 pozostaje otwarta.

## 2026-09-15 — PR #11 i prywatność kontroli wycieków haseł (CYB-F03-15)

**Zgoda i punkt wyjścia:** Igor jawnie zatwierdził publikację pakietu 0ec1069 wraz z dziennikiem. Opublikowano [roboczy PR #11](https://github.com/ezior8888-cpu/ksef-saas/pull/11) względem PR #10. Następnie polecił kontynuację po wyjaśnieniu wyniku kontroli. Dotychczasowy wpis o oczekiwaniu na publikację jest historyczny.

**Rzeczywiste kontrole opublikowanego pakietu:** CI 34999065676 PASS (1915 Vitest, 66 XML, typy/lint/zależności); Security 34999065411 FAILURE przez jedno zgłoszenie SHA-1 przy HIBP. Secret scan: 232 commity, brak trafień; CodeQL Actions PASS. Wyniki wpisano do PR. Automatyczna kontrola zgody nie dopuściła dopisania szczegółów nowego alertu do publicznego opisu; zapisano wyłącznie statusy i linki.

**Ocena i poprawka lokalna:** ustalono wymagane użycie SHA-1 do HIBP range lookup, bez przechowywania lub uwierzytelniania hasła tym wynikiem. Osobno usunięto rzeczywisty nadmiarowy zapis: cache oparty na odcisku konkretnego hasła. Dodano brak cache fetch, zakaz redirect, timeout obejmujący body, limit strumienia 256 KiB, pełną walidację odpowiedzi i stały log bez wyjątków. Zachowano kontrakt fallback. [Pełny zakres i dowody](FAZA-03-KONTROLA-WYCIEKOW-HASEL.md).

**Rozliczenie skanera:** jawny manifest wiąże najwyżej jedno false positive z całością przeglądniętego źródła, linią, ścieżką i regułą. Surowe high pozostaje widoczne. Zmiana bajtów, druga podatność, duplikat, błędny raport lub brak/wygaśnięcie polityki nie daje zielonego wyniku dla tego trafienia. Termin ponownego review: 2026-12-15 UTC, właściciele Igor/Bartek; nie odnawiać automatycznie. SHA256 modułu: 74b53285ee125ef0e5be187700a69f854f457282fbf8df9ec042138518891d0b, linia 34, LF wymuszone tylko dla tego pliku.

**Dowody lokalne:** 111 plików / 1950 Vitest PASS, zero pominiętych; pełne typy/lint PASS; 67 testów narzędzi PASS. Osobny natywny fetch na loopback: 5/5 PASS. Izolowany Next compile PASS i zgodny odcisk. Przeglądy kodu, bramki i manifestu bez potwierdzonych usterek. Prawdziwy historyczny SARIF wykorzystano do sprawdzenia kompatybilności parsera; kopia z przestawioną linią nie stanowi nowego skanu. Nowe wyniki GitHuba wymagają publikacji nowego commitu.

**Granice:** GitHub alert #1 nadal jest otwarty; manifest sam go nie zamyka. Nie usunięto istniejących kluczy Redis (dotychczasowy TTL 24 h). Bez SQL/produkcji/rotacji oraz bez prawdziwych zapytań HIBP. Odbiór Auth, Redis/RLS i recovery nadal otwarty. Ten wpis nie potwierdza wdrożenia.

**Zapis pakietu CYB-F03-15:** kod i testy w 0d45b7f15722d58ef763d35500e17696bcac8030. Gitleaks 10 przygotowanych plików bez trafień; historia tego commitu: 233 commity / 9,87 MB, brak trafień. Zweryfikowano zgodność pełnego odcisku bloba Git, manifestu i kopii kompilacji. Nowa poprawka jest lokalna; rzeczywisty zdalny wynik wymaga jej publikacji i nowego przebiegu.

## 2026-09-16 — Stan po publikacji PR #11 i kontynuacja dostępu (CYB-F03-16…19)

**Dyspozycja i granice:** Igor wznowił pracę po przerwie („siemano stary lecimy dalej”). Utworzono osobny worktree `security-access-continuation-20260916`, gałąź `codex/security-access-continuation`, od `a8dd10935b9c44225038fe8598dd53a28cb44da8`. Zastane zmiany użytkownika w root repo pozostały nietknięte. Bez merge, publikacji nowej gałęzi, produkcji, SQL, nowych migracji, rotacji i prawdziwej poczty.

**Rozliczenie wczorajszego wpisu:** po jego zapisaniu Igor jawnie zatwierdził publikację `a8dd109` oraz rozliczenie wyłącznie alertu CodeQL #1. Wysłano poprawkę do [PR #11](https://github.com/ezior8888-cpu/ksef-saas/pull/11), pozostawiając draft względem PR #10. [CI 35004416971](https://github.com/ezior8888-cpu/ksef-saas/actions/runs/35004416971) i [Security 35004417038](https://github.com/ezior8888-cpu/ksef-saas/actions/runs/35004417038) przeszły: wszystkie siedem kontroli, 1950 Vitest, 66 XML; historia 234 commitów bez sekretów. Jeden HIBP high pozostaje widoczny w surowym wyniku i został dopuszczony wyłącznie przez przeglądnięty manifest. Alert #1 oznaczono false positive z uzasadnieniem po wskazanej zgodzie. Wpis z 15.09 o otwartym alercie i oczekiwaniu na publikację jest historycznym stanem przed tą operacją. Dzisiejszy odczyt potwierdził nadal zielone kontrole PR #11; nie są to wyniki CI dla dzisiejszego kodu.

**Stan prac Bartka:** main nadal `b9c3703b6997d6623ba30f889c5f0c5ff267218b`, PR #7/#9/#11 bez nowych komentarzy i brak nowych gałęzi/commitów operatora do włączenia. Nie ma nowego dowodu odbioru GoTrue, Redis, RLS czy pełnego recovery. To obserwacja repo, nie twierdzenie o braku prac poza GitHubem. Obowiązują wcześniejsze datowane raporty właściciela, w tym wstrzymany/skorelowany odbiór 00072.

**Wykonano:** szczegóły, źródła i scenariusze odbioru w [pakiecie odzyskiwania hasła i dostępu](FAZA-03-ODZYSKIWANIE-HASLA-I-DOSTEP.md).

- CYB-F03-16: ograniczono próby hasła przy wyłączeniu TOTP, zachowano inne rodzaje czynników, wstrzymano usuwanie przy błędzie cleanup i ujawniono częściowy wynik bez pozornego pełnego sukcesu.
- CYB-F03-17: osobny formularz zapomnianego hasła z podpisanym, świeżym PKCE recovery AMR, weryfikacją tego samego JWT/tożsamości/sesji, zachowaniem wymogu MFA, kontrolą siły/wycieków i atomowym pojedynczym zapisem na sesję. Żądania maila mają osobne limity email/IP, konfigurację zaufanej domeny i jednakowy komunikat bez enumeracji kont.
- CYB-F03-18: usunięto pozorną wysyłkę przez admin generateLink. Akcja po guardzie odmawia i pokazuje własny proces odbiorcy; administracyjnie inicjowany reset pozostaje niedostępny do czasu właściwego kontraktu odbioru.
- CYB-F03-19: wspólne sprawdzanie wewnętrznych przekierowań, brak zaufania do request origin/forwarded, kontrolowane 503 przy błędnej konfiguracji oraz usuwanie fragmentów logowania przed Auth I/O również przy błędzie.

**Poprawka z przeglądu:** zwykłe `auth.signOut` zamienia 401/403/404 w lokalny sukces cleanup. Odtworzono zachowanie na zainstalowanym SDK. Globalne odwołanie własnej sesji używa teraz dokładnie zweryfikowanego JWT na anon kliencie przez metodę zachowującą błąd; lokalny cleanup i oba statusy UI są osobne. Regresje obejmują 204/401/403/404/500. Przed zapisem ponownie weryfikowane są świeżość/MFA/tożsamość po I/O kontroli hasła.

**Commity kodu:**
- `f55ab932a8126b82dc7f296efde9481473fac999` — TOTP, limity i częściowy cleanup.
- `5446b190f1b67db4155676c37ab0ff3ddedce3fb` — callback, domena, wewnętrzne przekierowania i fragment.
- `f1069606d96f0ad34b4b59a4b78c3e809a111fea` — kompletny samodzielny reset hasła, jednorazowość akcji i uczciwy stan resetu admina.

**Końcowa weryfikacja kodu:** 124 pliki / **2332 Vitest PASS**, zero pominiętych; **66 XML PASS**, **67 testów narzędzi PASS**; pełny typecheck PASS. Pełny lint: 0 błędów, 29 istniejących ostrzeżeń poza zmienionym zakresem (poprzednio 30); wszystkie 34 zmienione/nowe pliki TS/TSX: lint bez ostrzeżeń PASS. Izolowany Next webpack compile PASS; 34 pliki kodu/testów identyczne bajtowo z kopią kompilacji. To tryb compile, nie pełne generowanie stron ani odbiór środowiska.

**Test przeglądarki:** rzeczywisty formularz w headless Edge 153, akcja serwera jako atrapa: pending, MFA, ponowienie procesu, sukces i wszystkie cztery kombinacje statusów wylogowania PASS; 0 żądań strony i 0 pageerror. To nie E2E z GoTrue. Testy efektu finish obejmują replay/unmount i usunięcie fragmentu przed Auth. Zespół AI nie znalazł kolejnych potwierdzonych usterek po poprawce logout; to nie zewnętrzny pentest.

**Skan i inwentaryzacja:** Gitleaks kopii 36 przygotowanych plików: 0 trafień; historia do `f106960`: 237 commitów / 9,98 MB, 0 trafień, bez nowych wyjątków. Odcisk HIBP pozostaje dokładnie `74b53285ee125ef0e5be187700a69f854f457282fbf8df9ec042138518891d0b`; manifest nie został rozszerzony ani odnowiony. Offline nadal 305 zapytań service_role (77 do przeglądu, 12 średnich) oraz 103 wejścia / 35 sygnałów. Dwa nowe wejścia to odzyskiwanie hasła. Heurystyki nie zmieniano; liczby nie są werdyktem braku podatności.

**Dowody lokalne:** `faktflow-day16-validation-I2nPLH`, `faktflow-day16-offline-YWnCbD`, `faktflow-day16-compile-8PcNP8`, `faktflow-day16-scan-zJnPhj`, `faktflow-reset-ui-20260916-wiSXc4`. Hermetyczna konfiguracja bez .env i rzeczywistych usług. Zrzuty/raporty robocze są poza repo.

**Otwarte i przekazanie:** Bartek odbiera wersję/konfigurację GoTrue, PKCE mail w tej samej przeglądarce, TOTP podczas resetu, secure_password_change, awarie/równoległość/TTL SRH-Valkey, zaufanie proxy oraz bezpośredni Auth/PostgREST. Limit 15 minut i pojedynczy zapis dotyczą akcji aplikacji, nie całego API GoTrue; access JWT mogą przetrwać do wygaśnięcia. Nadal otwarte pełne odzyskiwanie po utracie MFA oraz odwołanie sesji innego konta po ID. Aktualna dokumentacja ma eksperymentalne natywne recoveryCodes, ale lokalny SDK 2.103.3 go nie udostępnia — potrzebna weryfikacja kompatybilności, bez własnego JWT i bez usuwania faktorów jako obejścia. Szczegółowa lista jest w nowym pakiecie.

**Stan publikacji:** nowe commity i dokumentacja są lokalne, przygotowane jako kolejny draft względem PR #11. Poprzednia dokładna zgoda na publikację `a8dd109` i alert #1 została wykonana; nie obejmuje sama w sobie nowego pakietu z opisem bezpieczeństwa. Nowe wyniki GitHuba i faktyczną publikację zapisać po ich wykonaniu w opisie PR, żeby dokumentacyjne dopiski nie uruchamiały bez potrzeby kolejnych przebiegów. Pełna F03 pozostaje otwarta.

## 2026-09-16 — przegląd izolacji firm i 89 zapytań (CYB-F03-20…23)

**Dyspozycja:** Igor zatwierdził dalszą pracę po PR #12. Nowy worktree `security-tenant-boundaries-20260916`, gałąź `codex/security-tenant-boundaries`, baza `36f2baeac39475fba2fbcbcb849d6c8bea5f8ca5`. Root checkout i zastane zmiany użytkownika nietknięte. Nie wykonano SQL/nowych migracji/produkcji ani publikacji tego pakietu.

**Rozliczenie poprzedniego wpisu:** PR #12 został wcześniej jawnie zatwierdzony i opublikowany jako draft względem PR #11. Dla 36f2bae [CI 35114996980](https://github.com/ezior8888-cpu/ksef-saas/actions/runs/35114996980) i [Security 35114996655](https://github.com/ezior8888-cpu/ksef-saas/actions/runs/35114996655) PASS: siedem kontroli, 2332 Vitest/66 XML; Gitleaks 238 commitów bez trafień, CodeQL JS/Actions bez wyników. Stan opublikowany zapisano w PR bez kolejnego dokumentacyjnego przebiegu CI. Wpis o lokalnym oczekiwaniu PR #12 był stanem przed publikacją. Dzisiejszy odczyt nie wykazał nowych commitów/raportów Bartka; main nadal b9c3703, PR #7/#9 bez nowego materiału. To obserwacja repo, nie dowód braku działań poza nim.

**Zakres i wynik:** [pełny pakiet z odbiorem Bartka](FAZA-03-IZOLACJA-FIRM-I-SERVICE-ROLE.md) oraz [rejestr 89 pozycji](audyt/service-role-review-20260916.json). Historyczne 78 zastąpiono aktualnym punktem odniesienia:77 do przejrzenia + 12 średnich w 305 zapytaniach bazowego commitu. Każdy z 89 rekordów ma identyfikator, tożsamość, guard, dowód i ograniczenia; brak duplikatów/pominięć. To rozliczenie, nie deklaracja 89 bezpiecznych miejsc ani ponowny audyt 216 automatycznych „ok”.

- CYB-F03-20: powiązania faktur w eksporcie, prawidłowe kierunki, tenantowe liczniki przypomnień i konflikt kolejki offline.
- CYB-F03-21: firma–faktura/import przed skutkami jobów, bezpieczniejsze failure callbacks, kwarantanna własnych niezgodnych wpisów kolejki, wymagany tenant i jeden zmieniony rekord helpera, kontrola członkostwa autora OCR.
- CYB-F03-22: tożsamość zgody FLO, tenant w wykonaniu/odciskach/cofaniu, aktualne wyłączniki, odrzucanie obcych ID i błędnych kwot, poprawki wyścigu oraz usunięcie fałszywego cofania salda bez cofnięcia płatności. Nie aktywowano niepodłączonego payment.confirm.
- CYB-F03-23: uczciwy eksport konta JSON v2 z limitami, błędy preferencji poczty/retry webhooka i brak danych zdarzenia w logu awarii audytu.

**Commity kodu:** 9e5fd2b (eksport/scheduler/offline), 67eadab (joby), ac3bc20 (FLO), 2874fa7 (eksport konta), 574abf6 (poczta), dd616a7 (prywatność audytu). Pełne SHA w dokumencie pakietu.

**Weryfikacja:**132 pliki/2465 Vitest PASS, 66 XML PASS, 67 narzędzi PASS; typecheck PASS; lint: 0 błędów / 29 istniejących ostrzeżeń; 44 zmienione pliki TS/TSX bez ostrzeżeń. Gitleaks 46 przygotowanych plików bez trafień; pełna historia do dd616a7: 244 commity bez trafień. Źródła zgodne z odciskami po commitach. Dodatkowy review poprawił 2 konkretne ścieżki błędu; końcowo bez nowych otwartych uwag w zmienionym zakresie. Mocki nie zastępują odbioru serwera.

**Kompilacja pozostaje niepotwierdzona:**4 próby webpack compile zakończone 2 jawnymi OOM i 2 awariami procesu Windows. Próba ograniczenia zasobów i optymalizacji dotyczyła wyłącznie kopii testowej; nie zmieniono repo next.config.ts ani ustawień komputera. Dokończyć build na środowisku z dostępną pamięcią przed wydaniem. Nie przedstawiać zielonych testów jako zielonego builda.

**Otwarte/Bartek:** wysoki priorytet zgodności tenant–invoice w samej bazie (payments+trigger salda, reminders+UNIQUE, offline queue, parent faktury) oraz created_by OCR. Kod nie zamyka bezpośredniego PostgREST. Dodatkowo sekwencja mailowa używa usuniętej users.tenant_id, trwały kontrakt zgody na przypomnienie wymaga osobnego projektu, a wcześniejsze GoTrue/Redis/recovery/backup pozostają otwarte. Rejestr zawiera niepodłączone helpery i świadome globalne crony, bez fałszywego zielonego statusu całości.

**Skaner po zmianach:**305 zapytań (217 ok / 64 do przejrzenia / 24 średnie), 103 wejścia / 36 sygnałów, heurystyki nietknięte. Liczniki nie są liczbą luk; nowe helpery objęto review/testami także tam, gdzie parser ich nie rozpoznaje. HIBP i jego manifest oraz wszystkie migracje są identyczne jak w bazie.

**Przekazanie:** pakiet pozostaje lokalny, przygotowany do przeglądu jako kolejny draft względem PR #12. Publikacja nowych szczegółów do publicznego repo wymaga decyzji o tym konkretnym pakiecie; wcześniejsze zgody na PR #11/#12 zostały wykonane. Nie wykonano merge/deploy. F03 pozostaje otwarta.

## 2026-09-16 — przegląd całego łańcucha po publikacji PR #13 (REV-01…08)

Na prośbę Igora wykonano przekrojowy przegląd dotychczasowych prac na f3ca0d4. [Pełny raport, źródła, dowody i kolejność napraw](PRZEGLAD-CALOSCI-2026-09-16.md). To przegląd, bez nowych napraw kodu i bez wdrożenia.

**Korekta stanu publikacji poprzedniego wpisu:** pakiet f3ca0d4 jest opublikowany w roboczym [PR #13](https://github.com/ezior8888-cpu/ksef-saas/pull/13). Wszystkie 7 kontroli tego HEAD zakończone sukcesem; [CI](https://github.com/ezior8888-cpu/ksef-saas/actions/runs/35120892202), [Security](https://github.com/ezior8888-cpu/ksef-saas/actions/runs/35120892103). Łańcuch #1/#2/#3/#4/#10/#11/#12/#13 nadal draft, open, niepołączony. Publikacja nie oznacza wdrożenia.

**Nowy wynik lokalny:** 132 pliki / 2465 Vitest PASS, typecheck PASS, lint 0 błędów / 29 wcześniejszych ostrzeżeń. Dodatkowe hermetyczne próby potwierdziły niezgodność wersji zgody FLO, odrzucanie Stripe przez proxy, pozorny logout przy Auth500, możliwość podstawienia sesji przez legacy finish i pominięty limiter prób hasła GDPR. Statycznie potwierdzono błąd timera bezczynności i brak kontroli relacji firmy w UPO. To starsze luki lub pozostałości niedomknięte we wcześniejszych poprawkach; nie deklarujemy incydentu na serwerze.

**GitHub:** efektywne reguły main chronią tylko przed usunięciem i force-push; wymagane statusy/PR/review nie są skonfigurowane. Właściciel powinien domknąć tę wcześniej otwartą bramkę.

**Otwarte:** szczegóły REV-01…08 w raporcie, znane relacje DB oraz GoTrue/Redis/recovery/backup i pełna kompilacja. Nie rozszerzać ręcznej puli 89 ani etykiet heurystyki na zapewnienie bezpieczeństwa wszystkich zapytań. Historyczne stwierdzenie o czystych logach nie obejmuje całego loggera workera.

Nowy raport i ten wpis pozostają lokalne. Nie wykonano commit/push nowych ustaleń, merge, migracji, zmian serwera ani prawdziwej wysyłki. Odtwarzające testy znajdują się w TEMP, z odniesieniami w raporcie. Kolejny krok to osobny pakiet poprawek i odbiór właściciela, nie automatyczne wdrożenie.

## 2026-09-23 — poprawki po przeglądzie REV-01…08

Na prośbę Igora wznowiono i dokończono lokalne naprawy na bazie f3ca0d4 (PR #13), gałąź codex/security-review-remediation. [Pełny opis napraw, testów i granic](NAPRAWY-PRZEGLADU-2026-09-23.md). Przerwany wcześniej zapis nie był wykonany; po odnowieniu dostępu sprawdzono rzeczywisty stan plików i dokończono zmiany. Root checkout i jego własne zmiany pozostawiono nietknięte.

**Wykonano:** walidacja firmy/faktury/numeru KSeF w UPO i retry; dokładny wyjątek podpisanego Stripe webhook; wersja treści i input w zgodzie FLO; poprawny termin bezczynności; lokalny logout mimo awarii Auth i uczciwy status odwołania; odmowa legacy finish z zachowaniem PKCE; wspólny atomowy budżet prób hasła obejmujący GDPR. Dodano rzeczywiste testy React/SDK, regresje wyścigów, cache i awarii. Poprawiono historyczny zbyt szeroki wniosek o logach workera, zachowując jego pierwotny zapis.

**Commity kodu:**
- 0ef909a7044975a9327bcdb5b38972171c5005e6 — security: update ZIP tooling and add DOM regression dependencies
- 020cd27a49c7e6c5d97805c57a0a8e21eae2d7d1 — fix: let signed Stripe webhooks reach signature verification
- d631ae5780c413626f7d32882cfe224542e749d0 — security: bind UPO jobs and retries to accepted tenant invoices
- 61ef18163e9ae6c6db1836a83e7316da4bf774d1 — security: bind FLO consent to the displayed operation and input
- 1d7e7cf97c21a9c660ff70438f19e5e9581739a2 — security: reject unsolicited legacy sign-in sessions
- d0b6b27ad6f7d662c6134726c823a2f2f675d995 — security: enforce inactivity deadline and report logout outcomes
- f2a22bda30cd0f0acd63606550cb1e0ed0a278aa — security: share password reauthentication budget with GDPR

**Weryfikacja:** 140 plików / 2568 Vitest PASS; 66 XML PASS; 67 testów narzędzi PASS; typecheck PASS; lint 0 błędów / 29 istniejących ostrzeżeń. Pełny next build --webpack PASS w 102 s, 82/82 stron, finalizacja ukończona. Build w kopii TEMP bez sekretów, heap 6 GB/cpus1/memoryopt, bez standalone/Dockera; kod aplikacji zgodny, późniejsza zmiana dotyczyła testu TOTP. Tymczasowy alias nowych dev typów i poprawki konfiguracji testowej nie zmieniały repo config ani produkcji. Dowody: TEMP/faktflow-auth-dom-U8LY1F, faktflow-review-validation-bZt9lU, faktflow-remediation-full-build-VY4kwc.

**Zależności:** wykryto 2 nowe zgłoszenia adm-zip (high/moderate), wyłącznie ścieżka dev inngest-cli. Dokładny override 0.6.1 usuwa oba zgłoszenia z ponownego audytu all/prod: po 0, exit 0. Frozen lockfile offline PASS. Dodano jsdom/@types do regresji React; shared node_modules nietknięte. Build/testy korzystają ze współdzielonych istniejących zależności oraz izolowanego dodatku jsdom; czystą instalację końcowego lockfile ma dodatkowo potwierdzić CI. Produkcyjne zależności pozostają takie same.

**Skan sekretów przed commitami:** Gitleaks 8.30.1, 48 przygotowanych plików kodu/testów/dokumentacji — brak trafień, bez nowych wyjątków. Dowód TEMP/faktflow-remediation-scan-x5QCu6. Końcowe dokumenty oraz historia 252 commitów do f2a22bda30cd również bez trafień; dowód TEMP/faktflow-final-remediation-check-jcFYi4.

**Otwarte/Bartek:** REV-04: konto nie ma admin/maintain; świeże reguły main nadal tylko deletion/non_fast_forward. [Gotowa konfiguracja sześciu kontroli, PR/review i odbiór](GITHUB-WYMAGANE-KONTROLE.md). REV-01: spójność parent–receipt, granty i test dwóch firm przez PostgREST. REV-03: nowa zgoda zabezpiecza wejście wykonawcy; niezmienność późniejszego maila w starszej kolejce przypomnień wciąż wymaga osobnego projektu. Ponadto GoTrue/PKCE/MFA/logout, Valkey EVAL/TTL, obraz aplikacji+workera, backup/restore i wcześniejsze zależności F03. Nie włączano nowych funkcji FLO.

**Stan wydania:** kod i dokumentacja lokalne, brak SQL/nowych migracji, zdalnych ustawień, merge i wdrożenia. Zielone wyniki PR #13 odnoszą się wyłącznie do f3ca0d4. Nie stanowią CI nowych commitów. F03 pozostaje otwarta do odbioru środowiska i zaległych granic danych.

## 2026-09-23 — REV-03: trwała zgoda aż do wysyłki przypomnienia

**Dyspozycja:** Igor zatwierdził kontynuację. Oddzielna gałąź codex/security-reminder-consent, baza f502baa1f54128cf3c329dd25f3c8fc5531e61b2. Root repo i zmiany użytkownika nietknięte. Bez serwera, SQL, nowych migracji, prawdziwej poczty i merge.

**Rozliczenie poprzedniego wpisu:** pakiet f502baa został opublikowany jako [roboczy PR #19](https://github.com/ezior8888-cpu/ksef-saas/pull/19). Wszystkie 7 kontroli dokładnego HEAD zakończone sukcesem: [CI](https://github.com/ezior8888-cpu/ksef-saas/actions/runs/35894636445) i [Security](https://github.com/ezior8888-cpu/ksef-saas/actions/runs/35894636254). Świeży odczyt potwierdził draft/open, bez merge. To wynik poprzedniego pakietu; nie zastępuje CI obecnej gałęzi.

**Wykonano:** [pełny zakres, testy i odbiór](ZGODA-NA-PRZYPOMNIENIA-2026-09-23.md). Wspólny podgląd manual/FLO, trwała koperta i gotowy PDF, rzeczywista zgoda związana z wersją i edycją, dispatch odróżniony od zwykłego consumed_at. Kolejka używa zatwierdzonych danych i stałego klucza Resend, ponownie sprawdza bieżące uprawnienia/stan faktury/wyłączniki. Zaufany receipt pozwala dokończyć historię po awarii bez kolejnej wysyłki. Limit podglądów i bezpieczny HTML. Stare losowe tokeny odrzucane.

**Weryfikacja:** 145 plików / 2681 Vitest, 66 XML, 67 narzędzi — PASS; typecheck PASS; lint 0 błędów / 29 wcześniejszych ostrzeżeń. Pełny Next build PASS w 100 s, 82/82 stron; 1294 pliki zgodne bajtowo z kopią. Bez standalone/Docker i E2E z usługami. Regresje obu modeli kolejki, deadline, receipt, NIP i przejściowych błędów DB. Dowody TEMP/faktflow-reminder-validation-ehXJ1o oraz faktflow-reminder-consent-build-Z6iy0M. Offline: 302 zapytania service_role (20 średnich, 65 do przeglądu), 103 wejścia / 36 sygnałów — nadal materiał do ręcznej weryfikacji.

**Ważne dla Bartka:** faktyczne service-only grants flo_* i UNIQUE etapów wymagają odbioru. Manual także podlega wyłącznikom FLO; żadnych flag nie włączano. Niepewna wysyłka pozostaje do rozliczenia i nie dostaje automatycznie nowego klucza. 48 h obejmuje tę fakturę, nie wszystkie wpłaty kontrahenta. Oddzielne odczyty nie zapewniają atomowości z zewnętrzną pocztą. Plan odbioru i rollback w podlinkowanym dokumencie. F03 i odbiór infrastruktury pozostają otwarte.

**Zapis kodu i skan:** 89cc64b05276a2ef9dfcec18ecdcfe5ab3ee3165. Gitleaks 8.30.1: 33 przygotowane pliki kodu/testów/dokumentacji, brak trafień, bez nowych wyjątków. Dowód TEMP/faktflow-reminder-scan-EW4AH9.

**Stan wydania w chwili wpisu:** lokalny, zweryfikowany pakiet gotowy do roboczego PR względem #19. Wyniki nowego SHA zostaną dopisane do opisu tego PR po publikacji. Wpis nie potwierdza wdrożenia.

## 2026-09-23 — okno wpłat kontrahenta i rozliczanie niepewnej wysyłki

**Dyspozycja i punkt wyjścia:** Igor zatwierdził dalszą pracę po [roboczym PR #23](https://github.com/ezior8888-cpu/ksef-saas/pull/23). Baza 88f430b3832eb6da75b8ecbffa81f03bf6c262ef; gałąź codex/security-contractor-payment-window. PR #23 miał 7/7 kontroli dokładnego HEAD PASS, lecz nie jest połączony ani wdrożony. Root checkout i zmiany użytkownika pozostały nietknięte.

**Zmiana 1 — znane wpłaty przed mailem:** [szczegółowy zakres i granice](OKNO-WPLAT-PRZYPOMNIEN-2026-09-23.md). W ostatnim sprawdzeniu przed Resend worker czyta także wpłaty z innych faktur tego samego kontrahenta oraz importy bankowe, włącznie z późno zapisanymi, oznaczonymi jako dopasowane/ignorowane i kwotami o obu znakach. Sprawdza NIP, firmę powiązanej faktury, kompletność wyników i ogranicza rozmiar odczytów; brak wiarygodnego NIP lub niepełny odczyt zatrzymuje wysyłkę. Daty DATE oznaczają konserwatywny cały dzień graniczny. Commit 7efd84a7611ec5472fef2fe5996a178d525da153.

**Zmiana 2 — niepewna dostawa:** [runbook operatora](RUNBOOK-PRZYPOMNIENIA-NIEPEWNA-WYSYLKA.md). Watchdog alarmuje po 30 minutach zamiast 60, rozróżnia receipt/dispatch/legacy/błąd odczytu bez treści maila/PDF w Sentry i podaje liczbę pending albo stan jej niedostępności oraz informację o obcięciu 50 szczegółów. Strona zaległości pokazuje orientacyjny stan oczekuje/wymaga weryfikacji/niedostępny; niepełny odczyt nie udaje braku wysyłki, a przycisk przygotowania zostaje wyłączony. Komunikaty nie odsyłają już do nieistniejącej historii dostaw. Nie dodano automatycznego ponowienia z nowym kluczem. Commit 085707268cf74e6314441580cf1083218a924163.

**Weryfikacja lokalna:** 147 plików / 2720 testów Vitest PASS; 66 testów XML PASS; 67 testów narzędzi bezpieczeństwa PASS. TypeScript PASS w izolowanej konfiguracji z developerskimi typami jsdom; pełny lint 0 błędów / 29 wcześniejszych ostrzeżeń. Pełny Next build --webpack PASS, 82/82 stron, 77 s; izolowana kopia 1299 plików źródłowych bez .env i sekretów, w chwili kopiowania zgodna bajtowo ze źródłami. Ustawienia pamięci/CPU i alias jsdom dotyczyły wyłącznie kopii, bez obrazu standalone/Docker. Gitleaks 15 zmienionych plików: brak trafień. Dowody lokalne: TEMP/faktflow-payment-recovery-final-tests-xMe3BG, TEMP/faktflow-payment-recovery-build-RLDjeg, TEMP/faktflow-payment-recovery-scan-V50YHm. Inwentaryzacja offline: 305 zapytań service_role (0 krytycznych, 0 wysokich, 19 średnich, 69 do przeglądu, 217 ok), 103 wejścia / 36 sygnałów; klasyfikacja heurystyczna, nie dowód braku luk. Dowód: TEMP/faktflow-payment-recovery-inventory-Rby1et.

**Granice i odbiór Bartka:** W repo nie ma importera zasilającego payment_imports, więc niezaimportowany przelew pozostaje niewidoczny. Oddzielne odczyty i zewnętrzna poczta nie są atomowe. W 00014 rola authenticated ma UPDATE/DELETE do payments, payment_imports i payment_reminders; może ukryć dowód wpłaty lub zafałszować orientacyjny stan UI. Brakuje złożonego FK tenant–invoice. To warunek bezpieczeństwa przed szerszym uruchomieniem automatycznych przypomnień: Bartek musi sprawdzić rzeczywiste granty/RLS i relacje na serwerze, źródło/świeżość importów, konwencję znaku kwoty oraz przypadki dwóch firm i niejednoznacznej dostawy. Odczyt ponad 500 wierszy celowo blokuje wysyłkę; dla dużych firm potrzebny jest indeksowany kontrakt bazowy. Przed aktywacją sprawdzić także oba backendy kolejek i konto dostawcy poczty według runbooka. Nie wykonywano SQL, migracji, wysyłki prawdziwego maila, zmian serwera ani wdrożenia.

**Status wydania:** dwa commity kodu i szczegółowe dokumenty są lokalne. Dziennik jest osobnym zapisem po pełnej walidacji; wyniki GitHub CI/Security dla nowego HEAD będą potwierdzone i zapisane w opisie roboczego PR po publikacji. Zielony build lokalny nie zastępuje testu rzeczywistej konfiguracji produkcji.

## Format następnego wpisu

Dopisz wpis dopiero po faktycznym działaniu:

- Data, autor, faza i identyfikator ryzyka.
- Zakres zgody; środowisko i stan wyjściowy.
- Problem/scenariusz oraz źródło ustalenia.
- Wykonana zmiana; pliki i commit.
- Weryfikacja: metoda, kontrolne dane, wynik oczekiwany i rzeczywisty, identyfikator dowodu.
- Status osobno dla kodu, testów i wdrożenia; czego nie sprawdzono.
- Skutki uboczne, zależności, możliwość wycofania; przy incydencie ochrona dowodów.
- Właściciel pozostałych działań, konkretne następne zadanie i termin przeglądu wyjątku, jeśli istnieje.
