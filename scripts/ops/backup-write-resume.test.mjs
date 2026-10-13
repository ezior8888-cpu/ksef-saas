import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createBackupWriteResume, UNCHANGED_RESUME_CONTROLS } from './backup-write-resume.mjs';
import { writeDurableBackupJson } from './backup-source-seal.mjs';
import { REQUIRED_WRITERS, SOURCE_REVISION } from './run-backup-sequence.mjs';
const iso = () => new Date().toISOString();
const stateRef = name => ({sha256:createHash('sha256').update('SYNTHETIC '+name).digest('hex'),evidenceRef:'synthetic-'+name});
const policy = name => ({ name, maximumRetryCount: 0 });
const snapshot = (digit, running = false) => ({ containerId: digit.repeat(64), imageId: 'sha256:' + 'e'.repeat(64), createdAtUtc: '2026-01-01T00:00:00.000000000Z', configDigest: 'f'.repeat(64), running, paused: false, restarting: false, dead: false, autoRemove: false, status: running ? 'running' : 'exited', health: running ? 'healthy' : null, healthcheckConfigured: true, restartPolicy: policy('no'), restartCount: 0, startedAtUtc: '2026-01-01T00:00:00.000000000Z', finishedAtUtc: '2026-01-01T01:00:00.000000000Z' });
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'f0-resume-synthetic-'));
  t.after(async () => { assert.ok(root.startsWith(path.join(os.tmpdir(), 'f0-resume-synthetic-'))); await rm(root, { recursive: true, force: true }); });
  const runRoot = path.join(root, 'synthetic-resume'); await mkdir(runRoot, { mode: 0o700 });
  const db = path.join(runRoot, 'postgresql'); await mkdir(db, { mode: 0o700 });
  const artifact = await writeDurableBackupJson(path.join(db, 'source-seal.json'), { synthetic: true }, { mode: 'synthetic' });
  const ctx = { originalState:stateRef('original-state'),heldState:stateRef('held-state'),mode: 'synthetic', runId: 'synthetic-resume', windowId: 'window-1', sourceRevision: SOURCE_REVISION, runRoot, timeoutMs: 5000, authorization: { resumeWrites: true }, sealSha256: artifact.sha256, requiredWriters: [...REQUIRED_WRITERS], seal: { runId: 'synthetic-resume', windowId: 'window-1', sourceRevision: SOURCE_REVISION, status: 'LOCAL_SOURCES_SEALED', closedSourceClients: true, durability: process.platform === 'linux' ? 'POSIX_FSYNC' : 'SYNTHETIC_ONLY', completedAtUtc: artifact.createdAtUtc, evidence: artifact } };
  const held = [snapshot('1'), snapshot('2'), snapshot('3')];
  const plan = { originalState:stateRef('original-state'),heldState:stateRef('held-state'),schemaVersion: 1, profile: 'docker-services-v1', runId: ctx.runId, windowId: ctx.windowId, sourceRevision: SOURCE_REVISION, capturedAtUtc: iso(), reviewed: true, unchangedControls: UNCHANGED_RESUME_CONTROLS.map(id => ({ id, originalSha256: 'a'.repeat(64), heldSha256: 'a'.repeat(64) })), services: held.map((s, i) => ({ id: 'service-' + i, hostId: i === 1 ? 'synthetic-host-b' : 'synthetic-host-a', dependsOn: i === 1 ? ['service-0'] : [], held: s, original: { running: i < 2, restartPolicy: policy(i < 2 ? 'unless-stopped' : 'no') } })) };
  const states = new Map(held.map(s => [s.containerId, structuredClone(s)])); const calls = [];
  const transport = {
    inspect: async ({ containerId }) => { calls.push('inspect:' + containerId[0]); return structuredClone(states.get(containerId)); },
    start: async ({ containerId }, c) => { assert.equal(c.authorization.resumeWrites, true); calls.push('start:' + containerId[0]); const s = states.get(containerId); s.running = true; s.status = 'running'; s.health = 'healthy'; s.startedAtUtc = '2026-01-02T00:00:00.000000000Z'; },
    updateRestartPolicy: async ({ containerId, restartPolicy }) => { calls.push('policy:' + containerId[0]); states.get(containerId).restartPolicy = structuredClone(restartPolicy); },
  };
  const observeBoundary = async c => ({ originalState:stateRef('original-state'),heldState:stateRef('held-state'),schemaVersion: 1, runId: c.runId, windowId: c.windowId, sourceRevision: c.sourceRevision, planSha256: c.planSha256, phase: c.phase, observedAtUtc: iso(), exclusiveControl: true, sourceReadsStopped: true, coveredWriters: [...REQUIRED_WRITERS], mutationsExcluded: c.phase === 'before', originalStateRestored: c.phase === 'after', controlDigests: Object.fromEntries(plan.unchangedControls.map(v => [v.id, v.originalSha256])), evidenceRef: 'synthetic-independent-observer' });
  return { root, ctx, plan, states, transport, observeBoundary, calls, create(overrides = {}) { return createBackupWriteResume({ plan, transport, observeBoundary, ...overrides }); } };
}
test('restores only original running services in dependency order with durable intents and readback', async t => {
  const f = await fixture(t); const result = await f.create()(f.ctx);
  assert.equal(result.status, 'RESUMED'); assert.equal(result.originalStateRestored, true);
  assert.deepEqual(f.calls.filter(v => !v.startsWith('inspect:')), ['start:1', 'policy:1', 'start:2', 'policy:2']);
  assert.equal(f.states.get('3'.repeat(64)).running, false);
  assert.equal(result.verificationEvidence.evidenceVerified, false);
  const entries = await readdir(path.join(f.ctx.runRoot, 'resume-steps'));
  assert.equal(entries.filter(v => v.endsWith('-intent.json')).length, 4);
  assert.equal(entries.filter(v => v.endsWith('-verified.json')).length, 4);
  const saved = JSON.parse(await readFile(path.join(f.ctx.runRoot, 'resume-steps', 'complete.json'), 'utf8'));
  assert.equal(saved.status, 'RESUMED');
});
test('checks all services before first mutation and detects foreign configuration', async t => {
  const f = await fixture(t); f.states.get('3'.repeat(64)).configDigest = 'b'.repeat(64);
  await assert.rejects(f.create()(f.ctx), /RESUME_STATE_CHANGED/);
  assert.equal(f.calls.some(v => v.startsWith('start:')), false);
});
test('rejects changed external controls before effects', async t => {
  const f = await fixture(t); f.plan.unchangedControls[0].heldSha256 = 'b'.repeat(64);
  assert.throws(() => f.create(), /RESUME_UNSUPPORTED_PLAN/); assert.deepEqual(f.calls, []);
});
test('binds request to run window revision and durable source seal', async t => {
  for (const field of ['runId', 'windowId', 'sourceRevision', 'sealSha256']) {
    const f = await fixture(t); f.ctx[field] = 'incorrect'; await assert.rejects(f.create()(f.ctx), /RESUME_INVALID_REQUEST/); assert.deepEqual(f.calls, []);
  }
});
test('requires explicit resume authorization even in synthetic mode', async t => {
  const f = await fixture(t); delete f.ctx.authorization;
  await assert.rejects(f.create()(f.ctx), /RESUME_AUTHORIZATION_REQUIRED/); assert.deepEqual(f.calls, []);
});
test('loss of mutation response stops without retry rollback or dependent service', async t => {
  const f = await fixture(t); const start = f.transport.start;
  f.transport.start = async (...args) => { await start(...args); throw new Error('private remote stderr'); };
  await assert.rejects(f.create()(f.ctx), e => e.code === 'RESUME_OPERATION_FAILED' && e.discardClientRequired === true && !e.message.includes('private'));
  assert.deepEqual(f.calls.filter(v => v.startsWith('start:') || v.startsWith('policy:')), ['start:1']);
  assert.ok((await readdir(path.join(f.ctx.runRoot, 'resume-steps'))).some(v => v.endsWith('-intent.json')));
  assert.ok(!(await readdir(path.join(f.ctx.runRoot, 'resume-steps'))).includes('complete.json'));
});
test('hanging or late mutation cannot schedule further work', async t => {
  const f = await fixture(t); f.ctx.timeoutMs = 100; let finish;
  f.transport.start = async () => { f.calls.push('start:1'); await new Promise(resolve => { finish = resolve; }); };
  await assert.rejects(f.create()(f.ctx), /RESUME_ABORTED_OR_TIMED_OUT/);
  assert.equal(typeof finish, 'function'); finish(); await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(f.calls.filter(v => v.startsWith('policy:')), []);
});
test('unhealthy start prevents dependents and policy restoration', async t => {
  const f = await fixture(t); const start = f.transport.start;
  f.transport.start = async (...args) => { await start(...args); f.states.get('1'.repeat(64)).health = 'unhealthy'; };
  await assert.rejects(f.create()(f.ctx), /RESUME_NOT_READY/);
  assert.deepEqual(f.calls.filter(v => v.startsWith('start:') || v.startsWith('policy:')), ['start:1']);
});
test('missing full observer proof cannot publish RESUMED', async t => {
  const f = await fixture(t); const observe = f.observeBoundary;
  const resume = f.create({ observeBoundary: async c => ({ ...await observe(c), ...(c.phase === 'after' ? { coveredWriters: ['web'] } : {}) }) });
  await assert.rejects(resume(f.ctx), /RESUME_BOUNDARY_NOT_VERIFIED/);
  assert.ok(!(await readdir(path.join(f.ctx.runRoot, 'resume-steps'))).includes('complete.json'));
});
test('replay refuses an existing journal without further inspection or mutation', async t => {
  const f = await fixture(t); await f.create()(f.ctx); f.calls.length = 0;
  await assert.rejects(f.create()(f.ctx), /RESUME_JOURNAL_EXISTS/); assert.deepEqual(f.calls, []);
});
test('factory snapshots configuration and target methods', async t => {
  const f = await fixture(t); const resume = f.create();
  f.plan.services[0].original.running = false; f.transport.start = () => { throw new Error('mutated'); };
  assert.equal((await resume(f.ctx)).status, 'RESUMED'); assert.ok(f.calls.includes('start:1'));
});
test('unsupported healthcheck/dependency/duplicate/autoRemove profiles fail before effects', async t => {
  const changes = [p => { p.services[0].held.healthcheckConfigured = false; }, p => { p.services[0].dependsOn = ['service-1']; }, p => { p.services[1].held.containerId = p.services[0].held.containerId; }, p => { p.services[0].held.autoRemove = true; }, p => { p.services[0].held.running = true; }];
  for (const change of changes) { const f = await fixture(t); change(f.plan); assert.throws(() => f.create(), /RESUME_UNSUPPORTED_PLAN/); assert.deepEqual(f.calls, []); }
});
test('journal write failure before mutation prevents dispatch', async t => {
  const f = await fixture(t);
  const persist = async (file, value, ctx) => { if (file.endsWith('-intent.json')) throw new Error('disk full'); return writeDurableBackupJson(file, value, ctx); };
  await assert.rejects(f.create({ persist })(f.ctx), /RESUME_OPERATION_FAILED/);
  assert.equal(f.calls.some(v => v.startsWith('start:')), false);
});

