# F03 — odzyskiwanie hasła, TOTP i przekierowania

Data: 2026-09-16. Autor: Astra i agenci pomocniczy. Gałąź: `codex/security-access-continuation`, baza `a8dd10935b9c44225038fe8598dd53a28cb44da8` z PR #11. **Stan: kod i testy lokalne; bez publikacji nowej gałęzi i bez wdrożenia.** Pełna F03 pozostaje otwarta.

## Co poprawiono

### CYB-F03-16 — wyłączanie TOTP

Operacja wymaga sprawdzonego MFA w bieżącej sesji, hasła długości 1–1024 i wspólnego z operacjami hasła limitu 5 prób / 300 s na konto. Limit działa przed izolowanym sprawdzeniem hasła, a awaria zamyka operację. Reauth nie obniża poziomu oryginalnej sesji.

Usuwane są wyłącznie czynniki TOTP należące do konta zwróconego przez Auth. Phone/WebAuthn pozostają. Czyszczenie starych, nieczynnych kodów ratunkowych odbywa się przed pierwszym usunięciem czynnika; błąd bazy zatrzymuje dalsze kroki. Usunięcia wielu czynników nie są transakcją: częściowe wykonanie ma osobny wynik i komunikat, bez audytu pełnego sukcesu. Udany audyt podaje typ i liczbę usuniętych czynników.

Kod: `app/(dashboard)/settings/security/actions.ts`, komponent `two-factor-card.tsx`, `lib/auth/mfa-recovery.ts`. Testy: `totp-unenroll-boundary`, `mfa-recovery-cleanup` oraz istniejące testy MFA/reauth. Nie włączono generatora ani konsumowania ratunkowych kodów MFA.

### CYB-F03-17 — rzeczywisty formularz zapomnianego hasła

Poprzedni link prowadził do ustawień wymagających starego hasła. Wprowadzono `/reset-password` oraz autoryzację niezależną od deklaracji przeglądarki.

- Żądanie przyjmuje ograniczony i poprawny adres email, sprawdza Turnstile, stosuje osobne atomowe limity 5/h na email i 10/h na IP. Awaria limitera odmawia wysyłki. Budżety są oddzielone od zalogowanych operacji hasła.
- Docelowy adres pochodzi wyłącznie ze zweryfikowanego `NEXT_PUBLIC_APP_URL`. SSR PKCE zapisuje verifier w przeglądarce proszącej o reset, dlatego wiadomość trzeba otworzyć w tej samej przeglądarce. Odpowiedź dla istniejącego i nieistniejącego konta oraz błędu Auth jest jednakowa. Akceptacja przez Auth nie jest dowodem doręczenia maila; surowe błędy nie są logowane ani wyświetlane.
- Helper pobiera token sesji i sprawdza dokładnie ten token przez `getUser(token)` oraz `getClaims(token)`. Wymaga zgodnego `sub`, poprawnego `session_id`, AAL1/AAL2 i podpisanego AMR `recovery`. Znacznik czasu musi być całkowity i świeży: poniżej 15 minut, z najwyżej 30 s tolerancji przyszłego czasu. Odświeżenie `iat` nie odnawia prawa do resetu.
- Cookies z danymi użytkownika, metadata, `next`, fragment `type=recovery` i SDK `redirectType` nie stanowią uprawnienia. Sesje password/oauth/otp/magiclink nie są przyjmowane jako dowód tego procesu. Starsze/niekompatybilne wdrożenie Auth ma odmówić, a nie uruchomić słabszy fallback.
- Dowolny aktywny, zweryfikowany czynnik MFA wymaga AAL2. Przy TOTP formularz kieruje do istniejącego challenge i wraca do resetu. Nieobsługiwany typ drugiego czynnika nie daje obejścia.
- Przed zapisem obowiązuje limit operacji hasła, kontrola siły i wycieków oraz ponowne sprawdzenie świeżości, MFA i zgodności użytkownika/sesji po walidacji. Potem atomowo zajmowany jest jeden zapis na `session_id` na 16 minut, czyli dłużej niż całe okno dopuszczonego dowodu. Rezerwacja nie jest zwalniana po nieudanej albo niepewnej odpowiedzi Auth; trzeba rozpocząć proces nowym mailem.
- Zapis używa klienta sesji i samego nowego hasła; bez starego hasła, nonce, administracyjnej zmiany hasła i service_role. Sukces wymaga użytkownika zgodnego z potwierdzonym kontem. Nie ma ponawiania z osłabionymi wymaganiami.
- Po sukcesie bezpośrednie `auth.admin.signOut(verifiedJwt, 'global')` na tym samym **anon kliencie** zachowuje błędy 401/403/404. Osobne `signOut({scope:'local'})` czyści lokalną sesję. UI odróżnia potwierdzone odwołanie od lokalnego cleanup i nie zamienia niepewnego wylogowania w porażkę już zapisanej zmiany hasła.

