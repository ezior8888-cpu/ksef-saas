# 07 — Produkcja od zewnątrz

Wygenerowane przez `scripts/security/audit-headers.ts` (tylko GET-y). **Nie edytuj ręcznie.**

Data: 2026-09-09 · cel: https://www.faktflow.pl

## 5.1 — Nagłówki bezpieczeństwa

| Nagłówek | Wartość |
|---|---|
| `strict-transport-security` | max-age=31536000; includeSubDomains; preload |
| `content-security-policy` | **BRAK** |
| `content-security-policy-report-only` | default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com; style-src 'self' … |
| `x-frame-options` | DENY |
| `x-content-type-options` | nosniff |
| `referrer-policy` | no-referrer |
| `permissions-policy` | camera=(), microphone=(), geolocation=(), browsing-topics=(), interest-cohort=() |

🟡 **CSP tylko w trybie Report-Only** — polityka jest zdefiniowana, ale przeglądarka
jej NIE egzekwuje, tylko raportuje naruszenia. XSS nie jest blokowany przez CSP.
To znane (`next.config.ts`), ale przed launchem powinno przejść w tryb egzekwowany.

## 5.4 — Cache-Control (trasy za logowaniem NIE mogą być cache'owane)

| Trasa | Status | Cache-Control | Ujawnia |
|---|---|---|---|
| `/` | 200 | `s-maxage=31536000` | x-powered-by: Next.js |
| `/login` | 200 | `private, no-cache, no-store, max-age=0, must-revalidate` | x-powered-by: Next.js |
| `/dashboard` | 307 | `(brak)` | — |
| `/invoices` | 307 | `(brak)` | — |
| `/api/health` | 200 | `(brak)` | — |

Trasa za logowaniem z `s-maxage`/`public` w Cache-Control = ryzyko, że pośrednik
(CDN, proxy) zcache'uje odpowiedź jednego użytkownika i poda ją innemu. Oczekiwane
dla takich tras: `no-store` albo `private`.

## 5.2 — Trasy deweloperskie na produkcji

| Trasa | Status | Werdykt |
|---|---|---|
| `/api/dev/load-test-session` | 405 | ✅ niedostępna |
| `/api/dev/posthog-test` | 404 | ✅ niedostępna |
| `/api/sentry-example-api` | 307 | ✅ za bramką auth (redirect→/login) |
| `/api/sentry-test-log` | 307 | ✅ za bramką auth (redirect→/login) |
| `/sentry-example-page` | 307 | ✅ za bramką auth (redirect→/login) |

Uwaga: `307 → /login` znaczy, że trasa jest za bramką auth (`proxy.ts`),
a nie że działa publicznie. Zagrożeniem byłby dopiero status `2xx` bez logowania.

## 5.3 — PostgREST od zewnątrz (bez tokenu)

| Adres | Status | Werdykt |
|---|---|---|
| `https://www.faktflow.pl/rest/v1/invoices?limit=1` | 307 | brak/nieosiągalne |
| `https://db.faktflow.pl/rest/v1/invoices?limit=1` | 401 | ✅ odmowa |

Uwaga: pełny test dostępu bazy bez tokenu zrobiliśmy już od wnętrza sieci
(dzień 3, `run-prod-readonly.sh` 5.4b — 47 tabel odmawia, 0 otwartych). Tu tylko
sprawdzamy, czy `/rest/v1` jest w ogóle wystawiony publicznie na domenie.