test('abort before invocation dispatches no transport', async t => {
 const f=await fixture(t); const controller=new AbortController();controller.abort();f.ctx.signal=controller.signal;
 await assert.rejects(f.create()(f.ctx),/RESUME_ABORTED_OR_TIMED_OUT/);assert.deepEqual(f.calls,[]);
});
test('foreign change immediately before action prevents dispatch', async t => {
 const f=await fixture(t);const observe=f.observeBoundary;
 await assert.rejects(f.create({observeBoundary:async c=>{const p=await observe(c);if(c.phase==='before-action')f.states.get('1'.repeat(64)).restartPolicy=policy('always');return p;}})(f.ctx),/RESUME_STATE_CHANGED/);
 assert.ok(!f.calls.includes('start:1'));
});
test('partial restart-policy effect is not retried or rolled back', async t => {
 const f=await fixture(t);const update=f.transport.updateRestartPolicy;f.transport.updateRestartPolicy=async(...args)=>{await update(...args);throw Error('response lost');};
 await assert.rejects(f.create()(f.ctx),/RESUME_OPERATION_FAILED/);
 assert.deepEqual(f.calls.filter(v=>v.startsWith('start:')||v.startsWith('policy:')),['start:1','policy:1']);
});
test('verification journal failure after effect halts dependents', async t => {
 const f=await fixture(t);const persist=async(file,value,c)=>{if(file.endsWith('-verified.json'))throw Error('disk full');return writeDurableBackupJson(file,value,c);};
 await assert.rejects(f.create({persist})(f.ctx),/RESUME_OPERATION_FAILED/);assert.deepEqual(f.calls.filter(v=>v.startsWith('start:')||v.startsWith('policy:')),['start:1']);
});
test('healthy readback is awaited before restart-policy or dependent service', async t=>{
 const f=await fixture(t);const start=f.transport.start,inspect=f.transport.inspect;let observed=0;
 f.transport.start=async(...a)=>{await start(...a);if(a[0].containerId==='1'.repeat(64))f.states.get(a[0].containerId).health='starting';};
 f.transport.inspect=async(...a)=>{const state=f.states.get(a[0].containerId);if(state.health==='starting'&&++observed===2)state.health='healthy';return inspect(...a);};
 assert.equal((await f.create()(f.ctx)).status,'RESUMED');assert.equal(observed,2);
});
test('missing exclusive control or stale proof prevents all effects', async t=>{
 for(const change of [p=>({...p,exclusiveControl:false}),p=>({...p,observedAtUtc:'2000-01-01T00:00:00.000Z'}),p=>({...p,sourceReadsStopped:false})]){
  const f=await fixture(t);const observe=f.observeBoundary;await assert.rejects(f.create({observeBoundary:async c=>change(await observe(c))})(f.ctx),/RESUME_BOUNDARY_NOT_VERIFIED/);assert.deepEqual(f.calls,[]);
 }
});
test('seal file mutation cannot authorize resume',async t=>{
 const f=await fixture(t);const {writeFile}=await import('node:fs/promises');await writeFile(f.ctx.seal.evidence.path,'changed');
 await assert.rejects(f.create()(f.ctx),/RESUME_INVALID_REQUEST/);assert.deepEqual(f.calls,[]);
});
test('complete receipt write failure remains uncertain',async t=>{
 const f=await fixture(t);const persist=async(file,value,c)=>{if(file.endsWith('complete.json'))throw Error('disk full');return writeDurableBackupJson(file,value,c);};
 await assert.rejects(f.create({persist})(f.ctx),e=>e.code==='RESUME_OPERATION_FAILED'&&e.discardClientRequired);
 assert.ok(!(await readdir(path.join(f.ctx.runRoot,'resume-steps'))).includes('complete.json'));
});
test('full sequence uses concrete coordinator before upload and history',async t=>{
 const {fixture:sequenceFixture}=await import('./fixtures/backup-sequence-fixture.mjs');const {runBackupSequence}=await import('./run-backup-sequence.mjs');
 const sequence=await sequenceFixture(t),f=await fixture(t);f.plan.runId=sequence.options.runId;f.plan.windowId='synthetic-window';
 sequence.options.authorization={backup:true,resumeWrites:true};const resume=f.create();
 sequence.adapters.resumeWrites=async c=>{sequence.calls.push('concrete-resume');return resume(c);};
 const result=await runBackupSequence(sequence.options);assert.equal(result.status,'SEQUENCE_COMPLETE_REQUIRES_ACCEPTANCE',JSON.stringify(result));
 assert.equal(result.writesState,'RESUMED');assert.ok(sequence.calls.indexOf('concrete-resume')<sequence.calls.indexOf('upload-database'));assert.equal(result.g09Accepted,false);
});
test('failed concrete resume retains sequence lock and prohibits upload',async t=>{
 const {fixture:sequenceFixture}=await import('./fixtures/backup-sequence-fixture.mjs');const {runBackupSequence}=await import('./run-backup-sequence.mjs');
 const sequence=await sequenceFixture(t),f=await fixture(t);f.plan.runId=sequence.options.runId;f.plan.windowId='synthetic-window';
 sequence.options.authorization={backup:true,resumeWrites:true};f.transport.start=async()=>{throw Error('uncertain');};sequence.adapters.resumeWrites=f.create();
 const result=await runBackupSequence(sequence.options);assert.equal(result.stage,'resume-writes');assert.equal(result.writesState,'RESUME_UNKNOWN');assert.equal(result.lockRetained,true);assert.equal(sequence.snapshots.size,0);
});

