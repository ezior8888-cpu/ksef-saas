# Performance Budget & Load Testing (Faza 34)

Budżet wydajności + instrukcja uruchamiania loadtestów k6 i Lighthouse.

## 1. Budżet wydajności

Progi są źródłem prawdy. Zakodowane w `load-tests/config.js` (`BUDGET`) oraz
`load-tests/lighthouse-budget.json`.

| Metryka | Budżet | Gdzie mierzone |
|---|---|---|
| First Contentful Paint | < 1.0 s | Lighthouse |
| Time to Interactive | < 2.5 s | Lighthouse |
| Largest Contentful Paint | < 2.0 s | Lighthouse |
| Dashboard load | < 1.0 s | Lighthouse / k6 |
| API response p95 | < 500 ms | k6 |
| API response p99 | < 1.5 s | k6 |
| HTTP error rate | < 1% | k6 |
| First Load JS (shared) | < 300 KB gz | `next build` + pomiar |

### Definition of Done Fazy 34

1000 concurrent users symulowane bez degradacji · p95 < 500 ms · pamięć
stabilna · utilization bazy < 70%.

## 2. k6 — instalacja

k6 to osobny binarny tool (nie pakiet npm):

```bash
brew install k6        # macOS
k6 version             # weryfikacja
```

## 3. k6 — zmienne środowiskowe

Nic wrażliwego nie jest w repo — wszystko przez `-e KLUCZ=wartość`:

| Zmienna | Opis | Wymagana |
|---|---|---|
| `BASE_URL` | URL środowiska testowego (deployed test env na Vercel) | tak |
| `PROFILE` | `smoke` / `baseline` / `peak` / `target` / `stress` / `spike` | tak (poza smoke) |
| `LOAD_TEST_EMAIL` | konto testowe | tak |
| `LOAD_TEST_PASSWORD` | hasło konta testowego | tak |
| `TURNSTILE_BYPASS_TOKEN` | bypass Cloudflare Turnstile (patrz niżej) | tak* |
| `INNGEST_EVENT_KEY` | klucz eventów Inngest (stress KSeF) | dla `load:stress:ksef` |
| `TENANT_ID` | UUID tenanta testowego (stress KSeF) | dla `load:stress:ksef` |
| `ACTION_INVOICE_SUBMIT` | ID Server Action wysyłki faktury | opcjonalna |
| `ACTION_BULK_IMPORT` | ID Server Action importu | opcjonalna |

\* Środowisko testowe **musi** akceptować nagłówek `x-turnstile-bypass`
zamiast realnego widgetu Turnstile (Faza 28). Bez tego zautomatyzowany login
bota = 403 i loadtest jest bezwartościowy. Dodaj obsługę tego nagłówka pod
flagą env w handlerze logowania **tylko na test env**.

## 4. k6 — uruchamianie

```bash
# Smoke — sprawdź że harness i środowisko żyją
pnpm load:smoke -- -e BASE_URL=https://test.faktflow.pl

# Pełny miks 4 scenariuszy — profile baseline/peak/target/stress/spike
pnpm load:run -- -e PROFILE=target -e BASE_URL=... \
  -e LOAD_TEST_EMAIL=... -e LOAD_TEST_PASSWORD=... -e TURNSTILE_BYPASS_TOKEN=...

# Pojedynczy scenariusz
pnpm load:dashboard -- -e PROFILE=peak -e BASE_URL=... -e LOAD_TEST_PASSWORD=...
```

Profile: `baseline`=100, `peak`=500, `target`=1000, `stress`=2000 użytkowników,
`spike`=0→1000 w 30 s. Test kończy się exit code ≠ 0, jeśli przekroczono budżet.

### Kolejność biegów (rekomendacja)

1. `smoke` — harness OK?
2. `baseline` (100) — punkt odniesienia.
3. `peak` (500) → `target` (1000) — cel DoD.
4. `stress` (2000) — szukamy punktu załamania.
5. `spike` — reakcja auto-scalingu Vercela.

## 5. Stress-testy izolowane

