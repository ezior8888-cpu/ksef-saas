/**
 * Mały, bezpieczny klient HTTP dla **client componentów**.
 *
 * Zakres:
 * - `AbortController` z domyślnym timeoutem (15 s) — łączony z zewnętrznym
 *   `signal`, jeśli wołający chce anulować ręcznie (np. `useEffect` cleanup
 *   przy nawigacji w trakcie pobierania downloadu).
 * - `AbortError` traktowany jako stan „cancelled” — **nie** rzuca błędu w
 *   konsoli, zwraca `{ ok: false, kind: 'aborted' }`.
 * - Lekki **circuit breaker** per-endpoint (klucz = URL bez query): po N
 *   kolejnych błędach 5xx / network/timeout zamykamy obwód na `cooldownMs` —
 *   kolejne wywołania natychmiast zwracają `kind: 'circuit_open'`, bez bicia
 *   w przeciążony backend.
 * - Brak duplikacji RSC — używaj wyłącznie z client componentów dla nielicznych
 *   POST-ów / downloadów. Listy / dane stron są na RSC; tam Next anuluje stream
 *   przy nawigacji automatycznie.
 */

const DEFAULT_TIMEOUT_MS = 15_000;
const FAILURE_THRESHOLD = 4;
const COOLDOWN_MS = 8_000;

type CircuitState = {
  failures: number;
  openedAt: number | null;
};

const circuits = new Map<string, CircuitState>();

function circuitKey(input: RequestInfo | URL): string {
  const raw =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  const i = raw.indexOf('?');
  return i === -1 ? raw : raw.slice(0, i);
}

function isCircuitOpen(key: string): boolean {
  const c = circuits.get(key);
  if (!c || c.openedAt === null) return false;
  if (Date.now() - c.openedAt > COOLDOWN_MS) {
    circuits.set(key, { failures: 0, openedAt: null });
    return false;
  }
  return true;
}

function recordFailure(key: string): void {
  const c = circuits.get(key) ?? { failures: 0, openedAt: null };
  const failures = c.failures + 1;
  if (failures >= FAILURE_THRESHOLD) {
    circuits.set(key, { failures, openedAt: Date.now() });
  } else {
    circuits.set(key, { failures, openedAt: null });
  }
}

function recordSuccess(key: string): void {
  if (!circuits.has(key)) return;
  circuits.set(key, { failures: 0, openedAt: null });
}

export type SafeFetchResult =
  | { ok: true; response: Response }
  | { ok: false; kind: 'aborted' }
  | { ok: false; kind: 'circuit_open'; retryAfterMs: number }
  | { ok: false; kind: 'network'; error: Error }
  | { ok: false; kind: 'timeout' }
  | { ok: false; kind: 'http'; status: number; response: Response };

export interface SafeFetchOptions extends Omit<RequestInit, 'signal'> {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Czy 5xx ma „karmić” circuit breaker (default: true). 4xx zawsze nie. */
  trackServerErrorsForCircuit?: boolean;
}

function isAbortError(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === 'AbortError' || err.name === 'TimeoutError')
  );
}

/**
 * Łączy zewnętrzny `signal` z lokalnym `AbortController` timeoutu.
 * Zwraca controller (do `signal`) i `dispose`, który czyści listenery / timer.
 */
function makeCombinedSignal(
  external: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();

  const onExternalAbort = () => controller.abort(external?.reason);
  if (external) {
    if (external.aborted) {
      controller.abort(external.reason);
    } else {
      external.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  const timer = setTimeout(() => {
    controller.abort(new DOMException('Timeout', 'TimeoutError'));
  }, timeoutMs);

  const dispose = () => {
    clearTimeout(timer);
    external?.removeEventListener('abort', onExternalAbort);
  };

  return { signal: controller.signal, dispose };
}

/**
 * Wykonuje `fetch` z timeoutem i obsługą abort. Nigdy nie rzuca dla:
 * - anulowania (`AbortError` / `TimeoutError`),
 * - błędu sieci,
 * - otwartego circuit breakera.
 *
 * Zwraca dyskryminowany Result; UI mapuje sensownie (toast / fallback / cisza).
 */
export async function safeFetch(
  input: RequestInfo | URL,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const {
    signal: externalSignal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    trackServerErrorsForCircuit = true,
    ...rest
  } = options;

  const key = circuitKey(input);
  if (isCircuitOpen(key)) {
    const c = circuits.get(key);
    const retryAfterMs =
      c?.openedAt != null ? Math.max(0, COOLDOWN_MS - (Date.now() - c.openedAt)) : COOLDOWN_MS;
    return { ok: false, kind: 'circuit_open', retryAfterMs };
  }

  const { signal, dispose } = makeCombinedSignal(externalSignal, timeoutMs);

  try {
    const response = await fetch(input, { ...rest, signal });
    if (!response.ok) {
      if (response.status >= 500 && trackServerErrorsForCircuit) {
        recordFailure(key);
      }
      return { ok: false, kind: 'http', status: response.status, response };
    }
    recordSuccess(key);
    return { ok: true, response };
  } catch (err) {
    if (isAbortError(err)) {
      if (
        err instanceof DOMException &&
        err.name === 'TimeoutError'
      ) {
        if (trackServerErrorsForCircuit) recordFailure(key);
        return { ok: false, kind: 'timeout' };
      }
      return { ok: false, kind: 'aborted' };
    }
    if (trackServerErrorsForCircuit) recordFailure(key);
    return {
      ok: false,
      kind: 'network',
      error: err instanceof Error ? err : new Error(String(err)),
    };
  } finally {
    dispose();
  }
}
