#!/usr/bin/env node
/** Pure check of a proposed staging plan, never a runtime/isolation check.
 * Accepts only bounded JSON text; no files, env, clients or YAML are loaded.
 * Opaque refs are claims: different strings do not prove separate resources,
 * keys, volumes or identity. Their protected mapping must be reviewed later.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROLES = ['database', 'auth', 'queue', 'cache', 'application-storage', 'supabase-storage', 'web', 'worker'];
const DEPENDENCIES = { database: [], auth: ['database'], queue: ['database'], cache: [], 'application-storage': [], 'supabase-storage': ['database', 'auth'], web: ROLES.slice(0, 6), worker: ROLES.slice(0, 6) };
const RESOURCE_FIELDS = ['resourceRef', 'identityRef', 'keyRef', 'volumeRef'];
const INTEGRATION_MODES = { ksef: ['TEST', 'BLOCKED'], stripe: ['TEST', 'BLOCKED'], email: ['TEST_SINK', 'BLOCKED'], sms: ['TEST_SINK', 'BLOCKED'], push: ['TEST_SINK', 'BLOCKED'], webhooks: ['TEST_SINK', 'BLOCKED'], ai: ['LOCAL_STUB', 'BLOCKED'], 'google-oauth': ['TEST', 'BLOCKED'], turnstile: ['TEST', 'BLOCKED'] };
const TELEMETRY = ['sentry-browser', 'sentry-server', 'sentry-worker', 'posthog-browser', 'posthog-server'];
const ENVIRONMENT = { APP_ENV: 'staging', NODE_ENV: 'production', NEXT_PUBLIC_APP_ENV: 'production', KSEF_ENV: 'test', JOBS_BACKEND: 'pgboss' };
const TOP_LEVEL = ['schemaVersion', 'scope', 'status', 'resources', 'dependencies', 'release', 'environment', 'isolation', 'bootstrap', 'integrations', 'telemetry'];
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (actual, expected) => Array.isArray(actual) && actual.length === expected.length && expected.every(value => actual.filter(item => item === value).length === 1);
const keys = (value, expected) => record(value) && exact(Object.keys(value), expected);
const rows = (value, expected) => Array.isArray(value) && value.every(record) && exact(value.map(row => row.kind), expected);
const ref = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value) && !/(?:^|[-_])(?:pending|unknown|unverified|todo|tbd|placeholder)(?:$|[-_])/i.test(value);
const revision = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const image = value => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
const result = blockers => ({ scope: 'PREPARATION_ONLY', status: blockers.length ? 'INCOMPLETE_PLAN' : 'STRUCTURAL_PLAN_READY', structuralPlanReady: blockers.length === 0, operationalReady: false, g03Passed: false, evidenceVerified: false, blockers });
function parse(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 65_536) throw new Error('INVALID_JSON');
  const plan = JSON.parse(text); let count = 0;
  function visit(value, depth) {
    if (++count > 2048 || depth > 12) throw new Error('INVALID_JSON');
    if (value === null || typeof value !== 'object') return;
    for (const key of Object.keys(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('INVALID_JSON');
      visit(value[key], depth + 1);
    }
  }
  visit(plan, 0); return plan;
}

/** Structural readiness applies only to this document. Never grants permission,
 * authenticates hashes/refs, checks delivery, or changes F0/G03 acceptance. */
