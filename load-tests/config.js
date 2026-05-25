// Centralna konfiguracja k6 — wspólna dla wszystkich scenariuszy obciążeniowych
// Fazy 34. Wartości wrażliwe (URL środowiska, dane testowe, tokeny) wstrzykujemy
// przez zmienne środowiskowe `-e KLUCZ=...`, więc nic nie ląduje w repo.

// Środowisko docelowe loadtestów — deployed test env na Vercel. Bez końcowego
// slasha, żeby sklejanie ścieżek (`${BASE_URL}/api/...`) nie dawało `//`.
export const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

// Performance budget Fazy 34 — jedno źródło prawdy dla progów k6. Przekroczenie
// któregokolwiek progu = test FAILED (exit code != 0), więc loadtest wyłapie
// regresję bez ręcznej analizy summary.
export const BUDGET = {
  apiP95: 500, // ms — p95 czasu odpowiedzi API
  apiP99: 1500, // ms — p99 (tolerujemy ogon dystrybucji, ale ograniczony)
  pageP95: 1000, // ms — p95 ładowania strony dashboardu
  httpErrorRate: 0.01, // maks. 1% błędów HTTP
};

// Domyślne progi przekładane do `thresholds` każdego scenariusza.
export const defaultThresholds = {
  http_req_failed: [`rate<${BUDGET.httpErrorRate}`],
  http_req_duration: [`p(95)<${BUDGET.apiP95}`, `p(99)<${BUDGET.apiP99}`],
  checks: ['rate>0.99'],
};

// Konto testowe do logowania w scenariuszach. MUSI istnieć w środowisku
// testowym (Krok 7 / instrukcja końcowa opisze jak je zaseedować).
export const TEST_USER = {
  email: __ENV.LOAD_TEST_EMAIL || 'loadtest@faktflow.test',
  password: __ENV.LOAD_TEST_PASSWORD || '',
};

// Token bypass dla Cloudflare Turnstile (Faza 28). Środowisko testowe musi
// akceptować ten nagłówek zamiast realnego widgetu — inaczej zautomatyzowany
// login bota dostanie 403 i cały loadtest jest bezwartościowy.
export const TURNSTILE_BYPASS = __ENV.TURNSTILE_BYPASS_TOKEN || '';

// Profile obciążenia — `stages` dla executora `ramping-vus`. Wybierane przez
// `-e PROFILE=peak`. Scenariusze importują `getProfile()`.
export const PROFILES = {
  // Lokalny dev (`pnpm dev`) — `next dev` nie wytrzyma baseline/target.
  local: {
    stages: [
      { duration: '30s', target: 5 },
      { duration: '1m', target: 10 },
      { duration: '30s', target: 0 },
    ],
  },
  // Smoke — minimalny ruch, weryfikacja że harness i środowisko żyją.
  smoke: {
    stages: [{ duration: '30s', target: 5 }],
  },
  // Baseline — 100 równoległych użytkowników (normalny dzień).
  baseline: {
    stages: [
      { duration: '1m', target: 100 },
      { duration: '3m', target: 100 },
      { duration: '1m', target: 0 },
    ],
  },
  // Peak — 500 użytkowników (szczyt, np. ostatni dzień na fakturę VAT).
  peak: {
    stages: [
      { duration: '2m', target: 500 },
      { duration: '5m', target: 500 },
      { duration: '2m', target: 0 },
    ],
  },
  // Target — 1000 użytkowników (cel Definition of Done Fazy 34).
  target: {
    stages: [
      { duration: '3m', target: 1000 },
      { duration: '5m', target: 1000 },
      { duration: '2m', target: 0 },
    ],
  },
  // Stress — 2000 użytkowników, świadomie ponad cel, szukamy punktu załamania.
  stress: {
    stages: [
      { duration: '3m', target: 2000 },
      { duration: '5m', target: 2000 },
      { duration: '2m', target: 0 },
    ],
  },
  // Spike — 0 → 1000 w 30 sekund, test reakcji auto-scalingu Vercel.
  spike: {
    stages: [
      { duration: '30s', target: 1000 },
      { duration: '2m', target: 1000 },
      { duration: '30s', target: 0 },
    ],
  },
};

// Zwraca profil wybrany przez `-e PROFILE=...` (domyślnie smoke — bezpieczny).
export function getProfile() {
  const name = __ENV.PROFILE || 'smoke';
  const profile = PROFILES[name];
  if (!profile) {
    throw new Error(
      `Nieznany PROFILE="${name}". Dostępne: ${Object.keys(PROFILES).join(', ')}`,
    );
  }
  return profile;
}

// Standardowy obiekt `options` dla scenariusza uruchamianego samodzielnie
// (`k6 run load-tests/scenarios/<plik>.js -e PROFILE=peak`). Executor
// `ramping-vus` realizuje stage'e wybranego profilu.
export function standaloneOptions() {
  return {
    scenarios: {
      default: {
        executor: 'ramping-vus',
        startVUs: 0,
        stages: getProfile().stages,
      },
    },
    thresholds: defaultThresholds,
  };
}
