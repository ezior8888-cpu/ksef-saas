import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createBackupServiceResume } from './backup-service-resume-wiring.mjs';
import { UNCHANGED_RESUME_CONTROLS } from './backup-write-resume.mjs';
import { writeDurableBackupJson } from './backup-source-seal.mjs';
import { REQUIRED_WRITERS, SOURCE_REVISION } from './run-backup-sequence.mjs';

const now = () => new Date().toISOString();
const policy = name => ({ name, maximumRetryCount: 0 });
function quotedArguments(text) {
  const words = []; let index = 0;
  while (index < text.length) {
    assert.equal(text[index++], "'"); let value = '';
    while (index < text.length) {
      if (text.slice(index, index + 4) === "'\\''") { value += "'"; index += 4; }
      else if (text[index] === "'") { index++; break; }
      else value += text[index++];
    }
    words.push(value); if (index < text.length) assert.equal(text[index++], ' ');
  }
  return words;
}
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'f0-resume-wiring-test-'));
  t.after(async () => {
    if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('f0-resume-wiring-test-')) throw new Error('UNSAFE_TEST_CLEANUP');
    await rm(root, { recursive: true, force: true });
  });
  const runRoot = path.join(root, 'synthetic-wiring');
  await mkdir(runRoot, { mode: 0o700 }); await mkdir(path.join(runRoot, 'postgresql'), { mode: 0o700 });
  const artifact = await writeDurableBackupJson(path.join(runRoot, 'postgresql', 'source-seal.json'), { synthetic: true }, { mode: 'synthetic' });
  const refs = { originalState: { sha256: 'c'.repeat(64), evidenceRef: 'synthetic-original' }, heldState: { sha256: 'd'.repeat(64), evidenceRef: 'synthetic-held' } };
  const ctx = { ...structuredClone(refs), mode: 'synthetic', runId: 'synthetic-wiring', windowId: 'window-1', sourceRevision: SOURCE_REVISION,
    runRoot, timeoutMs: 10000, authorization: { resumeWrites: true }, sealSha256: artifact.sha256, requiredWriters: [...REQUIRED_WRITERS],
    seal: { runId: 'synthetic-wiring', windowId: 'window-1', sourceRevision: SOURCE_REVISION, status: 'LOCAL_SOURCES_SEALED',
      closedSourceClients: true, durability: process.platform === 'linux' ? 'POSIX_FSYNC' : 'SYNTHETIC_ONLY', completedAtUtc: artifact.createdAtUtc, evidence: artifact } };
  const held = ['1', '2'].map(value => ({
    containerId: value.repeat(64), imageId: 'sha256:' + 'e'.repeat(64), configDigest: 'f'.repeat(64), createdAtUtc: '2026-01-01T00:00:00Z',
    running: false, paused: false, restarting: false, dead: false, autoRemove: false, status: 'exited', health: null,
    healthcheckConfigured: true, restartPolicy: policy('no'), restartCount: 0,
    startedAtUtc: '2026-01-01T00:00:00Z', finishedAtUtc: '2026-01-01T01:00:00Z',
  }));
  const plan = { ...structuredClone(refs), schemaVersion: 1, profile: 'docker-services-v1', runId: ctx.runId, windowId: ctx.windowId,
    sourceRevision: ctx.sourceRevision, capturedAtUtc: now(), reviewed: true,
    unchangedControls: UNCHANGED_RESUME_CONTROLS.map(id => ({ id, originalSha256: 'a'.repeat(64), heldSha256: 'a'.repeat(64) })),
    services: held.map((snapshot, index) => ({ id: 'service-' + index, hostId: 'host-' + index, dependsOn: index === 1 ? ['service-0'] : [],
      held: snapshot, original: { running: true, restartPolicy: policy('unless-stopped') } })) };
  const hosts = {};
  for (let index = 0; index < 2; index++) {
    const identityFile = path.join(root, 'identity-' + index), knownHostsFile = path.join(root, 'known-hosts-' + index);
    await writeFile(identityFile, 'SYNTHETIC_NOT_A_KEY', { mode: 0o600 });
    await writeFile(knownHostsFile, 'SYNTHETIC_NOT_A_HOST_KEY', { mode: 0o600 });
    hosts['host-' + index] = { hostname: 'host-' + index + '.fixture.invalid', user: 'backup-resume', port: index === 0 ? 22 : 49222, identityFile, knownHostsFile };
  }
  const calls = [], states = new Map(held.map(value => [value.containerId, structuredClone(value)]));
  const command = async (spec, context) => {
    assert.equal(spec.executable, 'ssh'); assert.deepEqual(spec.env, {}); assert.ok(context.signal instanceof AbortSignal);
    const argv = quotedArguments(spec.args.at(-1)), inspect = argv.includes('/usr/bin/python3');
    const containerId = inspect ? argv.at(-2) : argv.at(-1);
    const index = containerId[0] === '1' ? 0 : 1;
    assert.equal(spec.args.at(-2), 'backup-resume@host-' + index + '.fixture.invalid');
    assert.equal(spec.args[4], String(index === 0 ? 22 : 49222));
    assert.ok(spec.args.includes('UserKnownHostsFile=' + path.join(root, 'known-hosts-' + index)));
    const operation = inspect ? 'inspect' : argv.includes('start') ? 'start' : 'policy';
    calls.push({ containerId, operation, spec });
    const state = states.get(containerId);
    if (operation === 'start') Object.assign(state, { running: true, status: 'running', health: 'healthy', startedAtUtc: now(), finishedAtUtc: '0001-01-01T00:00:00Z' });
    if (operation === 'policy') {
      const encoded = argv.find(value => value.startsWith('--restart=')).slice('--restart='.length);
      const [name, retry] = encoded.split(':'); state.restartPolicy = { name, maximumRetryCount: Number(retry ?? 0) };
    }
    return { exitCode: 0, stdout: Buffer.from(inspect ? JSON.stringify(state) : containerId + '\n'), stderr: Buffer.alloc(0) };
  };
  const observeBoundary = async c => ({
    ...structuredClone(refs), schemaVersion: 1, runId: c.runId, windowId: c.windowId, sourceRevision: c.sourceRevision, planSha256: c.planSha256,
    phase: c.phase, observedAtUtc: now(), exclusiveControl: true, sourceReadsStopped: true, coveredWriters: [...REQUIRED_WRITERS],
    mutationsExcluded: c.phase === 'before', originalStateRestored: c.phase === 'after',
    controlDigests: Object.fromEntries(UNCHANGED_RESUME_CONTROLS.map(id => [id, 'a'.repeat(64)])), evidenceRef: 'synthetic-observer',
  });
  const config = { plan, hosts, command, observeBoundary };
  return { root, runRoot, ctx, config, calls, states };
}