```bash
# Baza — 1000 concurrent na ścieżkach odczytowych. OBSERWUJ dashboard Supabase.
pnpm load:stress:db -- -e VUS=1000 -e DURATION=3m -e BASE_URL=... -e LOAD_TEST_PASSWORD=...

# Kolejka KSeF — 10K eventów do Inngest (ingestion + throttle Fazy 23)
pnpm load:stress:ksef -- -e INNGEST_EVENT_KEY=... -e TENANT_ID=<uuid> -e COUNT=10000

# Pipeline OCR — 100 paragonów uploadowanych jednocześnie
pnpm load:stress:ocr -- -e VUS=100 -e DURATION=2m -e BASE_URL=... -e LOAD_TEST_PASSWORD=...
```

Stress KSeF w trybie domyślnym zalewa kolejkę syntetycznymi eventami (joby
fail-fast na nieistniejących fakturach) — testuje ingestion/dispatch/throttle.
Dla pełnego pipeline'u zaseeduj realne faktury i podaj prawdziwe ID.

## 6. Server Action IDs (scenariusze invoice / bulk)

Wysyłka faktury i bulk import idą przez Next.js Server Actions. Ich ID to hash
budowany w `next build` — **zmienia się przy każdym deployu**, więc nie da się
go zahardkodować. Bez ID scenariusz wciąż mierzy page loady, pomija tylko krok
mutacji.

Jak wyciągnąć ID z deployu:

1. Otwórz formularz (`/invoices/new/regular`) na test env w przeglądarce.
2. DevTools → Network, wyślij formularz.
3. Znajdź POST na ścieżkę strony → nagłówek żądania **`Next-Action`**.
4. Skopiuj wartość, podaj jako `-e ACTION_INVOICE_SUBMIT=<hash>`.

Analogicznie `ACTION_BULK_IMPORT` z `/import-danych`.

## 7. Lighthouse (FCP / TTI / LCP)

k6 mierzy warstwę protokołu — **nie** renderowanie. Metryki przeglądarkowe
liczy Lighthouse:

```bash
npx lighthouse https://test.faktflow.pl/dashboard \
  --budget-path=load-tests/lighthouse-budget.json \
  --only-categories=performance --chrome-flags="--headless"
```

Budżet (`load-tests/lighthouse-budget.json`) zgłosi przekroczenia.

## 8. Decyzja: SSE vs polling (status OCR)

**Decyzja: zostaje polling.** Status OCR jest dziś odpytywany przez polling
(klient → `getOcrJobStatusAction`).

| | Polling (obecnie) | SSE |
|---|---|---|
| Złożoność | niska, działa | wymaga long-lived connection |
| Vercel | OK | funkcje serverless źle znoszą długie połączenia |
| Obciążenie | lekkie odczyty co kilka s | 1 otwarte połączenie / klient |

Na Vercelu (funkcje serverless) **SSE jest gorszym wyborem** — długie
połączenia zżerają czas funkcji i concurrency. Polling przy zadaniach OCR
trwających sekundy jest tańszy i prostszy. Wracamy do SSE tylko, jeśli
loadtest pokaże, że polling realnie obciąża backend — dziś brak dowodów.

## 9. Status bundla i rekomendacja

`next build` (Faza 34): **shared First Load JS ≈ 310 KB gz** — ~10 KB ponad
budżet 300 KB. Skład: Sentry SDK z tracingiem (~146 KB), PostHog SDK (~60 KB),
React-DOM (~61 KB, nieredukowalne).

Tuning konfiguracji (`optimizePackageImports`, `bundleSizeOptimizations`,
`browserslist`) nie ruszył wagi — ciężar to samo SDK obserwowalności.

**Rekomendacja (osobne zadanie, wymaga decyzji):** lazy-load PostHog —
dynamiczny `import('posthog-js')` po udzieleniu zgody (consent), zamiast
eager-importu w 7 plikach. Zdejmuje ~60 KB z krytycznej ścieżki i realnie
schodzi poniżej 300 KB. Refaktor dotyka Fazy 31 (consent + experimenty),
dlatego nie wszedł do Fazy 34 — do zaplanowania świadomie.
