# A4 — Test runtime: cookies, magazyny przeglądarki i żądania sieciowe

| | |
|---|---|
| Autor | agent RUNTIME (audyt 13, etap „Test runtime cookies i sieci”) |
| Data | 10.10.2026 (zlecenie); build 11.10.2026 14:19–14:21 UTC, trzy przebiegi testu 14:22–14:48 UTC (wynik końcowy: 14:41–14:48) — wznowienie po limicie API |
| Wersja kodu | `origin/main` @ `3e5e00d` |
| Zakres | publiczne strony aplikacji w przeglądarce: cookies (także HttpOnly z `Set-Cookie`), localStorage, sessionStorage, IndexedDB, Cache Storage, service worker, żądania do domen zewnętrznych; scenariusze: przed wyborem, po odmowie, po akceptacji, po wycofaniu |
| Źródła danych | lokalny build produkcyjny z syntetycznymi zmiennymi, Chromium (Playwright), kod w repo |
| Ograniczenia | brak Supabase (strony za logowaniem niedostępne), build lokalny to nie produkcja, konfiguracja produkcyjna PostHog/Sentry nieznana, ruch zewnętrzny celowo przerwany — szczegóły w sekcji 7 |
| Stan | po niezależnym review R3 (werdykt: zatwierdzony z uwagami) — uwagi R3 naniesione przez redaktora poprawek 13.10.2026, miejsca oznaczone **[R3]** (lista w „Historia recenzji”) |

## 1. Środowisko i zmienne syntetyczne

| Element | Wartość |
|---|---|
| Kod | `origin/main` @ `3e5e00d`; gałąź robocza `claude/gallant-faraday-ypjokp` (w trakcie sesji przesunęła się z `5dae8c8` na `a249916` — commity koordynatora z plikami audytu) różni się od `3e5e00d` wyłącznie plikami w `docs/audyt/`: `git diff --quiet 3e5e00d HEAD -- ':(top)' ':(top,exclude)docs/audyt'` = 0, drzewo robocze poza `docs/audyt` bez zmian; to samo sprawdza pole `meta.kod_aplikacji_jak_3e5e00d: true` w wyniku JSON |
| Środowisko | sesja w chmurze (Linux, 4 vCPU, 15 GB RAM), Node v22.22.0, pnpm 10.33.0 |
| Tryb | **produkcyjny**: `pnpm build` (= `next build --webpack`, Next.js 16.3.8; build od zera 11.10.2026, `BUILD_ID` z 14:21 UTC, wynik `EXIT=0`, 82 strony statyczne) + `pnpm start -p 3100` (`NODE_ENV=production`). Tryb `pnpm dev` nie był potrzebny |
| Przeglądarka | Chromium 141.0.7390.37 z `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` przez `@playwright/test` 1.60.0 (`executablePath`; `playwright install` nie był uruchamiany), tryb headless, `locale: pl-PL`, UA bez „HeadlessChrome” i `navigator.webdriver = false` (inaczej `posthog-js` odrzuca zdarzenia jako ruch bota) |
| Plik `.env.local` | **nie utworzono**; zmienne podane w środowisku procesów build i start |

Zmienne podane procesom `pnpm build` i `pnpm start` (wszystkie **syntetyczne**,
żadna nie jest sekretem ani adresem produkcyjnym):

| Zmienna | Wartość | Dlaczego taka |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54321` | adres pętli zwrotnej, na którym nic nie nasłuchuje — brak backendu (ograniczenie, sekcja 7); trafia do CSP `connect-src` (`lib/security/csp.ts:15-23`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `syntetyczny` | wymagana przez klienta Supabase, nieużywana skutecznie |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3100` | adres testowy |
| `NEXT_PUBLIC_POSTHOG_KEY` | `phc_audyt_syntetyczny_klucz` | `isAnalyticsConfigured()` odrzuca tylko pusty klucz, prefiks `phc_xxx` i `phc_placeholder` (`lib/analytics/consent.ts:9-14`); ten klucz włącza provider i banner jak na produkcji |
| `NEXT_PUBLIC_POSTHOG_HOST` | `https://eu.i.posthog.com` | w kodzie brak wartości domyślnej — zmienna idzie tylko do `ui_host` (`lib/analytics/init-posthog-browser.ts:26`); wartość z `.env.example:193`. Ruch SDK idzie przez `api_host: '/ingest'` (`init-posthog-browser.ts:25`) i rewrite na `eu.i.posthog.com` / `eu-assets.i.posthog.com` (`next.config.ts:140-155`) |
| `NEXT_PUBLIC_SENTRY_DSN` | `https://publickey@o0.ingest.de.sentry.io/0` | DSN w formacie regionu DE; włącza Sentry w przeglądarce (`instrumentation-client.ts:5-21`, `enabled: NODE_ENV === 'production'`) i tunel `/monitoring` (`next.config.ts:189`) |
| `SENTRY_DSN` | ta sama wartość | serwerowy Sentry czyta `SENTRY_DSN` (`sentry.server.config.ts:5`) — podany tylko procesowi `start`, żeby zarejestrować próby wysyłki z serwera |
| `NEXT_PUBLIC_APP_ENV` | `production` | rozumiane znaczniki produkcji: `production`, `prod` (`lib/security/environment.ts:21`, `:46-48`) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | `1x00000000000000000000AA` | publiczny klucz testowy Cloudflare. Kod **wymaga** Turnstile poza lokalnym dev: bez konfiguracji `verifyTurnstile()` zwraca `not-configured` i blokuje logowanie (`lib/security/turnstile.ts:67-77`, `:106-110`), więc produkcja musi mieć klucz, a widżet renderuje się tylko z kluczem (`components/auth/turnstile-widget.tsx:25-26`) |
| `NEXT_TELEMETRY_DISABLED` | `1` | wyłącza telemetrię Next.js (ruch narzędzia, nie aplikacji) |
| `HTTP(S)_PROXY`, `NO_PROXY` | `http://127.0.0.1:3199`, `localhost,127.0.0.1,::1` | tylko proces `start`: biblioteki serwera respektujące proxy (np. transport Sentry dla Node) łączą się z lokalnym „sinkhole” (`narzedzia/sinkhole-proxy.mjs`), który zapisuje docelowy host i odpowiada 403; pozostałe połączenia zatrzymuje blokada egress |

Ten sam zestaw jest zapisany w `narzedzia/zmienne-syntetyczne.env` (bez
`SENTRY_DSN`, który skrypt startowy dodaje tylko procesowi `start`).

Budowanie (`pnpm build`) działało bez blokady egress, przez proxy środowiska:
`next/font/google` (`app/layout.tsx:2-8`, `:17-25`) pobiera fonty Geist,
Fraunces, Inter i IBM Plex Mono w czasie budowania (albo bierze je
z `.next/cache`) i serwuje je potem z własnej domeny. To ruch maszyny
budującej, nie przeglądarki użytkownika, i nie zawiera danych osobowych.
Wtyczka Sentry nie wysyłała map źródeł (brak `SENTRY_AUTH_TOKEN`). **[R3]**
Wtyczka domyślnie próbuje jednak wysłać do Sentry telemetrię użycia (metadane
budowania, bez danych osobowych; `telemetry` nie jest wyłączone
w `next.config.ts`, `@sentry/bundler-plugin-core` 5.3.0
`dist/cjs/index.js:5127,5385-5388`). Budowanie nie było objęte blokadą —
o wyniku tej próby decydowała polityka egress środowiska (domeny Sentry
blokowane); nie weryfikowano. Rekomendacja (I): `telemetry: false`
w opcjach `withSentryConfig` w `next.config.ts`. Build
dostał zmienne w środowisku procesu; `.env.local` nie istnieje i nie został
utworzony.

## 2. Metoda

**Narzędzia** (w `narzedzia/`, napisane na potrzeby audytu, nie są częścią
aplikacji):