test('two-host resume routes every immutable container to its pinned host and durable readback', async t => {
  const f = await fixture(t), resume = createBackupServiceResume(f.config);
  assert.equal(f.calls.length, 0);
  const result = await resume(f.ctx);
  assert.equal(result.status, 'RESUMED'); assert.equal(result.verificationEvidence.evidenceVerified, false);
  assert.deepEqual(f.calls.filter(call => call.operation !== 'inspect').map(call => call.operation + ':' + call.containerId[0]),
    ['start:1', 'policy:1', 'start:2', 'policy:2']);
  const complete = JSON.parse(await readFile(path.join(f.runRoot, 'resume-steps', 'complete.json'), 'utf8'));
  assert.equal(complete.status, 'RESUMED');
  assert.equal(complete.planSha256, result.verificationEvidence.planSha256);
});

test('routing rejects missing, redundant, unsafe and ambiguous host bindings without commands', async t => {
  const f = await fixture(t);
  for (const transform of [
    c => { delete c.hosts['host-1']; },
    c => { c.hosts['unused-host'] = { ...c.hosts['host-0'] }; },
    c => { c.plan.services[0].hostId = 'host;id'; },
    c => { c.plan.services[1].held.containerId = c.plan.services[0].held.containerId; },
    c => { c.hosts['host-0'].env = { SECRET: 'hidden' }; },
    c => { c.hosts['host-0'].port = '22'; },
  ]) {
    const copy = { ...f.config, plan: structuredClone(f.config.plan), hosts: structuredClone(f.config.hosts) };
    transform(copy);
    assert.throws(() => createBackupServiceResume(copy), error =>
      ['INVALID_SERVICE_RESUME_WIRING', 'INVALID_RESUME_DOCKER_TRANSPORT', 'RESUME_UNSUPPORTED_PLAN'].includes(error.code));
  }
  assert.equal(f.calls.length, 0);
});