Kod: nowy `lib/auth/password-recovery.ts`, katalog `app/(auth)/reset-password/`, akcja/formularz `forgot-password`, rozszerzenie `lib/rate-limit/password.ts` i publiczna ścieżka middleware z własnym guardem. Testy `password-recovery`, `password-reset-action`, `password-recovery-request`, `password-recovery-limit`, `password-reset-ui` oraz middleware.

**Granica zabezpieczenia:** limit 15 minut i pojedynczy zapis są kontrolami tej akcji aplikacji. Nie zmieniono polityki publicznego, bezpośredniego Auth `/user`. Wydane access JWT mogą pozostać ważne do wygaśnięcia mimo odwołania odświeżania sesji. Nie przedstawiać tego pakietu jako globalnego rozwiązania odzyskiwania Auth lub natychmiastowego unieważniania wszystkich JWT.

### CYB-F03-18 — reset inicjowany przez administratora

`generateLink(type: recovery)` generował link, ale nie wysyłał wiadomości. Panel fałszywie zgłaszał wysyłkę. Akcja nadal wymaga `requireAdmin`, lecz teraz uczciwie odmawia; przycisk jest wyłączony, a instrukcja wskazuje samodzielne żądanie przez odbiorcę na `/forgot-password`. Nie ma generowania linku, wysyłki, odczytu danych celu ani fałszywego audytu sukcesu.

Nie zastąpiono tego pozorną wysyłką PKCE z przeglądarki administratora: verifier trafiłby do innej osoby. Nie dodano też uprawnienia z ogólnego AMR `otp` dla implicit. Poprawny proces inicjowany przez operatora wymaga osobnego kontraktu odbioru, potwierdzenia serwera i konfiguracji szablonu. To celowo niedostępna, wcześniej nieczynna funkcja. Samodzielny reset opisano powyżej.

### CYB-F03-19 — docelowa domena i zakończenie logowania

Wspólny `getTrustedAppOrigin` przyjmuje wyłącznie skonfigurowany origin HTTPS. Wyjątek HTTP dotyczy loopback przy jawnym development poza buildem produkcyjnym. Odrzuca dane logowania, dodatkową ścieżkę, query/hash, whitespace, backslash i znaki sterujące. Brak poprawnej konfiguracji callback kończy kontrolowanym 503. Nagłówki Origin/Forwarded/Host żądania nie są fallbackiem.

Callback, strona finish i dotychczasowe przekierowania MFA używają wspólnego `safeRedirectPath`: kanonizacja wewnętrznej ścieżki, odmowa obcych originów, schematów wykonywalnych, znaków sterujących i niebezpiecznie kodowanych separatorów. Legalne query wewnętrznego adresu pozostaje.

Handler finish usuwa fragment URL przed utworzeniem klienta Auth, także przy błędzie lub braku tokenów. Nie pokazuje surowych błędów. Ponowne wykonanie efektu w StrictMode korzysta z jednej obietnicy; zakończenie po unmount nie nawiguje. Sam typ linku nie przyznaje prawa do zmiany hasła ani MFA. Callback ma `no-store` i `no-referrer`.

