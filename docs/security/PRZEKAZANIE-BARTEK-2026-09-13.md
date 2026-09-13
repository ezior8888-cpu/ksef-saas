# Przekazanie bezpieczeństwa dla Bartka — 2026-09-13

Igor zatwierdził publikację przygotowanych poprawek po wyjaśnieniu automatycznego Vercel Preview i zakończył dzisiejszy zakres. Kolejnej fazy nie rozpoczęto. Ta lista przekazuje czynności właściciela; nie oznacza wykonania zmian na serwerze.

## 1. Odblokować kontrolę zależności GitHub

W [ustawieniach bezpieczeństwa repo](https://github.com/ezior8888-cpu/ksef-saas/settings/security_analysis) włączyć **Dependency graph**, następnie ponowić nieudane dependency-review dla aktualnych commitów PR. Konto użyte do pracy ma push, ale nie admin/maintain.

Dowód odbioru: dependency-review przechodzi. Nie usuwać tego zadania ani nie ustawiać continue-on-error tylko po to, żeby uzyskać zielony wynik.

## 2. Potwierdzić cel i konfigurację Vercel Preview

[Bot w PR #2](https://github.com/ezior8888-cpu/ksef-saas/pull/2#issuecomment-5655251921) potwierdził automatycznie utworzony podgląd. Aktualizacja gałęzi może uruchamiać kolejny podgląd także po migracji na Hetzner. Nowe workflowy bezpieczeństwa nie zawierają polecenia wdrożenia Vercel.

Sprawdzić w koncie Vercel:
- czy ta integracja ma pozostać aktywna jako zapas/podgląd;
- jakie bazy i konta usług oraz konfigurację wykorzystuje środowisko Preview;
- czy podgląd ma odizolowane dane i uprawnienia, bez skutków w rzeczywistych płatnościach, KSeF i poczcie.

Jeżeli podglądy są zbędne, osobno uzgodnić ograniczenie/wyłączenie automatyzacji. Jeżeli zostają, potwierdzić ich izolację. Sama nazwa Preview nie jest dowodem. Wynik zapisać bez wartości kluczy i bez danych klientów.

## 3. Ustawić wymagane kontrole i przejrzeć PR

W ruleset dla docelowej gałęzi wymagać:
- Typecheck + Lint + Unit tests;
- dependency-review;
- Secret scan;
- CodeQL (javascript-typescript);
- CodeQL (actions);
- Offline security inventory po potwierdzeniu jego rzeczywistego przebiegu.

Potwierdzić, że nieudany wymagany check blokuje merge; samo istnienie YAML tego nie zapewnia. Wymagać review zmian workflowów, bramek i wyjątków.

Kolejność zależności:
1. [PR #1](https://github.com/ezior8888-cpu/ksef-saas/pull/1), codex/security-leak-fixes — wcześniejsze naprawy.
2. [PR #2](https://github.com/ezior8888-cpu/ksef-saas/pull/2), codex/security-foundations — testy RLS, CI, skanery i poprawki po CodeQL; baza to gałąź PR #1.
3. Drugi pakiet, codex/security-audit-inventory — pięć chronionych odczytów administracyjnych, zachowanie joba metryk, powtarzalny inwentarz i dokumentacja; baza to foundations.

Przed łączeniem ustalić docelowe gałęzie, aktualne commity i automatyzacje uruchamiane przez merge. Przegląd wymaga uwzględnienia zależności schematu z punktu 5. Publikacja draft PR nie jest zgodą na merge ani wdrożenie produkcji.

## 4. Przygotować odizolowany staging i dostęp do sekretów

W GitHub skonfigurować environment **security-staging**: dozwolona wyłącznie main, wymagany reviewer, bez samodzielnego zatwierdzania przez uruchamiającego. Umieścić wyłącznie oddzielne klucze środowiska testowego:
- STAGING_SUPABASE_URL;
- STAGING_SUPABASE_ANON_KEY;
- STAGING_SUPABASE_SERVICE_ROLE_KEY;
- STAGING_KSEF_CREDENTIALS_ENCRYPTION_KEY.

Sprawdzić, które workflowy nadal mają dostęp do istniejących sekretów repo/organizacji i ograniczyć ich zakres. Sama zmiana nazw w YAML nie usuwa starych uprawnień.

Dowód odbioru: fikcyjne dane co najmniej dwóch firm, właściwa baza i osobne klucze, kontrola wszystkich skutków zewnętrznych. Do czasu odbioru nie uruchamiać mutujących E2E. Testy RLS mają dodatkowo własne ograniczenia lokalnego celu i zakaz tunelu do produkcji — [README-RLS](../../tests/README-RLS.md).

## 5. Potwierdzić zgodność środowiska przed planowaniem wydania

Ustalić faktycznie wdrożone wersje aplikacji, workera i schematu. Potwierdzić stan istniejących 00068/00069 oraz zależności GDPR: hash tokenu anulowania, stan processing, processing_started_at i unikalność aktywnego żądania.

Propozycje schematu są w [PROPOZYCJE-SCHEMATU-GDPR.md](PROPOZYCJE-SCHEMATU-GDPR.md). Obecność pliku nie dowodzi zastosowania migracji; numery nowych propozycji nie są zarezerwowane. To przekazanie do właściciela bazy, bez polecenia wykonywania SQL dzisiaj.

Przyszłe wydanie musi mieć uzgodnioną kolejność zmian, zgodny kod–schema–worker i sposób wycofania. Kopie/restore, MFA, dalszy przegląd RLS oraz infrastruktura pozostają w następnych zadaniach; nie zostały odebrane w dzisiejszym pakiecie.

## Dowody i ograniczenia

Lokalnie: 88 plików / 1373 testy aplikacji oraz 52 testy narzędzi PASS; typecheck, lint zmienionych plików, Actionlint i końcowy Gitleaks historii PASS. Generator/walidator FA(3): 66/66 PASS. To nie są testy rzeczywistej bazy ani infrastruktury.

Dokładny przebieg, commity i korekty ustaleń: [dziennik](DZIENNIK-ODPORNOSCI-CYBER.md). Szczegóły workflowów i znaczenie exit codes: [CI-SECURITY.md](CI-SECURITY.md). Aktualny wynik GitHub trzeba sprawdzać na ostatnim commicie danego PR; sam historyczny zielony przebieg nie wystarcza.

Nie wpisywać wartości sekretów, danych klientów ani pełnych dumpów do publicznego repo. Potwierdzenia operatorskie zapisywać jako status, datę i identyfikator dowodu.
