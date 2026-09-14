# Dziennik odporności cybernetycznej — FaktFlow / KSeF SaaS

## Zasady kontynuacji dla ludzi i AI

Ten dziennik śledzi realizację [planu odporności cybernetycznej](PLAN-ODPORNOSCI-CYBER.md). Jest osobnym etapem po [wcześniejszych naprawach Astry](DZIENNIK-NAPRAW-ASTRA.md) i [audytach Claude](DZIENNIK-AUDYT.md). Nie zastępuje ich ani nie zmienia historycznych wyników.

- Aktualna dyspozycja Igora z 2026-09-14: wznowić następną część planu. Przygotowano lokalnie pakiet F03 (MFA i granice administracji); pełna faza i odbiór środowiska pozostają otwarte. Igor następnie zatwierdził publikację tego pakietu na codex/security-admin-mfa i draft PR względem PR #3, z ujawnionym skutkiem Vercel Preview. Brak zgody na merge, działania produkcyjne, SQL i rotacje.
- Hosting właściwej aplikacji: własny serwer Hetzner zarządzany przez Coolify (Igor potwierdził ponownie 2026-09-14). Vercel nie jest używanym hostingiem aplikacji; odnotowane statusy Vercel dotyczą pozostałej integracji GitHuba i nie potwierdzają wdrożenia na własnym serwerze.
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
