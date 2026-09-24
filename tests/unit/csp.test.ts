import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy } from '@/lib/security/csp';

describe('Content Security Policy', () => {
  it('allows only the configured self-hosted Supabase origin and socket', () => {
    const csp = buildContentSecurityPolicy({ production: true, supabaseUrl: 'https://db.example.test/rest/v1' });
    expect(csp).toContain('https://db.example.test wss://db.example.test');
    expect(csp).not.toContain('*.supabase.co');
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain('https://challenges.cloudflare.com');
    expect(csp).toContain('upgrade-insecure-requests');
  });
  it('permits native OAuth and Stripe form redirects to exact known origins', () => {
    const csp = buildContentSecurityPolicy({
      production: true, supabaseUrl: 'https://auth.custom.example.test:8443/rest/v1?ignored=true#ignored',
    });
    const formAction = csp.split('; ').find((directive) => directive.startsWith('form-action '));
    expect(formAction?.split(' ')).toEqual([
      'form-action', "'self'", 'https://accounts.google.com',
      'https://checkout.stripe.com', 'https://billing.stripe.com',
      'https://auth.custom.example.test:8443',
    ]);
    expect(formAction).not.toMatch(/\*|ignored|rest\/v1|wss:/);
  });
  it('does not allow arbitrary form destinations when no Supabase endpoint is configured', () => {
    const csp = buildContentSecurityPolicy({ production: true });
    expect(csp.split('; ').find((directive) => directive.startsWith('form-action ')))
      .toBe("form-action 'self' https://accounts.google.com https://checkout.stripe.com https://billing.stripe.com");
  });
  it('keeps local development HTTP and hot reload usable', () => {
    const csp = buildContentSecurityPolicy({ production: false, supabaseUrl: 'http://127.0.0.1:54321' });
    expect(csp).toContain('ws://127.0.0.1:54321');
    expect(csp).toContain('unsafe-eval');
    expect(csp).not.toContain('upgrade-insecure-requests');
  });
  it.each(['javascript:alert(1)', 'https://user:password@db.example.test'])('rejects an invalid configured source %s', (supabaseUrl) => {
    expect(() => buildContentSecurityPolicy({ production: true, supabaseUrl })).toThrow();
  });
});
