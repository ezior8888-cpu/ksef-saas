import type { KsefEnvironment, KsefErrorResponse } from '@/types/ksef';

/**
 * Zwraca bazowy URL API KSeF dla danego środowiska.
 */
export function getKsefBaseUrl(env: KsefEnvironment = 'test'): string {
  const envMap: Record<KsefEnvironment, string> = {
    test: process.env.KSEF_TEST_URL ?? 'https://api-test.ksef.mf.gov.pl/v2',
    demo: process.env.KSEF_DEMO_URL ?? 'https://api-demo.ksef.mf.gov.pl/v2',
    production: process.env.KSEF_PROD_URL ?? 'https://api.ksef.mf.gov.pl/v2',
  };
  return envMap[env];
}

/** Pełna baza URL API KSeF (`…/v2`) — alias pod health-check i jawny `fetch`. */
export function getKsefApiUrl(
  env?: KsefEnvironment,
): string {
  const resolved =
    env ?? (process.env.KSEF_ENV as KsefEnvironment) ?? 'test';
  return getKsefBaseUrl(resolved);
}

/**
 * Błąd rzucany przez klienta KSeF.
 * Zawiera pełną odpowiedź KSeF do debugowania.
 */
export class KsefApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: KsefErrorResponse | string,
    message: string
  ) {
    super(message);
    this.name = 'KsefApiError';
  }

  /** Czy ten błąd warto retry-ować?
   *
   * Reguła (Faza 23 sekcja 2):
   *   - 429 — retry z DELAY (KSeF mówi nam „zwolnij")
   *   - 5xx (>=500, <600) — retry, KSeF leży po stronie MF
   *   - 4xx (<500) — NonRetryable, błąd walidacji / autoryzacji po naszej stronie
   *     (KSeF nie zaakceptuje tej samej faktury bez zmiany payloadu).
   */
  get isRetryable(): boolean {
    if (this.status === 429) return true;
    return this.status >= 500 && this.status < 600;
  }

  /** Czy to błąd autoryzacji (wygasła sesja)? */
  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }

  /** Wyciąga kod błędu KSeF (jeśli jest) */
  get ksefCode(): number | null {
    if (typeof this.body === 'string') return null;
    return this.body.exceptionDetailList?.[0]?.exceptionCode ?? null;
  }
}

/**
 * Options dla wywołania KSeF API.
 */
export interface KsefRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Bearer token (accessToken z /auth/token/redeem) */
  accessToken?: string;
  /** Body (JSON lub binary) */
  body?: unknown;
  /** Dodatkowe nagłówki */
  headers?: Record<string, string>;
  /** Środowisko - domyślnie z env */
  env?: KsefEnvironment;
  /** Timeout w ms (domyślnie 30s) */
  timeoutMs?: number;
  /**
   * Audit log każdej interakcji z KSeF (Faza 23 sekcja 3). Gdy `audit`
   * jest podane, każde wywołanie ksefFetch wpisuje do `audit_logs`:
   *   - status HTTP, response time, payload size
   *   - tenantId + invoiceId + nazwa akcji ('submit', 'upo.download', etc.)
   *
   * Logowanie jest fire-and-forget (`void` promise) — nie blokuje
   * głównego flow ani nie rzuca jeśli `audit_logs` insert padnie.
   */
  audit?: {
    tenantId: string;
    /** Krótki opis operacji — np. 'submit', 'upo.download', 'inbox.poll', 'auth.token'. */
    action: string;
    /** ID faktury, której operacja dotyczy (jeśli relevantne). */
    invoiceId?: string;
    /** Dodatkowy kontekst — np. ksefNumber, batchSize. */
    metadata?: Record<string, unknown>;
  };
}

/**
 * Asynchroniczny zapis do audit_logs (fire-and-forget). Import dynamiczny
 * łamie potencjalny cycle `lib/audit/log-system` → `lib/supabase/server` →
 * ... → `lib/ksef/client` (gdyby ktoś dodał).
 */
async function recordKsefAudit(
  audit: NonNullable<KsefRequestOptions['audit']>,
  context: {
    method: string;
    path: string;
    status: number;
    durationMs: number;
    requestSize: number;
    responseSize: number;
    error?: string;
  },
): Promise<void> {
  try {
    const { logAuditSystem } = await import('@/lib/audit/log-system');
    await logAuditSystem({
      // Cast: `audit.action` to free-form string z call-site'ów ('session.open',
      // 'invoice.send', etc.) — `AuditAction` ma już prefixed warianty
      // `ksef.session.open` etc., więc concatenation jest typu `ksef.${string}`
      // i nie zwęża się automatycznie. Bezpieczne bo lista call-site'ów
      // jest ograniczona do helperów w `lib/ksef/`.
      action: `ksef.${audit.action}` as 'ksef.session.open',
      tenantId: audit.tenantId,
      userId: null,
      entityType: audit.invoiceId ? 'invoice' : 'ksef',
      entityId: audit.invoiceId,
      metadata: {
        ...audit.metadata,
        method: context.method,
        path: context.path,
        httpStatus: context.status,
        durationMs: context.durationMs,
        requestBytes: context.requestSize,
        responseBytes: context.responseSize,
        ...(context.error ? { error: context.error } : {}),
      },
    });
  } catch (e) {
    // Audit fail nie powinien wywracać samej operacji KSeF.
    console.error('[ksef.audit] log failed', e);
  }
}

