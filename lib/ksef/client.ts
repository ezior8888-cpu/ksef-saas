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

  /** Czy ten błąd warto retry-ować? */
  get isRetryable(): boolean {
    // 429 rate limit, 502/503/504 chwilowa niedostępność
    return [429, 502, 503, 504].includes(this.status);
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

  try {
    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: serializedBody,
      signal: controller.signal,
    });

    clearTimeout(timeoutHandle);

    const text = await response.text();
    let parsedBody: unknown = text;
    if (text && response.headers.get('content-type')?.includes('application/json')) {
      try {
        parsedBody = JSON.parse(text);
      } catch {
        // zostaw jako tekst
      }
    }

    if (!response.ok) {
      throw new KsefApiError(
        response.status,
        parsedBody as KsefErrorResponse | string,
        `KSeF API ${method} ${path} failed: ${response.status} ${response.statusText}`
      );
    }

    return parsedBody as TResponse;
  } catch (error) {
    clearTimeout(timeoutHandle);
    if (error instanceof KsefApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new KsefApiError(
        408,
        'Request timeout',
        `KSeF API ${method} ${path} timed out after ${timeoutMs}ms`
      );
    }
    throw error;
  }
}