| Plik | Rola |
|---|---|
| `narzedzia/blokada-egress-serwera.cjs` | ładowany do `pnpm start` (i procesów potomnych Node) przez `NODE_OPTIONS=--require`. Każde połączenie TCP serwera poza pętlę zwrotną **oraz** do lokalnego proxy wyjściowego na pętli zwrotnej (porty ze zmiennych `*_PROXY` sprzed podmiany) jest zapisywane (rodzaj, host, skrócony stos) i przerywane; bezpośrednie zapytania DNS o nazwy zewnętrzne — zapisywane i odrzucane. Dodatkowo zapisuje żądania **przychodzące** do `/ingest*` i `/monitoring`: metodę, ścieżkę bez query, `Sec-Fetch-*` oraz **nazwy** nagłówków i ciasteczek (bez wartości). |
| `narzedzia/test-cookies-i-sieci.mjs` | skrypt Playwright. `context.route('**/*')`: zasoby `http://localhost:3100` przechodzą; **każde** inne żądanie HTTP(S) jest zapisywane (metoda, host, ścieżka bez query, typ zasobu, scenariusz, krok) i przerywane (`route.abort`). Żądania do proxy pierwszej strony, które serwer przekazałby dostawcy (`/ingest/*` → PostHog, `/monitoring` → Sentry), są obsługiwane w przeglądarce syntetyczną odpowiedzią 200 i nie trafiają do serwera (wyjątek: krok `e3`); zapisywane są tylko nazwy zdarzeń, nazwy pól ładunku i zredagowane adresy stron. Rejestruje też zdarzenia `request`/`requestfailed` przeglądarki (żądania, które nie doszły do sieci). Chromium dostaje jako proxy lokalny „sinkhole” (zapis hosta, odpowiedź 403) — łapie to, co omija `route` (np. `<link rel="preconnect">`, WebSocket). |
| `narzedzia/sinkhole-proxy.mjs` | lokalny „sinkhole” dla procesu serwera: przyjmuje połączenia przez proxy, zapisuje tylko rodzaj, host i metodę, odpowiada 403; niczego nie przekazuje dalej |
| `narzedzia/uruchom-test-runtime.sh` | jedno polecenie: sinkhole + `pnpm start -p 3100` z blokadą + test + zatrzymanie procesów (także przy błędzie, `trap`) |
| `narzedzia/zmienne-syntetyczne.env` | zestaw zmiennych syntetycznych (build i start) |
| `narzedzia/wynik-test-cookies.json` | wynik surowy: migawki magazynów, `Set-Cookie`, żądania przerwane, sinkhole, zestawienie blokady serwera |

Przed testem blokadę sprawdzono osobno: `fetch`, `https.get`, `dns.lookup`,
`dns.promises.lookup` i połączenie TCP na adres IP — z `NODE_USE_ENV_PROXY=1`
i bez — kończą się `EAUDITBLOCKED`/`ENOTFOUND`, a rejestr zapisuje host
(skrypt kontrolny w scratchpadzie sesji, nie w repo).

**Recenzja narzędzi zastanych.** Pliki w `narzedzia/` zostawił poprzedni,
przerwany przebieg tej samej roli. Przeczytałem je w całości przed użyciem
i poprawiłem: (1) adresy stron w streszczeniu zdarzeń PostHog są obcinane do
origin + ścieżka (wcześniej zapisywano pełną wartość `$current_url`, która
mogłaby nieść query), (2) dodane porównanie identyfikatora `distinct_id`
między kolejnymi zdarzeniami — wynik zawiera tylko „taki sam / inny”, nigdy
wartość, (3) w metadanych pole `kod_aplikacji_jak_3e5e00d`, (4) krok
kontrolny `k` w podsumowaniu, (5) diagnostyka `e2` (CSP w service workerze)
i `e3` (ciasteczka w żądaniach do proxy dostawców) oraz zapis nazw
nagłówków i ciasteczek w blokadzie, (6) nowy skrypt startowy (sprzątanie
całej grupy procesów — pierwszy przebieg zostawił działający `next-server`,
zatrzymany ręcznie) i plik zmiennych. Wynik JSON z przerwanego przebiegu (build na
starszym commicie `b3970dc`) został nadpisany wynikiem tego przebiegu.

**Co jest zapisywane, a co nie.** Nazwy i atrybuty cookies (`HttpOnly`,
`Secure`, `SameSite`, `Max-Age`/`Expires`, `Path`, `Domain`) z nagłówków
`Set-Cookie` i z `context.cookies()` — **bez wartości**. Klucze localStorage
i sessionStorage — bez wartości, poza znacznikiem zgody `ff_analytics_consent`
i flagą PostHog `__ph_opt_in_out_*` (wartości techniczne: `granted`/`denied`,
`0`/`1`). Nazwy baz IndexedDB, nazwy i liczba wpisów Cache Storage (z hostami
wpisów), zakres i ścieżka skryptu service workera. Treści ładunków PostHog
i Sentry nie są zapisywane — tylko nazwy zdarzeń, nazwy pól i adresy stron
`localhost`. Z żądań przychodzących do `/ingest` i `/monitoring` — tylko
nazwy nagłówków i nazwy ciasteczek.

**Scenariusze** (każdy w świeżym kontekście przeglądarki, oczekiwanie 5 s
po zdarzeniu `load` na każdej stronie):

| Kod | Scenariusz | Przebieg |
|---|---|---|
| `a` | pierwsza wizyta, brak wyboru | każda strona w osobnym, świeżym kontekście |
| `a2` | brak wyboru, jedna sesja | wszystkie strony po kolei w jednym kontekście + syntetyczny błąd JS na `/` (czy Sentry wysyła przed decyzją) |
| `b` | odmowa | `/` → przycisk „Tylko niezbędne” → wszystkie strony → syntetyczny błąd JS |
| `b2` | zamknięcie bannera krzyżykiem | `/` → przycisk „Zamknij — Tylko niezbędne” → `/pricing` |
| `c` | akceptacja | `/` → „Akceptuję” → pozostałe strony (pełne przeładowania) |
| `d` | wycofanie | w kontekście z `c`: (d0) przeszukanie każdej strony pod kątem kontrolki zmiany decyzji (linki/przyciski z tekstem o cookies, zgodzie, prywatności, preferencjach); (d1) brak kontrolki → wywołanie dokładnie tego, co robi `setAnalyticsConsent(false)` (`lib/analytics/consent.ts:27-37`: zapis `denied` + zdarzenie `ff:analytics-consent`) na otwartej stronie, bez przeładowania, potem zmiana historii i kolejne strony; (d2) jedyna droga dostępna użytkownikowi bez kodu — wyczyszczenie danych witryny (localStorage) → banner → „Tylko niezbędne” |
| `e` | kontrole dodatkowe | wplecione w `a`–`c`: Turnstile, fonty, Stripe na `/login`, `/register`, `/forgot-password`; Sentry przy błędzie JS i przy stronie 404 (`/blog/nie-istnieje-audyt-13`) |
| `k` | kontrola | `about:blank` przez 15 s — ruch samej przeglądarki, żeby nie przypisać go aplikacji |
| `e2` | diagnostyka CSP w SW | `/` → po aktywacji service workera `fetch()` z wnętrza SW do `fonts.googleapis.com` i `challenges.cloudflare.com` + nasłuch `securitypolicyviolation`; odczyt `connect-src` z nagłówka `/sw.js` |
| `e3` | ciasteczka do proxy dostawców | syntetyczne ciasteczko `audyt13_syntetyczne=1` (`path=/`, `SameSite=Lax`) → `/` → „Akceptuję” → `/pricing`; `/ingest` i `/monitoring` przepuszczone do lokalnego serwera, który próbuje je przekazać dostawcy (zatrzymuje to blokada) |

Selektory pochodzą z `components/analytics/consent-banner.tsx`: tekst
„Analityka i pomoc w rozwoju produktu” (`:47`), przyciski „Akceptuję”
(`:70-76`), „Tylko niezbędne” (`:77-83`) i „Zamknij — Tylko niezbędne”
(`aria-label`, `:60-67`).

Strony: `/`, `/pricing` (cennik), `/legal/polityka-prywatnosci`,
`/legal/rodo`, `/login`, `/register`, `/forgot-password`, `/kontakt`,
`/blog/ksef-2-co-warto-wiedziec` (`content/blog/*.mdx`),
`/pomoc/czym-jest-ksef` (`content/help/*.mdx`) oraz celowe 404. Ścieżki
ustalone z `app/(landing)/page.tsx`, `app/(marketing)/*/page.tsx`,
`app/(auth)/*/page.tsx` i listy tras publicznych
`lib/supabase/middleware.ts:15-39`.

## 3. Wyniki: scenariusz × strona

Wynik końcowy pochodzi z trzeciego przebiegu (11.10.2026, 14:41–14:48 UTC,
Chromium 141.0.7390.37). Dwa wcześniejsze przebiegi tego samego dnia
(14:22–14:28 i 14:31–14:38, ten sam build) dały te same zbiory domen,
ciasteczek i kluczy; różniła się tylko liczba transakcji Sentry (próbkowanie
10%). Plik: `narzedzia/wynik-test-cookies.json` (64 migawki, 296 żądań
przechwyconych, pola `podsumowanie`, `macierz`, `serwer_egress`,
`serwer_wg_kroku`, `meta.e2_diagnostyka_sw_csp`).

