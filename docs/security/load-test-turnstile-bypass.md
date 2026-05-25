# Bypass Turnstile na środowisku testowym (load test)

Bez tego bot load-test dostaje **403** / `?error=bot_check_failed` przy logowaniu (Faza 28).

## Warunki (wszystkie naraz)

1. **Nie produkcja** — `VERCEL_ENV` ≠ `production` i `NEXT_PUBLIC_APP_ENV` ≠ `production`
2. **`LOAD_TEST_MODE=true`** w env serwera (Vercel Preview / `.env.local`)
3. Żądanie logowania z nagłówkiem **`x-turnstile-bypass`** (dowolna niepusta wartość, np. `1`)

## Kod

- `lib/security/turnstile.ts` — `isTurnstileBypassActive()`, `verifyTurnstile(..., { allowLoadTestBypass: true })`
- `app/(auth)/login/actions.ts` — tylko logowanie ma bypass
- `app/api/dev/load-test-session/route.ts` — k6 loguje się tu (bez Turnstile; wymaga `LOAD_TEST_MODE=true`)

Rejestracja i reset hasła **nie** używają bypass.

## Przykład (k6 / curl)

```bash
# Server Action wymaga cookies + form — bot zwykle symuluje POST jak przeglądarka.
# Nagłówek musi trafić do Next (Server Action):
curl -X POST 'https://twoj-preview.vercel.app/login' \
  -H 'x-turnstile-bypass: 1' \
  ...
```

W skrypcie load-test ustaw stały nagłówek na wszystkich requestach do originu aplikacji.

## Vercel Preview

Settings → Environment Variables → **Preview** (nie Production):

| Zmienna | Wartość |
|---------|---------|
| `LOAD_TEST_MODE` | `true` |
| `NEXT_PUBLIC_APP_ENV` | `staging` (nie `production`) |

Po deployu zrestartuj / poczekaj na nowy build.

## Lokalnie

W `.env.local`:

```env
LOAD_TEST_MODE=true
NEXT_PUBLIC_APP_ENV=development
```

Zrestartuj `pnpm dev`, wyślij nagłówek przy teście logowania.
