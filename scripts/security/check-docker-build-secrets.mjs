#!/usr/bin/env node
// CYB-DOCKER-BUILD-SECRETS: only synthetic files enter Docker; never use the repo context.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import { gunzipSync } from 'node:zlib';

const tokenName = 'SENTRY_AUTH_TOKEN';
const stubMarker = 'SYNTHETIC_BUILD_STUB_RAN';
export const missingTokenMessage = 'SENTRY_AUTH_TOKEN_REQUIRED=1 requires the SENTRY_AUTH_TOKEN BuildKit secret';
export const invalidPolicyMessage = 'SENTRY_AUTH_TOKEN_REQUIRED must be 0 or 1';

// Preserve complete real instructions, including RUN mounts and shell validation.
export function extractBuildInstructions(source) {
  const syntax = source.match(/^#\s*syntax=docker\/dockerfile:[^\s]+\s*$/m)?.[0].trim();
  assert.ok(syntax, 'Dockerfile syntax directive is required');
  const instructions = source.replace(/\r\n/g, '\n').replace(/\\\n\s*/g, ' ')
    .split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
  const start = instructions.findIndex((line) => /^FROM\s+.+\s+AS\s+build$/i.test(line));
  assert.ok(start >= 0, 'Dockerfile must contain a named build stage');
  const next = instructions.findIndex((line, index) => index > start && /^FROM\s/i.test(line));
  const stage = instructions.slice(start + 1, next < 0 ? undefined : next);
  const runs = stage.filter((line) => /^RUN\s/i.test(line) && /\bpnpm\s+build\b/.test(line));
  assert.equal(runs.length, 1, 'Expected exactly one pnpm build instruction');
  const buildIndex = stage.indexOf(runs[0]);
  assert.ok(!stage.slice(buildIndex + 1).some((line) => /^(ARG|ENV)\s/i.test(line)),
    'Build environment changed after pnpm build; extend the fixture');
  const environment = stage.filter((line) => /^(ARG|ENV)\s/i.test(line));
  const publicNames = environment.flatMap((line) => {
    const match = /^ARG\s+([A-Z_][A-Z0-9_]*)(?:=|$)/.exec(line);
    return match && /^(NEXT_PUBLIC_|SENTRY_(ORG$|PROJECT$|URL$|RELEASE$|AUTH_TOKEN_REQUIRED$))/.test(match[1]) ? [match[1]] : [];
  });
  assert.ok(publicNames.includes('NEXT_PUBLIC_SUPABASE_URL'), 'Public build arguments are missing');
  assert.ok(publicNames.includes('SENTRY_AUTH_TOKEN_REQUIRED'), 'Upload policy build argument is missing');
  return { syntax, environment, run: runs[0], publicNames };
}

export function publicValues(names, required = '1') {
  return Object.fromEntries(names.map((name) => [name,
    name === 'SENTRY_AUTH_TOKEN_REQUIRED' ? required : `synthetic-public-${name.toLowerCase()}`]));
}

export function createFixture(context, instructions, values, token, expectToken, injection) {
  mkdirSync(context, { recursive: true });
  const digest = createHash('sha256').update(token).digest('hex');
  // The expected token is represented by a digest only. The token file stays OUTSIDE context.
  const stub = `#!/usr/bin/env node
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { mkdirSync, writeFileSync } = require('node:fs');
assert.deepEqual(process.argv.slice(2), ['build'], 'Unexpected build command');
const expected = ${JSON.stringify(values)};
for (const [name, value] of Object.entries(expected)) {
  if (process.env[name] !== value) throw new Error('Synthetic public variable mismatch: ' + name);
}
const present = Boolean(process.env.SENTRY_AUTH_TOKEN);
if (present !== ${expectToken}) throw new Error('Synthetic token presence mismatch');
if (present && createHash('sha256').update(process.env.SENTRY_AUTH_TOKEN).digest('hex') !== '${digest}') {
  throw new Error('Synthetic token digest mismatch');
}
mkdirSync('/app/.next/standalone', { recursive: true });
writeFileSync('/app/.next/standalone/server.js', '// synthetic build artifact\\n');
console.log('${stubMarker}');
`;
  let run = instructions.run;
  let environment = [...instructions.environment];
  if (injection === 'arg-env') environment.push(`ARG ${tokenName}`, `ENV ${tokenName}=$${tokenName}`);
  if (injection === 'layer') run += ` && printf '%s' "$${tokenName}" > /app/leaked-token`;
  assert.ok(!injection || ['arg-env', 'layer'].includes(injection), 'Unknown fault injection');
  writeFileSync(join(context, 'pnpm'), stub);
  writeFileSync(join(context, 'Dockerfile'), [
    instructions.syntax, 'FROM node:22-slim AS build', 'WORKDIR /app',
    'COPY --chmod=755 pnpm /usr/local/bin/pnpm', ...environment, run,
    ...(injection === 'arg-env' ? [] : [
      'RUN test -z "${SENTRY_AUTH_TOKEN:-}" || (echo "Synthetic token survived into later RUN" >&2; exit 1)',
    ]), '',
  ].join('\n'));
}

// Both OCI layers and mode=max cache blobs use gzip, explicitly requested from BuildKit.
// Scanning decompressed tar bytes covers file contents, paths and deleted intermediate files.
export function inspectBytes(buffer, token) {
  const compressed = buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
  const content = compressed ? gunzipSync(buffer) : buffer;
  return { leaked: buffer.includes(token) || content.includes(token), compressed };
}

export function inspectLayout(root, token, scope) {
  const leaks = new Set();
  let files = 0;
  let compressed = 0;
  let configurations = 0;
  let provenance = 0;
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      assert.equal(entry.isSymbolicLink(), false, 'Unexpected symlink in OCI layout');
      if (entry.isDirectory()) { visit(path); continue; }
      assert.ok(entry.isFile(), 'Unexpected file type in OCI layout');
      const buffer = readFileSync(path);
      const result = inspectBytes(buffer, token);
      files += 1;
      if (result.compressed) compressed += 1;
      let config = false;
      let attestation = false;
      if (buffer[0] === 0x7b) {
        const metadata = JSON.parse(buffer.toString('utf8'));
        config = Boolean(metadata.config && Array.isArray(metadata.history));
        if (config) configurations += 1;
        attestation = typeof metadata.predicateType === 'string'
          && metadata.predicateType.startsWith('https://slsa.dev/provenance/')
          && Boolean(metadata.predicate?.buildType || metadata.predicate?.buildDefinition?.buildType);
        if (attestation) provenance += 1;
      }
      if (result.leaked) leaks.add(config ? `${scope} config/history` : attestation ? `${scope} provenance` : `${scope} layer/artifact`);
    }
  }
  const index = JSON.parse(readFileSync(join(root, 'index.json'), 'utf8'));
  assert.ok(Array.isArray(index.manifests) && index.manifests.length, 'OCI layout has no manifest');
  visit(root);
  assert.ok(compressed > 0, `${scope} has no inspected gzip layers`);
  if (scope === 'image') {
    assert.ok(configurations > 0, 'Image config/history was not inspected');
    assert.ok(provenance > 0, 'Image SLSA provenance was not inspected');
  }
  return { leaks: [...leaks], files, compressed, provenance };
}

