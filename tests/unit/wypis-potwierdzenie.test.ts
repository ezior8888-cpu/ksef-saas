import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ unsubscribe: vi.fn() }));
vi.mock('@/lib/email/preferences', () => ({ unsubscribe: mocks.unsubscribe }));

import { GET, POST } from '@/app/api/email/unsubscribe/route';
import { createUnsubscribeToken } from '@/lib/email/unsubscribe-token';

/**
 * AUD-97: link wypisu działał samym GET-em. Skanery poczty i podglądy
 * linków (antywirusy, Outlook Safe Links) otwierają linki z maila same —
 * i wypisywały ludzi bez ich wiedzy. Teraz GET tylko pyta, a wypis robi
 * POST: z formularza na stronie albo „One-Click” klienta poczty (RFC 8058).
 */

const userId = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('EMAIL_UNSUBSCRIBE_SECRET', randomBytes(32).toString('hex'));
  mocks.unsubscribe.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

const url = (token: string) => `https://example.test/api/email/unsubscribe?t=${encodeURIComponent(token)}`;

describe('wypis z maila', () => {
  it('GET z poprawnym linkiem: strona z przyciskiem, bez zapisu', async () => {
    const token = createUnsubscribeToken(userId, 'marketing');

    const res = await GET(new Request(url(token)));
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(mocks.unsubscribe).not.toHaveBeenCalled();
    expect(html).toMatch(/<form method="post"/i);
    expect(html).toContain('name="confirm"');
  });

  it('POST z formularza strony: wypis i strona z potwierdzeniem', async () => {
    const token = createUnsubscribeToken(userId, 'marketing');

    const res = await POST(new Request(url(token), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'confirm=1',
    }));

    expect(mocks.unsubscribe).toHaveBeenCalledExactlyOnceWith({ userId, category: 'marketing', source: 'settings_ui' });
    expect(res.headers.get('content-type')).toContain('text/html');
  });

  it('POST One-Click klienta poczty (RFC 8058): wypis, odpowiedź JSON', async () => {
    const token = createUnsubscribeToken(userId, 'product_updates');

    const res = await POST(new Request(url(token), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
    }));

    expect(mocks.unsubscribe).toHaveBeenCalledExactlyOnceWith({ userId, category: 'product_updates', source: 'one_click' });
    expect(await res.json()).toEqual({ unsubscribed: true });
  });
});
