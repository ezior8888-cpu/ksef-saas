import { describe, expect, it } from 'vitest';
import { scrubBreadcrumb, scrubTelemetry, sentryPrivacyOptions } from '@/lib/observability/scrub';

describe('telemetry privacy', () => {
  it('removes request payloads, all headers and user PII without mutating the source', () => {
    const source = {
      request: { url: 'https://app.example.test/gdpr/cancel?token=secret-value', headers: { Authorization: 'Bearer session', 'x-other-secret': 'secret' }, cookies: 'session', data: { invoice: 'private invoice' }, method: 'POST' },
      user: { id: 'user-1', email: 'client@example.test', ip_address: '127.0.0.1', username: 'Private Name' },
      extra: { access_token: 'secret', nested: { password: 'secret', apiKey: 'secret' } },
    };
    const clean = scrubTelemetry(source);
    expect(clean.request).toEqual({ url: 'https://app.example.test/gdpr/cancel?'+ '[REDACTED]', method: 'POST' });
    expect(clean.user).toEqual({ id: 'user-1' });
    expect(JSON.stringify(clean)).not.toMatch(/secret|private invoice|client@example|Private Name/);
    expect(source.request.headers.Authorization).toBe('Bearer session');
  });

  it.each([
    '/accountant/portal-secret/download/invoice-id',
    '/invite/portal-secret',
    'https://app.example.test/accountant/portal-secret',
    'GET /accountant/portal-secret?download=1',
    '/auth/callback#access_token=portal-secret',
    'https://storage.example.test/a?X-Amz-Signature=portal-secret',
    'https://app.example.test/login?next=%2Faccountant%2Fportal-secret',
  ])('cleans capability URLs in all nested transports: %s', (url) => {
    const clean = sentryPrivacyOptions.beforeSendTransaction({
      request: { url }, transaction: url,
      spans: [{ description: url, data: { 'http.url': url } }],
      breadcrumbs: [{ data: { from: url, to: url } }],
      exception: { values: [{ value: 'Failed: '+url }] },
    });
    expect(JSON.stringify(clean)).not.toContain('portal-secret');
    expect(JSON.stringify(clean)).toContain('[REDACTED]');
  });

  it('cleans span fields, query parameters, credentials and SQL text', () => {
    const clean = sentryPrivacyOptions.beforeSendSpan({
      data: { 'db.statement': "SELECT * WHERE email = 'private'", 'db.query.text': 'sensitive SQL', query_string: 'token=private', credentials: { key: 'secret' } },
      description: 'Bearer a-live-session-token',
    });
    expect(JSON.stringify(clean)).not.toMatch(/private|sensitive SQL|secret|a-live-session/);
  });

  it('strips user info in URL authorities and inline email addresses', () => {
    expect(scrubTelemetry('Failed https://user:pass@db.example.test/rest for client@example.test'))
      .not.toMatch(/user:pass|client@example/);
  });

  it('does not export console or DOM breadcrumbs, nor automatic logs', () => {
    expect(scrubBreadcrumb({ category: 'console', message: 'Invoice for Private Name' })).toBeNull();
    expect(scrubBreadcrumb({ category: 'ui.click', message: 'Private Name' })).toBeNull();
    expect(sentryPrivacyOptions.enableLogs).toBe(false);
    expect(sentryPrivacyOptions.beforeSendLog()).toBeNull();
    expect(scrubBreadcrumb({ category: 'navigation', data: { to: '/accountant/secret' } })?.data?.to)
      .toBe('/accountant/[REDACTED]');
  });

  it('handles cycles and keeps diagnostics without sensitive content', () => {
    const data: Record<string, unknown> = { event_id: 'event-123', status: 500 };
    data.self = data;
    expect(scrubTelemetry(data)).toEqual({ event_id: 'event-123', status: 500, self: '[REDACTED]' });
  });
});
