import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { parseOfflineAuditArgs } from './offline-audit-output.mjs';

const scripts = [
  { name: 'audit-service-role.ts', report: '02-service-role' },
  { name: 'inventory-entrypoints.ts', report: '01-powierzchnia' },
];

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'offline-audit-test-'));
  t.after(() => {
    // Delete only the absolute temp directory created by this individual test.
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.match(basename(root), /^offline-audit-test-/);
    rmSync(root, { recursive: true, force: true });
  });
  for (const dir of ['app/api/probe', 'lib', 'supabase/migrations', 'docs/security/audyt']) {
    mkdirSync(join(root, dir), { recursive: true });
  }
  writeFileSync(join(root, 'supabase/migrations/00001.sql'), 'create table invoices (id uuid, tenant_id uuid);');
  writeFileSync(join(root, 'app/api/probe/route.ts'), [
    // The source must be read as text, never imported or executed.
    "throw new Error('Application source was executed');",
    'export async function GET() {',
    '  const admin = createAdminClient();',
    "  return admin.from('invoices').select('*');",
    '}',
  ].join('\n'));
  writeFileSync(join(root, 'proxy.ts'), 'export const config = {};');
  writeFileSync(join(root, '.env.local'), 'OFFLINE_SENTINEL=synthetic-env-never-in-report');
  return root;
}

function run(root, script, args) {
  const path = fileURLToPath(new URL('./' + script, import.meta.url));
  // Do not inherit application credentials or Node preload options.
  const env = process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot } : {};
  const result = spawnSync(process.execPath, [path, ...args], { cwd: root, env, encoding: 'utf8', timeout: 15_000 });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  return result;
}

test('strict CLI rejects omitted, ambiguous, duplicate, unknown and network targets', () => {
  for (const args of [
    [], ['--output-dir'], ['--env', 'private.env'], ['--output-dir', ''],
    ['--output-dir', '  '], ['--output-dir', '--help'], ['--help', '--output-dir', 'out'],
    ['--output-dir', 'out', '--output-dir', 'other'],
    ['--output-dir', 'https://example.invalid/reports'], ['--output-dir', '//server/share'],
    ['--output-dir', String.raw`\\server\share`],
  ]) assert.throws(() => parseOfflineAuditArgs(args));
  assert.equal(parseOfflineAuditArgs(['--output-dir', 'new report directory']), 'new report directory');
  assert.equal(parseOfflineAuditArgs(['--help']), null);
});

for (const { name, report } of scripts) {
  test(name + ': requires explicit output before scanning', (t) => {
    const root = fixture(t);
    const result = run(root, name, []);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /--output-dir/);
    assert.equal(existsSync(join(root, 'docs/security/audyt', report + '.md')), false);
  });

  test(name + ': help has no output side effects and explains exit status', (t) => {
    const root = fixture(t);
    const result = run(root, name, ['--help']);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /nie potwierdzenie braku podatności/);
    assert.equal(existsSync(join(root, 'docs/security/audyt', report + '.json')), false);
  });

  test(name + ': writes a new pair with findings and keeps history intact', (t) => {
    const root = fixture(t);
    const historic = join(root, 'docs/security/audyt', report + '.md');
    writeFileSync(historic, 'historic evidence');
    const output = join(root, 'new reports', 'run');
    const result = run(root, name, ['--output-dir', output]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Kod 0 nie oznacza braku podatności/);
    const jsonText = readFileSync(join(output, report + '.json'), 'utf8');
    const rows = JSON.parse(jsonText);
    assert.ok(rows.length > 0, 'Synthetic entry must actually be scanned');
    assert.ok(rows.some((row) => (row.risk ?? row.ryzyko) !== 'ok'), 'Findings still produce a report, not an uncalibrated CI failure');
    const markdown = readFileSync(join(output, report + '.md'), 'utf8');
    assert.match(markdown, /nie potwierdzonymi podatnościami/);
    assert.doesNotMatch(jsonText + markdown + result.stdout + result.stderr, /synthetic-env-never-in-report/);
    assert.equal(readFileSync(historic, 'utf8'), 'historic evidence');
  });

  test(name + ': refuses the historical directory and descendants after normalizing paths', (t) => {
    const root = fixture(t);
    for (const target of ['docs/security/audyt', 'docs/security/other/../audyt/new']) {
      const result = run(root, name, ['--output-dir', target]);
      assert.equal(result.status, 2, result.stderr);
      assert.match(result.stderr, /historycznego/);
    }
    assert.equal(existsSync(join(root, 'docs/security/audyt/new')), false);
  });

  test(name + ': refuses a junction alias of the historical directory', (t) => {
    const root = fixture(t);
    const alias = join(root, 'history-alias');
    symlinkSync(join(root, 'docs/security/audyt'), alias, process.platform === 'win32' ? 'junction' : 'dir');
    const result = run(root, name, ['--output-dir', join(alias, 'nested')]);
    assert.equal(result.status, 2, result.stderr);
    assert.equal(existsSync(join(root, 'docs/security/audyt/nested')), false);
  });

  test(name + ': preflights the second output before writing the first', (t) => {
    const root = fixture(t);
    const output = join(root, 'reports');
    mkdirSync(output);
    writeFileSync(join(output, report + '.json'), 'previous JSON evidence');
    const result = run(root, name, ['--output-dir', output]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Raport już istnieje/);
    assert.equal(readFileSync(join(output, report + '.json'), 'utf8'), 'previous JSON evidence');
    assert.equal(existsSync(join(output, report + '.md')), false);
  });

  test(name + ': runtime filesystem failure is nonzero and never reports success', (t) => {
    const root = fixture(t);
    const output = join(root, 'occupied-path');
    writeFileSync(output, 'ordinary file');
    const result = run(root, name, ['--output-dir', output]);
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout, /Raport lokalny wygenerowany/);
    assert.equal(readFileSync(output, 'utf8'), 'ordinary file');
  });
}

