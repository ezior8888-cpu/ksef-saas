/** Prepared, closed Docker-only resume profile. No effects on import. The
 * independent boundary observer and protected original plan remain trusted
 * providers: JSON validation cannot authenticate their claims or provide CAS. */
import { mkdir } from 'node:fs/promises';
import { types } from 'node:util';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { hashBackupArtifact } from './backup-artifacts.mjs';
import { writeDurableBackupJson } from './backup-source-seal.mjs';

export const UNCHANGED_RESUME_CONTROLS = Object.freeze(['ingress', 'maintenance', 'deployment', 'schedules', 'database-permissions', 's3-access', 's3-lifecycle-replication', 'runtime-config-and-volumes']);
const WRITERS = ['web', 'worker', 'crons', 'database-admin', 's3-upload-delete', 's3-lifecycle', 'supabase-storage'];
const hex = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const id = v => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(v);
const exact = (a, b) => Array.isArray(a) && a.length === b.length && b.every(v => a.filter(x => x === v).length === 1);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const now = () => new Date().toISOString();
const stamp = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
class ResumeError extends Error { constructor(code) { super(code); this.code = code; } }
const fail = code => { throw new ResumeError(code); };
const reference = r => r && exact(Object.keys(r), ['sha256', 'evidenceRef']) && hex(r.sha256) && typeof r.evidenceRef === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(r.evidenceRef);
const sameReference = (a, b) => reference(a) && reference(b) && a.sha256 === b.sha256 && a.evidenceRef === b.evidenceRef;
function detached(value, max = 65_536) {
  let count = 0; const seen = new Set();
  const walk = (v, depth) => {
    if (++count > 10000 || depth > 16) fail('RESUME_INVALID_JSON');
    if (v === null || typeof v === 'boolean' || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))) return v;
    if (!v || typeof v !== 'object' || types.isProxy(v) || seen.has(v) || (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype)) fail('RESUME_INVALID_JSON');
    seen.add(v); const result = Array.isArray(v) ? [] : {};
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(v))) {
      if (Array.isArray(v) && key === 'length') continue;
      if (!descriptor.enumerable || !('value' in descriptor) || ['__proto__', 'constructor', 'prototype'].includes(key)) fail('RESUME_INVALID_JSON');
      result[key] = walk(descriptor.value, depth + 1);
    }
    seen.delete(v); return result;
  };
  const result = walk(value, 0); if (Buffer.byteLength(JSON.stringify(result)) > max) fail('RESUME_INVALID_JSON'); return result;
}
function restartPolicy(p) {
  if (!p || !['no', 'always', 'unless-stopped', 'on-failure'].includes(p.name) || !Number.isSafeInteger(p.maximumRetryCount)
    || p.maximumRetryCount < 0 || p.maximumRetryCount > 1000 || (p.name !== 'on-failure' && p.maximumRetryCount !== 0)
    || !exact(Object.keys(p), ['name', 'maximumRetryCount'])) fail('RESUME_UNSUPPORTED_PLAN');
  return { name: p.name, maximumRetryCount: p.maximumRetryCount };
}
function snapshot(s) {
  const fields = ['containerId', 'imageId', 'createdAtUtc', 'configDigest', 'running', 'paused', 'restarting', 'dead', 'autoRemove', 'status', 'health', 'healthcheckConfigured', 'restartPolicy', 'restartCount', 'startedAtUtc', 'finishedAtUtc'];
  if (!s || !exact(Object.keys(s), fields) || !hex(s.containerId) || !/^sha256:[a-f0-9]{64}$/.test(s.imageId ?? '') || !hex(s.configDigest)
    || ['running', 'paused', 'restarting', 'dead', 'autoRemove', 'healthcheckConfigured'].some(k => typeof s[k] !== 'boolean')
    || !['created', 'running', 'paused', 'restarting', 'removing', 'exited', 'dead'].includes(s.status)
    || ![null, 'healthy', 'starting', 'unhealthy'].includes(s.health) || !Number.isSafeInteger(s.restartCount) || s.restartCount < 0
    || ['createdAtUtc', 'startedAtUtc', 'finishedAtUtc'].some(k => typeof s[k] !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(s[k]))) fail('RESUME_INVALID_SNAPSHOT');
  return Object.fromEntries(fields.map(k => [k, k === 'restartPolicy' ? restartPolicy(s[k]) : s[k]]));
}
function validatePlan(input) {
  const p = detached(input); const names = new Set(), containers = new Set();
  if (!exact(Object.keys(p), ['schemaVersion', 'profile', 'runId', 'windowId', 'sourceRevision', 'capturedAtUtc', 'reviewed', 'unchangedControls', 'services', 'originalState', 'heldState'])
    || !reference(p.originalState) || !reference(p.heldState) || p.schemaVersion !== 1 || p.profile !== 'docker-services-v1' || !id(p.runId) || p.runId.length < 8 || !id(p.windowId)
    || !/^[a-f0-9]{40}$/.test(p.sourceRevision ?? '') || !stamp(p.capturedAtUtc) || p.reviewed !== true
    || !Array.isArray(p.services) || p.services.length < 1 || p.services.length > 64
    || !exact(p.unchangedControls?.map(c => c.id), UNCHANGED_RESUME_CONTROLS)) fail('RESUME_UNSUPPORTED_PLAN');
  for (const control of p.unchangedControls) {
    if (!exact(Object.keys(control), ['id', 'originalSha256', 'heldSha256']) || !hex(control.originalSha256) || control.originalSha256 !== control.heldSha256) fail('RESUME_UNSUPPORTED_PLAN');
  }
  for (const s of p.services) {
    if (!exact(Object.keys(s), ['id', 'hostId', 'dependsOn', 'held', 'original']) || !id(s.hostId) || !id(s.id) || names.has(s.id) || !Array.isArray(s.dependsOn)
      || new Set(s.dependsOn).size !== s.dependsOn.length || s.dependsOn.some(d => !names.has(d))
      || !s.original || !exact(Object.keys(s.original), ['running', 'restartPolicy']) || typeof s.original.running !== 'boolean') fail('RESUME_UNSUPPORTED_PLAN');
    s.held = snapshot(s.held); s.original.restartPolicy = restartPolicy(s.original.restartPolicy);
    if (containers.has(s.held.containerId) || s.held.running || s.held.paused || s.held.restarting || s.held.dead || s.held.autoRemove
      || !['created', 'exited'].includes(s.held.status) || s.held.restartPolicy.name !== 'no'
      || (s.original.running && (!s.held.healthcheckConfigured || s.held.restartCount !== 0))
      || s.dependsOn.some(d => !p.services.find(entry => entry.id === d).original.running)) fail('RESUME_UNSUPPORTED_PLAN');
    names.add(s.id); containers.add(s.held.containerId);
  }
  return p;
}

