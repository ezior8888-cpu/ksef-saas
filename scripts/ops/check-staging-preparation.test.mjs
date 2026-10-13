import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkStagingPreparation } from './check-staging-preparation.mjs';

const roles = ['database', 'auth', 'queue', 'cache', 'application-storage', 'supabase-storage', 'web', 'worker'];
const dependencies = { database: [], auth: ['database'], queue: ['database'], cache: [], 'application-storage': [], 'supabase-storage': ['database', 'auth'], web: roles.slice(0, 6), worker: roles.slice(0, 6) };
const integrations = ['ksef', 'stripe', 'email', 'sms', 'push', 'webhooks', 'ai', 'google-oauth', 'turnstile'];
const telemetry = ['sentry-browser', 'sentry-server', 'sentry-worker', 'posthog-browser', 'posthog-server'];
function fixture() {
  const resources = environment => roles.map(kind => ({ kind, resourceRef: `${environment}-${kind}-resource`, identityRef: `${environment}-${kind}-identity`, keyRef: `${environment}-${kind}-key`, volumeRef: `${environment}-${kind}-volume` }));
  return {
    schemaVersion: 1, scope: 'PREPARATION_ONLY', status: 'PROPOSED',
    resources: { production: resources('synthetic-production'), staging: resources('synthetic-staging') },
    dependencies: roles.map(kind => ({ kind, dependsOn: dependencies[kind], readinessProbeRef: `synthetic-probe-${kind}` })),
    release: { sourceRevision: 'a'.repeat(40), configurationRevision: 'b'.repeat(40), web: { revision: 'a'.repeat(40), imageDigest: 'sha256:' + 'c'.repeat(64) }, worker: { revision: 'a'.repeat(40), imageDigest: 'sha256:' + 'd'.repeat(64) } },
    environment: { APP_ENV: 'staging', NODE_ENV: 'production', NEXT_PUBLIC_APP_ENV: 'production', KSEF_ENV: 'test', JOBS_BACKEND: 'pgboss' },
    isolation: { syntheticDataOnly: true, productionEgress: 'DENY_PLANNED', backupSecrets: 'DENY_PLANNED', sharedDirectories: 'DENY_PLANNED', policyRef: 'synthetic-network-policy' },
    bootstrap: { migrations: 'NOT_AUTHORIZED', bootstrap: 'NOT_RUN', planRef: 'synthetic-bootstrap-plan' },
    integrations: integrations.map(kind => ({ kind, mode: 'BLOCKED', sinkRef: null })),
    telemetry: telemetry.map(kind => ({ kind, mode: 'DISABLED', sinkRef: null })),
  };
}
const check = plan => checkStagingPreparation(JSON.stringify(plan));
const blocked = (plan, code) => { const result = check(plan); assert.equal(result.structuralPlanReady, false); assert.ok(result.blockers.includes(code), JSON.stringify(result)); assert.equal(result.operationalReady, false); assert.equal(result.g03Passed, false); };

