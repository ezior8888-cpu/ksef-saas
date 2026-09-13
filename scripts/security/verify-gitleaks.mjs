import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

// Prawdziwy skaner, wyłącznie syntetyczne dane w nowym tymczasowym repo.
// Nie odczytuje .env ani nie wysyła niczego przez sieć.
const binary = process.argv[2];
if (!binary) throw new Error('Provide the path to the verified Gitleaks binary.');
const config = resolve('.github/gitleaks.toml');
const temporaryRoot = realpathSync(tmpdir());
const fixture = mkdtempSync(join(temporaryRoot, 'faktflow-gitleaks-'));
const repo = join(fixture, 'repo');

function run(command, args, cwd = repo) {
  const result = spawnSync(command, args, {
    cwd, encoding: 'utf8', timeout: 30_000, stdio: 'pipe', windowsHide: true,
  });
  if (result.error || result.signal || result.status === null) {
    throw new Error('Secret scanner verification could not complete.');
  }
  return result;
}
function commit() {
  assert.equal(run('git', ['add', '.']).status, 0);
  assert.equal(run('git', [
    '-c', 'user.name=Security fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=' + join(fixture, 'no-hooks'),
    'commit', '-qm', 'synthetic fixture',
  ]).status, 0);
}
function scan(customConfig = config) {
  return run(binary, [
    'git', repo, '--config', customConfig, '--log-opts=HEAD',
    '--redact=100', '--no-banner', '--no-color', '--log-level=error',
    '--ignore-gitleaks-allow', '--exit-code=1', '--timeout=20',
  ]);
}

try {
  mkdirSync(repo);
  assert.equal(run('git', ['init', '-q']).status, 0);
  writeFileSync(join(repo, 'sample.txt'), 'public documentation\n');
  commit();
  assert.equal(scan().status, 0, 'Clean fixture must pass.');

  // Prefiks i losowa zawartość powstają dopiero w temp, nigdy w historii projektu.
  const syntheticToken = ['ghp', randomBytes(18).toString('hex')].join('_');
  writeFileSync(join(repo, 'sample.txt'), 'access_token=' + syntheticToken + '\n');
  commit();
  const detected = scan();
  assert.equal(detected.status, 1, 'Synthetic token must fail the gate.');
  assert.equal((detected.stdout + detected.stderr).includes(syntheticToken), false,
    'The scanner must not print the synthetic token.');

  // Usunięcie z HEAD nie usuwa sekretu z historii.
  writeFileSync(join(repo, 'sample.txt'), 'public documentation again\n');
  commit();
  assert.equal(scan().status, 1, 'A token removed from HEAD must still be detected.');

  const invalidConfig = join(fixture, 'invalid.toml');
  writeFileSync(invalidConfig, '[invalid');
  assert.notEqual(scan(invalidConfig).status, 0, 'Invalid configuration must fail.');
  console.log('Gitleaks verification passed: clean, leak, historical leak, redaction, invalid config.');
} finally {
  // Kasujemy wyłącznie świeżo utworzoną, zweryfikowaną ścieżkę w katalogu temp.
  const resolvedFixture = realpathSync(fixture);
  if (!resolvedFixture.startsWith(temporaryRoot + sep) || resolvedFixture === temporaryRoot) {
    throw new Error('Refusing to remove an unexpected fixture path.');
  }
  rmSync(resolvedFixture, { recursive: true, force: true });
}
