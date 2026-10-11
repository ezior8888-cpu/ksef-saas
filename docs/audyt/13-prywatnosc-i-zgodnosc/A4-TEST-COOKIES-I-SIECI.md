# A4 — Test runtime: cookies, magazyny przeglądarki i żądania sieciowe

| | |
|---|---|
| Autor | agent RUNTIME (audyt 13, etap „Test runtime cookies i sieci”) |
| Data | 10.10.2026 |
| Wersja kodu | `origin/main` @ `3e5e00d` |
| Zakres | publiczne strony aplikacji w przeglądarce: cookies (także HttpOnly z `Set-Cookie`), localStorage, sessionStorage, IndexedDB, Cache Storage, service worker, żądania do domen zewnętrznych; scenariusze: przed wyborem, po odmowie, po akceptacji, po wycofaniu |
| Źródła danych | lokalny build produkcyjny z syntetycznymi zmiennymi, Chromium (Playwright), kod w repo |
| Ograniczenia | brak Supabase (strony za logowaniem niedostępne), build lokalny to nie produkcja, konfiguracja produkcyjna PostHog/Sentry nieznana, ruch zewnętrzny celowo przerwany — szczegóły w sekcji 8 |
| Stan | W TOKU — szkielet, uzupełniany przyrostowo |

## 1. Środowisko i zmienne syntetyczne

| Element | Wartość |
|---|---|
| Kod | `origin/main` @ `3e5e00d`; drzewo robocze bez zmian w kodzie aplikacji (zmienione tylko pliki audytu w `docs/audyt/13-…`) |
| Środowisko | sesja w chmurze (Linux, 4 vCPU, 15 GB RAM), Node v22.22.0, pnpm 10.33.0 |
| Tryb | **produkcyjny**: `pnpm build` (= `next build --webpack`, Next.js 16.3.8) + `pnpm start -p 3100` (`NODE_ENV=production`) |
| Przeglądarka | Chromium z `/opt/pw-browsers/chromium-1194` przez `@playwright/test` 1.60.0 (`executablePath`; `playwright install` nie był uruchamiany), tryb headless, `locale: pl-PL` |
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
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | `1x00000000000000000000AA` | publiczny klucz testowy Cloudflare. Kod **wymaga** Turnstile poza lokalnym dev: bez konfiguracji `verifyTurnstile()` zwraca `not-configured` i blokuje logowanie (`lib/security/turnstile.ts:67-77`, `:101-105`), więc produkcja musi mieć klucz, a widżet renderuje się tylko z kluczem (`components/auth/turnstile-widget.tsx:25-26`) |
| `NEXT_TELEMETRY_DISABLED` | `1` | wyłącza telemetrię Next.js (ruch narzędzia, nie aplikacji) |
| `NO_PROXY`, `no_proxy` | `*` | tylko proces `start`: biblioteki serwera łączą się wprost, więc blokada egress widzi docelowy host zamiast lokalnego proxy |

Budowanie (`pnpm build`) działało bez blokady egress: `next/font/google`
(`app/layout.tsx:2-8`) pobiera fonty w czasie budowania i serwuje je potem
z własnej domeny. To ruch maszyny budującej, nie przeglądarki użytkownika,
i nie zawiera danych osobowych. Wtyczka Sentry nie wysyłała map źródeł
(brak `SENTRY_AUTH_TOKEN`).

## 2. Metoda

**Narzędzia** (w `narzedzia/`, napisane na potrzeby audytu, nie są częścią
aplikacji):

| Plik | Rola |
|---|---|
| `narzedzia/blokada-egress-serwera.cjs` | ładowany do `next start` przez `NODE_OPTIONS=--require`. Każde połączenie TCP serwera poza pętlę zwrotną **oraz** do lokalnego proxy wyjściowego na pętli zwrotnej (porty ze zmiennych `*_PROXY`) jest zapisywane (rodzaj, host, skrócony stos) i przerywane; bezpośrednie zapytania DNS o nazwy zewnętrzne — zapisywane i odrzucane. Sprawdzone przed testem: `fetch`, `https.get`, `dns.lookup`, `dns.promises.lookup` i `fetch` przez proxy ze zmiennych (`NODE_USE_ENV_PROXY=1`) kończą się `EAUDITBLOCKED`/`ENOTFOUND`. |
| `narzedzia/test-cookies-i-sieci.mjs` | skrypt Playwright. `context.route('**/*')`: zasoby `http://localhost:3100` przechodzą; **każde** inne żądanie HTTP(S) jest zapisywane (metoda, host, ścieżka bez query, typ zasobu, scenariusz, krok) i przerywane (`route.abort`). Żądania do proxy pierwszej strony, które serwer przekazałby dostawcy (`/ingest/*` → PostHog, `/monitoring` → Sentry), też są przerywane w przeglądarce; zapisywane są tylko nazwy zdarzeń i nazwy pól ładunku. Chromium dostaje jako proxy lokalny „sinkhole” (zapis hosta, odpowiedź 403) — łapie to, co omija `route` (np. `<link rel="preconnect">`, WebSocket). |
| `narzedzia/wynik-test-cookies.json` | wynik surowy: migawki magazynów, `Set-Cookie`, żądania przerwane, sinkhole, zestawienie blokady serwera |

**Co jest zapisywane, a co nie.** Nazwy i atrybuty cookies (`HttpOnly`,
`Secure`, `SameSite`, `Max-Age`/`Expires`, `Path`, `Domain`) z nagłówków
`Set-Cookie` i z `context.cookies()` — **bez wartości**. Klucze localStorage
i sessionStorage — bez wartości, poza znacznikiem zgody `ff_analytics_consent`
i flagą PostHog `__ph_opt_in_out_*` (wartości techniczne: `granted`/`denied`,
`0`/`1`). Nazwy baz IndexedDB, nazwy i liczba wpisów Cache Storage (z hostami
wpisów), zakres i ścieżka skryptu service workera. Treści ładunków PostHog
i Sentry nie są zapisywane — tylko nazwy zdarzeń, nazwy pól i adresy stron
`localhost`.

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

(w toku)

## 4. Technologie i klasyfikacja

(w toku)

## 5. Ustalenia RUN-NN

(w toku)

## 6. Jak powtórzyć test

(w toku)

## 7. Niewiadome i ograniczenia

(w toku)

## 8. Pytania do końcowego review prawnego

(w toku)

## 9. Co sprawdziłem / czego nie mogłem sprawdzić

(w toku)
