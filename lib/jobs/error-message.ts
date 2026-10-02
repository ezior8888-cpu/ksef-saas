import { isLocalDevEnv } from '@/lib/security/environment';

/**
 * Błąd przekazania zadania do kolejki (pg-boss w naszym Postgresie).
 *
 * Instrukcja dla programisty tylko lokalnie — do 02.10 dostawał ją klient
 * (AUD-100). Klient ma wiedzieć jedno: spróbować ponownie. Adresów i nazw
 * hostów z komunikatu sterownika nie pokazujemy nigdy.
 */
export function formatJobSendError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const t = raw.toLowerCase();

  const looksLikeConnection =
    t.includes('fetch failed') ||
    t.includes('econnrefused') ||
    t.includes('enotfound') ||
    t.includes('socket hang up') ||
    t.includes('connection terminated') ||
    t.includes('database_url') ||
    t.includes('network request failed');

  if (looksLikeConnection) {
    if (!isLocalDevEnv()) {
      return 'Nie udało się przekazać zadania do realizacji. Spróbuj ponownie za chwilę.';
    }
    return (
      'Brak połączenia z kolejką zadań (pg-boss). Lokalnie ustaw w `.env.local` ' +
      '`DATABASE_URL` do bazy z kolejką i uruchom worker: `pnpm worker:dev`. ' +
      'Bez niego wysyłka do KSeF się nie wykona.'
    );
  }

  return raw;
}
