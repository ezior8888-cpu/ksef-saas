import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  alertCritical: vi.fn(),
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/alerts/slack', () => ({ alertCritical: mocks.alertCritical }));
vi.mock('@/lib/cache', () => ({ cacheGet: mocks.cacheGet, cacheSet: mocks.cacheSet }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock('@/lib/jobs/events', () => ({ inngest: { createFunction: vi.fn() } }));

import {
  checkBlockedKsefOfflineQueue,
  checkStaleKsefSendingInvoices,
} from '@/lib/jobs/runners/critical-alerts-monitor';

function query(result: { count?: number | null; data?: { deadline: string } | null; error: Error | null }) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    is: vi.fn(() => builder),
    lt: vi.fn(() => builder),
    or: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => result),
    then: (resolve: (value: typeof result) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('KSEF_ENV', 'production');
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-27T12:00:00.000Z'));
  mocks.cacheGet.mockResolvedValue(null);
  mocks.cacheSet.mockResolvedValue(undefined);
  mocks.alertCritical.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('blocked Offline24 environment alert', () => {
  it('alerts on a legacy queued or sending row with nearest deadline, excluding invoice data', async () => {
    const count = query({ count: 1, error: null });
    const nearest = query({ data: { deadline: '2026-09-26T10:00:00Z' }, error: null });
    mocks.from.mockReturnValueOnce(count).mockReturnValueOnce(nearest);
    await expect(checkBlockedKsefOfflineQueue()).resolves.toEqual({
      type: 'offline_environment_blocked', fired: true,
    });
    expect(count.in).toHaveBeenCalledWith('status', ['queued', 'sending']);
    expect(nearest.in).toHaveBeenCalledWith('status', ['queued', 'sending']);
    expect(count.or).toHaveBeenCalledWith('ksef_environment.is.null,ksef_environment.neq.production');
    expect(mocks.cacheSet).toHaveBeenCalledWith(
      'alerts:critical:lastsent:offline_environment_blocked:production',
      expect.any(String), 1800,
    );
    const alert = JSON.stringify(mocks.alertCritical.mock.calls[0]);
    expect(alert).toContain('2026-09-26T10:00:00Z');
    expect(alert).not.toContain('invoice_id');
  });

  it('stays quiet at zero and fails closed on an unknown count', async () => {
    mocks.from.mockReturnValueOnce(query({ count: 0, error: null }))
      .mockReturnValueOnce(query({ data: null, error: null }));
    await expect(checkBlockedKsefOfflineQueue()).resolves.toEqual({
      type: 'offline_environment_blocked', fired: false,
    });
    expect(mocks.alertCritical).not.toHaveBeenCalled();

    mocks.from.mockReturnValueOnce(query({ count: null, error: null }))
      .mockReturnValueOnce(query({ data: null, error: null }));
    await expect(checkBlockedKsefOfflineQueue()).rejects.toThrow('count unavailable');
  });
});

describe('stale KSeF sending invoice alert', () => {
  it('counts old claims and missing timestamps without including invoice identities', async () => {
    const stale = query({ count: 2, error: null });
    const missingClaim = query({ count: 1, error: null });
    mocks.from.mockReturnValueOnce(stale).mockReturnValueOnce(missingClaim);

    await expect(checkStaleKsefSendingInvoices()).resolves.toEqual({
      type: 'stale_ksef_sending_invoices', fired: true,
    });

    expect(mocks.from).toHaveBeenCalledTimes(2);
    expect(mocks.from).toHaveBeenCalledWith('invoices');
    expect(stale.select).toHaveBeenCalledExactlyOnceWith('id', { count: 'exact', head: true });
    expect(stale.eq).toHaveBeenCalledExactlyOnceWith('ksef_status', 'sending');
    expect(stale.lt).toHaveBeenCalledExactlyOnceWith(
      'submitted_to_ksef_at', '2026-09-27T11:45:00.000Z',
    );
    expect(missingClaim.select).toHaveBeenCalledExactlyOnceWith(
      'id', { count: 'exact', head: true },
    );
    expect(missingClaim.eq).toHaveBeenCalledExactlyOnceWith('ksef_status', 'sending');
    expect(missingClaim.is).toHaveBeenCalledExactlyOnceWith('submitted_to_ksef_at', null);
    expect(mocks.cacheSet).toHaveBeenCalledExactlyOnceWith(
      'alerts:critical:lastsent:stale_ksef_sending_invoices',
      '2026-09-27T12:00:00.000Z',
      30 * 60,
    );
    expect(mocks.alertCritical).toHaveBeenCalledOnce();
    expect(mocks.alertCritical.mock.calls[0]?.[2]).toMatchObject({
      fields: [
        { label: 'Faktury > 15 min', value: '2' },
        { label: 'Brak znacznika wysyłki', value: '1' },
        { label: 'Próg', value: '15 min' },
      ],
    });
    const alert = JSON.stringify(mocks.alertCritical.mock.calls[0]);
    expect(alert).toContain('nie ponawiaj wysyłki automatycznie');
    expect(alert).not.toContain('invoice_id');
    expect(alert).not.toContain('tenant_id');
  });

  it('alerts for a sending invoice with no claim timestamp even without old dated claims', async () => {
    mocks.from.mockReturnValueOnce(query({ count: 0, error: null }))
      .mockReturnValueOnce(query({ count: 1, error: null }));

    await expect(checkStaleKsefSendingInvoices()).resolves.toEqual({
      type: 'stale_ksef_sending_invoices', fired: true,
    });
    expect(mocks.alertCritical).toHaveBeenCalledOnce();
    expect(mocks.alertCritical.mock.calls[0]?.[2]).toMatchObject({
      fields: [
        { label: 'Faktury > 15 min', value: '0' },
        { label: 'Brak znacznika wysyłki', value: '1' },
        { label: 'Próg', value: '15 min' },
      ],
    });
  });

  it('stays quiet when none are stale or the alert was recently delivered', async () => {
    mocks.from.mockReturnValueOnce(query({ count: 0, error: null }))
      .mockReturnValueOnce(query({ count: 0, error: null }));
    await expect(checkStaleKsefSendingInvoices()).resolves.toEqual({
      type: 'stale_ksef_sending_invoices', fired: false,
    });
    expect(mocks.cacheGet).not.toHaveBeenCalled();
    expect(mocks.alertCritical).not.toHaveBeenCalled();

    // A historical sending row with no timestamp is enough to trigger the alert.
    mocks.from.mockReturnValueOnce(query({ count: 0, error: null }))
      .mockReturnValueOnce(query({ count: 1, error: null }));
    mocks.cacheGet.mockResolvedValue('already-sent');
    await expect(checkStaleKsefSendingInvoices()).resolves.toEqual({
      type: 'stale_ksef_sending_invoices', fired: false, reason: 'dedup',
    });
    expect(mocks.alertCritical).not.toHaveBeenCalled();
    expect(mocks.cacheSet).not.toHaveBeenCalled();
  });

  it('does not treat an unavailable count as a healthy state', async () => {
    const failure = new Error('database unavailable');
    mocks.from.mockReturnValueOnce(query({ count: 0, error: null }))
      .mockReturnValueOnce(query({ count: null, error: failure }));
    await expect(checkStaleKsefSendingInvoices()).rejects.toBe(failure);

    mocks.from.mockReturnValueOnce(query({ count: null, error: null }))
      .mockReturnValueOnce(query({ count: 0, error: null }));
    await expect(checkStaleKsefSendingInvoices()).rejects.toThrow(
      'Stale KSeF sending invoice counts unavailable',
    );
    expect(mocks.alertCritical).not.toHaveBeenCalled();
  });

  it('leaves dedup unset when Slack delivery fails', async () => {
    mocks.from.mockReturnValueOnce(query({ count: 1, error: null }))
      .mockReturnValueOnce(query({ count: 0, error: null }));
    const failure = new Error('Slack unavailable');
    mocks.alertCritical.mockRejectedValue(failure);

    await expect(checkStaleKsefSendingInvoices()).rejects.toBe(failure);
    expect(mocks.cacheSet).not.toHaveBeenCalled();
  });
});