## Dowody i ich ograniczenia

- Pełny Vitest: **124 pliki / 2332 testy PASS**, zero pominiętych. Pełny typecheck PASS. Pełny lint: 0 błędów, 29 zastanych ostrzeżeń poza zmienionym zakresem (poprzednio 30); lint wszystkich 34 zmienionych/nowych plików TS/TSX bez ostrzeżeń PASS.
- XML: **66/66 PASS**. Narzędzia bezpieczeństwa: **67/67 PASS**. Bez prawdziwych kont, poczty, SQL, Redis i danych aplikacji.
- Testy z rzeczywistym zainstalowanym SDK `auth-js 2.103.3` i atrapą HTTP potwierdzają JWT/body zapisu, brak reauth oraz odróżnienie odpowiedzi logout 204/401/403/404/500. To nie test serwera GoTrue.
- Prawdziwy komponent w headless Edge 153: pending, MFA → ponowienie → sukces, cztery kombinacje obu flag wylogowania, poprawne ostrzeżenia/odsyłacze, usunięcie haseł z DOM; 0 żądań strony, 0 pageerror. Jedynie server action i Next Link były atrapami. React czyści niekontrolowane pola także po odmowie — użytkownik wpisuje je ponownie. Dowód: `faktflow-reset-ui-20260916-wiSXc4`.
- Przegląd agenta wykrył ukrywanie błędów logout przez zwykłe SDK; poprawiono je i dodano regresje. W finalnym odczycie nie pozostały potwierdzone nowe ustalenia w tym zakresie. Jest to przegląd zespołu AI, nie niezależny pentest; autor fragmentu admin sprawdził też jego zgodność, więc ta część nie jest niezależnym review.
- Offline: nadal 305 zapytań service_role, w tym 77 do przeglądu i 12 średnich; 103 wejścia / 35 sygnałów (dwa nowe wejścia odzyskiwania). Nie zmieniano heurystyk dla poprawienia wyniku. To inwentaryzacja, nie liczba potwierdzonych luk.
- Dowody lokalne: `faktflow-day16-validation-I2nPLH`, `faktflow-day16-offline-YWnCbD`. Next webpack compile PASS w kopii faktflow-day16-compile-8PcNP8; 34 pliki kodu/testów zgodne bajtowo. Nie jest to pełny build z prerenderem; Sentry ostrzega o niepełnym wsparciu trybu compile. Gitleaks kopii 36 przygotowanych plików: 0 trafień; historia do f106960: 237 commitów / 9,98 MB, 0 trafień. Dowód: faktflow-day16-scan-zJnPhj. Nie dodano wyjątków skanera.

## Odbiór Bartka przed wdrożeniem