Oznaczenie scenariuszy jak w sekcji 2. Dodatkowo: `k` — krok kontrolny
`about:blank` (15 s, ruch samej przeglądarki), `e2` — diagnostyka CSP
w service workerze, `e3` — czy ciasteczka trafiają do proxy dostawców.

### 3.1. Magazyny przeglądarki (identyczne na wszystkich 11 stronach danego scenariusza)

| Scenariusz | Cookies (`Set-Cookie` / `context.cookies()`) | localStorage | sessionStorage | IndexedDB | Cache Storage | Service worker | Banner |
|---|---|---|---|---|---|---|---|
| `k` about:blank | 0 / 0 | — | — | — | — | — | — |
| `a` brak wyboru, świeży kontekst na stronę | 0 / 0 | — | — | — | `serwist-precache-v2-http://localhost:3100/` (205 wpisów, tylko `localhost:3100`) | `/` → `/sw.js` | widoczny na 11/11 |
| `a2` brak wyboru, jedna sesja | 0 / 0 | — | — | — | jw. | jw. | 11/11 |
| `b` odmowa „Tylko niezbędne” | 0 / 0 | `ff_analytics_consent=denied` | — | — | jw. | jw. | tylko przed kliknięciem |
| `b2` zamknięcie „X” | 0 / 0 | `ff_analytics_consent=denied` | — | — | jw. | jw. | tylko przed kliknięciem |
| `c` akceptacja | 0 / 0 | `ff_analytics_consent=granted`, `__ph_opt_in_out_<klucz>=1` | — | — | jw. | jw. | tylko przed kliknięciem |
| `d1` po wycofaniu programowym | 0 / 0 | `ff_analytics_consent=denied`, `__ph_opt_in_out_<klucz>=0` | — | — | jw. | jw. | nie wraca |
| `d2` po wyczyszczeniu localStorage + odmowie | 0 / 0 | `ff_analytics_consent=denied` | — | — | jw. (nie czyszczone) | jw. (nie wyrejestrowany) | wraca po wyczyszczeniu |
| `e3` (ciasteczko syntetyczne dodane przez test) | 0 / 1 (`audyt13_syntetyczne`, ustawione przez test) | jak `c` | — | — | jw. | jw. | tylko przed kliknięciem |

Wniosek: aplikacja **nie ustawiła żadnego ciasteczka** na żadnej stronie
publicznej w żadnym scenariuszu (0 nagłówków `Set-Cookie` z odpowiedzi
`localhost:3100`, `document.cookie` puste). Jedyne zapisy w przeglądarce
przed wyborem to service worker i jego Cache Storage. **[R3]** Cache runtime
SW (`app/sw.ts:30-33`, `ExpirationPlugin`) przy pierwszym użyciu tworzy też
bazę IndexedDB `serwist-expiration` z metadanymi wygasania — w teście
nieobserwowane (wszystkie pliki były w precache). `<klucz>` to
syntetyczny klucz projektu PostHog.

### 3.2. Żądania do domen zewnętrznych i proxy dostawców, strona × scenariusz

Legenda: **G** — `GET fonts.googleapis.com/css2` (arkusz Material Symbols,
przerwany); **G✗** — przeglądarka zgłosiła to samo żądanie, ale padło
`net::ERR_FAILED`, zanim doszło do sieci (CSP w service workerze, sekcja 3.7);
**T** — `GET challenges.cloudflare.com/turnstile/v0/api.js` (przerwany);
**S** — `POST /monitoring` (tunel Sentry); **P** — `POST /ingest/e/`
(PostHog). „—” = strona nieodwiedzana w tym scenariuszu.

| Strona | `a` brak wyboru (pierwsza wizyta) | `a2`/`b` brak wyboru w sesji / po odmowie (kolejne strony) | `c` po akceptacji | `d1`/`d2` po wycofaniu |
|---|---|---|---|---|
| `/` | G, S | G, S (pierwsza strona kontekstu) | G, S; **P** po kliknięciu „Akceptuję” | G✗, S |
| `/pricing` | G, S | G✗, S | G✗, S, P | G✗, S |
| `/legal/polityka-prywatnosci` | G, S | G✗, S | G✗, S, P | G✗, S |
| `/legal/rodo` | G, S | G✗, S | G✗, S, P | G✗, S |
| `/login` | G, **T**, S | G✗, T, S | G✗, T, S, P | — |
| `/register` | G, S (formularz niewyrenderowany — sekcja 7) | G✗, S | G✗, S, P | — |
| `/forgot-password` | G, **T**, S | G✗, T, S | G✗, T, S, P | — |
| `/kontakt` | G, S | G✗, S | G✗, S, P | — |
| `/blog/ksef-2-co-warto-wiedziec` | G, S | G✗, S | G✗, S, P | — |
| `/pomoc/czym-jest-ksef` | G, S | G✗, S | G✗, S, P | — |
| `/blog/nie-istnieje-audyt-13` (404) | G, S | G✗, S | G✗, S, P | — |

Żadna strona nie odwołała się do Stripe, `*.posthog.com` ani `*.sentry.io`
bezpośrednio z przeglądarki, do `fonts.gstatic.com` (plik fontu — nie
pojawił się, bo arkusz CSS był przerwany), ani do Supabase (brak sesji).
`<link rel="preconnect">` do hostów Google (`app/layout.tsx:114-119`) nie
wygenerował połączeń widocznych w sinkhole.

### 3.3. Sentry w przeglądarce — co wysyła (typy elementów koperty)

| Scenariusz | `session` | `transaction` | `span` | `event` (błąd) | `client_report` |
|---|---|---|---|---|---|
| `a` brak wyboru | 33 | 2 | — | — | — |
| `a2` brak wyboru + syntetyczny błąd JS | 37 | — | — | 1 | 1 |
| `b` odmowa + syntetyczny błąd JS | 40 | 1 | 1 | 1 | 1 |
| `b2` zamknięcie „X” | 6 | 1 | 1 | — | — |
| `c` akceptacja | 33 | 1 | — | — | — |
| `d` wycofanie (d0–d2) | 59 | 4 | — | — | 2 |

Pola (tylko nazwy, wartości niezapisywane): `session` — `sid`, `init`,
`started`, `status`, `errors`, `timestamp`, `attrs{environment, release,
user_agent}` (bez `did` i bez `ip_address`); `event` — m.in. `exception`,
`breadcrumbs`, `request`, `contexts`; nagłówek koperty — `dsn`, `sdk`,
`sent_at`, `trace`. Wniosek: **sesja Sentry jest wysyłana przy każdym
wczytaniu strony, w każdym stanie zgody**; błędy i próbkowane transakcje
też. Sentry nie zapisało niczego w magazynach przeglądarki.

### 3.4. PostHog po akceptacji

| Element | Obserwacja |
|---|---|
| Zdarzenia | tylko `$pageview` (11 w `c`, 12 w `d0`) i `$pageleave` (wysyłane `sendBeacon` — typ `ping`); brak `$autocapture`, `$snapshot`, `$exception`, `$web_vitals` |
| Inne żądania SDK | brak `/ingest/flags`/`/decide`, brak `/ingest/static/*` i `/ingest/array/*` (brak doładowania skryptów) |
| Adresy stron w zdarzeniach | zredagowane: `/`, `/pricing`, `/login`, `/register`, `/forgot-password`, `/legal/[redacted]`, `/blog/[redacted]`, `/[redacted]` (np. `/kontakt`, `/pomoc/…`) |
| Pola zdarzeń | `$browser`, `$browser_version`, `$os`, `$device_type`, `$screen_*`, `$viewport_*`, `$lib*`, `$session_id`, `$window_id`, `$device_id`, `$pageview_id`, `$prev_pageview_*`, `$is_identified`, `$process_person_profile`, `$current_url`, `$pathname`, `distinct_id`; brak `$referrer`, `$ip`, parametrów kampanii |
| Identyfikator między stronami | `distinct_id` **inny po każdym pełnym przeładowaniu** (10/10 `$pageview` w `c` — „inny niż w poprzednim zdarzeniu”); `$pageleave` ma ten sam identyfikator co `$pageview` tej samej strony |
| Ciasteczka / IndexedDB | brak; jedyny zapis to `__ph_opt_in_out_<klucz>=1` w localStorage |

