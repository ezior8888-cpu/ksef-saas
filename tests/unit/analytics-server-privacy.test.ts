import { beforeEach, describe, expect, it, vi } from 'vitest';

import { identifyServer, trackServer } from '@/lib/analytics/server';
import { ANALYTICS_EVENTS, type AnalyticsEventName } from '@/lib/analytics/events';

const sdk = vi.hoisted(() => ({ capture: vi.fn(), identify: vi.fn(), flush: vi.fn() }));
const client = vi.hoisted(() => vi.fn());
vi.mock('@/lib/analytics/posthog-node-client', () => ({ getPostHogNodeClient: client }));

const USER_ID = '00000000-0000-4000-8000-000000000001';
const TENANT_ID = '00000000-0000-4000-8000-000000000002';

beforeEach(() => {
  vi.clearAllMocks();
  client.mockReturnValue(sdk);
  sdk.flush.mockResolvedValue(undefined);
});

describe('server analytics data minimization', () => {
  it('drops personal data and arbitrary properties but retains reviewed metrics', async () => {
    await trackServer({
      distinctId: USER_ID,
      event: ANALYTICS_EVENTS.signupCompleted,
      properties: {
        method: 'password', count: 3, duration_ms: 150, status: 'active',
        tenant_id: TENANT_ID, note: 'Jan Kowalski', invoice_number: 'PRIVATE/2026',
        $current_url: '/accountant/private-token?email=private@example.invalid',
      },
      setPersonProperties: { email: 'private@example.invalid', first_name: 'Jan', plan: 'trial', phone: '500600700' },
    });
    expect(sdk.capture).toHaveBeenCalledWith({
      distinctId: USER_ID,
      event: 'signup_completed',
      properties: {
        method: 'password', count: 3, duration_ms: 150, status: 'active',
        tenant_id: TENANT_ID, $current_url: '/accountant/[redacted]',
      },
      $set: { plan: 'trial' },
    });
    expect(JSON.stringify(sdk.capture.mock.calls)).not.toMatch(/private|Kowalski|500600700|PRIVATE/);
    expect(sdk.flush).toHaveBeenCalledTimes(1);
  });

  it('filters identify properties with the same policy', async () => {
    await identifyServer(USER_ID, {
      email: 'private@example.invalid', first_name: 'Jan', address: 'Private street',
      plan: 'active', tenant_id: TENANT_ID,
    });
    expect(sdk.identify).toHaveBeenCalledWith({ distinctId: USER_ID, properties: { plan: 'active', tenant_id: TENANT_ID } });
  });

  it.each(['private@example.invalid', 'Jan Kowalski', '1234567890', ''])('does not send an unsafe distinct ID: %s', async (distinctId) => {
    await trackServer({ distinctId, event: ANALYTICS_EVENTS.signupCompleted });
    await identifyServer(distinctId, { plan: 'active' });
    expect(client).not.toHaveBeenCalled();
    expect(sdk.capture).not.toHaveBeenCalled();
    expect(sdk.identify).not.toHaveBeenCalled();
  });

  it('does not accept personal data as an event name from an untyped caller', async () => {
    await trackServer({ distinctId: USER_ID, event: 'private@example.invalid' as AnalyticsEventName });
    expect(sdk.capture).not.toHaveBeenCalled();
  });

  it('does not make business actions fail when analytics is absent', async () => {
    client.mockReturnValue(null);
    await expect(trackServer({ distinctId: USER_ID, event: ANALYTICS_EVENTS.signupCompleted })).resolves.toBeUndefined();
    await expect(identifyServer(USER_ID, { plan: 'active' })).resolves.toBeUndefined();
  });
});
