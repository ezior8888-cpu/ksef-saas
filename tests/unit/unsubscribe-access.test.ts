import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ unsubscribe: vi.fn() }));
vi.mock('@/lib/email/preferences', () => ({ unsubscribe: mocks.unsubscribe }));

import { GET, POST } from '@/app/api/email/unsubscribe/route';
import { createUnsubscribeToken } from '@/lib/email/unsubscribe-token';

const userId = '11111111-1111-4111-8111-111111111111';
const otherUserId = '22222222-2222-4222-8222-222222222222';
const secret = randomBytes(32).toString('hex');

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('EMAIL_UNSUBSCRIBE_SECRET', secret);
  mocks.unsubscribe.mockResolvedValue(undefined);
});
afterEach(() => { vi.unstubAllEnvs(); });

describe.each([
  { method: 'GET', handler: GET, source: 'settings_ui' },
  { method: 'POST', handler: POST, source: 'one_click' },
])('unsubscribe $method authorization', ({ method, handler, source }) => {
  const request = (token?: string) => {
    const url = new URL('https://example.test/api/email/unsubscribe');
    if (token !== undefined) url.searchParams.set('t', token);
    // Identifiers outside the signed payload must not grant access.
    url.searchParams.set('userId', otherUserId);
    url.searchParams.set('category', 'transactional');
    return new Request(url, { method });
  };

  it.each([undefined, '', 'malformed.token'])('does not write preferences for absent or invalid token %s', async (token) => {
    await handler(request(token));
    expect(mocks.unsubscribe).not.toHaveBeenCalled();
  });

  it('rejects a changed signed user even when the token looks structurally valid', async () => {
    const [payload, signature] = createUnsubscribeToken(userId, 'marketing').split('.');
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    decoded.userId = otherUserId;
    const changed = Buffer.from(JSON.stringify(decoded)).toString('base64url') + '.' + signature;

    await handler(request(changed));
    expect(mocks.unsubscribe).not.toHaveBeenCalled();
  });

  it('rejects an expired correctly signed token', async () => {
    await handler(request(createUnsubscribeToken(userId, 'marketing', -1)));
    expect(mocks.unsubscribe).not.toHaveBeenCalled();
  });

  it('fails closed when the signing secret is unavailable', async () => {
    const token = createUnsubscribeToken(userId, 'marketing');
    vi.stubEnv('EMAIL_UNSUBSCRIBE_SECRET', '');
    await handler(request(token));
    expect(mocks.unsubscribe).not.toHaveBeenCalled();
  });

  it('uses only identity and category from the verified signature', async () => {
    const response = await handler(request(createUnsubscribeToken(userId, 'marketing')));
    expect(response.status).toBe(200);
    expect(mocks.unsubscribe).toHaveBeenCalledExactlyOnceWith({ userId, category: 'marketing', source });
  });
});
