import { isLocalDevEnv } from '@/lib/security/environment';

/**
 * Inngest SDK używa `fetch()` — przy braku serwera (np. dev na :8288)
 * Node zwraca krótkie `TypeError: fetch failed` bez kontekstu.
 *
 * Instrukcja dla programisty (`pnpm inngest:dev`, `.env.local`) tylko
 * lokalnie — do 02.10 dostawał ją klient (AUD-100). Na produkcji kolejką
 * jest pg-boss, a klient ma wiedzieć jedno: spróbować ponownie.
 */
export function formatInngestSendError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const t = raw.toLowerCase();

  const looksLikeNetwork =
    raw === 'fetch failed' ||
    t.includes('fetch failed') ||
    t.includes('econnrefused') ||
    t.includes('socket hang up') ||
    t.includes('network request failed');

  if (looksLikeNetwork) {
    if (!isLocalDevEnv()) {
      return 'Nie udało się przekazać zadania do realizacji. Spróbuj ponownie za chwilę.';
    }
    return (
      'Brak połączenia z serwerem Inngest. W trybie lokalnym uruchom w osobnym ' +
      'terminalu `pnpm inngest:dev` (nasłuch zwykle na http://127.0.0.1:8288) ' +
      'i ustaw w `.env.local` zmienną `INNGEST_DEV=1`. ' +
      'Bez działającego Inngest kolejka wysyłki do KSeF się nie uruchomi.'
    );
  }

  return raw;
}