### 3.5. Wycofanie zgody

| Krok | Wynik |
|---|---|
| d0: szukanie kontrolki na 11 stronach (linki i przyciski z tekstem o cookies, zgodzie, prywatności, preferencjach) | **brak kontrolki**; jedyne trafienia to link „Polityka prywatności” → `/legal/polityka-prywatnosci` (10 stron; strona 404 nie ma nawet tego linku); polityka nie ma przycisku zmiany decyzji |
| d1: wywołanie dokładnie tego, co robi `setAnalyticsConsent(false)` | localStorage: `denied` i `__ph_opt_in_out_<klucz>=0`; ostatnie żądanie `/ingest` 0,26 s po wejściu na `/` (przed wycofaniem), **po wycofaniu — zero** (zmiana historii i 4 kolejne strony); banner nie wraca |
| d2: wyczyszczenie localStorage (odpowiednik „wyczyść dane witryny” — w realnej przeglądarce usunąłby też SW i Cache Storage, tu nie) | banner wraca, „Tylko niezbędne” → `denied`, brak `/ingest` |

### 3.6. Strona serwera (blokada egress i sinkhole)

| Rejestr | Wynik (przebieg końcowy) |
|---|---|
| Procesy z blokadą | 3 procesy Node (pnpm i procesy `next`) — wpis `guard_loaded` w każdym |
| Połączenia przerwane przez blokadę | `o0.ingest.de.sentry.io` × 22, `eu.i.posthog.com` × 7 — każde poprzedzone żądaniem przychodzącym `POST /monitoring` lub `POST /ingest/e/`; stos: `next/dist/compiled/httpxy` (rewrite Next.js) |
| Skąd żądania do proxy | 14 × `POST /monitoring` w scenariuszach `a`–`e2`: wysyłki `keepalive` przy przechodzeniu między stronami (`sec-fetch-mode: cors`), których `context.route` nie zdążył obsłużyć — serwer próbował je przekazać do Sentry; 8 × `/monitoring` i 7 × `/ingest/e/` w kroku `e3` (celowo przepuszczone) |
| Sinkhole serwera (biblioteki respektujące proxy) | `CONNECT o0.ingest.de.sentry.io:443` × 1732 w ok. 7 min — serwerowy SDK Sentry (`sentry.server.config.ts:4-12`, aktywny przy `SENTRY_DSN`), niezależnie od decyzji w przeglądarce; treści nie analizowano |
| Inne cele | brak (żadnych prób do PostHog z serwera poza rewrite, Stripe, Resend, Google, Cloudflare); połączenia do syntetycznego Supabase na pętli zwrotnej nie są rejestrowane |

### 3.7. Diagnostyka `e2` i `e3`

| Test | Wynik |
|---|---|
| `e2`: `fetch()` w service workerze do `fonts.googleapis.com` i `challenges.cloudflare.com` | `fonts.googleapis.com` → zdarzenie `securitypolicyviolation` z dyrektywą **`connect-src`**; `challenges.cloudflare.com` → bez naruszenia CSP (żądanie przerwał dopiero test). Nagłówek `/sw.js`: `connect-src 'self' https://challenges.cloudflare.com http://127.0.0.1:54321 ws://127.0.0.1:54321` (adres Supabase syntetyczny) |
| `e3`: syntetyczne ciasteczko `audyt13_syntetyczne` (`path=/`, `SameSite=Lax`, jak ciasteczko sesji Supabase) + akceptacja; `/ingest` i `/monitoring` przepuszczone do lokalnego serwera | **wszystkie** 8 żądań `/monitoring` i 7 `/ingest/e/` z tego kroku przyszły z nagłówkiem `cookie` zawierającym `audyt13_syntetyczne` (tryby `cors` i `no-cors`/`sendBeacon`); pozostałe nagłówki: `user-agent`, `accept-language`, `sec-ch-ua*`, `origin`, `referer` (tylko `/monitoring`), `content-type`; `x-forwarded-for` lokalnie brak (brak odwrotnego proxy). Serwer po każdym takim żądaniu próbował połączyć się z dostawcą (zablokowane) |

### 3.8. Ruch przeglądarki niezwiązany z aplikacją

Krok `k` (`about:blank`) wygenerował `CONNECT` do `accounts.google.com`,
`android.clients.google.com` i `www.google.com` — to usługi Chromium.
`content-autofill.googleapis.com` pojawiał się tylko przy stronach
z formularzami/polami — to usługa autouzupełniania Chromium (w repo brak
odwołań: `grep content-autofill` = 0). Żadnego z tych hostów nie
przypisujemy aplikacji. Wszystkie trafiły do lokalnego sinkhole (403).

## 4. Technologie i klasyfikacja

Klasyfikacja jest **propozycją** do końcowego review prawnego. Podstawa:
art. 399 ust. 1–3 PKE (ZR-11) i art. 5 ust. 3 dyrektywy 2002/58/WE (ZR-02)
— zgoda na przechowywanie informacji lub dostęp do nich w urządzeniu
końcowym, z wyjątkiem przypadków niezbędnych do transmisji lub do
świadczenia usługi żądanej przez użytkownika (P, [NZ]); zakres „dostępu”
wg EROD 2/2023 (ZR-34) i wyjątki wg WP29 04/2012 (ZR-53) — O, [NZ].
Przesłanie danych do dostawcy (IP, UA, adres strony) ocenia się
dodatkowo według RODO (art. 6, rozdz. V) niezależnie od tego, czy coś
zapisano w urządzeniu.

[NZ] = niezweryfikowane online 2026-10-10 (egress zablokowany) — treść wg
wiedzy modelu, do potwierdzenia w końcowym review.

