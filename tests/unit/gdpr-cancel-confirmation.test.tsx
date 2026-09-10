import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GdprCancelPage from '@/app/(auth)/gdpr/cancel/page';
import { cancelGdprDeletionAction } from '@/app/(auth)/gdpr/cancel/actions';

const mocks = vi.hoisted(() => ({ cancelGdprRequest: vi.fn(), logAudit: vi.fn() }));
vi.mock('@/lib/gdpr/deletion', () => ({ cancelGdprRequest: mocks.cancelGdprRequest }));
vi.mock('@/lib/audit/log', () => ({ logAudit: mocks.logAudit }));
const token = 'ab'.repeat(32);
const form = (value = token) => { const data = new FormData(); data.set('token', value); return data; };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.cancelGdprRequest.mockResolvedValue({ ok: true, requestId: 'request-1', userEmail: 'private@example.test' });
  mocks.logAudit.mockResolvedValue(undefined);
});

describe('GDPR cancellation confirmation', () => {
  it('a GET mail link only renders a form and does not reveal email or mutate the request', async () => {
    const markup = renderToStaticMarkup(await GdprCancelPage({ searchParams: Promise.resolve({ token }) }));
    expect(markup).toContain('<form');
    expect(markup).toContain('Zachowaj moje konto');
    expect(markup).not.toContain('private@example.test');
    expect(mocks.cancelGdprRequest).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('a forged outcome=canceled query never displays successful cancellation', async () => {
    for (const params of [{ outcome: 'canceled' }, { token, outcome: 'canceled' }]) {
      const markup = renderToStaticMarkup(await GdprCancelPage({ searchParams: Promise.resolve(params) }));
      expect(markup).not.toContain('zostało anulowane');
      expect(markup).not.toContain('konto pozostaje aktywne');
    }
    expect(mocks.cancelGdprRequest).not.toHaveBeenCalled();
  });

  it('invalid GET links do not render a cancellation form', async () => {
    const markup = renderToStaticMarkup(await GdprCancelPage({ searchParams: Promise.resolve({ token: 'invalid' }) }));
    expect(markup).not.toContain('<form');
    expect(mocks.cancelGdprRequest).not.toHaveBeenCalled();
  });

  it('only an explicit successful POST returns the success state without token or email', async () => {
    expect(await cancelGdprDeletionAction({ outcome: 'idle' }, form())).toEqual({ outcome: 'canceled' });
    expect(mocks.cancelGdprRequest).toHaveBeenCalledWith(token, 'user_confirmed_cancel');
    expect(mocks.logAudit.mock.calls[0][0].metadata.request_id).toBe('request-1');
    expect(JSON.stringify(mocks.logAudit.mock.calls)).not.toContain(token);
    expect(JSON.stringify(mocks.logAudit.mock.calls)).not.toContain('private@example.test');
  });

  it('a forged previous success state cannot authorize an invalid token or a rejected cancellation', async () => {
    expect(await cancelGdprDeletionAction({ outcome: 'canceled' }, form('invalid'))).toEqual({ outcome: 'invalid' });
    expect(mocks.cancelGdprRequest).not.toHaveBeenCalled();
    mocks.cancelGdprRequest.mockResolvedValue({ ok: false });
    expect(await cancelGdprDeletionAction({ outcome: 'canceled' }, form())).toEqual({ outcome: 'invalid' });
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('a database error returns a neutral failure state without reflecting backend content', async () => {
    mocks.cancelGdprRequest.mockRejectedValue(new Error('private database details'));
    expect(await cancelGdprDeletionAction({ outcome: 'idle' }, form())).toEqual({ outcome: 'failed' });
  });
});
