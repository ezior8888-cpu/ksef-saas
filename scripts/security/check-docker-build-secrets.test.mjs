import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import test from 'node:test';
import {
  createFixture, extractBuildInstructions, inspectBytes, inspectLayout,
  invalidPolicyMessage, missingTokenMessage, publicValues, verifyBuildResult,
} from './check-docker-build-secrets.mjs';

const syntheticToken = 'unit-test-only-synthetic-token';
const dockerfile = fileURLToPath(new URL('../../Dockerfile', import.meta.url));
const instructions = extractBuildInstructions(readFileSync(dockerfile, 'utf8'));

function temporary(run) {
  const root = mkdtempSync(join(resolve(tmpdir()), 'ksef-build-secret-test-'));
  assert.equal(dirname(resolve(root)), resolve(tmpdir()));
  try { run(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

function layout(root, { configToken = '', layerToken = '' } = {}) {
  mkdirSync(join(root, 'blobs', 'sha256'), { recursive: true });
  writeFileSync(join(root, 'index.json'), JSON.stringify({ manifests: [{ digest: 'synthetic' }] }));
  writeFileSync(join(root, 'blobs', 'sha256', 'provenance'), JSON.stringify({
    predicateType: 'https://slsa.dev/provenance/v0.2', predicate: { buildType: 'https://mobyproject.org/buildkit@v1' },
  }));
  writeFileSync(join(root, 'blobs', 'sha256', 'config'), JSON.stringify({
    config: { Env: [`SENTRY_AUTH_TOKEN=${configToken}`] }, history: [{ created_by: 'synthetic' }],
  }));
  writeFileSync(join(root, 'blobs', 'sha256', 'layer'), gzipSync(`synthetic artifact ${layerToken}`));
}

test('extracts the real build-stage ARG/ENV and complete mounted build RUN only', () => {
  assert.ok(instructions.environment.every((line) => /^(ARG|ENV)\s/.test(line)));
  assert.match(instructions.run, /^RUN --mount=type=secret,id=SENTRY_AUTH_TOKEN,env=SENTRY_AUTH_TOKEN/);
  assert.match(instructions.run, /&& pnpm build$/);
  assert.ok(instructions.publicNames.includes('NEXT_PUBLIC_SUPABASE_URL'));
  assert.ok(instructions.publicNames.includes('SENTRY_AUTH_TOKEN_REQUIRED'));
  assert.ok(instructions.publicNames.includes('SENTRY_RELEASE'));
  assert.equal(instructions.publicNames.includes('SENTRY_AUTH_TOKEN'), false);
  assert.equal(instructions.environment.some((line) => /\bSENTRY_AUTH_TOKEN\b/.test(line)), false);
});

test('rejects missing, ambiguous and modified-after-build stage definitions', () => {
  const source = readFileSync(dockerfile, 'utf8');
  assert.throws(() => extractBuildInstructions('# syntax=docker/dockerfile:1.10\nFROM scratch'), /named build stage/);
  assert.throws(() => extractBuildInstructions(source.replace('&& pnpm build', '&& pnpm something')), /exactly one/);
  assert.throws(() => extractBuildInstructions(source.replace('&& pnpm build', '&& pnpm build\nRUN pnpm build')), /exactly one/);
  assert.throws(() => extractBuildInstructions(source.replace('&& pnpm build', '&& pnpm build\nENV LATE=value')), /environment changed/);
});

test('fixture contains only a stub and Dockerfile; token is absent and real RUN is preserved', () => temporary((root) => {
  createFixture(root, instructions, publicValues(instructions.publicNames), syntheticToken, true);
  assert.deepEqual(readdirSync(root).sort(), ['Dockerfile', 'pnpm']);
  const source = readFileSync(join(root, 'Dockerfile'), 'utf8');
  assert.ok(source.startsWith(instructions.syntax + '\n'));
  assert.ok(source.includes(instructions.run));
  assert.ok(source.includes('RUN test -z "${SENTRY_AUTH_TOKEN:-}"'));
  assert.equal(source.includes('COPY .'), false);
  assert.equal(source.includes(syntheticToken), false);
  assert.equal(readFileSync(join(root, 'pnpm'), 'utf8').includes(syntheticToken), false);
}));

test('negative controls explicitly persist synthetic token through ARG/ENV or an artifact', () => temporary((root) => {
  for (const injection of ['arg-env', 'layer']) {
    const directory = join(root, injection);
    createFixture(directory, instructions, publicValues(instructions.publicNames), syntheticToken, true, injection);
    const source = readFileSync(join(directory, 'Dockerfile'), 'utf8');
    assert.equal(source.includes(syntheticToken), false);
    if (injection === 'arg-env') assert.match(source, /ARG SENTRY_AUTH_TOKEN\nENV SENTRY_AUTH_TOKEN=\$SENTRY_AUTH_TOKEN/);
    else assert.match(source, /printf '%s' "\$SENTRY_AUTH_TOKEN" > \/app\/leaked-token/);
  }
}));

test('scanner detects a canary in raw metadata, uncompressed tar bytes and gzip layers', () => {
  for (const buffer of [Buffer.from(syntheticToken), Buffer.from(`header ${syntheticToken} artifact`), gzipSync(`tar ${syntheticToken}`)]) {
    assert.equal(inspectBytes(buffer, syntheticToken).leaked, true);
  }
  assert.deepEqual(inspectBytes(gzipSync('harmless synthetic artifact'), syntheticToken), { leaked: false, compressed: true });
  assert.throws(() => inspectBytes(Buffer.from([0x1f, 0x8b, 0x01]), syntheticToken));
});

test('layout validates inspected config/history and gzip artifact coverage', () => temporary((root) => {
  layout(root);
  assert.deepEqual(inspectLayout(root, syntheticToken, 'image'), { leaks: [], files: 4, compressed: 1, provenance: 1 });
  rmSync(join(root, 'blobs', 'sha256', 'config'));
  assert.throws(() => inspectLayout(root, syntheticToken, 'image'), /config\/history was not inspected/);
}));

test('image without inspected provenance is rejected', () => temporary((root) => {
  layout(root);
  rmSync(join(root, 'blobs', 'sha256', 'provenance'));
  assert.throws(() => inspectLayout(root, syntheticToken, 'image'), /SLSA provenance was not inspected/);
}));

test('metadata and compressed artifact leaks are separately identified without values', () => temporary((root) => {
  layout(root, { configToken: syntheticToken, layerToken: syntheticToken });
  const image = inspectLayout(root, syntheticToken, 'image');
  assert.deepEqual(image.leaks.sort(), ['image config/history', 'image layer/artifact']);
  const cache = inspectLayout(root, syntheticToken, 'cache');
  assert.ok(cache.leaks.includes('cache layer/artifact'));
  assert.equal(JSON.stringify([image, cache]).includes(syntheticToken), false);
}));

test('required-secret and invalid-policy errors must be executed messages before pnpm runs', () => {
  for (const message of [missingTokenMessage, invalidPolicyMessage]) {
    verifyBuildResult({ status: 1, stdout: `#8 0.124 ${message}\n`, stderr: '' }, syntheticToken, message);
    assert.throws(() => verifyBuildResult({ status: 1, stdout: `#8 RUN echo '${message}'`, stderr: '' }, syntheticToken, message));
    assert.throws(() => verifyBuildResult({ status: 1, stdout: `#8 0.124 ${message}\nSYNTHETIC_BUILD_STUB_RAN`, stderr: '' }, syntheticToken, message), /pnpm build ran/);
  }
});

test('a token in logs fails without including it in the failure message', () => {
  assert.throws(() => verifyBuildResult({ status: 0, stdout: syntheticToken, stderr: '' }, syntheticToken), (error) => {
    assert.match(error.message, /Synthetic token leaked in build logs/);
    assert.equal(error.message.includes(syntheticToken), false);
    return true;
  });
});

test('command failure or missing proof that pnpm ran cannot count as a passing build', () => {
  assert.throws(() => verifyBuildResult({ error: new Error('unavailable'), status: null }, syntheticToken, missingTokenMessage), /Docker\/BuildKit must be available/);
  assert.throws(() => verifyBuildResult({ status: 1, stdout: 'unrelated build failure' }, syntheticToken, missingTokenMessage), /reason other than/);
  assert.throws(() => verifyBuildResult({ status: 0, stdout: '' }, syntheticToken), /pnpm build did not run/);
  verifyBuildResult({ status: 0, stdout: '#7 0.124 SYNTHETIC_BUILD_STUB_RAN\n' }, syntheticToken);
});

test('missing Docker makes the executable fail; it never satisfies a negative control', () => temporary((root) => {
  writeFileSync(join(root, 'Dockerfile'), readFileSync(dockerfile));
  const script = fileURLToPath(new URL('./check-docker-build-secrets.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script], {
    cwd: root, encoding: 'utf8', env: { ...process.env, PATH: '', Path: '' },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Docker build secrets: FAIL/);
  assert.match(result.stderr, /Docker\/BuildKit must be available/);
  assert.doesNotMatch(result.stdout, /PASS/);
}));