| Technologia | Kto ustawia | Cel (z kodu) | Czas życia | Proponowana klasyfikacja i uzasadnienie | Przed zgodą | Po odmowie | Po akceptacji | Po wycofaniu |
|---|---|---|---|---|---|---|---|---|
| `ff_analytics_consent` (localStorage) | aplikacja, `lib/analytics/consent.ts:2,27-37` | zapamiętanie decyzji o analityce | bez wygaśnięcia, do wyczyszczenia danych | **ściśle niezbędne** — zapis wyboru użytkownika dot. zgody (WP29 04/2012, kategoria „user-input/consent” — O, [NZ]) | brak | `denied` | `granted` | `denied` (d1); po d2 — `denied` |
| `__ph_opt_in_out_<klucz projektu>` (localStorage) | `posthog-js` (trwałość opt-in/out SDK; konfiguracja `lib/analytics/init-posthog-browser.ts:30-31`) | stan opt-in SDK | bez wygaśnięcia | **ściśle niezbędne do respektowania wyboru**, ale powstaje dopiero po akceptacji; zostaje po wycofaniu z wartością `0` | brak | brak | `1` | `0` (d1, zostaje); znika przy d2 |
| PostHog — SDK w pamięci + `POST /ingest/e/` → `eu.i.posthog.com` (rewrite `next.config.ts:140-155`) | aplikacja, `lib/analytics/init-posthog-browser.ts:13-61` | analityka produktowa (`$pageview`, `$pageleave`) | `persistence: 'memory'` (`:29`) — do przeładowania strony | **wymaga zgody** (analityka nie jest niezbędna do usługi) — tak jest zaimplementowane | brak żądań | brak żądań | `$pageview`/`$pageleave`, ścieżki zredagowane | brak żądań od chwili wycofania |
| Sentry w przeglądarce — `POST /monitoring` → `o0.ingest.de.sentry.io` (`tunnelRoute`, `next.config.ts:189`) | aplikacja, `instrumentation-client.ts:5-21`, `components/sentry-client-init.tsx:9-13`, opcje `lib/observability/scrub.ts:70-79` | monitorowanie błędów + sesje (release health) + 10% transakcji wydajności | brak zapisu w przeglądarce; sesja SDK w pamięci | **do decyzji**: brak zapisu w urządzeniu (zapis — nie dotyczy); odczyt UA/rozmiaru ekranu przez skrypt może wchodzić w „dostęp” wg EROD 2/2023 (O, [NZ]). Proponuję: błędy — uzasadniony interes (art. 6 ust. 1 lit. f RODO, LIA), **sesje i tracing — za zgodą albo wyłączone** (to pomiar użycia/wydajności, nie bezpieczeństwo) | `session` na każdą stronę, transakcje, błędy | jw. | jw. | jw. |
| Service worker `/sw.js` (zakres `/`) + Cache Storage `serwist-precache-v2-…` (205 publicznych plików `_next/static`) | `@serwist/next` (rejestracja domyślna: `register` = `true`, `node_modules/@serwist/next/dist/chunks/schema-BhRhcBIb.js:8`; `next.config.ts:11-20` nie wyłącza), `app/sw.ts:16-38`, filtr `lib/security/service-worker-cache.ts:5-10` | PWA: precache statyki, push (`app/sw.ts:55+`) | precache do aktualizacji SW; cache runtime 7 dni / 128 wpisów (`app/sw.ts:31-32`, nieobserwowany) | **raczej wymaga zgody albo zawężenia**: zapis w urządzeniu każdemu odwiedzającemu stronę marketingową; offline i push to funkcje panelu, o które gość nie prosił. Brak danych osobowych w cache (tylko `localhost:3100`) — ryzyko niskie. Alternatywa: rejestracja SW dopiero w panelu po zalogowaniu | zapisane | zapisane | zapisane | zostaje |
| Google Fonts — `GET fonts.googleapis.com/css2?family=Material+Symbols+Outlined…` (+ plik z `fonts.gstatic.com`) | aplikacja, `app/layout.tsx:114-125` | ikony Material Symbols (używane w panelu i `/pomoc`) | — (zapis tylko w pamięci podręcznej HTTP przeglądarki) | **niepotrzebne przekazanie IP/UA do Google** (USA); nie jest technologią zapisu aplikacji, ale wymaga podstawy z RODO; najprościej samohostować (pozostałe fonty już są samohostowane przez `next/font`) | pierwsza strona kontekstu | jw. | jw. | jw. (zależnie od SW — RUN-07) |
| Cloudflare Turnstile — `challenges.cloudflare.com/turnstile/v0/api.js` (+ ramka) | aplikacja, `components/auth/turnstile-widget.tsx:28-43` na `/login`, `/forgot-password`, `/register` (`app/(auth)/register/page.tsx:152`) | ochrona formularzy przed botami | nieobserwowane (skrypt przerwany) | **ściśle niezbędne** dla bezpieczeństwa usługi żądanej przez użytkownika (logowanie) — O, [NZ]; przekazanie do Cloudflare — podstawa z RODO i informacja (jest w polityce, sekcja 8) | na stronach auth | jw. | jw. | jw. |
| Ciasteczka sesji Supabase `sb-<pierwszy człon hosta>-auth-token` (+ części `.0`, `.1`) | `@supabase/ssr` 0.10.2 (domyślne opcje `…/@supabase/ssr/dist/main/utils/constants.js:4-11`), nazwa: `@supabase/supabase-js` 2.103.3 `dist/index.cjs:369` | uwierzytelnienie | **400 dni**, `HttpOnly` = nie, `SameSite=Lax`, bez `Secure` w opcjach domyślnych | **ściśle niezbędne** co do sesji; **[R3]** trwałość 400 dni bez wyboru użytkownika — do review (A1 ZGD-11, QA1-07) | nieobserwowane (brak Supabase) | — | — | — |
| `ksef.active_org` | aplikacja, `lib/supabase/active-org.ts:16`, `lib/supabase/middleware.ts:330-338`, `app/actions/organizations.ts:34-43` | wybrana organizacja | 30 dni, `HttpOnly`, `SameSite=Lax`, `Secure` w produkcji | **ściśle niezbędne** (funkcja żądana po zalogowaniu) | nieobserwowane (za logowaniem) | — | — | — |
| `theme` (localStorage) | aplikacja, `lib/theme/theme.ts:3,24,35`, przełącznik `components/dashboard/theme-toggle.tsx:37` (tylko panel, `app/(dashboard)/layout.tsx:102`) | preferencja motywu | bez wygaśnięcia | **niezbędne** (preferencja ustawiona przez użytkownika) | skrypt tylko odczytuje; zapis nieobserwowany | — | — | — |
| `ff.banner.dismissed.*`, `install-prompt-dismissed-at` (localStorage), `ff:ksef-banner-dismissed` (sessionStorage) | aplikacja, `components/dashboard/dismissible-banner.tsx:5,34-63`, `hooks/use-install-prompt.ts:17,37,69`, `app/(dashboard)/_components/ksef-health-banner-client.tsx:31,73` | zapamiętanie zamknięcia komunikatów w panelu | bez wygaśnięcia / sesja karty | **niezbędne** (działanie użytkownika) | nieobserwowane (za logowaniem) | — | — | — |

## 5. Ustalenia RUN-NN

### RUN-01. Strony publiczne nie ustawiają ciasteczek ani identyfikatorów przed wyborem

- **Stan:** potwierdzone (runtime, build lokalny). **Klasa:** P — art. 399 PKE [NZ]; I.
- **Dowód:** 0 nagłówków `Set-Cookie` i puste `context.cookies()` we wszystkich scenariuszach `a`–`d` na 11 stronach (`wynik-test-cookies.json` → `set_cookie: []`, `podsumowanie.*.ciasteczka: []`); localStorage i sessionStorage puste przed wyborem; brak IndexedDB na zbadanych stronach (**[R3]** cache runtime SW może utworzyć bazę `serwist-expiration` — sekcja 3.1, nieobserwowane). Zgodne z kodem: ciasteczka ustawia tylko logowanie (Supabase, `ksef.active_org`).
- **Luka:** brak w zakresie ciasteczek. Zastrzeżenie: bez Supabase middleware (`lib/supabase/middleware.ts`) nie miał czego odświeżać — dla zalogowanego użytkownika obraz będzie inny (sekcja 7).
- **Ryzyko:** niskie.
- **Rekomendacja:** (I) utrzymać jako test regresji (`narzedzia/uruchom-test-runtime.sh`, scenariusz `a`).

### RUN-02. PostHog: przed wyborem i po odmowie zero żądań; po akceptacji wąski zakres

- **Stan:** potwierdzone (runtime). Potwierdza pierwszy i ostatni wiersz ZGD-05 w `A1-…` (dotąd tylko z kodu). **Klasa:** P — art. 399 PKE, art. 7 RODO [NZ]; I.
- **Dowód:** sekcje 3.2 i 3.4; kod `lib/analytics/init-posthog-browser.ts:13-24` (bez zgody brak `init`), `:29` (`persistence: 'memory'`), `:36-52` (bez autocapture, nagrań, flag, doładowań i referrera; **[R3]** opcja `ip: false` w `:52` nie działa w SDK 1.374.3 — `@posthog/types/dist/posthog-config.d.ts:1490-1494`), redakcja ścieżek `lib/analytics/privacy.ts:18-24,110`. `distinct_id` zmienia się przy każdym pełnym przeładowaniu.
- **Luka:** w samym działaniu nie stwierdzono. Uwaga: identyfikacja zalogowanego konta (`components/analytics/analytics-identify.tsx`) — nieobserwowana (za logowaniem).
- **Ryzyko:** niskie.
- **Rekomendacja:** (I) test e2e „brak wyboru/odmowa → zero `/ingest`; akceptacja → tylko `$pageview`/`$pageleave` ze zredagowaną ścieżką”.

### RUN-03. Brak w interfejsie sposobu wycofania lub zmiany decyzji

- **Stan:** brak (potwierdzone runtime). Potwierdza ZGD-05 „Wycofanie niemożliwe z interfejsu” w `A1-…`. **Klasa:** P — art. 7 ust. 3 RODO, art. 399–400 PKE [NZ]; O — EROD 05/2020 (ZR-31), Cookie Banner Taskforce (ZR-40) [NZ].
- **Dowód:** d0 — na 11 stronach brak kontrolki (sekcja 3.5); `setAnalyticsConsent` wywołuje tylko banner (`components/analytics/consent-banner.tsx:36,40`), a banner jest widoczny tylko przy stanie `unset` (`:28-33`). Mechanizm działa, gdy się go wywoła: d1 — po programowym wycofaniu zero żądań `/ingest`, flaga SDK `0` (`init-posthog-browser.ts:14-19`). Jedyna droga użytkownika: wyczyszczenie danych witryny (d2).
- **Luka:** wycofanie nie jest tak łatwe jak udzielenie zgody (jeden klik w bannerze vs. czyszczenie danych przeglądarki); strona 404 nie ma nawet linku do polityki.
- **Ryzyko:** średnie — wprost wymaganie art. 7 ust. 3 RODO [NZ]; kontrolka jest prosta, bo logika już istnieje.
- **Rekomendacja:** (I) link „Ustawienia prywatności” w stopce wszystkich układów (marketing, auth, panel, 404) otwierający ten sam wybór; przy wycofaniu dodatkowo `posthog.reset()` (zob. ZGD-05); test: zgoda → wycofanie przez kontrolkę → zero `/ingest` (ta sama uprząż, krok d1 zastąpiony kliknięciem).

