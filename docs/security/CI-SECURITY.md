# Kontrole bezpieczeństwa w CI

Stan implementacji: 2026-09-13; kolejne pakiety i wyniki są rozdzielone w dzienniku. Powiązany [plan](PLAN-ODPORNOSCI-CYBER.md) i [dziennik](DZIENNIK-ODPORNOSCI-CYBER.md).

## Co sprawdzają workflow

- [CI](../../.github/workflows/ci.yml): typy, lint, testy lokalne, audit zależności produkcyjnych na poziomie high oraz dependency review zmian PR. Dodatkowo testuje interpretację wyników CodeQL. Osobny job Offline security inventory testuje i uruchamia dwa zaadaptowane skrypty lokalne bez instalowania zależności aplikacji.
- [Security](../../.github/workflows/security.yml): Gitleaks skanuje całą historię osiągalną z badanego HEAD; CodeQL analizuje JavaScript/TypeScript i workflow Actions bez instalowania/uruchamiania aplikacji.
- [E2E staging](../../.github/workflows/e2e-staging.yml): uprzywilejowane testy przeniesione z automatycznego PR do osobnego ręcznego przebiegu na main, z domyślnie wyłączonym potwierdzeniem i środowiskiem security-staging.

Zwykłe CI i skan sekretów mają tylko contents:read, checkout nie zapisuje tokenu w konfiguracji Git. CodeQL otrzymuje dodatkowo security-events:write do przesłania wyników do GitHub. Nie ma komentarzy bota ani publikacji raportów Gitleaks. Akcje przypięto do sprawdzonych pełnych SHA; Gitleaks 8.30.1 pobierany jest z oficjalnego wydania i weryfikowany przez przypięte SHA256 archiwum Linux.

