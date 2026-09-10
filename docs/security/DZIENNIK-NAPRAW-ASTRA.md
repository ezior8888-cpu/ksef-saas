# Dziennik napraw bezpieczeństwa — Astra

> **Przekazanie zatwierdzone:** kod i dziennik są w [roboczym PR #1](https://github.com/ezior8888-cpu/ksef-saas/pull/1), gałąź codex/security-leak-fixes. Nie wdrożono zmian.

> **Aktualny stan:** czytaj również wpis z 2026-09-10. Własne propozycje schematu są wyłącznie w dokumentacji; nie ma nowych migracji 00070/00071. Zmian nie wdrożono.

## Jak przejąć pracę

- Projekt: FaktFlow / KSeF SaaS. Zakres: wycieki danych pomiędzy firmami oraz poza aplikację.
- Ten dziennik kontynuuje [DZIENNIK-AUDYT.md](DZIENNIK-AUDYT.md), [rejestr ustaleń](audyt/REJESTR-USTALEN.md) i [raport Claude](audyt/RAPORT.md).
- Punktem startowym jest commit 7576a08 na gałęzi claude/app-security-plan-74b134.
- Zmiany powstają w istniejącym worktree .claude/worktrees/flo-agent-interface-04fab0. Główny checkout jest na innej gałęzi: redesign/dashboard-prototyp. Nie mieszać tych drzew ani nie zakładać, że poprawki są już na main.
- Igor zlecił rzeczywiste naprawy i testy. Historyczny tryb „tylko raport” z audytu nie dotyczy tej nowej sesji.
- **Żadna migracja nie została wykonana. Nie wdrożono aplikacji ani workera. Nie wykonywano zapisów do produkcji.**
- Zgodnie z aktualną instrukcją Igora migracje wdraża właściciel repo. Nie wykonywać supabase db push/reset, psql -f, db:push:prod ani migracji pg-boss.
- Nie zmieniać stacku, nazw R2_*/UPSTASH_* ani usuwać backendu Inngest.
- Ten plik nie zawiera kluczy, tokenów, danych klientów ani zrzutów środowiska. Dopisywać kolejne wpisy z rzeczywistym wynikiem i ograniczeniami.

## 2026-09-09 — rozpoczęcie napraw po audycie

Autor: Igor + Codex Astra; niezależne podzadania: kontrola dostępu/GDPR, pliki i eksporty, analityka/FLO.

### Co wykryto przy ponownym przeglądzie

1. Starszy katalog główny nie zawierał właściwego dziennika. Znaleziono go dopiero w worktree Claude; wszystkie poniższe poprawki dotyczą tego worktree.
2. Wynik dependency audit się zmienił: przed aktualizacją skan produkcyjnego drzewa wykazał **84 zgłoszenia: 2 krytyczne, 51 wysokich, 27 średnich, 4 niskie**. To liczba zgłoszeń skanera zależności, nie liczba potwierdzonych ataków na aplikację.
3. Samo Next.js 16.2.11 zalecane we wcześniejszym raporcie już nie wystarcza. Doradztwo dotyczące przetwarzania AVIF wymaga >=16.3.3: https://github.com/advisories/GHSA-2xp9-vwfh-vxw4.
4. „Logi czyste” we wcześniejszym raporcie było zbyt mocnym wnioskiem: isProductionDeploy() bez dodatkowych markerów nie rozpoznaje NODE_ENV=production, a kod używał jego negacji do wrażliwych logów. RESEND_DEV_TO_OVERRIDE nie miał faktycznej bramki produkcyjnej.
5. Dotychczasowe Sentry beforeSend nie obejmowało wszystkich kanałów (transakcje, spany, automatyczne logi), a konfiguracja Edge nie miała odpowiedniego filtra.
6. Pole ze ścieżką pliku w bazie nie jest samo w sobie dowodem własności obiektu. Własny rekord dostępny do UPDATE może zawierać ścieżkę innego najemcy; dlatego granica storage musi sprawdzać prefiks najemcy.
7. Service worker defaultCache obejmował API/RSC/HTML. Cache lokalny nie jest izolowany samym RLS ani zmianą sesji.
8. Anulowanie żądania usunięcia konta odbywało się podczas GET/renderowania linku; skaner poczty mógł wykonać je bez świadomego potwierdzenia użytkownika.
9. Brak skonfigurowanego Turnstile oznaczał sukces również poza lokalnym developmentem.

### Zapisane poprawki

- **Zależności / SEC-A-03:** Next.js, @next/mdx i eslint-config-next do 16.3.4; @xmldom/xmldom do 0.9.12; poprawione zależności pośrednie w pnpm overrides i lockfile. Pozostaje pnpm 10.33.0. Używać corepack pnpm, aby globalny launcher innej wersji nie ignorował ustawień projektu. Po aktualizacji skan produkcyjnych zależności: **0 znanych podatności**.
- **PostHog / SEC-D-01/02:** inicjalizacja dopiero po jednoznacznej zgodzie, wyłączone nagrywanie sesji i autocapture, obsługa cofnięcia zgody, filtrowanie zdarzeń i właściwości przed wysyłką, adresy sprowadzone do obszarów aplikacji bez identyfikatorów/tokenów.
- **FLO / SEC-D-03:** poprawione wzorce rozpoznawalnych identyfikatorów; granica promptu oparta na zamkniętych kodach podpowiedzi i placeholderach ze statycznego szablonu. Dowolny tekst dokumentu nie może wejść przez hints ani przez retry. Regex nie jest pełnym anonimizatorem nazwisk.
- **Sentry:** wspólny filtr dla błędów, transakcji, spanów i breadcrumbs na kliencie, Node i Edge; usuwane body i nagłówki żądania, pola poświadczeń, parametry i fragmenty URL, tokeny portalu oraz dane użytkownika poza identyfikatorem. Automatyczny eksport console i breadcrumbs DOM wyłączony.
- **Logi/KSeF/poczta:** osobna bramka zezwala na wrażliwy debug i zmianę odbiorcy testowego tylko w jawnym runtime development/test bez markera produkcji. Brak konfiguracji nie otwiera dostępu.
- **CSP / SEC-E-02/03:** polityka egzekwowana, skonfigurowany origin Supabase i Realtime, brak unsafe-eval w produkcji, poweredByHeader=false. Inline bootstrap Next nadal dozwolony; to nie jest CSP z nonce ani pełna ochrona przed każdym XSS.
- **Turnstile:** brak sekretu poza lokalnym developmentem zwraca błąd, zamiast pomijać ochronę.
- **HTTP / SEC-A-01:** stałe odpowiedzi błędów w czterech wskazanych route'ach; szczegóły nie trafiają do klienta. Webhook Resend sprawdza również świeżość podpisanego timestampu.
- **Storage:** obowiązkowa walidacja tenantId przy odczycie/podpisywaniu ścieżek; dotyczy XML, PDF, eksportów, OCR, UPO i importów. Podpisane odpowiedzi i pobieranie dokumentów otrzymują private,no-store; nowe podpisy wymuszają to również dla starych obiektów.
- **Service worker:** cache tylko jawnie dozwolonych zasobów statycznych; usuwanie legacy runtime cache podczas aktywacji.
- **GDPR / SEC-C-04:** token anulowania przechowywany jako SHA-256; warunkowa zmiana statusu pending; GET pokazuje potwierdzenie, a anulowanie wykonuje osobna akcja POST.

### Migracje i zależności wdrożenia

- 00068_fix_invoices_overdue_cross_tenant_leak.sql — istniejąca poprawka krytycznego widoku, SEC-C-05. **Przygotowana wcześniej, niewykonana w tej sesji.**
- 00069_audit_permission_hardening.sql — istniejąca poprawka grantów/RPC, SEC-C-03/06/07/08. Przejrzana; właściwe sygnatury funkcji i grant service_role są obecne. **Niewykonana.**
- 00070_gdpr_cancel_token_hash.sql — nowa migracja hashująca istniejące tokeny i zmieniająca nazwę kolumny. **Niewykonana. Nowy kod wymaga tej migracji; stary kod nie jest zgodny z nową nazwą kolumny.** Nie wykonywać samodzielnego rollbacku samej aplikacji.

### Dotychczas potwierdzona walidacja

- Dependency audit po aktualizacji: 0 znanych podatności w produkcyjnym drzewie.
- Testy XML: 66/66 przeszło.
- Sentry, blokada debug i odbiorcy poczty: 21/21 przeszło.
- CSP i Turnstile: 9/9 przeszło.
- Pierwsza walidacja PostHog/FLO: 77/77 w czterech plikach przeszło.
- Znaleziony błąd typów w starszym scripts/security/audit-redaction.ts (import .ts) poprawiono; narzędzie uruchamiane przez tsx.
- Pełny wynik lint/typecheck/unit/build zostanie dopisany po zakończeniu. **Ten wpis nie deklaruje jeszcze gotowości do wdrożenia.**

### Nadal do rozstrzygnięcia

- **SEC-D-04 — retencja i pliki:** nie zmieniono okresów przechowywania ani nie kasowano danych. Potrzebna decyzja właściciela dotycząca kategorii danych i retencji; potem trwała kolejka usuwania obiektów z retry, powiązana z rekordami przed ich skasowaniem. Nie usuwać wszystkich plików po samym usunięciu użytkownika należącego do organizacji.
- **SEC-D-05 — dokumentacja przetwarzania OCR:** przegląd umów/rejestru podprzetwarzających pozostaje po stronie właściciela.
- Konfiguracja MinIO, CDN, firewall, żywe granty i wersja wdrożenia nie były w tej sesji sprawdzane na produkcji.
- Już zapisane logi/nagrania/obiekty w cache nie znikają automatycznie wskutek zmiany kodu. Zweryfikować dostęp i retencję historycznych danych w panelach dostawców; nie podawać tokenów w raporcie.
- Zmiany w CSP i wyłączenie nagrywania sesji są świadome: po wdrożeniu sprawdzić logowanie, Realtime, podgląd paragonów, eksporty i analitykę po zgodzie.
- Szerszy wyścig worker/anulowanie GDPR jest w trakcie domykania przez atomowe przejęcie żądania; wynik i ewentualna dodatkowa migracja będą dopisane poniżej.

### Przerwy techniczne

Dwukrotnie limit użycia przerwał narzędzia i podzadania. Igor polecił kontynuację. Po każdym wznowieniu sprawdzano rzeczywisty stan plików; nie uznano rozpoczętej operacji za ukończoną.

## 2026-09-10 — doprecyzowanie stanu i kolejne naprawy

Ten wpis uzupełnia wcześniejsze, częściowe wyniki. Nie kasujemy historii audytu.

### Korekta migracji po nowej instrukcji Igora

Wcześniejszy wpis o nowych plikach 00070/00071 jest historyczny. Po odczytaniu zaktualizowanej instrukcji zabraniającej także **tworzenia** migracji usunięto wyłącznie te dwa własne, nieśledzone pliki z supabase/migrations. Ich pełny projekt zachowano w [PROPOZYCJE-SCHEMATU-GDPR.md](PROPOZYCJE-SCHEMATU-GDPR.md). Katalog migracji nie ma zmian względem punktu startowego napraw 7576a08; istniejące 00068/00069 pochodzą z wcześniejszego audytu Claude.

Nowy kod GDPR wymaga hashu tokenu, stanu processing, kolumny processing_started_at i unikalności aktywnego żądania na użytkownika. Numery 00070/00071 nie są zarezerwowane. Właściciel ustala numery i przygotowuje migracje. Stary kod i nowy schemat nie są zgodne; nie wykonywać samodzielnego rollbacku do kolumny plaintext.

### Zmiany uzupełniające

- PostHog: allowlista obowiązuje również na serwerze; usunięto email/imię z analityki rejestracji, pozostawiając dane potrzebne osobnemu jobowi powitalnemu. Identyfikatory ograniczone do UUID, właściwości do jawnych enum/liczników. SDK w przeglądarce korzysta wyłącznie z pamięci, zgoda synchronizowana pomiędzy kartami.
- Sentry: redagowane również tokeny /invite/ i portalu /accountant/, body request/response oraz payload. Filtr defensywnie kopiuje obiekty i obsługuje cykle. Nie jest klasyfikatorem wszystkich danych osobowych; dowolna treść faktury nie powinna trafiać do telemetry.
- Storage: testy podmienionej ścieżki obejmują również portal księgowego i cache PDF. Nagłówki no-store wymuszane przy nowych podpisach istniejących obiektów; wcześniejsze podpisy nie są unieważniane.
- Service worker: wyłączono cacheOnNavigation, usuwany również dawny start-url cache. Cache API ignoruje semantykę HTTP no-store, dlatego ważna jest allowlista zasobów w samym workerze.
- GDPR: atomowy claim pending -> processing przed usuwaniem. Anulowanie i drugi worker przegrywają warunkowy UPDATE po przejęciu. Zakończenie i failure też wymagają processing. Stare/osierocone processing oraz failed wymagają oceny operatora, bez automatycznego resetu do pending.
- Dodatkowy przegląd GDPR wykrył duplikaty przy SELECT -> INSERT, niebezpieczną rotację tokenu przed wysyłką emaila, pozorny sukces sterowany parametrem query oraz filtrowanie pending dopiero po pobraniu danych. Naprawy: ograniczenie UNIQUE w projekcie schematu z obsługą konfliktu; zachowanie istniejącego tokenu i terminu; rzeczywisty wynik Server Action; filtr pending w zapytaniu. Nowe UI udostępnia anulowanie po sesji i haśle, również gdy email nie dotarł.
- CSP: syntetyczny Chrome wykazał, że form-action self blokował natywny POST -> 303 do OAuth/Stripe przed hydratacją. Dodano dokładny origin skonfigurowanego Supabase oraz accounts.google.com, checkout.stripe.com, billing.stripe.com. Nie dodano wildcardu dla wszystkich HTTPS. Test przeglądarki bez JS: dozwolony origin działa, niezatwierdzony dostaje 0 żądań.
- Testy RLS: osobny vitest.rls.config.ts i RLS_TEST_SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY. Bez fallbacku do zmiennych aplikacji. Zwykły Vitest wyklucza RLS, envDir:false, brak dotenv w setup. CI unit nie otrzymuje sekretów. Zachowano istniejący opcjonalny E2E.
- Toolchain: Vitest/@vitest/ui 4.1.11, Node 22 w CI zgodnie z Dockerem, pnpm 10.33.0. Lokalnie Node 24.11.1. Globalny pnpm 11 potrafi przejąć wywołania zagnieżdżone w script ci; lokalna walidacja uruchamiała każdy jego etap jawnie przez corepack pnpm.
- [Mapa OWASP](owasp-top10-mapping.md) nie deklaruje już pełnego pokrycia, automatycznych zabezpieczeń Vercel ani nieaktualnej liczby zaakceptowanych podatności. Historyczny raport i rejestr mają odsyłacze do aktualnego stanu.

### Potwierdzone przebiegi przed ostatnią korektą GDPR/CSP

- Kompilacja produkcyjna zakończona kodem 0. Wyłącznie syntetyczne zmienne localhost, wyłączona telemetria/Sentry i brak env.local.
- Odpowiednik pełnego CI: typecheck 0, lint 0 błędów / 29 ostrzeżeń, XML 66/66, Vitest 81 plików / 1272 testy PASS. Ostatnie nowe przypadki GDPR/CSP są sprawdzane ponownie; wynik końcowy poniżej.
- CSP po korekcie formularzy: 6/6 testów i syntetyczny Chrome allow/block origin PASS.
- Skrypt audit-secrets na 1165 plikach (śledzone + nieignorowane nowe) i historii: 0 trafień poza 7 rozpoznanymi atrapami; w historii wyłącznie .env.example i app/.env.example. Raport zapisano tymczasowo, nie nadpisując historycznego 03-sekrety.md. To skan wzorców, nie dowód braku wszystkich możliwych sekretów.
- Nie uruchamiano zdalnych RLS, KSeF submit, poczty, kasowania użytkowników ani produkcyjnych smoke testów.

### Jedna pozostała podatność developerska

Pełny audit po aktualizacji: adm-zip 0.6.0 przez inngest-cli, waga średnia, [GHSA-vwc7-r8mq-g2x9](https://github.com/advisories/GHSA-vwc7-r8mq-g2x9). Problem dotyczy symlinków w lokalnym katalogu rozpakowania. Zweryfikowano brak wydanej poprawki; samo przejście na nowszy inngest-cli nie usuwa zależności.

Praktyczne ograniczenie ryzyka: instalacje z zaufanych wydań do prywatnego, świeżego katalogu, bez wspólnego zapisu i podstawionych symlinków. Nie usuwano Inngest, bo nadal stanowi ścieżkę rollbacku JOBS_BACKEND. To jawna pozostałość, nie deklaracja naprawy lub akceptacji przez właściciela. Skan produkcyjny pozostaje 0.

Vitest podniesiono również z powodu [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9), poprawka w 4.1.11.

### Rozwiązania dla otwartych spraw wymagających właściciela

1. **Baza C-05/C-06 i granty:** porównać faktyczny widok/granty z istniejącymi 00068/00069, skoordynować ich obsługę z właścicielem. Kod aplikacji nie naprawi bezpośredniego dostępu przez PostgREST do wadliwego widoku/RPC.
2. **GDPR schema:** projekt obejmuje zgodne hashowanie starych linków, atomowy claim i UNIQUE aktywnego user_id. Stare duplikaty ocenić indywidualnie; nie wybierać automatycznie najnowszego i nie usuwać historii. Brak zgodnego schematu blokuje wydanie tej części.
3. **Retencja i pliki D-04:** przed fizycznym usunięciem rekordów zapisać trwałą kolejkę zawierającą tenantId, dokładne klucze obiektów, kategorię retencji i idempotency key. Worker usuwa tylko zatwierdzone kategorie po upływie retencji, z retry i rejestrem wyniku. Nie zbierać kluczy dopiero po CASCADE i nie usuwać całej organizacji po skasowaniu jednego członka. Nie wdrożono usuwania bez decyzji właściciela.
4. **Dostawcy D-05 i historia telemetry:** sprawdzić dokumentację OCR/Anthropic i pozostałych przetwarzających oraz uprawnienia i retencję starych nagrań/logów. Zmiana kodu zatrzymuje przyszłe ścieżki, nie kasuje wcześniejszych danych.
5. **Po zatwierdzonym wydaniu:** właściciel weryfikuje konfigurację aplikacji, workera, MinIO/CDN oraz podstawowe przepływy logowania, płatności, Realtime, eksportów i GDPR na przeznaczonym do tego środowisku. Niniejszy dziennik nie jest zgodą na deploy.

### Przerwy i wznowienia

Limity użycia wielokrotnie przerywały narzędzia i podzadania. Kontynuowano na polecenie Igora. Każdorazowo sprawdzano zapisane pliki i rzeczywiste wyniki. Wpisy powyżej rozróżniają uruchomione, zakończone i jeszcze wymagane kontrole.

## 2026-09-10 — końcowy kod i wyniki regresji

Gałąź napraw: **codex/security-leak-fixes**. Końcowy kod aplikacji przed dokumentacją: **c2ab06d**. Baza napraw: **7576a08** (historyczny audyt Claude). Gałąź dziedziczy 12 wcześniejszych commitów audytu; wcześniejsze 00068/00069 nie są nowymi migracjami tej sesji.

### Commity napraw

- cc7e37d — zależności i lockfile.
- 93a5202 — Sentry, logi, debug KSeF i odbiorca testowy poczty.
- 2fd07da — granica tenantId w storage, cache PDF/portalu i service worker.
- b1ccf79 — stałe błędy HTTP oraz świeżość podpisów webhooka Resend.
- f6a3595 — egzekwowana CSP z dozwolonymi formularzami OAuth/płatności i Turnstile fail-closed.
- 4de44e6 — oddzielne testy RLS, brak sekretów w zwykłym CI, pnpm/Node oraz audit produkcyjnych zależności w CI.
- a8c0436 — cykl GDPR, jawne potwierdzenie anulowania, zachowany link, wynik poczty, odczyt ustawień przez sesję/RLS i propozycja schematu.
- 20b4e36 — redakcja rozpoznawalnych formatów i zamknięte hinty FLO.
- c2ab06d — zgoda na PostHog, filtrowanie klient/serwer oraz powtarzalny lokalny smoke przeglądarkowy.

Pełną listę zmian i kod można odtworzyć przez git diff 7576a08..c2ab06d. Nie obejmuje to późniejszych commitów wyłącznie dokumentacyjnych. Główny checkout redesign/dashboard-prototyp i zastane lokalne zmiany Igora nie zostały zmienione.

### Ostateczne wyniki kodu c2ab06d

- Pełny Vitest: **82 pliki, 1289/1289 testów PASS**, po wszystkich poprawkach GDPR/CSP/analytics.
- XML: **66/66 PASS** po aktualizacji zależności; późniejsze zmiany nie dotyczyły XML ani lockfile.
- Lint: **0 błędów, 29 ostrzeżeń**. Nie oznaczamy ostrzeżeń jako naprawionych. Pozostałe dotyczą m.in. hooków/React Compiler i nieużywanych zmiennych.
- Typecheck: pełny przebieg bez incremental PASS po GDPR, a następnie TypeScript w końcowym buildzie PASS.
- Produkcyjny build końcowego źródła: **exit 0**. Budowano z syntetycznymi URL localhost i atrapami kluczy, bez env.local, bez Sentry upload tokenu i bez uruchamiania workera.
- Dodana kontrola CI: corepack pnpm audit --prod --audit-level=high — **exit 0, No known vulnerabilities found**.
- Dodatkowy przegląd GDPR: **32/32** przypadki. UNIQUE aktywnego user_id jest wymaganiem projektu schematu; test używa modelu constraintu, nie prawdziwej bazy.
- Dodatkowy przegląd CSP: **6/6** przypadków i Chrome bez JS z lokalnym POST -> 303. Dozwolony origin przechodzi, obcy jest blokowany przed wysłaniem.
- git diff --check czysty. git diff 7576a08..c2ab06d -- supabase/migrations jest pusty.

### Korekta transportu wykryta dzięki rzeczywistemu SDK

Pierwszy browser smoke nie emitował zdarzeń, ponieważ PostHog rozpoznawał automatyzację jako bota. Harness odwzorowuje zwykłą przeglądarkę; kod aplikacji nie wyłącza ochrony SDK. Dopiero rzeczywista paczka SDK ujawniła, że filtr usuwał publiczny klucz projektu properties.token. Teraz przepuszcza wyłącznie wartość równą skonfigurowanemu publicznemu NEXT_PUBLIC_POSTHOG_KEY; dowolne tokeny dostępu nadal są usuwane.

Usunięto również ręczny dodatkowy pageview: SDK emituje pierwsze wejście po opt-in. Lokalny smoke sprawdza dokładnie jedno początkowe wejście, rzeczywiste paczki danych, cofnięcie zgody między kartami i brak danych z formularza/query/hash/linku portalu.

Skrypt: scripts/security/smoke-local-browser.mjs. Wymaga istniejącego builda syntetycznego; odmawia startu przy rzeczywistych plikach .env, używa własnego localhost:3100, mockuje /ingest i blokuje inne żądania oraz WebSocket. Kończy tylko własny proces. Nie zastępuje E2E logowania, Stripe, Realtime ani testu z prawdziwą bazą. Wynik końcowego uruchomienia dopisano poniżej.

### Końcowy test przeglądarkowy — PASS

Uruchomiono na świeżym buildzie kodu c2ab06d. Potwierdzone:

- Home i login: poprawna hydratacja, egzekwowana CSP, brak X-Powered-By.
- Zero żądań SDK przed zgodą oraz po odmowie, także po nawigacji.
- Dokładnie jeden początkowy pageview po zgodzie.
- Trzy rzeczywiste zdarzenia SDK przechwycone i zdekodowane; publiczny project key zachowany. Brak wartości formularza oraz tokenów query/hash/portalu.
- Cofnięcie zgody w drugiej karcie zatrzymuje zbieranie; odmowa utrzymana po ponownym załadowaniu.
- **0 naruszeń CSP i 0 nieobsłużonych błędów klienta.** Pięć prób pobrania Google Fonts zablokowanych przez izolację testową, zgodnie z założeniem.
- Własny serwer i przeglądarka zamknięte. Bez wysyłki zdarzeń do prawdziwego PostHog, bez logowania i płatności.

Ograniczenie: w tym smoke PWA jest wyłączone wyłącznie w izolowanej przeglądarce, by stary worker nie omijał przechwytywania sieci. Reguły i czyszczenie cache mają osobne testy jednostkowe. Zachowanie prawdziwego wdrożenia PWA wymaga weryfikacji właściciela po zatwierdzonym wydaniu.

### Stan przekazania — lokalnie gotowe, wysłanie zablokowane

Kod i dziennik zapisano na lokalnej gałęzi codex/security-leak-fixes. Planowany draft PR do main nie został utworzony. Automatyczna kontrola uprawnień odrzuciła polecenie wysyłki do origin, wskazując brak wyraźnej zgody na eksport tej zawartości do zdalnego repozytorium. Git remote i metadane konektora wskazują https://github.com/ezior8888-cpu/ksef-saas — repozytorium PUBLICZNE. Wysłanie ujawni również dokumentację niezastosowanych poprawek bazy. Wymagana jest decyzja użytkownika przed publikacją.

Nie wysłano gałęzi, nie zmieniono main, nie wykonano migracji ani wdrożenia. Wymagania schematu GDPR oraz pozostałe sprawy retencji, dostawców i produkcyjnych grantów pozostają jawnie otwarte. Nie wykonywać automatycznego merge ani wdrożenia na podstawie samych zielonych testów.

## 2026-09-10 — zatwierdzone przekazanie do GitHub

Igor wyraźnie zatwierdził publiczne wysłanie kodu i dziennika do ezior8888-cpu/ksef-saas oraz utworzenie roboczego PR. Gałąź **codex/security-leak-fixes** została wysłana; utworzono **[draft PR #1](https://github.com/ezior8888-cpu/ksef-saas/pull/1)** do main.

Poprzedni wpis o blokadzie opisuje stan przed zgodą. Integracja GitHub nie miała uprawnień do tworzenia PR (403), więc PR utworzono przez istniejące uwierzytelnienie Git, bez zmiany jego uprawnień i bez ujawniania poświadczeń. Kod i dziennik są teraz dostępne współpracownikowi oraz publicznie w repozytorium.

PR pozostaje roboczy z jawnymi zależnościami schematu i retencji. Nie wykonano merge, migracji, wdrożenia ani restartu usług.