test('complete synthetic plan proves only structural preparation, never readiness or G03', () => {
  const plan = fixture(), before = JSON.stringify(plan), result = check(plan);
  assert.deepEqual(result, { scope: 'PREPARATION_ONLY', status: 'STRUCTURAL_PLAN_READY', structuralPlanReady: true, operationalReady: false, g03Passed: false, evidenceVerified: false, blockers: [] });
  assert.equal(JSON.stringify(plan), before);
});
test('only bounded JSON text is accepted; no getters, YAML, paths or JavaScript are evaluated', () => {
  let touched = false;
  for (const input of [null, { get schemaVersion() { touched = true; return 1; } }, 'schemaVersion: 1', './private.json', '(globalThis.sideEffect = true)', '{', ' '.repeat(65537), JSON.stringify(Array(10000).fill(1)), JSON.stringify({ a: { b: { c: { d: { e: { f: { g: { h: { i: { j: { k: { l: { m: 1 } } } } } } } } } } } } })]) {
    const result = checkStagingPreparation(input); assert.equal(result.structuralPlanReady, false); assert.ok(result.blockers.length > 0);
  }
  assert.equal(touched, false);
});
for (const property of ['scope', 'status', 'schemaVersion']) test(`rejects operational or unsupported ${property}`, () => {
  const plan = fixture(); plan[property] = property === 'schemaVersion' ? 2 : 'EXECUTED'; blocked(plan, 'PLAN_SCOPE');
});
for (const environment of ['production', 'staging']) test(`requires exact ${environment} dependency inventory`, () => {
  const plan = fixture(); plan.resources[environment].pop(); blocked(plan, 'RESOURCE_INVENTORY');
  plan.resources[environment].push(structuredClone(plan.resources[environment][0])); blocked(plan, 'RESOURCE_INVENTORY');
});
for (const field of ['resourceRef', 'identityRef', 'keyRef', 'volumeRef']) test(`rejects cross-role production reuse of ${field}`, () => {
  const plan = fixture(); plan.resources.staging[7][field] = plan.resources.production[0][field]; blocked(plan, 'PRODUCTION_RESOURCE_OVERLAP');
});
test('detects reused opaque ID across different resource fields', () => {
  const plan = fixture(); plan.resources.staging[0].keyRef = plan.resources.production[7].identityRef; blocked(plan, 'PRODUCTION_RESOURCE_OVERLAP');
});
test('shared staging DB infrastructure is allowed but is never proof of isolation', () => {
  const plan = fixture(); plan.resources.staging[1].volumeRef = plan.resources.staging[0].volumeRef;
  assert.equal(check(plan).structuralPlanReady, true); assert.equal(check(plan).evidenceVerified, false);
});
test('rejects unpinned refs, addresses, unknown fields and raw secret-like configuration without echoing input', () => {
  const plan = fixture(); plan.resources.staging[0].keyRef = 'https://private.example.invalid/secret-value'; blocked(plan, 'RESOURCE_REFERENCE');
  assert.doesNotMatch(JSON.stringify(check(plan)), /private|secret-value/);
  plan.resources.staging[0].keyRef = 'pending'; blocked(plan, 'RESOURCE_REFERENCE');
  plan.resources.staging[0].keyRef = 'synthetic-key'; plan.resources.staging[0].password = 'private-value'; blocked(plan, 'RESOURCE_INVENTORY');
});
test('dependency order and probe references are exact, not boolean declarations', () => {
  const plan = fixture(); plan.dependencies[7].dependsOn = ['database']; blocked(plan, 'DEPENDENCY_PLAN');
  const duplicate = fixture(); duplicate.dependencies[7].kind = 'web'; blocked(duplicate, 'DEPENDENCY_PLAN');
  const missing = fixture(); missing.dependencies[0].readinessProbeRef = true; blocked(missing, 'DEPENDENCY_PLAN');
});
for (const mutation of [p => { p.release.web.imageDigest = 'latest'; }, p => { p.release.worker.revision = 'e'.repeat(40); }, p => { p.release.configurationRevision = null; }]) test('requires pinned and matching web/worker release and image hashes', () => { const plan = fixture(); mutation(plan); blocked(plan, 'RELEASE_NOT_PINNED'); });
for (const [key, value] of [['NEXT_PUBLIC_APP_ENV', 'staging'], ['APP_ENV', 'production'], ['KSEF_ENV', 'production'], ['JOBS_BACKEND', 'inngest'], ['NODE_ENV', 'development']]) test(`rejects unsafe environment plan ${key}`, () => { const plan = fixture(); plan.environment[key] = value; blocked(plan, 'ENVIRONMENT_GUARD'); });
for (const field of ['syntheticDataOnly', 'productionEgress', 'backupSecrets', 'sharedDirectories', 'policyRef']) test(`requires isolation plan field ${field}`, () => { const plan = fixture(); delete plan.isolation[field]; blocked(plan, 'ISOLATION_PLAN'); });
test('migration/bootstrap authorization or effects invalidate preparation-only status', () => {
  const plan = fixture(); plan.bootstrap.migrations = 'AUTHORIZED'; blocked(plan, 'BOOTSTRAP_BOUNDARY');
  plan.bootstrap.migrations = 'NOT_AUTHORIZED'; plan.bootstrap.bootstrap = 'DONE'; blocked(plan, 'BOOTSTRAP_BOUNDARY');
});
test('every integration is explicit and only test/sink/local stub or blocked modes are allowed', () => {
  const plan = fixture(); plan.integrations.pop(); blocked(plan, 'INTEGRATION_PLAN');
  const unsafe = fixture(); unsafe.integrations[0].mode = 'PRODUCTION'; blocked(unsafe, 'INTEGRATION_PLAN');
  const sink = fixture(); sink.integrations.find(i => i.kind === 'email').mode = 'TEST_SINK'; blocked(sink, 'INTEGRATION_PLAN');
  sink.integrations.find(i => i.kind === 'email').sinkRef = 'synthetic-email-sink'; assert.equal(check(sink).structuralPlanReady, true);
  const ksef = fixture(); ksef.integrations[0] = { kind: 'ksef', mode: 'TEST', sinkRef: 'synthetic-ksef-test' }; assert.equal(check(ksef).structuralPlanReady, true);
});
test('all existing telemetry SDKs stay disabled or point to declared local sinks', () => {
  const plan = fixture(); plan.telemetry[0] = { kind: 'sentry-browser', mode: 'LOCAL_SINK', sinkRef: 'synthetic-local-sink' }; assert.equal(check(plan).structuralPlanReady, true);
  plan.telemetry[0].mode = 'SAAS'; blocked(plan, 'TELEMETRY_PLAN');
  const missing = fixture(); missing.telemetry.pop(); blocked(missing, 'TELEMETRY_PLAN');
});
test('CLI is help-only and rejects a config path without reading it', () => {
  const file = fileURLToPath(new URL('./check-staging-preparation.mjs', import.meta.url));
  const help = execFileSync(process.execPath, [file], { encoding: 'utf8' }); assert.match(help, /PREPARATION_ONLY/);
  const result = spawnSync(process.execPath, [file, 'private-config-sentinel.json'], { encoding: 'utf8' });
  assert.equal(result.status, 2); assert.doesNotMatch(result.stderr + result.stdout, /private-config-sentinel/);
});

test('missing or malformed sections return blockers without throwing or echoing their values', () => {
  for (const section of ['resources', 'dependencies', 'release', 'environment', 'isolation', 'bootstrap', 'integrations', 'telemetry']) {
    for (const value of [null, false, 'private-invalid-value', [], {}]) {
      const plan = fixture(); plan[section] = value;
      const result = check(plan); assert.equal(result.structuralPlanReady, false); assert.doesNotMatch(JSON.stringify(result), /private-invalid-value/);
    }
    const plan = fixture(); delete plan[section]; assert.equal(check(plan).structuralPlanReady, false);
  }
});
