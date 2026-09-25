# F03 — onboarding, zaproszenia i potwierdzanie zmiany hasła

Data: 2026-09-15. Autor: Astra, na polecenie kontynuacji Igora. Gałąź lokalna codex/security-account-continuation, po PR #10 (dc7806a). Przed poprawkami połączono main b9c3703 i opublikowane prace Bartka z PR #7 oraz #9. Jest to przygotowanie kodu do przeglądu, bez merge do main i wdrożenia na Hetzner/Coolify.

## Zmiany

- **CYB-F03-13 — MFA na wejściach bez istniejącej organizacji.** Publiczny charakter onboardingu i zaproszenia nie oznacza zwolnienia zalogowanego konta z jego drugiego czynnika. Nowy lib/auth/verified-user.ts wymaga zweryfikowanej tożsamości i ukończonego MFA, jeśli konto ma aktywny czynnik. Nie wymaga posiadania firmy. Chroni utworzenie firmy, pominięcie NIP, wysłanie prośby o dołączenie, akceptację zaproszenia oraz odczyt GUS i informacji o istniejącej organizacji. Odmowa następuje przed uprzywilejowanym klientem, RPC, GUS, Stripe, audytem i zapisem cookies.
- **Importy i ich strony.** Oba starty importu korzystają z requireUserAndActiveOrg; samo cookie firmy nie zastępuje aktywnego członkostwa. Pozostaje kontrola zgodności przekazanego tenantId z aktywną organizacją. Strony onboardingu, wyboru importu, importu, postępu i zaproszenia sprawdzają MFA przed danymi. Postęp dodatkowo filtruje aktywnego tenanta i nadal respektuje RLS. Przekierowanie na challenge zachowuje cel, w tym zaproszenie; awaria Auth nie uruchamia odczytu ani pętli przekierowań.
- **CYB-F03-14 — potwierdzanie zmiany hasła.** Oryginalna sesja MFA pozostaje zachowana. Izolowane sprawdzenie aktualnego hasła nie odmładza jej na potrzeby GoTrue. Formularz obsługuje więc reauthentication_needed, umożliwia jawną wysyłkę kodu i przekazuje nonce oraz current_password przy ponowieniu. Nie wylicza samodzielnie wieku sesji i nie podnosi AAL własnym tokenem. Sukces wymaga odpowiedzi dla tego samego użytkownika.
- **Ograniczenie prób hasła.** Osobne od TOTP limity na konto: pięć operacji w stałym oknie 300 s oraz dodatkowo jedna próba wysyłki kodu na 60 s. Zmiana hasła i żądanie kodu współdzielą limit operacji. Atomowy EVAL przechowuje ograniczony licznik z TTL. Awaria, brak konfiguracji lub niepoprawna odpowiedź odmawiają operacji. Błędne żądanie także zużywa próbę; odmowa nie przedłuża okna.
- **Formularz.** Kod jest wysyłany wyłącznie po kliknięciu. Błąd nie usuwa wpisanych haseł; sukces czyści hasła i kod. Walidacja przyjmuje nonce o długości 6–10 cyfr (konfigurowalnej w Auth), ogranicza długości wejść i odrzuca pliki w polach tekstowych. Dane nie trafiają do URL, logów, localStorage ani cookies aplikacji.
- **Wzmocnienie po integracji.** Wspólny kontekst czterech akcji formularza faktury korzysta z tej samej kontroli MFA i aktywnego członkostwa, również przy pobieraniu ostatniej faktury do nowego formularza. To dodatkowa ochrona samej akcji. Nie potwierdzono obejścia transportu Server Actions przez publiczną ścieżkę — Next sprawdza właściwy worker; nie opisujemy tego jako wykazanego exploita.

## Dowody i granice testów

