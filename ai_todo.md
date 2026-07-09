# ai_todo.md — Backlog egzekucyjny AI (przed założeniem firmy)

> Zadania **czysto kodowe**, niewymagające NIP / kont zewnętrznych / firmy.
> Egzekwowane teraz, w trybie ciągłym. Każde zadanie kończy się
> `pnpm typecheck` + `pnpm lint` (+ testy gdzie dotyczy) na zielono.
>
> Legenda: `[ ]` todo · `[~]` w trakcie · `[x]` zrobione i zweryfikowane
>
> Baseline na start: typecheck 0 err · lint 0 err (28 warn) · 66 unit + 21 vitest pass.

---

## P0 — Bezpieczeństwo (krytyczne przed launchem)

- [x] **SEC-1 · `isProductionDeploy()` fail-closed.** ✅ Nowy moduł
  `lib/security/environment.ts` (testowalny, bez `server-only`): `isProductionDeploy()`
  fail-closed (VERCEL_ENV/NEXT_PUBLIC_APP_ENV/APP_ENV), nowy `isBypassAllowedEnv()`
  wymagający JAWNEGO markera nie-produkcji. Podłączony w `turnstile.ts` +
  `load-test-session/route.ts`. Test: `tests/unit/security-environment.test.ts`
  (13 testów, w tym regresja „goły Hetzner ⇒ bypass FALSE").

- [x] **SEC-2 · Bump podatnych zależności.** ✅ 22 vulns (8 high) → **0 vulns**.
  Overrides: hono≥4.12.21, protobufjs≥8.2.0, ws≥8.20.1, qs≥6.15.2, tmp≥0.2.6,
  uuid≥11.1.1, brace-expansion≥5.0.6, @protobufjs/utf8≥1.1.1, 3× @opentelemetry/*.
  Build zielony (inngest/otel nie zerwane), typecheck OK.

- [x] **SEC-3 · CSP enforce-ready allowlist.** ✅ `next.config.ts`: dodane
  challenges.cloudflare.com (script/frame/connect), fonts.googleapis.com (style),
  fonts.gstatic.com (font), worker-src 'self' blob:. Stripe potwierdzony jako
  server-side (brak Stripe.js → CSP go nie wymaga). Zostaje Report-Only,
  allowlist kompletny do enforce.

- [x] **SEC-4 · DEBUG_KSEF defense-in-depth.** ✅ `lib/ksef/auth.ts` — log
  podpisanego XML teraz `DEBUG_KSEF==='1' && !isProductionDeploy()`.

## P1 — Korektność + testy krytycznych ścieżek

- [x] **TEST-1 · KSeF error translator / classifier.** ✅
  `tests/unit/ksef-error-translator.test.ts` — eksport pure helperów
  (coerceSeverity, matchByKeywords, enrichWithLineNumber, formatLastErrorPayload),
  klasyfikacja timeout/401/429/5xx/signature/cert, numer pozycji FaWiersz[N],
  {N} placeholder. 22 testy.

- [x] **TEST-2 · Retry schedule.** ✅ `tests/unit/ksef-retry-schedule.test.ts` —
  sekwencja 30s→2m→5m→15m→1h, monotoniczność, bounds (≥5 ⇒ 1h), ujemne ⇒ 30s,
  limity per-tenant. 7 testów.

- [x] **TEST-3 · Rate limit.** ✅ `tests/unit/rate-limit.test.ts` — eksport
  hashIdentifier (SHA-256, case-insensitive, brak plaintextu), fail-OPEN bez
  Redis dla wszystkich bucketów. 8 testów.

- [x] **TEST-4 · Walidacja faktury.** ✅ `tests/unit/invoice-validators.test.ts`
  — invoiceLineSchema (cena 0 ok, ujemna nie, ilość dodatnia, dozwolone VAT),
  sellerSchema (NIP checksum 5260001246 vs 1234567890), buyerB2CSchema
  (identyfikator zależny od idType), discriminated union b2b/b2c. 16 testów.

- [x] **TEST-5 · Szyfrowanie credentials.** ✅ `tests/unit/credentials-crypto.test.ts`
  — round-trip xades+token, brak plaintextu w blobie, losowy IV, tamper
  ciphertext/tag ⇒ throw, zły klucz ⇒ throw, brak klucza ⇒ czytelny błąd. 9 testów.

- [x] **TEST-6 · KSeF helpers.** ✅ `ksefNumericStatusCode` (string "200" ⇒ 200,
  śmieci ⇒ NaN) — w pliku TEST-1. 4 testy.

## P2 — Jakość kodu

- [x] **QA-1 · Structured logging.** ✅ Nowy `lib/observability/logger.ts`
  (debug/info no-op na produkcji via `isProductionDeploy`, warn/error zawsze →
  Sentry). 11 stub-logów w `lib/email/send.ts` (PII: email + dane faktury)
  → `logger.debug` — cisza i brak PII w prod nawet przy pomyłkowym wejściu.

- [x] **QA-2 · Lint warnings.** ✅ `_nip` unused usunięty (refactor QA-3).
  28 → 27 warn. `clientDup` zostawiony (udokumentowany jako akceptowalny w
  AGENTS.md). Reszta to świadomie-warn react-hooks/*.

- [x] **QA-3 · JPK_FA tax_office_code.** ✅ `extractTaxOfficeCode(_nip)` →
  `resolveTaxOfficeCode(code)` z walidacją 4-cyfrową + `DEFAULT_TAX_OFFICE_CODE`.
  Dodane opcjonalne `issuer.taxOfficeCode` (forward-compat z przyszłą kolumną
  `tenants.tax_office_code`). Test: `tests/unit/jpk-fa-tax-office.test.ts` (3).

## P3 — Robustness

- [x] **ROB-1 · Health endpoint depth.** ✅ `/api/health` — dodany
  `informational.redis` (ping, graceful: skipped gdy nieskonfigurowany).
  NIE bramkuje ogólnego statusu (Redis = cache fail-open). Smoke target dla M3.

---

## Log wykonania

**Stan końcowy (wszystkie zadania ✅):**

| Test | Baseline | Po egzekucji |
|---|---|---|
| `pnpm typecheck` | 0 err | ✅ 0 err |
| `pnpm lint` | 0 err, 28 warn | ✅ 0 err, **27 warn** |
| `pnpm test` (xml node:test) | 66 pass | ✅ 66 pass |
| `pnpm test:vitest tests/unit/` | — | ✅ **69 pass (7 plików)** |
| `pnpm build` | exit 0 | ✅ exit 0 |
| `pnpm audit --prod` | **22 vulns (8 high)** | ✅ **0 vulns** |

**Nowe pliki:**
- `lib/security/environment.ts` (+ test, 13)
- `lib/observability/logger.ts`
- `tests/unit/` — 7 plików testowych, 69 testów łącznie:
  security-environment (13), ksef-error-translator (22), ksef-retry-schedule (7),
  rate-limit (8), invoice-validators (16), credentials-crypto (9), jpk-fa-tax-office (3)

**Zmienione (security/jakość):**
- `lib/security/turnstile.ts` — fail-closed bypass
- `app/api/dev/load-test-session/route.ts` — fail-closed gate
- `lib/ksef/auth.ts` — debug-log !prod
- `next.config.ts` — CSP enforce-ready
- `package.json` — overrides (0 vulns)
- `lib/ksef/error-translator.ts` — export pure helpers
- `lib/rate-limit/index.ts` — export hashIdentifier
- `lib/exports/jpk-fa-generator.ts` — resolveTaxOfficeCode
- `lib/email/send.ts` — logger.debug
- `app/api/health/route.ts` — Redis check

**Suma testów w projekcie: 66 (xml) + 69 (unit) + 21 (vitest integ. non-RLS) = 156.**
