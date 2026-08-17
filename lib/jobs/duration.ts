/**
 * Parser czasu w formacie Inngest ('30s', '2m', '1h', '500ms', '1d') → ms.
 * Używany przez błędy retry i shim `step.sleep`, żeby porty jobów mogły
 * zachować dotychczasowe literały bez zmian.
 */

const DURATION_RE = /^(\d+)(ms|s|m|h|d)$/;

const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

export function parseDurationMs(input: string | number): number {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) {
      throw new Error(`Niepoprawny czas (liczba ms): ${input}`);
    }
    return input;
  }
  const m = DURATION_RE.exec(input.trim());
  if (!m) {
    throw new Error(
      `Niepoprawny format czasu: "${input}" (oczekiwane np. '30s', '2m', '1h', '500ms', '1d')`,
    );
  }
  return Number(m[1]) * UNIT_MS[m[2]!]!;
}