Pierwszy pełny przebieg po integracji: 109 plików / 1890 Vitest PASS, 66 XML PASS, pełny typecheck i lint PASS, 48 testów narzędzi audytu PASS. Izolowana kompilacja Next.js webpack w trybie compile PASS; kopia bez .env i prawdziwych kluczy, syntetyczny Supabase na loopback. To nie pełny build z generowaniem stron ani odbiór serwera.

Testy sprawdzają brak skutków przed autoryzacją, inne czynniki niż TOTP, błędy Auth, cofnięte członkostwo, własną/cudzą firmę, działanie kont bez MFA i poprawnego AAL2. Prawdziwy SDK z atrapą HTTP potwierdza użycie pierwotnej sesji przy wysyłce/nonce i aktualizacji hasła. Formularz przeszedł dodatkowo hermetyczny test w headless Edge: wymagany kod → jawna wysyłka → błędny kod → sukces, zachowanie pól przy błędach i czyszczenie po sukcesie, zero żądań sieciowych. To test komponentu z atrapami akcji, nie pełnego logowania.

Przegląd security-review nie wykazał potwierdzonej nowej podatności w nonce, limiterze i osłonach onboardingu. Wstępne podejrzenie publicznego wywołania akcji faktury wycofano po odczycie implementacji Next. Przegląd AI nie zastępuje niezależnego pentestu.

Końcowy odbiór po wzmocnieniu formularza faktury: **110 plików / 1915 Vitest PASS (0 pominiętych), 66 XML PASS, pełny typecheck i lint PASS, 48 testów narzędzi audytu PASS**. Ponowiona izolowana kompilacja compile PASS; wszystkie 13 nowych/zmienionych plików aplikacji są bajtowo zgodne z kopią kompilacji. Skan 24 przygotowanych plików bez trafień; 20 plików kodu/testów zgodnych z kopią skanu. Gitleaks historii kodu 986a2cd: 231 commitów / 9,83 MB, brak trafień. Końcowy przegląd dwóch plików wzmocnienia faktur: bez nowych usterek. Szczegóły i commity w [dzienniku](DZIENNIK-ODPORNOSCI-CYBER.md).

## Odbiór przed wydaniem

1. Potwierdzić wersję GoTrue i jego ustawienia secure_password_change oraz wymogu aktualnego hasła. Przećwiczyć nową i starą sesję z prawdziwym dostarczeniem kodu, jego wygaśnięciem i błędnym kodem. Konfiguracji serwera ani supabase/config.toml nie zmieniono.
2. Na odizolowanym stagingu sprawdzić EVAL, TTL, współbieżność i odmowę przy awarii SRH/Valkey. Testy lokalne limitera używają atrap odpowiedzi, nie wykonują Lua na Redisie. Limity aplikacji nie obejmują bezpośredniego wywołania GoTrue.
3. Sprawdzić pełny onboarding i zaproszenie po nowym logowaniu AAL1: challenge → powrót do właściwego celu → własna firma/import. Dodać odbiór RLS i publicznych wejść Auth/PostgREST na fikcyjnych kontach dwóch firm.
4. Pełne odzyskiwanie MFA, odwoływanie sesji po ID i pozostały przegląd uprzywilejowanych ścieżek nadal nie są ukończone. Ten pakiet nie włącza niedziałającego recovery.
5. Przy integracji PR-ów zachować nowsze zależności pakietu bezpieczeństwa i [plan wydania GDPR Bartka](PLAN-WYDANIA-GDPR.md). Pliki 00070–00072 pochodzą od właściciela; nie tworzono ani nie uruchamiano SQL. 00072 pozostaje zmianą wymagającą skoordynowanego wydania aplikacji i workera.

Źródła kontraktu Auth: [reauthentication przy zmianie hasła](https://supabase.com/docs/guides/auth/password-security#require-reauthentication-when-changing-password), [current_password](https://supabase.com/docs/guides/auth/passwords#verifying-the-current-password), [wysyłka nonce](https://supabase.com/docs/reference/javascript/auth-reauthenticate). Lokalny SDK: @supabase/auth-js 2.103.3.
