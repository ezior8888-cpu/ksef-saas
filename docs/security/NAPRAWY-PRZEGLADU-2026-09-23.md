# Poprawki po przeglądzie bezpieczeństwa — 23.09.2026

Autor: Astra/Codex. Kontynuacja na prośbę Igora „Popraw proszę” i „lecisz dalej”. Baza: `f3ca0d4c3b90b1eeaeb61d91cc78aa520206dd04` (PR #13), gałąź robocza `codex/security-review-remediation`. Ten dokument opisuje lokalny pakiet; publikacja, połączenie i wdrożenie mają osobne statusy w dzienniku. Nie wykonywano SQL, nie tworzono migracji i nie zmieniano serwera ani jego sekretów.

## Co poprawiono

### REV-01 — UPO: firma, faktura i numer KSeF

`lib/inngest/jobs/upo-identity.ts`, `download-upo.ts`, `upo-retry-stale.ts` sprawdzają zgodność firmy, faktury, numeru KSeF i statusu `accepted` przed skutkami. Odczyty są ponawiane także po wznowieniu zadania z zapisanym wynikiem kroku; sam cache nie stanowi autoryzacji. Zapisy potwierdzenia mają pełne warunki tożsamości. PDF korzysta z faktury odczytanej w tym samym zakresie.

Cron ponownie odczytuje kandydatów i porównuje relację do faktury. Potwierdzone niespójności oznacza `UPO_IDENTITY_MISMATCH`, wyłączając je z automatycznych powtórzeń. Błąd bazy nie jest podstawą do takiego oznaczenia. Wadliwy numer KSeF nie przerywa całej partii; test obejmuje także 100 wadliwych rekordów przed poprawnym. Warunki zapisu chronią równoległą naprawę tożsamości rekordu UPO.

**Granica:** osobne odczyty nie zastępują atomowej spójności parent–child w bazie. FK, UNIQUE, granty i bezpośredni PostgREST pozostają zadaniem Bartka. Po naprawieniu odseparowanego rekordu poprawne wymuszone zadanie musi ponownie zweryfikować relację i wyczyścić marker; sama naprawa rodzica nie włącza automatycznie retry. Kod nie dowodzi braku wszystkich wyścigów zmian faktury.

### REV-02 — podpisane powiadomienia Stripe

`lib/supabase/middleware.ts` dopuszcza bez sesji dokładnie `/api/stripe/webhook`. Obowiązkowe sprawdzenie podpisu pozostaje w handlerze; inne i zagnieżdżone ścieżki Stripe nie dziedziczą wyjątku. Regresje używają rzeczywistego proxy/matchera Next oraz SDK Stripe z syntetycznymi podpisami. Nie wykonano płatności ani wywołań produkcyjnego Stripe.

### REV-03 — wersja zgody FLO

Nowy `lib/flo/approval-version.ts` tworzy kanoniczny skrót treści propozycji: tożsamości, rodzaju, tematu, tytułu, body, payload, dowodów, odcisku faktów, terminu i priorytetu. Widok przekazuje wersję do akcji. Brak wersji w starej karcie wymaga odświeżenia. Akcja sprawdza wersję przed utworzeniem zgody, a wykonawca przed przejęciem i ponownie na wierszu zwróconym przez atomowy zapis. Sama zgodność odcisku faktów już nie wystarcza.

Token jest związany także z dokładnym zwalidowanym input użytkownika. Zużycie tokenu ma warunki firmy, użytkownika, propozycji, terminu, wersji i skrótu input w jednym UPDATE. Ta sama niezrealizowana zgoda jest współdzielona tylko dla identycznej operacji; nowa treść/input wymagają nowego tokenu. Wygasłe tokeny nie blokują bez końca indeksu unikalnego. Stare snapshoty bez wiązania są odrzucane. Zwalnianie przejęcia nie nadpisuje równoległego zakończenia/odrzucenia propozycji.

**Granica:** wiązanie chroni przepływ karta → akcja → wykonawca FLO. Nie jest deklaracją niezmienności wszystkich późniejszych skutków kolejki. Znany starszy przepływ `payment-chase-handler` → `send-reminder` przekazuje `approvalId`, a późniejsza wysyłka pobiera aktualnego adresata. Trwała zgoda obejmująca ostateczną wiadomość/adresata w kolejce pozostaje osobnym zadaniem przed szerszym uruchomieniem FLO. Nie włączano żadnych funkcji ani flag.

Aktualizacja po tym pakiecie: [osobna kontynuacja zgody w kolejce przypomnień](ZGODA-NA-PRZYPOMNIENIA-2026-09-23.md) zamraża wiadomość i PDF oraz weryfikuje dispatch/receipt. Jej granice i odbiór są opisane osobno.

### REV-04 — wymagania GitHuba

Świeży odczyt 23.09 potwierdza tylko zakaz usuwania i force push na `main`. Konto ma `push`, ale nie ma `admin` ani `maintain`. Zapis ustawień nie był podejmowany. **Ten punkt pozostaje otwarty po stronie Bartka.**

Przygotowano [dokładną konfigurację i odbiór](GITHUB-WYMAGANE-KONTROLE.md): wymagany PR, jedna niezależna akceptacja, ponowne zatwierdzenie nowych zmian, zamknięcie dyskusji i sześć istniejących kontroli z potwierdzonym App ID. Dokument wymaga zachowania obecnych reguł i rzeczywistej listy wyjątków, której bieżący dostęp nie ujawnia. Siedem zielonych checks z PR #13 dotyczy starego SHA, nie tego nowego pakietu.

### REV-05 — termin wylogowania po bezczynności

`hooks/use-inactivity-timeout.ts` oddziela stan ostrzeżenia od rejestracji timerów. Ostrzeżenie po 59 minutach nie rozpoczyna kolejnej godziny. Test rzeczywistego React w StrictMode potwierdza dokładnie jedno wylogowanie po 60 minutach, brak przedłużenia przypadkowym ruchem oraz działanie jawnego „Pozostań”. Obejmuje także rerender i unmount.

Timer przeglądarki nie zastępuje serwerowego wygasania sesji; zatrzymana karta/urządzenie wymaga osobnego odbioru polityk Auth.

### REV-06 — prawdziwy wynik wylogowania

Wspólny `lib/auth/sign-out.ts` rozdziela lokalne usunięcie cookies i potwierdzone odwołanie sesji przez Auth. Czyści tylko cookies bieżącego projektu Supabase, ich fragmenty i PKCE verifier. To działa również przy błędzie inicjalizacji/HTTP500; inne cookies i sesje innych projektów pozostają nietknięte. Audyt przypisuje użytkownika tylko po weryfikacji jego tokenu i nie oznacza globalnego sukcesu po błędzie.

Login pokazuje informację o wylogowaniu lokalnym, jeśli nie potwierdzono odwołania pozostałych sesji. IdleWatcher obsługuje oczekiwanie, błąd lokalnego cleanup i świadome ponowienie, bez podwójnej prośby gdy termin upłynie w trakcie klikniętego logout. Gdy cookies nie można usunąć, nie pokazujemy sukcesu. Nie naprawia to wcześniej zidentyfikowanego administracyjnego odwołania innego konta po samym ID.

### REV-07 — stare linki logowania

`/auth/finish` usuwa fragment z URL, odrzuca stare linki z tokenami i prowadzi do logowania/uzyskania nowego linku. Nie tworzy klienta Auth i nie wywołuje `setSession`. Klient przeglądarkowy ma `detectSessionInUrl:false`; wspierany PKCE nadal wymienia code+verifier w serwerowym `/auth/callback`.

Regresje z prawdziwym SDK potwierdzają zachowanie sesji A mimo tokenów B w linku oraz poprawny PKCE. Doprecyzowanie: obecny SSR SDK domyślnie używa PKCE i sam już odrzuca implicit; pierwotnym problemem było jawne `finish.setSession`. Nowa opcja dodatkowo zapobiega konkurencyjnej wymianie PKCE przez komponenty klienta. Szablony/redirecty rzeczywistego GoTrue wymagają odbioru Bartka. Stary link trzeba wygenerować ponownie.

### REV-08 — wspólny budżet prób hasła

`lib/auth/reauth.ts` sam pobiera atomowy budżet konta. Obejmuje GDPR (żądanie i anulowanie), zmianę hasła, nonce i usuwanie TOTP; akcje nie naliczają próby drugi raz. Awaria Redis zatrzymuje sprawdzenie hasła i skutki operacji. GDPR zwraca osobny kod limitu/niedostępności zamiast udawać błędne hasło.

Testy wywołują rzeczywiste akcje, helper i limiter, z syntetycznym transportem Auth/Redis: z 20 równoległych prób przez różne akcje tylko 5 dochodzi do Auth. To nie jest test wykonania Lua na rzeczywistym SRH/Valkey ani limitów GoTrue.

## Dodatkowo — aktualizacja podatnego narzędzia ZIP

Świeży audit wykrył dwa zgłoszenia dla adm-zip 0.6.0, high i moderate. Jedyna ścieżka w lockfile to developerskie inngest-cli → adm-zip. Dodano dokładny override adm-zip@<0.6.1 → 0.6.1, bez zmiany pozostałych overrides i bez zmiany deklaracji zależności produkcyjnych. [Oficjalne wydanie 0.6.1](https://github.com/cthackers/adm-zip/releases/tag/v0.6.1) opisuje ograniczenie dekompresji i ochronę ekstrakcji przez symlinki; [advisory high](https://github.com/advisories/GHSA-7q85-xj36-vmfc) wskazuje tę wersję jako poprawioną.

Ponowny audit produkcyjny i audit całego lockfile: **0 zgłoszeń, oba exit 0**. Frozen lockfile sprawdzony offline w osobnej kopii: PASS, bez zmiany SHA pliku. Starsze advisory moderate nadal ma nieuzupełnione pole patched, lecz wersja 0.6.1 jest poza jego zakresem i oficjalny release opisuje tę poprawkę. Dowód TEMP: faktflow-admzip-fix-CLxAo9. To wynik bazy znanych podatności w chwili sprawdzenia, nie gwarancja braku innych błędów.

Kompilacja oraz testy aplikacji nie korzystały z nowej wersji developerskiego CLI: współdzielone node_modules pozostawiono nietknięte. Różnica nie zmienia zależności produkcyjnych użytych przy buildzie. Czystą instalację całości z końcowego lockfile powinien potwierdzić CI.

## Weryfikacja

- Pełny Vitest: **140 plików / 2568 testów PASS**. Wzrost netto względem bazy 132/2465: 8 plików i 103 testy; zastąpiono również stare oczekiwania akceptujące podatne zachowania.
- Typecheck PASS. Lint: **0 błędów / 29 istniejących ostrzeżeń**; progów ani wyjątków nie obniżano.
- XML: **66/66 PASS** z lokalnym walidatorem XSD. Narzędzia bezpieczeństwa: **67/67 PASS**.
- **Pełny `next build --webpack` PASS**, 102 sekundy, 82/82 stron; ukończono TypeScript, zbieranie zależności i finalizację. To zamyka wcześniejszy brak potwierdzenia lokalnej kompilacji kodu.
- Przegląd drugiego agenta objął granicę zgody FLO; root przejrzał UPO/auth i dodatkowo wykrył oraz naprawił zatrzymywanie partii przez wadliwy numer KSeF.

Testy działały bez sekretów aplikacji, z allowlist środowiska i `envDir:false`. Do rzeczywistego renderowania React dodano wyłącznie dev dependencies `jsdom@29.1.1` i `@types/jsdom@27.0.0`. Wspólnego `node_modules` innych worktree nie zmieniono; lokalnie nowe zależności zainstalowano w TEMP i wskazano w konfiguracji testów/typów. Standardowa instalacja pnpm z locka zapewnia je normalnie.

Build wykonano w świeżej kopii bez `.env`, z syntetycznymi publicznymi adresami, stertą 6 GB i jednym workerem. `cpus:1` i `webpackMemoryOptimizations:true` dotyczyły wyłącznie kopii, nie repo. Nie budowano artefaktu standalone/Docker; nie uruchamiano usług na prawdziwych danych. Późniejsza zmiana testu TOTP nie zmieniła źródeł aplikacji.

Dowody lokalne (TEMP, nie publikowane): `faktflow-auth-dom-U8LY1F/tests.json`, `faktflow-review-validation-bZt9lU`, `faktflow-remediation-full-build-VY4kwc/{result.json,build.log,source-manifest.json}`. Stan audytu zależności i skanu sekretów należy czytać z końcowego wpisu dziennika.

## Pozostałe warunki odbioru i wycofanie

Bartek: reguły GitHuba; relacje/granty DB i testy dwóch firm przez PostgREST; odbiór GoTrue/PKCE/logout/MFA i SRH/Valkey; build właściwego obrazu aplikacji oraz workera w Coolify. Wciąż otwarte są wcześniejsze backup/restore, infrastruktura i niezależny pentest. Nie wolno utożsamiać testów lokalnych ze stanem wdrożenia lub pełnym domknięciem F03.

Pakiet nie zmienia schematu. Wycofanie kodu przywraca opisane usterki; przy ewentualnym rollbacku należy utrzymać wyłączenie dotkniętych funkcji i ustalić poprawioną wersję. Cofnięcie kodu nie usuwa automatycznie markerów odseparowanych UPO. Stare tokeny FLO pozostają dowodem historycznym i nie są ponownie uprawnieniem do wykonania.