export function checkStagingPreparation(jsonText) {
  let plan;
  try { plan = parse(jsonText); } catch { return result(['INVALID_JSON']); }
  if (!record(plan)) return result(['PLAN_SCOPE']);
  const blockers = new Set(); const issue = code => blockers.add(code);
  if (!keys(plan, TOP_LEVEL) || plan.schemaVersion !== 1 || plan.scope !== 'PREPARATION_ONLY' || plan.status !== 'PROPOSED') issue('PLAN_SCOPE');
  if (!keys(plan.resources, ['production', 'staging'])) issue('RESOURCE_INVENTORY');
  for (const environment of ['production', 'staging']) {
    const inventory = plan.resources?.[environment];
    if (!rows(inventory, ROLES)) { issue('RESOURCE_INVENTORY'); continue; }
    for (const entry of inventory) {
      if (!keys(entry, ['kind', ...RESOURCE_FIELDS])) issue('RESOURCE_INVENTORY');
      if (RESOURCE_FIELDS.some(field => !ref(entry[field]))) issue('RESOURCE_REFERENCE');
    }
  }
  if (rows(plan.resources?.production, ROLES) && rows(plan.resources?.staging, ROLES)) {
    // Check across roles and field types, not just matching array positions.
    // Shared infrastructure inside staging is allowed; its namespaces and access
    // still need real verification. Nothing may reuse a production reference.
    const production = new Set(plan.resources.production.flatMap(entry => RESOURCE_FIELDS.map(field => entry[field])));
    if (plan.resources.staging.some(entry => RESOURCE_FIELDS.some(field => production.has(entry[field])))) issue('PRODUCTION_RESOURCE_OVERLAP');
  }
  if (!rows(plan.dependencies, ROLES) || plan.dependencies.some(entry => !keys(entry, ['kind', 'dependsOn', 'readinessProbeRef'])
    || !exact(entry.dependsOn, DEPENDENCIES[entry.kind]) || !ref(entry.readinessProbeRef))) issue('DEPENDENCY_PLAN');
  const release = plan.release;
  if (!keys(release, ['sourceRevision', 'configurationRevision', 'web', 'worker']) || !revision(release.sourceRevision) || !revision(release.configurationRevision)
    || ['web', 'worker'].some(kind => !keys(release[kind], ['revision', 'imageDigest']) || release[kind].revision !== release.sourceRevision || !image(release[kind].imageDigest))) issue('RELEASE_NOT_PINNED');
  if (!keys(plan.environment, Object.keys(ENVIRONMENT)) || Object.entries(ENVIRONMENT).some(([key, value]) => plan.environment[key] !== value)) issue('ENVIRONMENT_GUARD');
  const isolation = plan.isolation;
  if (!keys(isolation, ['syntheticDataOnly', 'productionEgress', 'backupSecrets', 'sharedDirectories', 'policyRef']) || isolation.syntheticDataOnly !== true
    || ['productionEgress', 'backupSecrets', 'sharedDirectories'].some(key => isolation[key] !== 'DENY_PLANNED') || !ref(isolation.policyRef)) issue('ISOLATION_PLAN');
  if (!keys(plan.bootstrap, ['migrations', 'bootstrap', 'planRef']) || plan.bootstrap.migrations !== 'NOT_AUTHORIZED' || plan.bootstrap.bootstrap !== 'NOT_RUN' || !ref(plan.bootstrap.planRef)) issue('BOOTSTRAP_BOUNDARY');
  if (!rows(plan.integrations, Object.keys(INTEGRATION_MODES)) || plan.integrations.some(entry => !keys(entry, ['kind', 'mode', 'sinkRef'])
    || !INTEGRATION_MODES[entry.kind].includes(entry.mode) || (entry.mode === 'BLOCKED' ? entry.sinkRef !== null : !ref(entry.sinkRef)))) issue('INTEGRATION_PLAN');
  if (!rows(plan.telemetry, TELEMETRY) || plan.telemetry.some(entry => !keys(entry, ['kind', 'mode', 'sinkRef'])
    || !['DISABLED', 'LOCAL_SINK'].includes(entry.mode) || (entry.mode === 'DISABLED' ? entry.sinkRef !== null : !ref(entry.sinkRef)))) issue('TELEMETRY_PLAN');
  return result([...blockers]);
}

const HELP = 'PREPARATION_ONLY: checkStagingPreparation(jsonText) sprawdza wyłącznie strukturę planu.\nCLI pokazuje tylko pomoc; nie czyta konfiguracji, env ani sieci.\nWynik nigdy nie potwierdza izolacji, gotowości operacyjnej lub PASS G03.\n';
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === '--help')) process.stdout.write(HELP);
  else { process.stderr.write('STAGING_HELP_ONLY\n'); process.exitCode = 2; }
}