### RUN-04. Sentry w przeglądarce wysyła sesje, transakcje i błędy niezależnie od decyzji

- **Stan:** potwierdzone (runtime). Rozszerza ZGD-10 w `A1-…` o typy danych. **Klasa:** P — art. 6 ust. 1 lit. f, art. 13 RODO; art. 399 PKE w zakresie „dostępu” [NZ]; O — EROD 2/2023 (ZR-34) [NZ]; I.
- **Dowód:** sekcja 3.3 — `session` przy każdym wczytaniu strony we wszystkich scenariuszach (także po odmowie i wycofaniu), próbkowane `transaction`/`span`, `event` przy błędzie; kod `instrumentation-client.ts:5-21` (`tracesSampleRate: 0.1`, brak bramki zgody), domyślne integracje SDK (opcje `lib/observability/scrub.ts:70-79` nie wyłączają sesji). Serwerowy SDK też wysyła (sekcja 3.6). Banner mówi tylko o PostHog (`consent-banner.tsx:47-57`); polityka wymienia Sentry jako „error tracking” (`app/(marketing)/legal/polityka-prywatnosci/page.tsx:118`), bez sesji i pomiaru wydajności.
- **Luka:** brak udokumentowanej podstawy i klasyfikacji dla sesji i tracingu po stronie przeglądarki; brak informacji o nich.
- **Ryzyko:** średnie — sesje i tracing to pomiar użycia, nie zabezpieczenie usługi; samo raportowanie błędów jest łatwiejsze do obrony.
- **Rekomendacja:** (I) w przeglądarce wyłączyć śledzenie sesji i `tracesSampleRate` przed zgodą (albo całkowicie), błędy zostawić z LIA i opisem w polityce; decyzja — review prawne (sekcja 8).

### RUN-05. Google Fonts (Material Symbols) przed jakimkolwiek wyborem

- **Stan:** potwierdzone (runtime). Potwierdza ZGD-10 w `A1-…`. **Klasa:** P — art. 6 i rozdz. V RODO (przekazanie IP do USA), art. 13 RODO [NZ]; O — LG München I, 20.01.2022, 3 O 17493/20 (sąd niemiecki, znaczenie pomocnicze) [NZ]; I.
- **Dowód:** `GET fonts.googleapis.com/css2` na pierwszej stronie każdego kontekstu, na wszystkich 11 stronach (sekcja 3.2, `a`); źródło `app/layout.tsx:114-125` (główny układ, każda strona); CSP dopuszcza Google (`lib/security/csp.ts:30,32`). Polityka prywatności nie wymienia Google Fonts (`grep -i google` w `polityka-prywatnosci/page.tsx` — tylko Google Authenticator, `:126`).
- **Luka:** IP i UA każdego odwiedzającego trafiają do Google bez potrzeby i bez informacji.
- **Ryzyko:** średnie.
- **Rekomendacja:** (I) samohostować Material Symbols (np. plik w `public/` albo pakiet npm), usunąć `preconnect`/`<link>` i hosty Google z CSP; test: scenariusz `a` bez żądań do `fonts.googleapis.com`.

### RUN-06. Service worker i Cache Storage zapisywane każdemu odwiedzającemu

- **Stan:** potwierdzone (runtime). Potwierdza ZGD-10 w `A1-…`. **Klasa:** P — art. 399 PKE [NZ]; O — EROD 2/2023, WP29 04/2012 [NZ]; I.
- **Dowód:** rejestracja `/sw.js` (zakres `/`) i `serwist-precache-v2-…` z 205 plikami statycznymi na pierwszej stronie, przed wyborem, we wszystkich scenariuszach (sekcja 3.1); kod `next.config.ts:11-20`, `app/sw.ts:16-38`, domyślne `register: true` w `@serwist/next`.
- **Luka:** zapis w urządzeniu bez zgody, bez informacji w polityce; uzasadnienie „ściśle niezbędne” słabe dla stron marketingowych.
- **Ryzyko:** niskie — w cache wyłącznie publiczne pliki aplikacji (filtr `lib/security/service-worker-cache.ts:5-10`), brak danych osobowych.
- **Rekomendacja:** (I) `register: false` i rejestracja SW w panelu po zalogowaniu (tam push/PWA jest funkcją żądaną) albo po akcji „Zainstaluj aplikację”; dopisać SW i Cache Storage do polityki.

### RUN-07. CSP w service workerze blokuje arkusz Material Symbols

- **Stan:** potwierdzone (runtime, diagnostyka `e2`). Nowe — nieopisane w `A1-…`. **Klasa:** I.
- **Dowód:** po aktywacji SW żądanie `fonts.googleapis.com/css2` kończy się `net::ERR_FAILED` bez wyjścia do sieci (G✗ w sekcji 3.2); w SW `fetch()` do tego hosta wywołuje naruszenie `connect-src` (sekcja 3.7). Przyczyna: SW przechwytuje wszystkie żądania (`app/sw.ts:36`, `NetworkOnly`), a `fetch()` w SW podlega CSP z nagłówka `/sw.js` (nagłówki dla `/:path*`, `next.config.ts:117`), gdzie `connect-src` nie zawiera `fonts.googleapis.com` (`lib/security/csp.ts:8,33`).
- **Luka:** ikony Material Symbols nie ładują się od drugiej strony wizyty (defekt funkcjonalny); skutek uboczny dla prywatności: do Google trafia tylko pierwsze wczytanie w przeglądarce bez aktywnego SW.
- **Ryzyko:** niskie dla prywatności, funkcjonalnie zauważalne (panel używa Material Symbols).
- **Rekomendacja:** (I) rozwiązać razem z RUN-05 (samohostowanie). **Nie** dopisywać `fonts.googleapis.com` do `connect-src` — przywróciłoby przekazanie do Google przy każdej stronie.

### RUN-08. Proxy `/ingest` i `/monitoring` przekazują dostawcom nagłówki przeglądarki, w tym ciasteczka

- **Stan:** częściowe — wejście potwierdzone w runtime, przekazanie dalej potwierdzone w kodzie, nieobserwowane na łączu (blokada). Nowe — nieopisane w `A1-…`. **Klasa:** P — art. 5 ust. 1 lit. c i f, art. 28, art. 32 RODO [NZ]; S — CC6 (ochrona poświadczeń) [NZ]; I.
- **Opis (jedno zdanie, repo publiczne):** rewrite `/ingest/*` (`next.config.ts:140-155`) i tunel Sentry `/monitoring` (`next.config.ts:189`) przekazują do PostHog i Sentry wszystkie nagłówki żądania przeglądarki, w tym `Cookie` z ciasteczkami sesji pierwszej strony.
- **Dowód:** **[R3]** (skrócone do odwołań dowodowych) krok `e3` — wszystkie 8 żądań `/monitoring` i 7 `/ingest/e/` niosły syntetyczne ciasteczko pierwszej strony, a serwer po każdym próbował połączyć się z dostawcą (zablokowane) — sekcje 3.6–3.7, `wynik-test-cookies.json` → `serwer_wg_kroku["e3-ciasteczka-do-proxy-dostawcow"]`. Kod: Next.js 16.3.8 `next/dist/server/lib/router-utils/proxy-request.js:29-41`, `next/dist/compiled/httpxy/index.js` (`setupOutgoing`); `@sentry/nextjs` 10.53.1 `build/cjs/config/withSentryConfig/tunnel.js:49-100` (tunel jako rewrite — dowód uzupełniający R3); ścieżki publiczne w `lib/supabase/middleware.ts:57,78`.
- **Luka:** dla zalogowanego użytkownika ciasteczka pierwszej strony, w tym sesji, mogą trafiać do dwóch dostawców przy każdym żądaniu telemetrii (Sentry — zawsze, PostHog — po zgodzie). Jeśli odwrotne proxy produkcji dopisuje `X-Forwarded-For`, dostawca dostaje też IP klienta — niezweryfikowane; **[R3]** opcja `ip: false` w SDK nie działa (`posthog-config.d.ts:1490-1494`), decyduje ustawienie projektu „Discard client IP data”. **[R3]** To ustalenie o przekazaniu danych procesorowi (prywatność), nie podatność wykorzystywalna z zewnątrz; zgodnie z zasadą repo publicznego opis ograniczono do odwołań dowodowych.
- **Ryzyko:** wysokie — poświadczenia sesji poza systemem, bez potrzeby i bez umowy, która by to obejmowała; nie zależy od zgody (Sentry).
- **Rekomendacja:** (I) zastąpić rewrites dwiema trasami (`app/ingest/[...path]/route.ts`, `app/monitoring/route.ts` albo filtr w `proxy.ts`), które przekazują tylko treść i `content-type` (+ dla Sentry walidacja DSN z koperty), bez `cookie`, `authorization` i `x-forwarded-*`; test regresji: uprząż `e3` musi pokazać brak nagłówka `cookie` w żądaniu do dostawcy (sprawdzone na lokalnym odbiorniku zamiast dostawcy). Po wdrożeniu: zapytać dostawców o logi nagłówków (sekcja 8).