Źródła konfiguracji: [Gitleaks CLI](https://github.com/gitleaks/gitleaks), [CodeQL Action](https://github.com/github/codeql-action), [oficjalne opcje workflow CodeQL](https://docs.github.com/en/code-security/reference/code-scanning/workflow-configuration-options). Datowane przypięcie wersji wymaga okresowego przeglądu i aktualizacji, nie gwarantuje bezpieczeństwa na zawsze.

## Znaczenie wyniku

Gitleaks zwraca błąd przy trafieniu lub problemie uruchomienia. W każdym przebiegu najpierw wykonuje test w nowym repo tymczasowym: czysty plik, syntetyczny token, usunięcie tego tokenu z najnowszej wersji oraz błędna konfiguracja. Weryfikowana jest również redakcja tokenu w wyjściu. Wartość testowa powstaje dopiero w katalogu tymczasowym.

Po udanym CodeQL analyze [bramka SARIF](../../scripts/security/check-codeql-results.mjs) rozróżnia:
- exit 0 — prawidłowe raporty, bez wyników przekraczających ustalony próg;
- exit 1 — ocena security-severity ≥ 7 albo wynik error bez takiej oceny;
- exit 2 — brak/popsuty/nieobsługiwany raport lub błąd narzędzia.

Bramka pokazuje liczniki, bez treści podatności, fragmentów kodu i URL. Nie pomija wyników suppressed/unchanged. Obsługuje określony format CodeQL SARIF 2.1.0; nie jest ogólnym walidatorem SARIF. Poprawny raport z results:[] oznacza brak wyników skanera; nie potwierdza kompletności modelu zagrożeń.

**Sukces testów bramki nie oznacza braku ustaleń CodeQL.** Po korekcie obsługi formatu rzeczywisty przebieg 34775777627 przeszedł dla Actions, a JS/TS zatrzymał się na czterech wynikach high. GitHub API raportowało zero wyników dla zakresu PR; bramka analizuje raport z runnera i nadal blokuje. Ocena i poprawki trafień (4041868, opublikowane po zgodzie Igora) znajdują się w dzienniku. Bieżący odbiór należy odczytać z ostatniego przebiegu PR, a historyczne cztery trafienia nie opisują automatycznie nowego commita. Nie zamieniaj tego stanu na zielony poprzez oparcie bramki o sam licznik API.

Odbiór opublikowanego 4041868: [Security 34777397329](https://github.com/ezior8888-cpu/ksef-saas/actions/runs/34777397329) — Gitleaks i oba CodeQL PASS, surowy raport JS/TS ma zero wyników. [CI 34777397347](https://github.com/ezior8888-cpu/ksef-saas/actions/runs/34777397347) — główny job PASS, dependency-review nadal blokuje brak Dependency graph. Ten dowód odnosi się do tego commita; następne wersje wymagają własnych kontroli.

## Trzy wąskie wyjątki Gitleaks

[.gitleaksignore](../../.gitleaksignore) zawiera wyłącznie historyczne fingerprinty obejmujące commit, plik, regułę i linię:
- scripts/check-env.ts — porównanie do placeholdera Stripe, który walidator uznaje za niepoprawną konfigurację;
- lib/stripe/client.ts — porównanie do tego samego rodzaju placeholdera, odrzucanego jako skonfigurowany klucz;
- .env.example — komentarz z publicznym identyfikatorem modelu Claude.

Kontekst każdego trafienia sprawdzono w wskazanym commicie. Nie dodano wyłączenia całych plików, dokumentacji, testów ani rodzin tokenów. Nowe trafienia w tych plikach nadal blokują skan. Autor kwalifikacji: Astra; proponowany przegląd przez właściciela do 2026-12-13. Nie stwierdzono tu rzeczywistych kluczy wymagających wyłączenia skanera lub ukrycia nowego wycieku.

Każdy kolejny wyjątek wymaga wskazania konkretnego trafienia, uzasadnienia, autora i daty przeglądu. Rzeczywisty ujawniony klucz wymaga reakcji i unieważnienia; dopisanie wyjątku nie jest naprawą.

## Co musi ustawić właściciel GitHub przed uznaniem CI za odebrane

Zmiana pliku workflow nie ustanawia uprawnień i ochrony w ustawieniach repo. Ten pakiet ich nie zmienia.

1. Włączyć Dependency graph w ustawieniach bezpieczeństwa repo. Pierwszy rzeczywisty przebieg dependency-review w PR #2 potwierdził brak tej funkcji (job 103771627779). Użyte konto ma push, ale nie ma admin/maintain, więc nie zmieniono ustawienia i nie wyłączono kontroli.
2. W ruleset ustawić jako wymagane: Typecheck + Lint + Unit tests, dependency-review, Secret scan i oba zadania CodeQL; po odbiorze nowego przebiegu także Offline security inventory. Zweryfikować dokładne nazwy po pierwszym przebiegu i kontrolnym niepowodzeniu.
3. Wymagać przeglądu zmian workflow, konfiguracji skanerów, wyjątków i skryptów bramek. Osoba mająca możliwość zmiany workflow może zmienić także sam test; same pliki nie stanowią ochrony przed złośliwym współpracownikiem z takim dostępem.
4. Skonfigurować environment security-staging: wyłącznie main, wymagany zatwierdzający, brak samodzielnego obejścia przez autora. Dodać tylko osobne klucze jednorazowego staging w sekretach środowiska:
   STAGING_SUPABASE_URL, STAGING_SUPABASE_ANON_KEY, STAGING_SUPABASE_SERVICE_ROLE_KEY, STAGING_KSEF_CREDENTIALS_ENCRYPTION_KEY.
5. Sprawdzić istniejące sekrety repozytorium i organizacji. Wrażliwe klucze nie mogą pozostać dostępne wszystkim workflow. Samo przeniesienie odwołań w YAML nie usuwa istniejącego sekretu z repo; potrzebne jest ograniczenie go do właściwego środowiska, a przy podejrzeniu ujawnienia — rotacja.
6. Potwierdzić odizolowanie staging i brak skutków w produkcyjnym KSeF, Stripe, storage i poczcie. Środowisko GitHub to ochrona dostępu do sekretów, nie dowód tożsamości bazy.

Dotychczasowe RUN_E2E_ON_CI nie włącza już uprzywilejowanych testów PR. Trace, screenshoty i HTML mogą zawierać dane lub sesje, więc nowy E2E nie publikuje ich automatycznie. Odbiór redakcji artefaktów jest osobnym zadaniem.

## Uruchomienia lokalne i granice pierwszego pakietu

Test parsera raportów jest hermetyczny:
`node --test scripts/security/check-codeql-results.test.mjs`.

Test skanera przyjmuje ścieżkę do pobranego i zweryfikowanego Gitleaks:
`node scripts/security/verify-gitleaks.mjs <ścieżka-do-binarki>`.

Instrukcja bezpiecznych mutujących testów RLS: [README-RLS](../../tests/README-RLS.md). Zdalne RLS są zablokowane; test guardu nie zastępuje testu polityk na przygotowanej bazie.

## Powtarzalna inwentaryzacja offline

Zaadaptowano wyłącznie audit-service-role.ts oraz inventory-entrypoints.ts. Uruchomione z katalogu głównego repo czytają lokalny kod i pliki migracji jako tekst. Nie wykonują aplikacji, nie czytają plików .env i nie łączą się z bazą ani usługami. CLI wymaga Node 22.18+ lub 24 ([obsługa TypeScript w Node](https://nodejs.org/docs/latest-v22.x/api/typescript.html)).

Każdy skrypt wymaga jawnego --output-dir do nowego lokalnego katalogu, np.:

```text
node scripts/security/audit-service-role.ts --output-dir <nowy-katalog-service-role>
node scripts/security/inventory-entrypoints.ts --output-dir <nowy-katalog-wejsc>
node --test scripts/security/offline-audit-output.test.mjs
```

Zapis do historycznego docs/security/audyt jest odrzucany, także po rozpoznaniu dowiązania lub junction. Istniejące raporty nie są nadpisywane. Lokalne uprawnienia plików zależą od systemu i dziedziczonych ACL; helper nie izoluje od złośliwego procesu mającego prawo zmieniać te same katalogi.

W CI wyniki trafiają wyłącznie do nowych podkatalogów RUNNER_TEMP. Log zawiera liczniki i ścieżki wyjściowe, bez treści raportów. Raporty nie są publikowane jako artefakty. Ich odtworzenie lokalnie wymaga tego samego commita i świeżego katalogu.

Exit 0 oznacza utworzenie raportów, także gdy heurystyka oznaczyła miejsca do przeglądu. Exit 1 oznacza błąd odczytu/zapisu; exit 2 błędne argumenty lub zabroniony katalog historyczny. To kontrola powtarzalności inwentaryzacji, a nie automatyczny werdykt o izolacji firm.

Obecność requireAdmin w layout jest informacją pomocniczą. Nie zastępuje kontroli przy odczycie danych; taki wynik wymaga prześledzenia helpera. Podobnie etykieta ok nie potwierdza kolejności wywołań ani wdrożonej polityki RLS. [Zalecenia autoryzacji Next.js](https://nextjs.org/docs/app/guides/authentication).

Pozostałe audit-*.ts i run-prod-* pozostają poza CI. Wymagają osobnej oceny efektów ubocznych i celu; szczególnie nie należy uruchamiać mutujących weryfikacji produkcyjnych. Ten pakiet nie zmienia schematu, kluczy ani konfiguracji hostów.
