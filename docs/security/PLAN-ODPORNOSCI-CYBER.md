# Plan odporności cybernetycznej FaktFlow / KSeF SaaS

Data: 2026-09-13. Autor: Astra, na prośbę Igora. Status: **plan do realizacji; wykonano analizę przygotowawczą, bez wdrażania zabezpieczeń**.

## Cel i sposób pracy

Chronimy poufność danych każdej firmy, poprawność faktur i operacji finansowych, dostęp do KSeF oraz możliwość odtworzenia usługi po awarii lub przejęciu. Celem jest także szybkie zauważenie zdarzenia, ograniczenie szkód i odzyskanie kontroli. Nie istnieje plan zapewniający odporność na wszystkie ataki.

Priorytety wynikają ze skutków dla klientów. Najpierw utrata izolacji, przejęcie administracji, wykradzione klucze, nieodwracalna zmiana faktur i brak odtwarzania; później poszerzanie automatyzacji i optymalizacja. Wykryty czynny wyciek lub przejęcie wymaga od razu reakcji właściciela — nie czeka na ukończenie kolejnej fazy.

Jako katalog kontroli proponuję odpowiednie wymagania OWASP ASVS 5.0.0, docelowo poziom 2 dla aplikacji, uzupełnione o KSeF, infrastrukturę i FLO. Organizacja prac obejmuje zarządzanie ryzykiem, ochronę, wykrywanie, reakcję i odtwarzanie, zgodnie z kierunkiem NIST CSF. To ramy weryfikacji, nie deklaracja certyfikacji. [OWASP ASVS](https://owasp.github.io/www-project-application-security-verification-standard/), [NIST CSF](https://www.nist.gov/cyberframework).

Każda kontrola otrzymuje właściciela, scenariusz zagrożenia i dowód odbioru. Osobne statusy: **zaplanowane → w kodzie/konfiguracji → sprawdzone na testach → wdrożone → potwierdzone w danym środowisku**. Wynik lokalny nie potwierdza produkcji.

## Punkt wyjścia: co rzeczywiście wiemy

Analiza dotyczy lokalnego stanu bazowego `d49e8aebdf7fe74e392f6e33d90dd2549b53e93c` oraz istniejących dzienników. Poprzednie naprawy znajdują się w [draft PR #1](https://github.com/ezior8888-cpu/ksef-saas/pull/1); przy sprawdzeniu PR pozostawał otwarty i niepołączony. Nie sprawdzano teraz serwera, kluczy ani konfiguracji produkcyjnej.

- **CI już ma skan zależności produkcyjnych** i dependency review. Brakuje kompletnej ochrony sekretów i analizy statycznej oraz dowodu, że wymagane kontrole blokują połączenie zmian. Źródło: [workflow](../../.github/workflows/ci.yml).
- **CSP jest już egzekwowane w kodzie.** Dalsze zadanie to zgodność z rzeczywistym wdrożeniem, raportowanie i ograniczanie wyjątków. Źródła: [Next.js](../../next.config.ts), [polityka CSP](../../lib/security/csp.ts).
- **78 oznacza historyczne pozycje do przeglądu**, nie potwierdzone podatności: raport z 8 września klasyfikował 305 zapytań service_role jako 78 do przeglądu, 12 średnich i 215 „ok”. Heurystyka nie zastępuje prześledzenia autoryzacji. Źródło: [raport RLS/service_role](audyt/02-service-role.md).
- **Obecny eksport nie dowodzi pełnego odtwarzania.** Paginuje tabele public przez REST, pomija m.in. Auth, audit_logs i gdpr_deletion_requests; kod gzip/hash nie zapewnia szyfrowania. Nie ustalono, jakie dodatkowe kopie lub szyfrowanie istnieją na serwerze. Źródła: [snapshot](../../lib/backup/db-snapshot.ts), [klient kopii](../../lib/backup/r2-backup-client.ts).
- **Administracja wymaga dalszej kontroli MFA**, a po zmianie hostingu trzeba zweryfikować zaufanie do adresu IP, zachowanie limitera podczas awarii i uprawnienia workera. Źródła: [admin guard](../../lib/auth/admin-guard.ts), [IP klienta](../../lib/auth/get-client-ip.ts), [limiter](../../lib/rate-limit/index.ts), [Dockerfile](../../Dockerfile).
- Część [procedury odtwarzania](../runbooks/backup-restore.md), [rotacji](../runbooks/key-rotation.md), [disaster recovery](../runbooks/disaster-recovery.md) i [celów RTO/RPO](rto-rpo.md) opisuje dawną infrastrukturę. Istniejące wyniki testów z [poprzedniego dziennika](DZIENNIK-NAPRAW-ASTRA.md) są historycznym dowodem określonego zakresu, nie nowym audytem całości.

## Faza 1 — Rzeczywisty stan, odpowiedzialność i granice zaufania

**Cel:** ustalić, co działa, kto ma dostęp i gdzie ryzykujemy dane albo pieniądze.

Zakres:
- Uzgodnić commit aplikacji, workera i schemat faktycznie wdrożony w każdym środowisku. Sprawdzić stan 00068/00069 i propozycji schematu GDPR, bez zakładania ich wdrożenia na podstawie plików.
- Opisać przepływ: przeglądarka → Cloudflare/Coolify → aplikacja/Supabase → kolejki/storage → KSeF i dostawcy. Uwzględnić wejścia API, Server Actions, webhooki, cron, upload, administrację i funkcje FLO.
- Spisać aktywa, klasy danych, role operatorów, dostawców, konta, rodzaje kluczy, publiczne usługi oraz właściciela i zastępcę. W repo tylko opis i identyfikator dowodu; rzeczywiste sekrety i szczegóły dostępu w chronionym systemie.
- Zbudować rejestr ryzyk oraz scenariusze nadużyć. Uzgodnić dopuszczalną utratę danych (RPO), czas odtworzenia (RTO), budżet i sposób obsługi alarmów poza godzinami pracy.

**Odbiór:** datowana mapa środowisk i danych, komplet właścicieli najważniejszych zasobów, lista rozbieżności oraz decyzje biznesowe. Każde „nie wiadomo” ma osobę i kolejny krok.

**Odpowiedzialni:** AI przygotowuje analizę repo; Bartek potwierdza środowiska; Igor zatwierdza priorytety i cele operacyjne.

## Faza 2 — Bezpieczne testy i udowodnione odtwarzanie

**Cel:** mieć gdzie sprawdzać ochronę oraz odzyskać usługę po utracie lub przejęciu serwera.

Zakres:
- Wydzielić środowisko z fikcyjnymi danymi co najmniej dwóch firm i osobnymi kluczami. Testy mutujące muszą sprawdzać oznaczenie dozwolonej bazy; sama nazwa RLS_TEST_* nie wystarcza. Prawdziwe wysyłki KSeF, płatności i poczta nie mogą uruchamiać się przypadkowo.
- Zaprojektować spójny backup DB obejmujący schemat, role/RLS, Auth, wymagane logi i stan usunięć oraz kopię XML/PDF/UPO, konfiguracji i potrzebnych wersji kluczy. Ustalić spójność obiektów z rekordami i stanem kolejki.
- Szyfrowane kopie poza wspólną domeną awarii, osobna tożsamość z minimalnym dostępem, odporność na usunięcie przez przejętą aplikację. Osobno zabezpieczyć odzyskanie kluczy i katalog kopii.
- Przećwiczyć odtworzenie na czystym środowisku przez drugą osobę. Zmierzyć RPO/RTO, sprawdzić logowanie, izolację firm, odszyfrowanie i integralność załączników.
- Po odtworzeniu uzgodnić stan z KSeF/Stripe i kolejkami: nie wystawić ponownie już przyjętej faktury, nie powtórzyć płatności ani nie przywrócić do aktywnego użycia danych wcześniej usuniętych.

**Odbiór:** protokół udanego odtworzenia, zmierzone czasy i utrata danych w przyjętych celach, test dostępu do kopii po utracie głównego hosta. Wstępna propozycja do wyceny: RPO ≤ 1 godzina, RTO podstawowej obsługi ≤ 4 godziny; to cel, nie obecnie osiągany parametr. Stan dokumentów przyjętych przez KSeF wymaga uzgodnienia niezależnie od RPO.

**Odpowiedzialni:** Bartek — kopie/restore; AI — scenariusze i testy; Igor — akceptacja celów. Minimalna sprawdzona możliwość odzyskania poprzedza zmiany schematu; pełny program nie opóźnia doraźnego ograniczenia czynnego zagrożenia.

## Faza 3 — Izolacja firm, konta i domknięcie audytu

**Cel:** cudzy identyfikator, skradziona sesja lub nadużycie funkcji nie daje dostępu do kolejnej firmy.

Zakres:
- Odświeżyć inwentaryzację uprzywilejowanych zapytań. Przejrzeć historyczne 78, pozostałe 12 średnich oraz krytyczne ścieżki z kategorii „ok” i nowe miejsca. Dla każdego: cel, wszyscy wywołujący, źródło tożsamości firmy, wymagane role i dowód.
- Zaplanować z Bartkiem weryfikację/wdrożenie istniejących 00068/00069 oraz uzgodnionego schematu GDPR. Zmiany schematu, aplikacji i workera muszą mieć zgodną kolejność i bezpieczne wycofanie. [Propozycje GDPR](PROPOZYCJE-SCHEMATU-GDPR.md) pozostają projektem do uzgodnienia.
- Przetestować odczyt i zapis przez API, Server Actions, widoki/RPC, eksporty, storage, linki czasowe, cache i worker. Dwie firmy z rzeczywistymi danymi testowymi, także przeterminowanymi fakturami; poprawny dostęp do własnych danych musi działać obok odmowy dostępu do cudzych.
- Objąć zmianę aktywnej firmy, kilka członkostw, cofnięcie roli, zaproszenia, odwołany dostęp księgowego, sesję po zmianie hasła i próby przekazania własnego tenantId/storage_path.
- Ograniczać użycie service_role przez klienta sesyjnego i wąskie operacje z kontrolą autoryzacji. Nie zmieniać w ciemno wbudowanej roli BYPASSRLS; taki klucz omija RLS. [Dokumentacja Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).
- Obowiązkowy drugi czynnik administracji, serwerowa kontrola odpowiedniego poziomu uwierzytelnienia dla wrażliwych akcji/API, ponowne potwierdzenie zmian dostępu i kluczy. Zweryfikować powiązanie sesji NextAuth z Supabase — obecność MFA w interfejsie nie dowodzi kontroli endpointu. [Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa).
- Imienne konta i odbieranie dostępu również w GitHub, Hetzner, Coolify, Cloudflare i u rejestratora domen. Przećwiczyć odzyskanie konta i rotację: unieważnienie upstream, sesje, wersje kluczy, ponowne szyfrowanie i starsze kopie.

**Odbiór:** każda uprzywilejowana ścieżka ma uzasadnienie; testy własnych/cudzych danych przechodzą; AAL1, odebrana rola i powtórzony kod odzyskiwania nie omijają administracji. Nie ma otwartego potwierdzonego obejścia izolacji.

**Odpowiedzialni:** AI — kod/testy po rozpoczęciu realizacji; Bartek — schemat/klucze; Igor — lista administratorów.

## Faza 4 — CI, zależności i bezpieczne wydawanie zmian

**Cel:** wykrywać regresje zanim trafią do klientów i zabezpieczyć sam proces budowania.

Zakres:
- Zachować działający audit zależności produkcyjnych i dependency review. Dodać Gitleaks dla zmian i kontrolowanej pełnej historii; wyniki bez ujawniania sekretów. Zakres zależności obejmuje także to, co faktycznie trafia do obrazu workera.
- Jako pierwszy SAST proponuję CodeQL dla JS/TS i workflow. Dodatkowe reguły Semgrep tylko dla luk w pokryciu, np. lokalnych konwencji autoryzacji. [Zakres zapytań CodeQL](https://docs.github.com/en/code-security/reference/code-scanning/codeql/codeql-queries).
- Własnym skryptom dodać tryb CI: jawny cel, odrębne artefakty, bez nadpisywania dzienników, limit czasu, redakcja wyników i jednoznaczny kod zakończenia. Sam raport z trafieniami obecnie nie musi dać czerwonego CI.
- Lokalne audit-service-role, inventory-entrypoints, audit-secrets i audit-redaction oddzielić od prób sieciowych. audit-client-bundle sprawdzać wyłącznie na syntetycznych znacznikach sekretów. audit-headers ma obecnie wpisaną produkcję, audit-postgrest-exposure łączy się z bazą, a run-prod-verify wykonuje mutujące RPC — nie wpinać ich bezpośrednio do zwykłego PR CI.
- E2E/RLS z uprawnieniami uruchamiać tylko w zaufanym przebiegu przeciw oznaczonej bazie testowej. Bez sekretów dla kodu niezaufanego PR. Minimalny GITHUB_TOKEN, Actions przypięte do SHA, przegląd workflow/lockfile, kontrolowane artefakty i chronione wydania. Uważać na wykonywanie kodu PR w pull_request_target. [GitHub: bezpieczeństwo tego zdarzenia](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target).
- Skanować oba obrazy, utrzymywać wykaz ich komponentów (SBOM) i powiązanie commit → artefakt → wdrożenie. Dostosować rulesets tak, by wymagane kontrole rzeczywiście blokowały merge.

**Odbiór:** kontrolnie wprowadzony błąd każdej bramki powoduje niepowodzenie, czysty przypadek przechodzi; brak skanera nie udaje sukcesu. Wyjątek wskazuje konkretne trafienie, właściciela, uzasadnienie, ochronę zastępczą i termin.

**Odpowiedzialni:** AI — konfiguracja/testy; właściciel GitHub — uprawnienia i rulesets; Bartek — wydania/obrazy.

## Faza 5 — Infrastruktura i ochrona działającej aplikacji

**Cel:** ograniczyć wejścia do systemu i skutki przejęcia jednej usługi.

Zakres:
- Zatwierdzona lista publicznych portów i usług, IPv4/IPv6, prywatny port DB/Redis oraz konsol MinIO/Coolify. Zachować wymagane publiczne API Supabase Auth/PostgREST z właściwą kontrolą dostępu.
- SSH z kluczami, ograniczenie źródeł dostępu, wyłączenie zbędnego roota i haseł, ochrona przed próbami logowania tam, gdzie potrzebna, aktualizacje hosta i usług. Sprawdzony dostęp awaryjny przed zaostrzeniem reguł.
- Zweryfikować prywatność bucketów: anonimowe listowanie/odczyt/zapis zabronione, podpisane URL krótkie i właściwie przypisane; CORS nie jest kontrolą dostępu. Sekrety Coolify tylko dla potrzebujących usług.
- Web i worker bez roota, ograniczone uprawnienia i zasoby, minimalny obraz. Zastąpić przekazywanie SENTRY_AUTH_TOKEN przez ARG/ENV bezpiecznym mechanizmem sekretów builda; sprawdzić warstwy/cache bez wypisywania klucza.
- Cloudflare/WAF stosownie do posiadanych możliwości; zamknąć bezpośrednie obejście originu. Dopiero po ustaleniu zaufanego łańcucha proxy używać adresu klienta do limitów. Testować fałszywy X-Forwarded-For i alternatywne wejścia.
- Limity również na konto, firmę, operację i koszt; sprawdzić równoległość. Ustalić zachowanie bez Redis: wrażliwe/kosztowne operacje mają pozostać ograniczone albo zostać wstrzymane.
- Zweryfikować CSP, sesyjne cookies, CSRF/origin, cache prywatnych danych i service worker. Odbiornik raportów CSP ograniczony rozmiarem/częstotliwością, z usuwaniem danych osobowych i tokenowych URL; raport jest niezaufanym wejściem. Stopniowo usuwać zbędne wyjątki CSP z testem zgodności.

**Odbiór:** autoryzowana kontrola potwierdza macierz usług, izolację administracji i storage; podrobione IP nie omija limitów. Login/OAuth, upload, płatności i webhooki działają przy aktywnej ochronie.

**Odpowiedzialni:** Bartek — infrastruktura; AI — zmiany aplikacji i scenariusze weryfikacji.

## Faza 6 — Cykl życia danych i obowiązki wobec klientów

**Cel:** znać miejsce, cel i czas przechowywania każdej kategorii danych.

Zakres:
- Mapa rzeczywistych przepływów i podmiotów: m.in. OCR→Anthropic, Resend, Stripe, Hetzner, Sentry, PostHog, Cloudflare oraz pozostałe faktycznie używane usługi. Zweryfikować regiony, role, retencję i dostęp wsparcia; lokalizacja głównego serwera nie rozstrzyga całej ścieżki danych.
- Z prawnikiem ustalić wymagane umowy powierzenia, rejestr czynności, transfery i potrzebę oceny skutków. Nie przypisywać automatycznie każdemu dostawcy tej samej roli. [RODO, art. 28, 30 i 35](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng).
- Uzgodnić retencję osobno dla faktur/UPO, kopii XML/PDF, oryginałów OCR, danych konta, promptów, logów i backupów. Dziesięcioletnie przechowywanie faktur w KSeF nie rozstrzyga automatycznie retencji każdej kopii w naszej aplikacji. [Informacje KSeF](https://ksef.podatki.gov.pl/ksef-news/najczestsze-pytania/).
- Domknąć SEC-D-04/05: rozróżnić usunięcie konta od usunięcia danych firmy; po decyzji o retencji zaprojektować trwałą kolejkę usuwania obiektów przed DB CASCADE, z ponawianiem, kontrolą legal hold i potwierdzeniem wyniku. Odtwarzanie backupu musi respektować rejestr usunięć.
- Sprawdzić minimalizację danych w telemetrii, raportach, mailach i narzędziach AI oraz bezpieczny eksport danych osoby uprawnionej.

**Odbiór:** zatwierdzona macierz danych i retencji, ustalone dokumenty z dostawcami oraz test całej ścieżki usunięcia, również po częściowej awarii i restore. Zmiana schematu GDPR nie oznacza automatycznie zamknięcia sprawy retencji.

**Odpowiedzialni:** Igor/prawnik — decyzje i dokumenty; Bartek — storage/schema; AI — przepływy i późniejsza implementacja.

## Faza 7 — Integralność faktur, nadużycia i FLO

**Cel:** aplikacja nie wykonuje cudzej lub zmienionej operacji i nie generuje niekontrolowanych kosztów.

Zakres:
- Testować powiązanie firmy, faktury, certyfikatu i zatwierdzonej wersji danych; wartości finansowe i uprawnienia sprawdzać na serwerze. Izolacja KSeF TEST/PROD, brak ślepego ponawiania po timeout z nieznanym wynikiem.
- Webhooki Stripe/KSeF i joby: podpis/uwierzytelnienie, replay, kolejność, duplikaty, równoległość, częściowe wykonanie i cofnięcie uprawnień podczas oczekiwania. Handler sam sprawdza powiązanie obiektu z firmą. Idempotencja, ograniczone retry, kwarantanna i uzgadnianie skutków.
- Sprawdzić oba backendy JOBS_BACKEND, zachowując jedną aktywną ścieżkę. Przełączenie/rollback nie może powielić pracy; cron i narzędzia operatora wymagają autoryzacji.
- Upload/OCR/XML/PDF/eksporty: rozmiar, typ i rzeczywista zawartość, bomby kompresji/parserów, niebezpieczne odwołania XML, SSRF, treści aktywne i formuły w CSV. Limity czasu/pamięci oraz ilości i kosztu OCR/FLO/maili na firmę.
- FLO: dokument i odpowiedź modelu są niezaufane. Oddzielić propozycję od wykonania; zgoda związana z konkretną akcją i wersją danych. Zamknięta lista narzędzi, kontrola uprawnień także przy execute/undo, izolacja pamięci/cache, brak sekretów w kontekście, limity kosztu i wyłącznik funkcji.
- Przetestować awarie DB, Redis, MinIO, KSeF, Stripe, Anthropic i poczty. Zdefiniować dostępne funkcje, komunikat dla użytkownika, zachowanie kolejki i sposób odzyskania; żaden tryb awaryjny nie rozluźnia izolacji firm.

**Odbiór:** scenariusze podmiany identyfikatora, replay, prompt injection i awarii nie powodują nieautoryzowanej zmiany, podwójnego skutku ani przekroczenia ustalonego budżetu. Niebezpieczną funkcję można wyłączyć bez zatrzymania reszty aplikacji.

**Odpowiedzialni:** AI — model zagrożeń/kod/testy; Igor — zakres akcji FLO i limity; Bartek — kolejki i wyłączniki operacyjne.

## Faza 8 — Wykrywanie, reakcja i niezależny test

**Cel:** zauważyć incydent, zatrzymać jego skutki i sprawdzić ochronę niezależnie od jej autorów.

Zakres:
- Alarmy: masowe odczyty/eksporty, zmiany administracji, podejrzane sesje, wzrost kosztów, utrata limitera, zaległe joby, brak świeżej kopii i błędy audytu. Wykorzystać istniejące alerty dostępności; nie zakładać, że zapis „wysłano” dowodzi doręczenia.
- Logi z minimalną ilością danych, czasem i korelacją operacji; ograniczony dostęp oraz dowody poza zasięgiem pojedynczego przejętego hosta. Test kanału podstawowego i zastępczego działającego bez aplikacji/DB.
- Procedura od alarmu do izolacji, unieważnienia kluczy/sesji, zachowania dowodów, odtwarzania, komunikacji i analizy przyczyny. Właściciel dyżuru, zastępca i czasy reakcji zatwierdzone przez Igora.
- Ćwiczenia: ujawniony klucz, przejęty administrator, wyciek między firmami, utrata/zainfekowanie serwera, nadużycie FLO i niedostępność dostawcy. Część techniczna na testach; decyzje i komunikację przećwiczyć z ludźmi.
- Ocena naruszenia danych z właścicielem/prawnikiem. Obowiązek zgłoszenia organowi co do zasady obejmuje termin do 72 godzin od stwierdzenia, z ustawowym wyjątkiem przy mało prawdopodobnym ryzyku; nie każdy alert jest takim naruszeniem. [RODO, art. 33–34](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng).
- Zewnętrzny pentest przez ludzi na uzgodnionym środowisku i zakresie: multi-tenant, API/PostgREST, MFA/admin, storage, parsery, joby, integracje, infrastruktura i FLO, jeśli będzie aktywne. Umówione reguły testu, obsługa zgłoszeń, poprawki i retest.
- Monitorowany prywatny kanał zgłoszeń oraz security.txt z rzeczywistym kontaktem i datą ważności. [RFC 9116](https://www.rfc-editor.org/rfc/rfc9116.html).

**Odbiór:** dostarczony próbny alarm, udokumentowane ćwiczenie od reakcji do odzyskania, raport pentestu i retest istotnych ustaleń. AI nie jest niezależnym pentesterem swojego rozwiązania.

**Odpowiedzialni:** Igor — procedury/kontakty/zlecenie testu; Bartek — reakcja techniczna; AI — przygotowanie/testy/poprawki; firma zewnętrzna — niezależna ocena.

## Faza 9 — Decyzja o uruchomieniu i stały cykl

**Cel:** utrzymać potwierdzoną ochronę mimo kolejnych zmian.

Warunki udostępnienia klientom:
- Brak nierozwiązanych krytycznych podatności oraz wysokiego ryzyka w izolacji firm, administracji, integralności faktur i ochronie kluczy. Przy braku odbioru funkcja pozostaje niedostępna lub ma ograniczony zakres.
- Potwierdzona zgodność aplikacji, workera i schematu; wdrożone kontrole to te, które przeszły testy.
- Udane odtworzenie, działające alerty i realna obsada reakcji.
- Zatwierdzone zasady danych i retencji, zamknięte istotne ustalenia pentestu.
- Pozostałe odstępstwa mają właściciela, opis skutku, ochronę zastępczą, termin i akceptację Igora. Zielony skaner nie jest samodzielną zgodą na start.

Proponowany rytm po rozpoczęciu realizacji:
- Każdy PR: wymagane kontrole i przegląd bezpieczeństwa; zmiana tożsamości, danych, integracji lub narzędzi FLO wymaga aktualizacji modelu zagrożeń.
- Codziennie automatycznie: świeżość kopii, krytyczne alarmy i nowe podatności zależności; tygodniowo właściciel przegląda nierozwiązane sygnały i terminy.
- Miesięcznie: konta/uprawnienia, poprawki infrastruktury, wyjątki i aktualność procedur.
- Kwartalnie oraz po istotnej zmianie: odtworzenie, ćwiczenie incydentu i wybranego scenariusza rotacji. Podejrzenie ujawnienia klucza uruchamia rotację od razu.
- Po istotnej zmianie powierzchni ataku i okresowo według ryzyka: niezależny retest/pentest.

**Odbiór:** Igor podejmuje udokumentowaną decyzję na podstawie dowodów, a każdy powtarzalny obowiązek ma osobę i termin. Ten dokument nie tworzy harmonogramów ani automatyzacji.

## Kolejność wykonania i granice obecnej zgody

Po zgodzie na realizację zaczynamy od fazy 1. Równolegle przygotowujemy bezpieczne testy i odtwarzanie (2), domknięcie izolacji/dostępu (3) oraz CI (4). Infrastrukturę (5) i decyzje o danych (6) prowadzimy z właścicielami; prac prawnych nie odkładamy na koniec. Faza 7 korzysta z ustalonych granic dostępu i limitów. Podstawowe alarmy z fazy 8 powstają wcześnie; pentest ocenia już reprezentatywny zestaw zmian. Faza 9 scala odbiór.

Plan nie wymaga zakupu wszystkich narzędzi ani równoczesnego wdrożenia kilku skanerów. Kolejne prace dobieramy do potwierdzonego ryzyka, zasobów zespołu i dowodów odbioru.

**Obecna zgoda obejmuje wyłącznie analizę i dokumentację.** Nie wykonano migracji, skanów produkcji, rotacji, zmian konfiguracji ani wdrożeń. Zmiany SQL i ich wykonanie należą do odrębnego uzgodnienia z właścicielem repo; tak samo działania na serwerze i publikacja. Zachowujemy obecny stack, nazwy R2_*/UPSTASH_* oraz oba backendy jobów.

Dalszą pracę zapisujemy w [dzienniku odporności cybernetycznej](DZIENNIK-ODPORNOSCI-CYBER.md). Rejestr ma dokumentować fakty i dowody, a nie samą liczbę zamkniętych zadań.