/** This factory does not capture/freeze anything. Its plan must have been
 * privately persisted and reviewed before the separately authorized window.
 * Non-Docker controls must be proven unchanged; otherwise this profile stops.
 * No retry, rollback, cleanup or replay is performed after any failure. */
export function createBackupWriteResume({ plan: input, transport, observeBoundary, persist = writeDurableBackupJson } = {}) {
  const plan = validatePlan(input);
  if (typeof observeBoundary !== 'function' || typeof persist !== 'function' || ['inspect', 'start', 'updateRestartPolicy'].some(k => typeof transport?.[k] !== 'function')) fail('RESUME_REQUIRED_PROVIDER_MISSING');
  const commands = Object.fromEntries(['inspect', 'start', 'updateRestartPolicy'].map(k => [k, transport[k].bind(transport)]));
  const planSha256 = createHash('sha256').update(JSON.stringify(plan)).digest('hex');
  const digests = Object.fromEntries(plan.unchangedControls.map(c => [c.id, c.originalSha256]));
  return async function resumeWrites(request) {
    const { signal } = request ?? {}; const started = Date.now(), startedAtUtc = now();
    const ctx = { ...request, authorization: { resumeWrites: request?.authorization?.resumeWrites === true } };
    if (!ctx.authorization.resumeWrites) fail('RESUME_AUTHORIZATION_REQUIRED');
    if (!['synthetic', 'separately-authorized'].includes(ctx.mode) || (ctx.mode === 'separately-authorized' && process.platform !== 'linux')) fail('RESUME_UNSUPPORTED_PLATFORM');
    if ((signal !== undefined && !(signal instanceof AbortSignal)) || ctx.runId !== plan.runId || ctx.windowId !== plan.windowId || ctx.sourceRevision !== plan.sourceRevision
      || !sameReference(ctx.originalState, plan.originalState) || !sameReference(ctx.heldState, plan.heldState)
      || !hex(ctx.sealSha256) || !Number.isSafeInteger(ctx.timeoutMs) || ctx.timeoutMs < 1 || ctx.timeoutMs > 1_800_000
      || typeof ctx.runRoot !== 'string' || !path.isAbsolute(ctx.runRoot) || path.normalize(ctx.runRoot) !== ctx.runRoot || !exact(ctx.requiredWriters, WRITERS)
      || Date.parse(plan.capturedAtUtc) > started || started - Date.parse(plan.capturedAtUtc) > 86_400_000
      || !ctx.seal || ctx.seal.runId !== plan.runId || ctx.seal.windowId !== plan.windowId || ctx.seal.sourceRevision !== plan.sourceRevision
      || ctx.seal.status !== 'LOCAL_SOURCES_SEALED' || ctx.seal.closedSourceClients !== true
      || !['POSIX_FSYNC', ...(ctx.mode === 'synthetic' ? ['SYNTHETIC_ONLY'] : [])].includes(ctx.seal.durability)
      || !stamp(ctx.seal.completedAtUtc) || Date.parse(ctx.seal.completedAtUtc) > started
      || ctx.seal.evidence?.path !== path.join(ctx.runRoot, 'postgresql', 'source-seal.json') || ctx.seal.evidence.sha256 !== ctx.sealSha256) fail('RESUME_INVALID_REQUEST');
    ctx.originalState = detached(ctx.originalState); ctx.heldState = detached(ctx.heldState); ctx.seal = detached(ctx.seal); ctx.requiredWriters = [...WRITERS];
    const controller = new AbortController(); ctx.signal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    const timer = setTimeout(() => controller.abort(), ctx.timeoutMs);
    const checkpoint = () => { if (ctx.signal.aborted || Date.now() - started >= ctx.timeoutMs) fail('RESUME_ABORTED_OR_TIMED_OUT'); };
    async function call(work) {
      checkpoint(); let stop;
      const interrupted = new Promise((_, reject) => { stop = () => { const e = new ResumeError('RESUME_ABORTED_OR_TIMED_OUT'); reject(e); }; ctx.signal.addEventListener('abort', stop, { once: true }); if (ctx.signal.aborted) stop(); });
      try {
        const value = await Promise.race([Promise.resolve().then(() => { checkpoint(); return work({ ...ctx, timeoutMs: Math.max(1, ctx.timeoutMs - (Date.now() - started)) }); }), interrupted]);
        checkpoint(); return value;
      } finally { ctx.signal.removeEventListener('abort', stop); }
    }
    const journalDir = path.join(ctx.runRoot, 'resume-steps'); let action = 0;
    const save = (name, value) => call(c => persist(path.join(journalDir, name + '.json'), { schemaVersion: 1, runId: plan.runId, windowId: plan.windowId, sourceRevision: plan.sourceRevision, planSha256, sealSha256: ctx.sealSha256, ...value }, c));
    const transportContext = c => ({ ...c, timeoutMs: Math.min(c.timeoutMs, 300_000) });
    const inspect = s => call(async c => snapshot(detached(await commands.inspect({ containerId: s.held.containerId }, transportContext(c)))));
    async function boundary(phase) {
      const observedAfter = Date.now();
      const proof = detached(await call(c => observeBoundary({ ...c, phase, planSha256 })));
      if (proof.schemaVersion !== 1 || proof.runId !== plan.runId || proof.windowId !== plan.windowId || proof.sourceRevision !== plan.sourceRevision
        || !sameReference(proof.originalState, plan.originalState) || !sameReference(proof.heldState, plan.heldState)
        || proof.planSha256 !== planSha256 || proof.phase !== phase || proof.exclusiveControl !== true || proof.sourceReadsStopped !== true
        || !exact(proof.coveredWriters, WRITERS) || !stamp(proof.observedAtUtc) || Date.parse(proof.observedAtUtc) < observedAfter || Date.parse(proof.observedAtUtc) > Date.now()
        || !proof.controlDigests || !exact(Object.keys(proof.controlDigests), Object.keys(digests)) || Object.keys(digests).some(k => proof.controlDigests[k] !== digests[k])
        || typeof proof.evidenceRef !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(proof.evidenceRef)
        || (phase === 'before' && proof.mutationsExcluded !== true) || (phase === 'after' && proof.originalStateRestored !== true)) fail('RESUME_BOUNDARY_NOT_VERIFIED');
      return proof;
    }
    const expected = new Map(plan.services.map(s => [s.id, s.held]));
    async function unchanged(s) { const observed = await inspect(s); if (!equal(observed, expected.get(s.id))) fail('RESUME_STATE_CHANGED'); return observed; }
    async function allUnchanged() { for (const s of plan.services) await unchanged(s); }
    async function effect(s, operation, apply, verify) {
      await boundary('before-action'); await allUnchanged();
      const prefix = String(++action).padStart(3, '0') + '-' + operation;
      await save(prefix + '-intent', { serviceId: s.id, containerId: s.held.containerId, operation, status: 'OUTCOME_UNKNOWN', expected: expected.get(s.id), original: s.original, createdAtUtc: now() });
      // Durable I/O can yield long enough for a foreign controller to act.
      await boundary('before-action'); await allUnchanged(); checkpoint(); await call(apply);
      const observed = await verify(); expected.set(s.id, observed);
      await save(prefix + '-verified', { serviceId: s.id, operation, status: 'VERIFIED', observed, completedAtUtc: now() });
    }
    try {
      const sealArtifact = await call(c => hashBackupArtifact(ctx.seal.evidence.path, c));
      if (sealArtifact.sha256 !== ctx.sealSha256 || sealArtifact.bytes !== ctx.seal.evidence.bytes) fail('RESUME_INVALID_REQUEST');
      try { await call(() => mkdir(journalDir, { mode: 0o700 })); } catch (error) { if (error.code === 'EEXIST') fail('RESUME_JOURNAL_EXISTS'); throw error; }
      await save('plan', { plan, status: 'NOT_RESUMED', createdAtUtc: now() });
      await boundary('before'); await allUnchanged();
      for (const s of plan.services) {
        if (s.original.running) {
          await effect(s, 'start', c => commands.start({ containerId: s.held.containerId }, transportContext(c)), async () => {
            for (;;) {
              const observed = await inspect(s);
              if (['containerId', 'imageId', 'createdAtUtc', 'configDigest', 'healthcheckConfigured', 'restartCount'].some(k => observed[k] !== s.held[k])
                || observed.paused || observed.restarting || observed.dead || observed.autoRemove || !equal(observed.restartPolicy, s.held.restartPolicy)) fail('RESUME_STATE_CHANGED');
              if (!observed.running || observed.status !== 'running' || !['starting', 'healthy'].includes(observed.health)) fail('RESUME_NOT_READY');
              if (observed.health === 'healthy') return observed;
              await call(c => delay(250, undefined, { signal: c.signal }));
            }
          });
        }
        if (!equal(s.original.restartPolicy, s.held.restartPolicy)) {
          await effect(s, 'restart-policy', c => commands.updateRestartPolicy({ containerId: s.held.containerId, restartPolicy: { ...s.original.restartPolicy } }, transportContext(c)), async () => {
            const observed = await inspect(s), wanted = { ...expected.get(s.id), restartPolicy: s.original.restartPolicy };
            if (!equal(observed, wanted)) fail('RESUME_STATE_CHANGED'); return observed;
          });
        }
      }
      await allUnchanged(); const proof = await boundary('after'); await allUnchanged();
      const receipt = { schemaVersion: 1, status: 'RESUMED', runId: plan.runId, windowId: plan.windowId, sourceRevision: plan.sourceRevision, sealSha256: ctx.sealSha256,
        coveredWriters: [...WRITERS], sourceReadsStopped: true, originalStateRestored: true, startedAtUtc, completedAtUtc: now(),
        verificationEvidence: { profile: plan.profile, planSha256, actionCount: action, observerEvidence: proof.evidenceRef, evidenceVerified: false, journalDirectory: 'resume-steps', trustedExclusiveControlRequired: true } };
      await save('complete', receipt); checkpoint(); return receipt;
    } catch (error) {
      controller.abort(); const code = error instanceof ResumeError ? error.code : 'RESUME_OPERATION_FAILED';
      const safe = new ResumeError(code); safe.discardClientRequired = true; safe.remoteMayStillRun = true; throw safe;
    } finally { clearTimeout(timer); }
  };
}
