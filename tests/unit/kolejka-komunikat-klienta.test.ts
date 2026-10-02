import { afterEach, describe, expect, it, vi } from 'vitest';

import { formatJobSendError } from '@/lib/jobs/error-message';

/**
 * AUD-100: przy braku połączenia z kolejką klient dostawał instrukcję dla
 * programisty („ustaw `.env.local`, uruchom worker”). Ta
 * podpowiedź zostaje tylko lokalnie; klient widzi zwykły komunikat.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('komunikat o niedostępnej kolejce', () => {
  it('poza lokalnym dev — bez instrukcji dla programisty', () => {
    vi.stubEnv('NODE_ENV', 'production');

    const message = formatJobSendError(new TypeError('fetch failed'));

    expect(message).not.toMatch(/pnpm|inngest|pg-boss|\.env|DATABASE_URL|127\.0\.0\.1/i);
    expect(message).toMatch(/Spróbuj ponownie/);
  });

  it('błąd połączenia z bazą kolejki (ECONNREFUSED) — ten sam komunikat dla klienta', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(formatJobSendError(new Error('connect ECONNREFUSED 10.0.0.3:5432'))).not.toContain('10.0.0.3');
  });

  it('lokalny dev — podpowiedź jak dotąd', () => {
    vi.stubEnv('NODE_ENV', 'development');

    expect(formatJobSendError(new Error('connect ECONNREFUSED 127.0.0.1:5432'))).toContain('pnpm worker:dev');
  });
});
