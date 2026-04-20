/**
 * KSeF w JSON czasem zwraca `status.code` jako string (`"200"`, `"150"`).
 * Ścisłe `code === 200` wtedy nigdy nie jest true → polling nie kończy się
 * na ACCEPTED i użytkownik widzi „Wysyłanie” bez końca (do timeoutu × retry).
 */
export function ksefNumericStatusCode(code: unknown): number {
  if (typeof code === 'number' && Number.isFinite(code)) return code;
  if (typeof code === 'string') {
    const n = Number(code);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}