test('factory captures plan, hosts and provider functions before callers can change them', async t => {
  const f = await fixture(t), resume = createBackupServiceResume(f.config);
  f.config.plan.services[0].hostId = 'host-1'; f.config.plan.services[0].held.containerId = 'b'.repeat(64);
  f.config.hosts['host-0'].hostname = 'unreviewed.fixture.invalid'; f.config.hosts['host-0'].port = 65535;
  f.config.command = async () => assert.fail('must retain original command');
  f.config.observeBoundary = async () => assert.fail('must retain original observer');
  assert.equal((await resume(f.ctx)).status, 'RESUMED');
});

test('lost response on first host cannot start or update the dependent host and leaves intent', async t => {
  const f = await fixture(t), original = f.config.command;
  f.config.command = async (...args) => {
    const result = await original(...args);
    if (f.calls.at(-1).operation === 'start') throw new Error('PRIVATE_SSH_FAILURE');
    return result;
  };
  await assert.rejects(createBackupServiceResume(f.config)(f.ctx), error =>
    error.discardClientRequired === true && error.remoteMayStillRun === true && !error.message.includes('PRIVATE_SSH_FAILURE'));
  assert.deepEqual(f.calls.filter(call => call.operation !== 'inspect').map(call => call.operation + ':' + call.containerId[0]), ['start:1']);
  const journal = await readdir(path.join(f.runRoot, 'resume-steps'));
  assert.ok(journal.includes('001-start-intent.json')); assert.equal(journal.includes('complete.json'), false);
});

test('default transport remains inert and cannot use real SSH from synthetic mode', async t => {
  const f = await fixture(t); delete f.config.command;
  const resume = createBackupServiceResume(f.config);
  await assert.rejects(resume(f.ctx), { code: 'RESUME_OPERATION_FAILED', discardClientRequired: true });
  assert.equal(f.calls.length, 0);
});

test('external fence changes and missing original-state binding still fail before SSH', async t => {
  const f = await fixture(t);
  const changed = structuredClone(f.config.plan); changed.unchangedControls[0].heldSha256 = 'b'.repeat(64);
  assert.throws(() => createBackupServiceResume({ ...f.config, plan: changed }), { code: 'RESUME_UNSUPPORTED_PLAN' });
  const resume = createBackupServiceResume(f.config); delete f.ctx.originalState;
  await assert.rejects(resume(f.ctx), { code: 'RESUME_INVALID_REQUEST' });
  assert.equal(f.calls.length, 0);
});

test('host configuration getters are rejected without invoking them', async t => {
  const f = await fixture(t); let invoked = 0;
  Object.defineProperty(f.config.hosts['host-0'], 'hostname', { enumerable: true, get() { invoked++; return 'unreviewed.fixture.invalid'; } });
  assert.throws(() => createBackupServiceResume(f.config), { code: 'INVALID_SERVICE_RESUME_WIRING' });
  assert.equal(invoked, 0); assert.equal(f.calls.length, 0);
});
