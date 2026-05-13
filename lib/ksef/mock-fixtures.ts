/**
 * Mock KSeF fixtures — deterministyczne odpowiedzi dla testów E2E + Vitest.
 *
 * Faza 23 sekcja 4: zakaz uderzania do produkcyjnego API podczas testowania.
 * Mock interceptor w `ksefFetch` (zob. `client.ts`) routuje requesty do tych
 * fixturek na bazie path + scenario.
 *
 * Scenariusze (`MOCK_SCENARIO_ENV`):
 *   - 'healthy'  — wszystkie 2xx, 50ms latency, faktura akceptowana
 *   - 'down'     — wszystkie 503 (MF outage)
 *   - 'flaky'    — 50% sukces / 50% 503 (sporadic failures)
 *   - 'recovery' — pierwsze N calls 503, potem sukces (test recovery flow)
 *
 * Test może nadpisać scenariusz przez `setMockScenario('xxx')` zamiast env.
 */

export type MockScenario = 'healthy' | 'down' | 'flaky' | 'recovery';

export const MOCK_SCENARIO_ENV = 'E2E_MOCK_KSEF_SCENARIO';
export const MOCK_RECOVERY_AFTER_ENV = 'E2E_MOCK_KSEF_RECOVERY_AFTER';

/** Counter dla scenario 'recovery' — po `recoveryAfter` failach przełącza
 *  w tryb 'healthy'. Reset przy każdym `resetMockState()`. */
let mockFailureCount = 0;
let overrideScenario: MockScenario | null = null;

export function getMockScenario(): MockScenario {
  if (overrideScenario) return overrideScenario;
  const fromEnv = process.env[MOCK_SCENARIO_ENV];
  if (
    fromEnv === 'down' ||
    fromEnv === 'flaky' ||
    fromEnv === 'recovery' ||
    fromEnv === 'healthy'
  ) {
    return fromEnv;
  }
  return 'healthy';
}

export function setMockScenario(scenario: MockScenario | null): void {
  overrideScenario = scenario;
}

export function resetMockState(): void {
  mockFailureCount = 0;
  overrideScenario = null;
}

/** Zwiększa wewnętrzny licznik failure'ów (dla scenariusza 'recovery'). */
export function incrementMockFailureCount(): void {
  mockFailureCount++;
}

export function getMockFailureCount(): number {
  return mockFailureCount;
}

export function getRecoveryThreshold(): number {
  const raw = process.env[MOCK_RECOVERY_AFTER_ENV];
  const n = raw ? Number.parseInt(raw, 10) : 3;
  return Number.isFinite(n) && n > 0 ? n : 3;
}

// ─── Fixture responses ──────────────────────────────────────────────────

export interface MockResponse {
  status: number;
  body: unknown;
  /** Symulowany delay (ms) — testy z fake timers nie używają, prod E2E tak. */
  delayMs?: number;
}

export const FIXTURE_HEALTH_OK: MockResponse = {
  status: 200,
  body: { status: 'ok', timestamp: new Date().toISOString() },
  delayMs: 50,
};

export const FIXTURE_503: MockResponse = {
  status: 503,
  body: {
    timestamp: new Date().toISOString(),
    exceptionDetailList: [
      {
        exceptionCode: 21001,
        exceptionDescription: 'Service temporarily unavailable',
      },
    ],
  },
};

export const FIXTURE_SESSION_OPEN_OK: MockResponse = {
  status: 200,
  body: {
    referenceNumber: 'MOCK-SESSION-REF-0001',
    timestamp: new Date().toISOString(),
  },
  delayMs: 80,
};

export const FIXTURE_INVOICE_SEND_OK: MockResponse = {
  status: 200,
  body: {
    referenceNumber: 'MOCK-INV-REF-0001',
    timestamp: new Date().toISOString(),
  },
  delayMs: 120,
};

export const FIXTURE_INVOICE_POLL_ACCEPTED: MockResponse = {
  status: 200,
  body: {
    status: { code: 200, description: 'Faktura przetworzona' },
    ksefNumber: 'MOCK-1234567890-20260512-AB-CD',
    acquisitionTimestamp: new Date().toISOString(),
    upoDownloadUrl: 'https://mock-ksef/upo/MOCK',
  },
  delayMs: 60,
};

export const FIXTURE_SESSION_CLOSE_OK: MockResponse = {
  status: 200,
  body: { closed: true },
  delayMs: 30,
};

export const FIXTURE_UPO_XML_OK: MockResponse = {
  status: 200,
  body: '<?xml version="1.0"?><UPO><Header>mock</Header></UPO>',
  delayMs: 100,
};

export const FIXTURE_INBOX_QUERY_EMPTY: MockResponse = {
  status: 200,
  body: { invoices: [], continuationToken: undefined },
  delayMs: 70,
};

// ─── Routing path → fixture ─────────────────────────────────────────────

export function resolveFixture(
  path: string,
  method: string,
): MockResponse | null {
  if (path.includes('/health')) return FIXTURE_HEALTH_OK;
  if (path === '/sessions/online' && method === 'POST') {
    return FIXTURE_SESSION_OPEN_OK;
  }
  if (/\/sessions\/online\/[^/]+\/invoices$/.test(path) && method === 'POST') {
    return FIXTURE_INVOICE_SEND_OK;
  }
  if (/\/sessions\/[^/]+\/invoices\/[^/]+$/.test(path) && method === 'GET') {
    return FIXTURE_INVOICE_POLL_ACCEPTED;
  }
  if (/\/sessions\/online\/[^/]+\/close$/.test(path)) {
    return FIXTURE_SESSION_CLOSE_OK;
  }
  if (path.includes('/upo')) return FIXTURE_UPO_XML_OK;
  if (path.includes('/invoices/query/metadata')) return FIXTURE_INBOX_QUERY_EMPTY;
  return null;
}

/** Dispatch dla `down`/`flaky`/`recovery` — zwraca 503 zamiast healthy fixturki. */
export function applyScenario(
  scenario: MockScenario,
  healthyFixture: MockResponse,
): MockResponse {
  switch (scenario) {
    case 'healthy':
      return healthyFixture;
    case 'down':
      incrementMockFailureCount();
      return FIXTURE_503;
    case 'flaky':
      // Deterministic seed na podstawie failure count — bez Math.random()
      // żeby test był reproducible (parity z Vitest fake timers).
      if (mockFailureCount % 2 === 0) {
        incrementMockFailureCount();
        return FIXTURE_503;
      }
      incrementMockFailureCount();
      return healthyFixture;
    case 'recovery': {
      const threshold = getRecoveryThreshold();
      if (mockFailureCount < threshold) {
        incrementMockFailureCount();
        return FIXTURE_503;
      }
      return healthyFixture;
    }
  }
}