/** Faza 23 sekcja 4: gdy `E2E_MOCK_KSEF=1`, interceptor zwraca deterministyczne
 *  fixtures z `mock-fixtures.ts` zamiast hitować realne MF API. Zachowuje audit
 *  logging i error throwing — testy widzą identyczny flow jak produkcyjny.
 *
 *  NIE dotyka `process.env.KSEF_ENV` — to wciąż `test`/`production`, decyzja
 *  o mocku jest niezależna i opt-in.
 */
async function maybeMockResponse(
  method: string,
  path: string,
): Promise<{ status: number; bodyText: string } | null> {
  if (process.env.E2E_MOCK_KSEF !== '1') return null;

  const { resolveFixture, applyScenario, getMockScenario } = await import(
    './mock-fixtures'
  );

  const healthyFixture = resolveFixture(path, method);
  if (!healthyFixture) {
    return {
      status: 404,
      bodyText: JSON.stringify({ mock: true, reason: 'fixture-not-found', path }),
    };
  }

  const applied = applyScenario(getMockScenario(), healthyFixture);
  const bodyText =
    typeof applied.body === 'string' ? applied.body : JSON.stringify(applied.body);

  if (applied.delayMs && process.env.E2E_MOCK_KSEF_SKIP_DELAY !== '1') {
    await new Promise((resolve) => setTimeout(resolve, applied.delayMs));
  }

  return { status: applied.status, bodyText };
}

/**
 * Helper do wywołania endpointu KSeF API.
 * Obsługuje JSON request/response, bearer auth, timeouts, strukturalne błędy.
 */
export async function ksefFetch<TResponse = unknown>(
  path: string,
  options: KsefRequestOptions = {}
): Promise<TResponse> {
  const {
    method = 'GET',
    accessToken,
    body,
    headers = {},
    env = (process.env.KSEF_ENV as KsefEnvironment) ?? 'test',
    timeoutMs = 30_000,
    audit,
  } = options;

  const url = `${getKsefBaseUrl(env)}${path}`;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...headers,
  };

  if (accessToken) {
    requestHeaders['Authorization'] = `Bearer ${accessToken}`;
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  // Stringowe body (XML, raw) przesyłamy jak jest.
  // Obiektowe body serializujemy do JSON.
  let serializedBody: string | undefined;
  if (body !== undefined && body !== null) {
    serializedBody = typeof body === 'string' ? body : JSON.stringify(body);
  }

  const startedAt = Date.now();
  const requestSize = serializedBody ? Buffer.byteLength(serializedBody, 'utf8') : 0;

  try {
    // Faza 23 sekcja 4: mock interceptor dla testów (E2E_MOCK_KSEF=1).
    // Zwraca deterministyczne fixtures zamiast hitować realne MF API.
    const mocked = await maybeMockResponse(method, path);
    let responseStatus: number;
    let responseOk: boolean;
    let text: string;
    let contentType: string | null;

    if (mocked) {
      clearTimeout(timeoutHandle);
      responseStatus = mocked.status;
      responseOk = mocked.status >= 200 && mocked.status < 300;
      text = mocked.bodyText;
      contentType = text.startsWith('<')
        ? 'application/xml'
        : 'application/json';
    } else {
      const response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: serializedBody,
        signal: controller.signal,
      });
      clearTimeout(timeoutHandle);
      responseStatus = response.status;
      responseOk = response.ok;
      text = await response.text();
      contentType = response.headers.get('content-type');
    }

    const responseSize = Buffer.byteLength(text, 'utf8');
    let parsedBody: unknown = text;
    if (text && contentType?.includes('application/json')) {
      try {
        parsedBody = JSON.parse(text);
      } catch {
        // zostaw jako tekst
      }
    }

    // Audit (fire-and-forget) — KAŻDA interakcja KSeF jest zapisana.
    if (audit) {
      void recordKsefAudit(audit, {
        method,
        path,
        status: responseStatus,
        durationMs: Date.now() - startedAt,
        requestSize,
        responseSize,
        error: responseOk ? undefined : `HTTP ${responseStatus}`,
      });
    }

    if (!responseOk) {
      throw new KsefApiError(
        responseStatus,
        parsedBody as KsefErrorResponse | string,
        `KSeF API ${method} ${path} failed: ${responseStatus}`
      );
    }

    return parsedBody as TResponse;
  } catch (error) {
    clearTimeout(timeoutHandle);

    if (error instanceof KsefApiError) {
      // Audit już zapisany w bloku try (przed throw). Tylko re-throw.
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      if (audit) {
        void recordKsefAudit(audit, {
          method,
          path,
          status: 408,
          durationMs: Date.now() - startedAt,
          requestSize,
          responseSize: 0,
          error: 'timeout',
        });
      }
      throw new KsefApiError(
        408,
        'Request timeout',
        `KSeF API ${method} ${path} timed out after ${timeoutMs}ms`
      );
    }

    // Network error (ECONNRESET, DNS fail) — bez statusu HTTP.
    if (audit) {
      void recordKsefAudit(audit, {
        method,
        path,
        status: 0,
        durationMs: Date.now() - startedAt,
        requestSize,
        responseSize: 0,
        error: error instanceof Error ? error.message : 'network',
      });
    }
    throw error;
  }
}
