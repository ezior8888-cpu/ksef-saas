# PostHog — gdzie wkleić co (szablon)

W tym projekcie **nie wklejasz** `posthog.init('phc_…', …)` do losowego pliku `.tsx`.  
Klucz i host trzymasz w **`.env.local`**; w kodzie init jest już w **`lib/analytics/browser-posthog.ts`**, a loader `array.js` w **`components/analytics/posthog-snippet-loader.tsx`**.

---

## 1. Lokalnie — plik **`.env.local`** (w **rootcie** repo, obok `package.json`)

Utwórz lub edytuj plik **`.env.local`** (jest w `.gitignore` — nie trafia do Gita).

Wklej poniższe i **podmień** tylko wartości w wierszu `NEXT_PUBLIC_POSTHOG_KEY`:

```env
# PostHog — Project API Key z: PostHog → Project settings → Project API Key
NEXT_PUBLIC_POSTHOG_KEY=Wklej_tutaj_swoj_klucz_phc_

# Region EU (jak w panelu PostHog); zostaw jak jest, chyba że masz inny region
NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
```

Zapisz plik i **zrestartuj** `pnpm dev` (zmienne `NEXT_PUBLIC_*` ładowane przy starcie builda / dev).

**Uwaga (zgoda):** na **localhost** eventy idą od razu (stan `unset` w localStorage). Na **produkcji** bez kliknięcia „Akceptuję” w banerze PostHog nie dostaje capture z przeglądarki. Jeśli wcześniej kliknąłeś „Tylko niezbędne”, wyczyść klucz `ff_analytics_consent` w Application → Local Storage albo kliknij „Akceptuję”.

---

## 2. Produkcja (np. **Vercel**)

**Vercel → Twój projekt → Settings → Environment Variables**

Dodaj **te same nazwy** co wyżej:

| Name | Value (wklej) |
|------|----------------|
| `NEXT_PUBLIC_POSTHOG_KEY` | Twój `phc_…` z PostHoga |
| `NEXT_PUBLIC_POSTHOG_HOST` | `https://eu.i.posthog.com` (lub host z Twojego regionu) |

Zapisz i **Redeploy**, żeby zmienne trafiły do bundle.

---

## 3. Odpowiednik snippeta z panelu PostHog (dla orientacji)

W panelu PostHog pod **Web** często widzisz coś w stylu:

```js
import posthog from 'posthog-js'

posthog.init('phc_.....', {
  api_host: 'https://eu.i.posthog.com',
  defaults: '2026-01-30',
})
```

U nas to jest **zbudowane tak**:

| Fragment z panelu | U nas |
|-------------------|--------|
| `'phc_.....'` | `process.env.NEXT_PUBLIC_POSTHOG_KEY` (wartość z **`.env.local`** / Vercel) |
| `api_host: 'https://eu.i.posthog.com'` | `api_host: '/ingest'` — **reverse proxy** w `next.config.ts` (mniej ad-blocków); ruch i tak trafia do EU |
| `defaults: '2026-01-30'` | Stała `POSTHOG_INIT_DEFAULTS` w `lib/analytics/browser-posthog.ts` |
| `import posthog` + init w pliku | Ładowanie **`array.js`** + `initBrowserPosthogAfterSnippet()` — patrz `components/analytics/posthog-snippet-loader.tsx` |

**`ui_host`:** w init ustawiamy `process.env.NEXT_PUBLIC_POSTHOG_HOST` (toolbar / linki w UI PostHoga) — dlatego w env zostawiasz prawdziwy host `https://eu.i.posthog.com`.

---

## 4. Czego **nie** rób

- Nie wklejaj jawnego `phc_…` do `app/layout.tsx`, `browser-posthog.ts` ani innych plików **commitowanych** do Gita.
- Nie duplikuj drugiego `posthog.init` — jedna ścieżka: loader + `initBrowserPosthogAfterSnippet()`.
- **Nie modyfikuj `proxy.ts` pod PostHog** — w tym projekcie to Next.js proxy (sesja Supabase, logowanie), nie przekaźnik eventów. Instrukcja z wizarda (`new PostHog(...)` + `capture` w „proxy”) dotyczy innego typu aplikacji; u nas `posthog-node` jest w `lib/analytics/posthog-node-client.ts`, a eventy z przeglądarki lecą przez `/ingest`.

---

## 5. Szybki test

Po ustawieniu env i restarcie dev: wejdź na stronę, w DevTools → **Network** filtr `ingest` — powinny być żądania **200** do `http://localhost:3000/ingest/...`.

W PostHogu: **Activity** / **Live events** — ustaw zakres czasu na „Last 15 minutes” i upewnij się, że nie filtrujesz tylko produkcji (URL). Jeśli nadal pusto: w konsoli `localStorage.getItem('ff_analytics_consent')` — wartość `denied` blokuje capture (na prod zawsze; na dev też po „Tylko niezbędne”).

---

## 6. Node.js (`posthog-node`) — serwer

Odpowiednik dokumentacji PostHoga:

```js
import { PostHog } from 'posthog-node'

const client = new PostHog('[project token]', { host: 'https://eu.i.posthog.com' })
await client.shutdown()
```

**W projekcie:** jeden singleton + `shutdown` przy SIGTERM/SIGINT — plik **`lib/analytics/posthog-node-client.ts`**.

- **Token:** ten sam co w przeglądarce — `NEXT_PUBLIC_POSTHOG_KEY` w `.env.local` / Vercel (nie wklejasz literalu `phc_` do TS).
- **Host:** `NEXT_PUBLIC_POSTHOG_HOST` (domyślnie `https://eu.i.posthog.com`).
- **Wysyłka eventów:** `trackServer` / `identifyServer` w **`lib/analytics/server.ts`** (wołają `flush()` po każdej operacji — Vercel serverless).
- **Ręczny dostęp:** `getPostHogNodeClient()` albo `requirePostHogNodeClient()` z `posthog-node-client.ts` (albo legacy `getPostHogClient` z `lib/posthog-server.ts`).

`shutdownPostHogNodeClient()` jest podpięty w **`instrumentation.ts`** (`SIGTERM` / `SIGINT`).
