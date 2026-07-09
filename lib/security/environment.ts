/**
 * Detekcja środowiska — fail-closed dla bramek bezpieczeństwa.
 *
 * SEC-1 (audyt przedlaunchowy): historycznie `isProductionDeploy()` opierał się
 * wyłącznie na `VERCEL_ENV`. Po migracji na Hetzner/Coolify ten var ZNIKA, więc
 * jedyną osłoną auth-bypassu (`/api/dev/load-test-session`, Turnstile bypass)
 * zostawał `NEXT_PUBLIC_APP_ENV`. Jeśli ktoś zapomni go ustawić na produkcji —
 * brama fail-OPEN i każdy może zalogować się jako dowolny user.
 *
 * Tu wprowadzamy dwie funkcje:
 *   - `isProductionDeploy()` — fail-CLOSED: każdy sygnał produkcji ⇒ produkcja.
 *   - `isBypassAllowedEnv()` — wymaga JAWNEGO sygnału nie-produkcji. Sama
 *     nieobecność markera produkcji NIE wystarcza (chroni przed gołym
 *     środowiskiem Hetzner bez env vars).
 *
 * Moduł celowo BEZ `import 'server-only'` — żeby był jednostkowo testowalny
 * (Vitest). Nie zawiera sekretów ani I/O.
 */

/** Wartości env traktowane jako „to jest realna produkcja". */
const PRODUCTION_MARKERS = new Set(['production', 'prod']);

/** Jawne markery środowisk nie-produkcyjnych, gdzie bypass jest dozwolony. */
const NON_PROD_MARKERS = new Set([
  'development',
  'dev',
  'test',
  'staging',
  'preview',
  'local',
]);

function normalized(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/**
 * Czy to realny deploy produkcyjny? Fail-closed: wystarczy JEDEN sygnał
 * produkcji, by zwrócić true.
 *
 * Używane przez bramki, które na produkcji muszą być WYŁĄCZONE (debug-logi,
 * przykładowe endpointy), oraz włączane (HSTS).
 */
export function isProductionDeploy(): boolean {
  if (PRODUCTION_MARKERS.has(normalized(process.env.VERCEL_ENV))) return true;
  if (PRODUCTION_MARKERS.has(normalized(process.env.NEXT_PUBLIC_APP_ENV)))
    return true;
  if (PRODUCTION_MARKERS.has(normalized(process.env.APP_ENV))) return true;
  return false;
}

/**
 * Czy środowisko POZYTYWNIE potwierdza, że NIE jest produkcją — na tyle, żeby
 * pozwolić na auth-bypass (load testy)?
 *
 * Fail-CLOSED przez konstrukcję:
 *   1. Jakikolwiek marker produkcji ⇒ false (nigdy bypass na prod).
 *   2. `NODE_ENV` development/test ⇒ true (lokalny dev, Vitest, Playwright).
 *   3. W innym wypadku (np. build produkcyjny `NODE_ENV=production` na Hetzner)
 *      wymagamy JAWNEGO markera nie-produkcji w `APP_ENV` / `NEXT_PUBLIC_APP_ENV`.
 *      Brak markera ⇒ false (traktujemy jak produkcję).
 */
export function isBypassAllowedEnv(): boolean {
  // Krok 1 — twardy zakaz na produkcji.
  if (isProductionDeploy()) return false;

  // Krok 2 — lokalny dev / testy.
  const nodeEnv = normalized(process.env.NODE_ENV);
  if (nodeEnv === 'development' || nodeEnv === 'test') return true;

  // Krok 3 — build produkcyjny bez markera produkcji: wymagaj JAWNEGO
  // markera środowiska nie-produkcyjnego. Inaczej fail-closed.
  const appEnv = normalized(process.env.APP_ENV || process.env.NEXT_PUBLIC_APP_ENV);
  return NON_PROD_MARKERS.has(appEnv);
}
