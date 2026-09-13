# Dziennik odporności cybernetycznej — FaktFlow / KSeF SaaS

## Zasady kontynuacji dla ludzi i AI

Ten dziennik śledzi realizację [planu odporności cybernetycznej](PLAN-ODPORNOSCI-CYBER.md). Jest osobnym etapem po [wcześniejszych naprawach Astry](DZIENNIK-NAPRAW-ASTRA.md) i [audytach Claude](DZIENNIK-AUDYT.md). Nie zastępuje ich ani nie zmienia historycznych wyników.

- Aktualna zgoda Igora z 2026-09-13: rozpocząć stopniową realizację planu. Pierwszy pakiet obejmuje CI i zabezpieczenie celu testów. Samo otwarcie tego pliku nie upoważnia do wdrożenia produkcji, SQL, testów na produkcji ani rotacji; działania operacyjne nadal wymagają konkretnego uzgodnienia.
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

**Weryfikacja celowana:** 12 testów recovery/GUS, 14 testów tokenu oraz 4 testy metadanych raportu PASS; lint zmienionych plików PASS. Niezależny przegląd zmiany unsubscribe bez uwag. Workflow Security uruchamia testy bezpiecznej diagnostyki i redakcji. Nowy CodeQL jest konieczny do potwierdzenia zamknięcia czterech sygnałów.

**Granice:** audit-client-bundle pozostaje skryptem operatorskim poza zwykłym CI; stary tryb build wymaga osobnego przeglądu wyjścia procesu i zmiennych. Żaden z tych testów nie odczytywał sekretów aplikacji ani nie korzystał z prawdziwych kont, bazy lub usług. Poprawki administracji i inwentaryzacji pozostają osobnym pakietem lokalnym.

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