1. Zapisać wersję/obraz GoTrue i skonfigurowaną publiczną domenę aplikacji. Sprawdzić HTTPS, dozwolone redirecty i rzeczywisty PKCE recovery AMR. Skonfigurowany origin jest teraz wymagany; brak poprawnej wartości blokuje callback i prośbę o reset.
2. Na wydzielonym stagingu z fikcyjnym kontem sprawdzić dostarczenie wiadomości, tę samą i inną przeglądarkę, wygasły/użyty link, zwykłą sesję bez recovery oraz nowy link po błędzie. Potwierdzić, że wiadomość nie prowadzi do starego formularza i że szablon nie zmienia PKCE w nieobsługiwany implicit/OTP.
3. Przejść konto bez MFA i konto z TOTP: email nie omija 2FA; challenge wraca do resetu, stare hasło przestaje działać. Ustawienia secure_password_change/current_password_required nie mogą uruchamiać fallbacku. Błąd/wymóg nieobsługiwany ma prowadzić do kontrolowanej odmowy.
4. Zweryfikować EVAL, TTL, równoczesność i awarię SRH/Valkey, a także politykę usuwania/utraty kluczy. Utrata rezerwacji nie może być traktowana jako zachowana jednorazowość. Sprawdzić limity email/IP i zaufany łańcuch proxy; adres IP z niezaufanego nagłówka nie jest samodzielną granicą ochrony.
5. Sprawdzić odwołanie własnych sesji, pozostałe access JWT i bezpośrednie Auth `/user`/PostgREST. Nie utożsamiać ochrony Server Action z serwerową polityką wszystkich klientów Supabase.
6. Sprawdzić wyłączenie TOTP z innymi czynnikami, błąd cleanup i częściowe usunięcie. Nadal ustalić pełny, sprawdzony proces po utracie drugiego czynnika oraz odwoływanie sesji innego konta po ID. Nie usuwać czynników ani tworzyć własnego JWT w celu obejścia.
7. Wcześniejsze zadania infrastruktury/RLS, rotacji i odbioru 00072 pozostają zgodne z datowanymi dokumentami właściciela. Ten pakiet nie zmienia SQL ani workera i nie wymaga nowej migracji.

Dzisiejszy odczyt GitHuba nie wykazał nowych commitów main, nowszych gałęzi/raportów operatora ani nowych komentarzy PR #7/#9/#11. Nie dowodzi to braku prac Bartka poza repo. Raportowane wcześniej wdrożenia 00068–00071 nie zostały niezależnie sprawdzone na serwerze; 00072 pozostaje skoordynowanym zadaniem właściciela.

## Kontrakt źródłowy i dalsze recovery

Sprawdzono kod zainstalowanego SDK 2.103.3 oraz pierwotne źródła GoTrue: [PKCE w verify.go](https://github.com/supabase/auth/blob/4eee58f296d9698a1c2c0ae14d7a0b379c7622d3/internal/api/verify.go#L135), [wymiana PKCE w token.go](https://github.com/supabase/auth/blob/4eee58f296d9698a1c2c0ae14d7a0b379c7622d3/internal/api/token.go#L256), [kontrola aktualizacji hasła](https://github.com/supabase/auth/blob/4eee58f296d9698a1c2c0ae14d7a0b379c7622d3/internal/api/user.go#L106) i [klasyfikacja recovery/OTP](https://github.com/supabase/auth/blob/4eee58f296d9698a1c2c0ae14d7a0b379c7622d3/internal/models/factor.go#L66). Źródła nie dowodzą wersji działającej na Hetznerze.

Korekta zbyt szerokiego historycznego uproszczenia: aktualna dokumentacja opisuje [eksperymentalne natywne recoveryCodes](https://supabase.com/docs/reference/javascript/auth-mfa-recovery-codes-generate), lecz zainstalowany SDK 2.103.3 go nie udostępnia. Dobór rozwiązania wymaga potwierdzenia zgodności SDK i self-hosted GoTrue. Nie twierdzić, że natywna funkcja w ogóle nie istnieje; nie włączać niesprawdzonego rozwiązania.

Wycofanie kodu wymaga powrotu do spójnego pakietu aplikacji i konfiguracji; nie usuwać aktywnych rezerwacji/limitów w Redis w celu wymuszenia ponownej próby. Powrót do starego kodu przywraca też opisane problemy. Żadnego wdrożenia ani rollbacku nie wykonano.

## Zapis kodu

- `f55ab932a8126b82dc7f296efde9481473fac999` — TOTP i cleanup.
- `5446b190f1b67db4155676c37ab0ff3ddedce3fb` — przekierowania i fragment.
- `f1069606d96f0ad34b4b59a4b78c3e809a111fea` — samodzielne odzyskiwanie hasła i stan resetu admina.

Nowy pakiet pozostaje lokalny. Po publikacji dopisać faktyczny status i wyniki GitHuba do opisu nowego PR; wcześniejsze zielone wyniki PR #11 nie dotyczą tych zmian.
