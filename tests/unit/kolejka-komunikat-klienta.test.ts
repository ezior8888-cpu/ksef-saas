import { afterEach, describe, expect, it, vi } from 'vitest';

import { formatInngestSendError } from '@/lib/inngest/error-message';

/**
 * AUD-100: przy braku połączenia z kolejką klient dostawał instrukcję dla
 * programisty („uruchom `pnpm inngest:dev`, ustaw `.env.local`”). Ta
 * podpowiedź zostaje tylko lokalnie; klient widzi zwykły komunikat.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('komunikat o niedostępnej kolejce', () => {
  it('poza lokalnym dev — bez instrukcji dla programisty', () => {
    vi.stubEnv('NODE_ENV', 'production');

    const message = formatInngestSendError(new TypeError('fetch failed'));

    expect(message).not.toMatch(/pnpm|inngest|\.env|127\.0\.0\.1/i);
    expect(message).toMatch(/Spróbuj ponownie/);
  });

  it('błąd połączenia z bazą kolejki (ECONNREFUSED) — ten sam komunikat dla klienta', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(formatInngestSendError(new Error('connect ECONNREFUSED 10.0.0.3:5432'))).not.toContain('10.0.0.3');
  });

  it('lokalny dev — podpowiedź jak dotąd', () => {
    vi.stubEnv('NODE_ENV', 'development');

    expect(formatInngestSendError(new TypeError('fetch failed'))).toContain('pnpm inngest:dev');
  });
});
