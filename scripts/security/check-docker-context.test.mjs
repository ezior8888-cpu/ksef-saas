import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createFixture, privatePaths, readPolicy, requiredPaths, verifyExport } from './check-docker-context.mjs';

function temporary(run) {
  const root = mkdtempSync(join(resolve(tmpdir()), 'ksef-docker-context-test-'));
  assert.equal(dirname(resolve(root)), resolve(tmpdir()));
  try { run(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

function validExport(root) {
  for (const name of requiredPaths) {
    const target = join(root, 'app', name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, 'SYNTHETIC-DOCKER-CONTEXT-CANARY\n');
  }
}

test('fixture contains synthetic private files at root and two nested levels', () => temporary((root) => {
  createFixture(root, '**/.agents\n');
  for (const name of [...privatePaths, ...requiredPaths]) {
    assert.equal(readFileSync(join(root, name), 'utf8'), 'SYNTHETIC-DOCKER-CONTEXT-CANARY\n');
  }
  assert.equal(readFileSync(join(root, 'Dockerfile'), 'utf8'), 'FROM scratch\nCOPY . /app\n');
}));

test('validator accepts retained runtime assets and absent private files', () => temporary((root) => {
  validExport(root);
  verifyExport(root);
}));

test('validator rejects every leaked private canary, including nested files', () => temporary((root) => {
  validExport(root);
  for (const name of privatePaths) {
    const target = join(root, 'app', name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, 'SYNTHETIC-DOCKER-CONTEXT-CANARY\n');
    assert.throws(() => verifyExport(root), /Private synthetic path entered context/);
    rmSync(target);
  }
}));

test('validator rejects exclusion of runtime schema/font/help files', () => temporary((root) => {
  for (const name of requiredPaths) {
    validExport(root);
    rmSync(join(root, 'app', name));
    assert.throws(() => verifyExport(root));
  }
}));

test('production Dockerfile override cannot silently bypass the checked policy', () => temporary((root) => {
  writeFileSync(join(root, '.dockerignore'), '**/.agents\n');
  assert.equal(readPolicy(root), '**/.agents\n');
  writeFileSync(join(root, 'Dockerfile.dockerignore'), '');
  assert.throws(() => readPolicy(root), /overrides the root policy/);
}));

test('missing Docker is a failure, never a skipped or successful check', () => temporary((root) => {
  writeFileSync(join(root, '.dockerignore'), '**/.agents\n');
  const script = fileURLToPath(new URL('./check-docker-context.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script], {
    cwd: root, encoding: 'utf8', env: { ...process.env, PATH: '', Path: '' },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Docker context: FAIL/);
  assert.equal(existsSync(join(root, 'app')), false);
}));