test('inventory: a layout guard remains context and cannot replace the page data guard', (t) => {
  const root = fixture(t);
  for (const dir of ['app/admin/only-layout', 'app/admin/own-guard']) mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, 'app/admin/layout.tsx'), 'export default async function Layout() { await requireAdmin(); return null; }');
  for (const [dir, guard] of [['only-layout', ''], ['own-guard', 'await requireAdmin();']]) {
    writeFileSync(join(root, 'app/admin', dir, 'page.tsx'), [
      'export default async function Page() {',
      guard,
      'const admin = createAdminClient();',
      "return admin.from('audit_logs').select('*');",
      '}',
    ].join('\n'));
  }
  const output = join(root, 'reports');
  const result = run(root, 'inventory-entrypoints.ts', ['--output-dir', output]);
  assert.equal(result.status, 0, result.stderr);
  const rows = JSON.parse(readFileSync(join(output, '01-powierzchnia.json'), 'utf8'));
  const layoutOnly = rows.find((row) => row.file === 'app/admin/only-layout/page.tsx');
  const ownGuard = rows.find((row) => row.file === 'app/admin/own-guard/page.tsx');
  assert.equal(layoutOnly.layoutGuard, 'requireAdmin');
  assert.equal(layoutOnly.risk, 'do-przejrzenia');
  assert.ok(layoutOnly.flags.some((flag) => flag.startsWith('LAYOUT-BEZ-AUTORYZACJI-DANYCH:')));
  assert.equal(ownGuard.layoutGuard, 'requireAdmin');
  assert.equal(ownGuard.risk, 'ok');
  assert.deepEqual(ownGuard.flags, []);
});

test('inventory: layout context never downgrades stronger cookie or object-id signals', (t) => {
  const root = fixture(t);
  for (const dir of ['app/admin/cookie', 'app/admin/[invoiceId]']) mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, 'app/admin/layout.tsx'), 'export default async function Layout() { await requireAdmin(); return null; }');
  for (const [dir, input] of [['cookie', 'const tenantId = await getActiveOrgIdFromCookies();'], ['[invoiceId]', '']]) {
    writeFileSync(join(root, 'app/admin', dir, 'page.tsx'), [
      'export default async function Page() {',
      input,
      'const admin = createAdminClient();',
      "return admin.from('invoices').select('*');",
      '}',
    ].join('\n'));
  }
  const output = join(root, 'reports');
  const result = run(root, 'inventory-entrypoints.ts', ['--output-dir', output]);
  assert.equal(result.status, 0, result.stderr);
  const rows = JSON.parse(readFileSync(join(output, '01-powierzchnia.json'), 'utf8'));
  const cookiePage = rows.find((row) => row.file === 'app/admin/cookie/page.tsx');
  const dynamicPage = rows.find((row) => row.file === 'app/admin/[invoiceId]/page.tsx');
  assert.equal(cookiePage.risk, 'krytyczne');
  assert.equal(dynamicPage.risk, 'wysokie');
  for (const row of [cookiePage, dynamicPage]) {
    assert.ok(row.flags.some((flag) => flag.startsWith('LAYOUT-BEZ-AUTORYZACJI-DANYCH:')));
  }
});

test('inventory: a server action does not inherit authorization from an admin layout', (t) => {
  const root = fixture(t);
  mkdirSync(join(root, 'app/admin'), { recursive: true });
  writeFileSync(join(root, 'app/admin/layout.tsx'), 'export default async function Layout() { await requireAdmin(); return null; }');
  writeFileSync(join(root, 'app/admin/actions.ts'), [
    "'use server';",
    'export async function readAudit() {',
    'const admin = createAdminClient();',
    "return admin.from('audit_logs').select('*');",
    '}',
  ].join('\n'));
  const output = join(root, 'reports');
  const result = run(root, 'inventory-entrypoints.ts', ['--output-dir', output]);
  assert.equal(result.status, 0, result.stderr);
  const rows = JSON.parse(readFileSync(join(output, '01-powierzchnia.json'), 'utf8'));
  const action = rows.find((row) => row.file === 'app/admin/actions.ts');
  assert.equal(action.layoutGuard, null);
  assert.equal(action.risk, 'krytyczne');
  assert.ok(action.flags.some((flag) => flag.startsWith('OMIJA-RLS-BEZ-STRAŻNIKA:')));
  assert.ok(!action.flags.some((flag) => flag.startsWith('LAYOUT-BEZ-AUTORYZACJI-DANYCH:')));
});