### RUN-09. Turnstile ładowany na stronach logowania niezależnie od decyzji

- **Stan:** potwierdzone dla `/login` i `/forgot-password`; `/register` — niezweryfikowane (formularz niewyrenderowany bez Supabase). **Klasa:** P — art. 6 ust. 1 lit. f RODO; art. 399 PKE (wyjątek niezbędności) [NZ]; O — WP29 04/2012 [NZ].
- **Dowód:** `T` w sekcji 3.2 we wszystkich stanach zgody; kod `components/auth/turnstile-widget.tsx:20-43`; dla `/register` `isSignupClosed()` przy braku bazy zwraca `true` (`lib/feature-flags/signups.ts:24-30`, `app/(auth)/register/page.tsx:51-57`), więc widżet (`:152`) się nie renderuje. Polityka opisuje Turnstile (`polityka-prywatnosci/page.tsx:153-160`).
- **Luka:** zawartości ramki Cloudflare (ewentualne ciasteczka w domenie Cloudflare) nie dało się zbadać — skrypt przerwany.
- **Ryzyko:** niskie.
- **Rekomendacja:** (I) klasyfikować jako ściśle niezbędne (bezpieczeństwo logowania) z opisem w tabeli technologii polityki; ewentualnie ładować skrypt dopiero przy interakcji z formularzem.

### RUN-10. Co zostaje w przeglądarce po akceptacji i po wycofaniu

- **Stan:** potwierdzone (runtime). Potwierdza „Brak dowodu i wersji” z ZGD-05. **Klasa:** P — art. 7 ust. 1 RODO (wykazanie zgody) [NZ]; I.
- **Dowód:** sekcja 3.1: po akceptacji `granted` + `__ph_opt_in_out_<klucz>=1`; po wycofaniu `denied` + flaga `0` (zostaje); żadnej daty ani wersji treści (`lib/analytics/consent.ts:27-37`). SW i Cache Storage zostają w każdym stanie.
- **Luka:** decyzja bez wersji i daty — nie da się wykazać, na jaką treść bannera wyrażono zgodę, ani ponowić pytania po zmianie treści.
- **Ryzyko:** niskie.
- **Rekomendacja:** (I) zapis `{decyzja, wersja, data}`; przy zmianie wersji banner wraca.

### RUN-11. Polityka i strona „RODO” rozmijają się z obserwacją

- **Stan:** potwierdzone (runtime + kod). Uzupełnia ZGD-11 i ZGD-12 w `A1-…`. **Klasa:** P — art. 12–13 RODO, art. 399 ust. 2 PKE (informacja) [NZ].
- **Dowód (deklaracja → obserwacja):** „Cookies (sesja, preferencje)” zbierane automatycznie (`polityka-prywatnosci/page.tsx:44-50`) → na stronach publicznych 0 ciasteczek; „preferencje motywu” jako cookies, „Cookies preferencji: 1 rok” (`:226-246`) → motyw w localStorage `theme` bez wygaśnięcia, ciasteczka preferencji nie znaleziono w kodzie; „Cookies sesji: do końca sesji” (`:231`) → domyślnie 400 dni (sekcja 4, ZGD-11); „Brak cookies analitycznych” (`app/(marketing)/legal/rodo/page.tsx:47`) → formalnie prawda (PostHog w pamięci), ale analityka działa po zgodzie, a sesje Sentry bez zgody. Brak w polityce: Google Fonts, service worker i Cache Storage, klucze localStorage, sesje i tracing Sentry w przeglądarce.
- **Luka:** informacja niepełna i miejscami nieprawdziwa.
- **Ryzyko:** średnie.
- **Rekomendacja:** (I) tabela technologii w polityce budowana z sekcji 4 tego raportu (po decyzjach z RUN-04–RUN-06), z datą weryfikacji; test regresji tej uprzęży jako źródło prawdy przy zmianie zależności.

## 6. Jak powtórzyć test

```bash
cd /ścieżka/do/ksef-saas            # klon na wersji 3e5e00d (lub nowszej)
pnpm install --frozen-lockfile      # jeśli brak node_modules
# 1. build produkcyjny ze zmiennymi syntetycznymi (bez .env.local)
env $(grep -v '^#' docs/audyt/13-prywatnosc-i-zgodnosc/narzedzia/zmienne-syntetyczne.env | xargs) pnpm build
# 2. serwer z blokadą egress + sinkhole + test Playwright + sprzątanie
bash docs/audyt/13-prywatnosc-i-zgodnosc/narzedzia/uruchom-test-runtime.sh
```

- Wynik: `narzedzia/wynik-test-cookies.json` (nadpisywany). Rejestry
  pomocnicze (JSONL blokady i sinkhole, logi serwera) — w katalogu z
  `AUDYT_WORKDIR` (domyślnie `mktemp -d`); nie trafiają do repo.
- Zmienne opcjonalne: `CHROMIUM_PATH` (gdy wersja Playwright nie pasuje do
  zainstalowanej przeglądarki; skrypt sam szuka `/opt/pw-browsers/chromium-*`),
  `WAIT_MS` (domyślnie 5000), `PORT` (3100), `SINK_PORT` (3199).
- Czas: build ok. 3 min (4 vCPU), test ok. 7 min.
- Skrypt startowy zatrzymuje serwer i sinkhole (grupa procesów + zapasowo
  proces o tytule `next-server (v…`). Sprawdzenie po teście:
  `curl -s --noproxy '*' http://localhost:3100/robots.txt` → brak połączenia.
- Przy zmianie wersji Next.js sprawdzić, czy blokada nadal łapie połączenia
  (sekcja 2, test kontrolny) — rejestr musi pokazać `guard_loaded` w 3 procesach.

## 7. Niewiadome i ograniczenia

| Ograniczenie | Skutek dla wniosków |
|---|---|
| Brak Supabase (adres syntetyczny na pętli zwrotnej) | Nie zbadano stron za logowaniem, ciasteczek sesji, `ksef.active_org`, identyfikacji w PostHog (`analytics-identify`), push, PWA w panelu; `/register` pokazał komunikat o zamkniętej rejestracji (fail-closed flagi), więc Turnstile na tej stronie nieobserwowany. Atrybuty ciasteczek sesji podane z kodu bibliotek (sekcja 4). Nie zakładano kont w żadnej usłudze. |
| Build lokalny ≠ produkcja | Inne zmienne (`NEXT_PUBLIC_*` wkompilowane w bundle), brak odwrotnego proxy (Traefik/Coolify — dopisywanie `X-Forwarded-For` niezweryfikowane), brak HTTPS (`Secure`, HSTS, `upgrade-insecure-requests` bez znaczenia lokalnie). Wynik opisuje kod `3e5e00d`, nie stan wdrożenia. |
| Konfiguracja produkcyjna PostHog i Sentry nieznana | Nie wiadomo, czy produkcja ma ustawiony `NEXT_PUBLIC_POSTHOG_KEY` (bez niego banner się nie pokazuje — `components/analytics/analytics-provider.tsx:18-20`), jaki jest DSN, region i retencja. PR #225 (niescalony) deklaruje intake EU obu usług — pomiar operatora 4.10, niezweryfikowane w tej sesji. Ustawienia projektu PostHog (nagrania/heatmapy włączone po stronie projektu wg PR #225) nie mają wpływu na zaobserwowany ruch, bo SDK ich nie pobiera (`advanced_disable_flags`). |
| Sieć zewnętrzna celowo przerwana | Nie widać, co dostawcy odpowiadają ani co zapisują (np. ciasteczka w ramce Turnstile, plik fontu z `fonts.gstatic.com`, zachowanie SDK po odpowiedzi 200 od prawdziwego PostHog). Żądania do `/ingest` i `/monitoring` dostawały w przeglądarce syntetyczne 200 (poza `e3`). |
| Wysyłki przy opuszczaniu strony | Część żądań `keepalive` omija `context.route`; rejestr serwera je łapie (sekcja 3.6), ale przypisanie do kroku jest przybliżone (po znaczniku czasu). |
| Jedna przeglądarka | Chromium 141 w trybie headless z emulacją zwykłego UA; Firefox/Safari (inne zasady cache, SW i ciasteczek) nie były testowane. |
| Przepisy | Klasyfikacja w sekcji 4 i klasy P/O oparte na wiedzy modelu — [NZ]. |
| **[R3]** Budowanie bez blokady egress | `pnpm build` działał przez proxy środowiska; wtyczka Sentry domyślnie próbuje wysłać telemetrię użycia (metadane budowania, bez danych osobowych — sekcja 1). Czy próba wyszła z maszyny, zależało od polityki egress (domeny Sentry blokowane) — nie weryfikowano. Nie dotyczy ruchu przeglądarki ani serwera w czasie testu. |