// Diagnostics contain only output from our synthetic context. Redact before truncating,
// so a token crossing the tail boundary cannot escape as a partially visible value.
export function buildDiagnostic(result, token, scenario = 'unknown') {
  const clean = (value) => stripVTControlCharacters(String(value))
    .replace(/\r\n?/g, '\n')
    .replace(/\p{Cc}/gu, (character) => ['\n', '\t'].includes(character) ? character : '')
    .replaceAll(token, '[synthetic-token-redacted]');
  const output = clean(`${result.stdout ?? ''}\n${result.stderr ?? ''}\n${result.error?.message ?? ''}`);
  const executed = output.split('\n').filter((line) => /^#\d+ [\d.]+ /.test(line));
  const errors = executed.filter((line) => /\b(?:[A-Za-z]*Error|ERROR):/.test(line))
    .slice(0, 2).map((line) => line.slice(0, 600)).join('\n');
  const priority = executed.length
    ? `Executed build output:\n${errors}\n${executed.join('\n').slice(0, 1800)}\nLog tail:\n`
    : '';
  const bounded = priority + output.slice(-(4000 - priority.length));
  const name = clean(scenario).replace(/\s/g, ' ').slice(0, 80);
  const status = clean(result.status ?? 'unavailable').slice(0, 20);
  const signal = clean(result.signal ?? 'none').slice(0, 20);
  return `Scenario: ${name}; status: ${status}; signal: ${signal}\n${bounded}`;
}

export function verifyBuildResult(result, token, guardMessage, scenario) {
  const diagnostic = buildDiagnostic(result, token, scenario);
  const requireResult = (condition, message) => {
    if (!condition) throw new Error(`${message}\n${diagnostic}`);
  };
  requireResult(!result.error, 'Docker/BuildKit must be available; command did not complete');
  const logs = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  requireResult(!logs.includes(token), 'Synthetic token leaked in build logs');
  if (guardMessage) {
    requireResult(result.status !== 0, 'Required upload unexpectedly succeeded without its secret');
    // Match an executed shell message, not merely the RUN command echoed by BuildKit.
    const message = guardMessage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    requireResult(new RegExp(`(?:^|\\n)(?:#\\d+ [\\d.]+ )?${message}(?:\\r?\\n|$)`).test(logs),
      'Build failed for a reason other than the required-secret guard');
    requireResult(!logs.includes(stubMarker), 'pnpm build ran without its required secret');
  } else {
    requireResult(result.status === 0, 'Synthetic Docker build failed');
    requireResult(logs.includes(stubMarker), 'Synthetic pnpm build did not run');
  }
}
export function checkBuildSecrets(source) {
  const instructions = extractBuildInstructions(source);
  const temporaryRoot = resolve(tmpdir());
  const root = mkdtempSync(join(temporaryRoot, 'ksef-build-secrets-'));
  assert.equal(dirname(resolve(root)), temporaryRoot);
  const token = `synthetic-build-secret-${randomBytes(24).toString('hex')}`;
  const counts = { builds: 0, imageFiles: 0, cacheFiles: 0, gzipLayers: 0, negativeControls: 0 };
  try {
    const tokenPath = join(root, 'synthetic-token');
    writeFileSync(tokenPath, token, { mode: 0o600 });
    const cases = [
      { name: 'build-args', token: true, transport: 'args', required: '1' },
      { name: 'all-secrets', token: true, transport: 'secrets', required: '1' },
      { name: 'optional-missing', token: false, transport: 'args', required: '0' },
      { name: 'required-missing', token: false, transport: 'args', required: '1', failure: missingTokenMessage },
      { name: 'invalid-policy', token: false, transport: 'args', required: 'invalid', failure: invalidPolicyMessage },
      { name: 'negative-arg-env', token: true, transport: 'args', required: '1', injection: 'arg-env' },
      { name: 'negative-layer', token: true, transport: 'args', required: '1', injection: 'layer' },
    ];
    for (const scenario of cases) {
      const directory = join(root, scenario.name);
      const context = join(directory, 'context');
      const image = join(directory, 'image');
      const cache = join(directory, 'cache');
      const values = publicValues(instructions.publicNames, scenario.required);
      createFixture(context, instructions, values, token, scenario.token, scenario.injection);
      const args = ['buildx', 'build', '--no-cache', '--progress=plain', '--platform=linux/amd64',
        '--provenance=mode=max', '--network=none',
        '--output', `type=oci,dest=${image},tar=false,compression=gzip,force-compression=true`,
        '--cache-to', `type=local,dest=${cache},mode=max,compression=gzip,force-compression=true`];
      if (scenario.token) args.push('--secret', `id=${tokenName},src=${tokenPath}`);
      for (const [name, value] of Object.entries(values)) {
        if (scenario.transport === 'args') args.push('--build-arg', `${name}=${value}`);
        else {
          const path = join(directory, name);
          writeFileSync(path, value);
          args.push('--secret', `id=${name},src=${path}`);
        }
      }
      // Only this deliberately unsafe control passes a token as a build argument.
      // The command line contains its name, never its value; the env value is synthetic.
      if (scenario.injection === 'arg-env') args.push('--build-arg', tokenName);
      args.push('--file', join(context, 'Dockerfile'), context);
      const result = spawnSync('docker', args, {
        encoding: 'utf8', timeout: 180_000, maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, [tokenName]: token, DOCKER_BUILDKIT: '1' },
      });
      verifyBuildResult(result, token, scenario.failure, scenario.name);
      counts.builds += 1;
      if (scenario.failure) continue;
      const imageCheck = inspectLayout(image, token, 'image');
      const cacheCheck = inspectLayout(cache, token, 'cache');
      counts.imageFiles += imageCheck.files;
      counts.cacheFiles += cacheCheck.files;
      counts.gzipLayers += imageCheck.compressed + cacheCheck.compressed;
      const leaks = [...imageCheck.leaks, ...cacheCheck.leaks];
      if (scenario.injection === 'arg-env') {
        assert.ok(leaks.includes('image config/history'), 'ARG/ENV control did not reveal the expected persisted token');
        counts.negativeControls += 1;
      } else if (scenario.injection === 'layer') {
        assert.ok(leaks.includes('image layer/artifact'), 'Layer control did not reveal an image leak');
        assert.ok(leaks.includes('cache layer/artifact'), 'Layer control did not reveal a cache leak');
        counts.negativeControls += 1;
      } else {
        assert.equal(leaks.length, 0, `Synthetic token persisted in: ${leaks.join(', ')}`);
      }
    }
    return counts;
  } finally {
    // Delete only our freshly created direct child of the system temporary directory.
    assert.equal(dirname(resolve(root)), temporaryRoot);
    rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.equal(process.argv.length, 2, 'Usage: check-docker-build-secrets.mjs');
    const counts = checkBuildSecrets(readFileSync(join(process.cwd(), 'Dockerfile'), 'utf8'));
    console.log(`Docker build secrets: PASS (${counts.builds} builds; ${counts.imageFiles} image files; ${counts.cacheFiles} cache files; ${counts.gzipLayers} gzip layers inspected; ${counts.negativeControls} leak controls detected)`);
  } catch (error) {
    console.error(`Docker build secrets: FAIL (${error instanceof Error ? error.message : 'validation failed'})`);
    process.exitCode = 1;
  }
}
