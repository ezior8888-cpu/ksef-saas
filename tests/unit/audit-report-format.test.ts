import { describe, expect, it } from 'vitest';

import { formatUntrustedHeader } from '@/scripts/security/audit-report-format.js';

describe('audit report HTTP header formatting', () => {
  it('keeps an untrusted header inside one Markdown table cell', () => {
    const hostile = 'public | [open](https://attacker.invalid) <img src=x> `code`';
    const formatted = formatUntrustedHeader(hostile);

    expect(formatted).toContain('public &#124; &#91;open&#93;');
    expect(formatted).toContain('&#60;img src=x&#62;');
    expect(formatted).not.toContain('|');
    expect(formatted).not.toContain('[open](');
    expect(formatted).not.toContain('https://attacker.invalid');
    expect(formatted).not.toContain('<img');
  });

  it('removes control and bidi characters and limits the report value', () => {
    expect(formatUntrustedHeader('ok\n# forged row\u001b[31m\u202e', 11))
      .toBe('ok &#35; forged…');
    expect(formatUntrustedHeader('no-store')).toBe('no-store');
  });

  it('preserves late unsafe Cache-Control directives when no display limit is requested', () => {
    const cacheControl = `max-age=0, extension=${'x'.repeat(145)}, public, s-maxage=3600`;

    expect(formatUntrustedHeader(cacheControl)).toContain('public, s-maxage=3600');
    expect(formatUntrustedHeader(cacheControl, 160)).not.toContain('s-maxage=3600');
  });
});