## 8. Pytania do końcowego review prawnego

1. Czy sesje (release health) i 10% transakcji Sentry w przeglądarce można
   oprzeć na uzasadnionym interesie bez zgody, czy należy je objąć zgodą
   analityczną albo wyłączyć (RUN-04)? Czy odczyt UA i parametrów ekranu przez
   SDK to „dostęp do informacji w urządzeniu” w rozumieniu art. 399 PKE
   (EROD 2/2023)?
2. Czy rejestracja service workera z precache statyki dla każdego gościa
   strony marketingowej mieści się w wyjątku niezbędności (RUN-06)?
3. Czy dynamiczne ładowanie fontów z Google wymaga zgody, czy wystarczy
   samohostowanie jako środek techniczny (RUN-05) — rekomendacja techniczna
   nie zależy od odpowiedzi, ale ocena stanu historycznego tak.
4. Czy przekazywanie ciasteczek sesji do PostHog i Sentry przez proxy
   pierwszej strony (RUN-08) jest naruszeniem ochrony danych wymagającym
   oceny z art. 33 RODO, jeśli potwierdzi się na produkcji? Jakie pytania
   zadać dostawcom (logowanie nagłówków żądań przyjmowanych, retencja logów)?
5. Czy Turnstile można zakwalifikować jako ściśle niezbędny (RUN-09) i czy
   obecny opis w polityce (sekcja 8 polityki, „USA, SCC”) jest wystarczający?
6. Jaki minimalny zakres „dowodu zgody” (wersja, data, zapis po stronie
   serwera) jest wymagany dla analityki opartej na zgodzie (RUN-10)?

## 9. Co sprawdziłem / czego nie mogłem sprawdzić

**Sprawdziłem:**

- Przeczytałem w całości zastane narzędzia (`blokada-egress-serwera.cjs`,
  `sinkhole-proxy.mjs`, `test-cookies-i-sieci.mjs`) i szkic raportu;
  poprawiłem je (sekcja 2), dopisałem skrypt startowy i plik zmiennych.
- Sprawdziłem blokadę egress osobnym testem (5 ścieżek połączeń, z proxy
  ze zmiennych i bez) — wszystkie zatrzymane lokalnie. **[R3]** Blokada
  obejmowała `pnpm start` i przeglądarkę, nie `pnpm build` (sekcja 1, sekcja 7).
- Zbudowałem aplikację od zera w trybie produkcyjnym (11.10.2026, `EXIT=0`)
  i wykonałem trzy przebiegi testu; wyniki spójne. Po każdym przebiegu
  sprawdziłem, że nie zostały procesy serwera ani przeglądarki (po pierwszym
  przebiegu został `next-server` — zatrzymany ręcznie, skrypt poprawiony).
- Zweryfikowałem w kodzie każdą tezę z tabel (ścieżki:linie w sekcjach 4–5),
  w tym kod bibliotek: `@supabase/ssr` 0.10.2, `@supabase/supabase-js`
  2.103.3, `@serwist/next` 9.5.11, Next.js 16.3.8 (`proxy-request.js`,
  `httpxy`).
- Sprawdziłem, że wynik JSON nie zawiera wartości ciasteczek, tokenów ani
  adresów IP poza syntetycznym `127.0.0.1` (grep po wzorcach IP, `eyJ`,
  `Bearer`, kluczy; jedyne wartości to znaczniki zgody `granted`/`denied`/`0`/`1`).
- Kod aplikacji w chwili testu = `3e5e00d` (`meta.kod_aplikacji_jak_3e5e00d: true`;
  gałąź robocza w trakcie sesji przesunęła się o commity koordynatora
  z plikami audytu).

**Nie mogłem sprawdzić:**

- stron i ciasteczek za logowaniem, identyfikacji PostHog, push i PWA
  w panelu (brak Supabase; nie tworzyłem kont w żadnej zdalnej usłudze);
- `/register` z otwartą rejestracją (Turnstile tam tylko z kodu);
- zachowania produkcji: zmiennych, odwrotnego proxy (`X-Forwarded-For`),
  HTTPS, faktycznego klucza PostHog i DSN Sentry;
- tego, co dostawcy (Google, Cloudflare, PostHog, Sentry) robią z żądaniem
  i czy zapisują ciasteczka po swojej stronie — ruch celowo przerwany;
- treści przepisów i wytycznych w źródłach pierwotnych (egress zablokowany,
  WebSearch odrzucony przez właściciela) — oznaczenia [NZ];
- przeglądarek innych niż Chromium;
- **[R3]** wyniku próby telemetrii wtyczki Sentry w czasie budowania (sekcja 1).

**Niezależna recenzja:** **[R3]** plik przeszedł recenzję R3 (werdykt:
zatwierdzony z uwagami; recenzent powtórzył skrót testu dla `/` i `/login`
z tym samym wynikiem — `R3.md` § 5). Uwagi naniesiono 13.10.2026 — sekcja
„Historia recenzji”.

**Redakcja poprawek R3 (13.10.2026) — co sprawdzono przed naniesieniem:**
`@posthog/types` 1.374.3 `posthog-config.d.ts:1490-1494` (opcja `ip` bez
działania); `@sentry/bundler-plugin-core` 5.3.0 `dist/cjs/index.js:5122`
(domyślny `url` = `https://sentry.io`), `:5127` (`telemetry ?? true`),
`:5385-5388` (dla domyślnego `url` telemetria dozwolona); `next.config.ts`
bez opcji `telemetry`; `@sentry/nextjs` 10.53.1 `build/cjs/config/webpack.js:343-385`
(wtyczka tworzona, gdy moduł jest dostępny); `app/sw.ts:30-33`; zbudowany
`public/sw.js` (poza gitem) zawiera `serwist-expiration`; klucz
`serwer_wg_kroku["e3-ciasteczka-do-proxy-dostawcow"]` w wyniku JSON. Testu
redaktor nie powtarzał. R3-U09: z dwóch wariantów wskazanych przez
recenzenta wybrano skrócenie opisu w RUN-08 (bez wyliczania, które
ciasteczka i z jakimi atrybutami trafiają do dostawców) i dopisano zdanie
o charakterze ustalenia; opis metody w sekcji 3.7 (atrybuty syntetycznego
ciasteczka testowego) pozostawiono bez zmian.

## Historia recenzji

| Recenzent | Data | Werdykt | Uwagi | Przyjęte | Odrzucone | Plik recenzji |
|---|---|---|---|---|---|---|
| R3 — niezależny agent-recenzent (grupa: `A1` + `A2` + `A4`) | 10.10.2026 (recenzja wykonana w sesji 13.10.2026) | zatwierdzony z uwagami (22 kontrole punktowe, 21 potwierdzonych; skrót testu powtórzony przez R3 z tym samym wynikiem; narzędzia bez drogi wycieku) | 5 uwag do tego pliku i `narzedzia/` (R3-U01, R3-U09, R3-U10, R3-U21, R3-U22; 1 istotna, 4 drobne) | wszystkie 5 — naniesione przez redaktora poprawek 13.10.2026 po sprawdzeniu w kodzie i `node_modules`; miejsca oznaczone **[R3]**. U09 — wariant „skrócić opis RUN-08”. Narzędzi (`narzedzia/*`) nie zmieniano — uwagi ich nie wymagały | — | `R3.md` (scratchpad sesji; streszczenie w `10-REVIEW.md`) |