test('plan must bind the actual consistency state references',async t=>{const f=await fixture(t);f.ctx.heldState.sha256='b'.repeat(64);await assert.rejects(f.create()(f.ctx),/RESUME_INVALID_REQUEST/);assert.deepEqual(f.calls,[]);});
test('foreign provider code cannot escape in error payload',async t=>{const f=await fixture(t);f.transport.start=()=>{throw Object.assign(Error('secret'),{code:'RESUME_PRIVATE_SECRET'});};await assert.rejects(f.create()(f.ctx),e=>e.code==='RESUME_OPERATION_FAILED'&&!e.message.includes('SECRET'));});

test('foreign change during durable intent write is detected before dispatch',async t=>{const f=await fixture(t);const persist=async(file,value,c)=>{const r=await writeDurableBackupJson(file,value,c);if(file.endsWith('-intent.json'))f.states.get('1'.repeat(64)).configDigest='b'.repeat(64);return r;};await assert.rejects(f.create({persist})(f.ctx),/RESUME_STATE_CHANGED/);assert.ok(!f.calls.includes('start:1'));});

test('invalid signal returns a safe code before effects',async t=>{const f=await fixture(t);f.ctx.signal={};await assert.rejects(f.create()(f.ctx),e=>e.code==='RESUME_INVALID_REQUEST');assert.deepEqual(f.calls,[]);});
test('nonzero previous restart counter for a service to start is unsupported before effects',async t=>{const f=await fixture(t);f.plan.services[0].held.restartCount=1;assert.throws(()=>f.create(),/RESUME_UNSUPPORTED_PLAN/);assert.deepEqual(f.calls,[]);});
