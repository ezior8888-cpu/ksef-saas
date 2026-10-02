import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { expect, it, vi } from 'vitest';

it('writes untrusted HTTP headers as inert report data without contacting production', async () => {
  const originalCwd = process.cwd();
  const temporaryRoot = realpathSync(tmpdir());
  const auditDir = mkdtempSync(join(temporaryRoot, 'faktflow-audit-headers-'));
  const reportPath = join(auditDir, 'docs/security/audyt/07-produkcja.md');
  const hostile = `no-store | [open](https://attacker.invalid) <script> \u001b[31m${'x'.repeat(180)}, public, s-maxage=3600`;
  const headerValues = new Map([
    ['cache-control', hostile],
    ['server', hostile],
    ['x-powered-by', 'Next.js'],
    ['content-security-policy', "default-src 'self'"],
  ]);
  const fetchMock = vi.fn(async () => ({
    status: 200,
    headers: { get: (name: string) => headerValues.get(name) ?? null },
  }));
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

  try {
    process.chdir(auditDir);
    vi.stubGlobal('fetch', fetchMock);
    await import('@/scripts/security/audit-headers');
    await vi.waitFor(() => expect(existsSync(reportPath)).toBe(true));

    const report = readFileSync(reportPath, 'utf8');
    const dashboard = report.split('\n').find((line) => line.startsWith('| `/dashboard` |'));
    expect(dashboard).toBeDefined();
    expect(dashboard?.match(/\|/g)).toHaveLength(5);
    expect(report).toContain('no-store &#124; &#91;open&#93;');
    expect(dashboard).toContain('public, s-maxage=3600');
    expect(report).not.toContain('[open](');
    expect(report).not.toContain('https://attacker.invalid');
    expect(report).not.toContain('<script>');
    expect(report).not.toContain('\u001b');
    expect(log.mock.calls.flat().join('\n')).toContain('CSP:');
    expect(log.mock.calls.flat().join('\n')).not.toContain('\u001b');
    expect(fetchMock).toHaveBeenCalled();
  } finally {
    process.chdir(originalCwd);
    vi.unstubAllGlobals();
    log.mockRestore();
    const resolvedAuditDir = realpathSync(auditDir);
    if (!resolvedAuditDir.startsWith(temporaryRoot + sep)) {
      throw new Error('Audit test cleanup escaped the temporary directory');
    }
    rmSync(resolvedAuditDir, { recursive: true, force: true });
  }
});
