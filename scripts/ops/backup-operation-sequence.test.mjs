import test from 'node:test';
import assert from 'node:assert/strict';
import { runBackupSequence } from './run-backup-sequence.mjs';
import { fixture } from './fixtures/backup-sequence-fixture.mjs';
for (const [name, adapter, change, code] of [
 ['foreign preflight', 'preflight', v => ({...v,runId:'another-run'}), 'PREFLIGHT_INCOMPLETE'],
 ['stale preflight', 'preflight', v => ({...v,completedAtUtc:'2000-01-01T00:00:00.000Z'}), 'PREFLIGHT_INCOMPLETE'],
 ['secret-bearing preflight', 'preflight', v => ({...v,env:{PRIVATE:'do-not-serialize'}}), 'PREFLIGHT_INCOMPLETE'],
 ['unbound recovery', 'captureRecovery', v => ({...v,windowId:'foreign-window'}), 'RECOVERY_CONFIGURATION_INCOMPLETE'],
 ['wrong recovery hash', 'captureRecovery', v => ({...v,artifact:{...v.artifact,sha256:'f'.repeat(64)}}), 'RECOVERY_CONFIGURATION_INCOMPLETE'],
 ['missing original state', 'observeConsistency', v => ({...v,originalState:undefined}), 'CONSISTENCY_NOT_ESTABLISHED'],
]) test(name+' fails before upload or resume',async t=>{
 const f=await fixture(t),original=f.adapters[adapter];f.adapters[adapter]=async c=>change(await original(c));
 const result=await runBackupSequence(f.options);assert.equal(result.status,'INCOMPLETE');assert.equal(result.code,code);assert.equal(f.snapshots.size,0);assert.ok(!f.calls.includes('resume'));
});
test('after proof must retain the original and temporary state binding',async t=>{
 const f=await fixture(t),original=f.adapters.observeConsistency;f.adapters.observeConsistency=async c=>{const value=await original(c);if(c.phase==='after')value.heldState.sha256='f'.repeat(64);return value;};
 const result=await runBackupSequence(f.options);assert.equal(result.code,'CONSISTENCY_INTERVAL_NOT_VERIFIED');assert.equal(result.writesState,'HELD');assert.equal(result.lockRetained,true);
});
test('notification undefined stays unconfirmed while accepted receipt never proves delivery',async t=>{
 for(const accepted of [false,true]){
  const f=await fixture(t);if(accepted)f.adapters.notify=async c=>({schemaVersion:1,runId:c.runId,sourceRevision:c.sourceRevision,event:c.event,status:'PROVIDER_ACCEPTED',startedAtUtc:new Date().toISOString(),completedAtUtc:new Date().toISOString(),evidence:{evidenceRef:'synthetic-notify',sha256:'a'.repeat(64)}});
  const result=await runBackupSequence(f.options);assert.equal(result.status,'SEQUENCE_COMPLETE_REQUIRES_ACCEPTANCE');assert.equal(result.notification.status,accepted?'PROVIDER_ACCEPTED':'UNCONFIRMED');assert.equal(result.notification.deliveryVerified,false);
 }
});

test('provider cannot rewrite validation context to admit stale preflight',async t=>{const f=await fixture(t),original=f.adapters.preflight;f.adapters.preflight=async c=>{const v=await original(c);c.startedAtUtc='1999-01-01T00:00:00.000Z';v.startedAtUtc='2000-01-01T00:00:00.000Z';return v;};const r=await runBackupSequence(f.options);assert.equal(r.code,'PREFLIGHT_INCOMPLETE');assert.equal(f.snapshots.size,0);});
test('resume receipt getter is rejected without execution and lock is retained',async t=>{const f=await fixture(t),original=f.adapters.resumeWrites;let touched=false;f.adapters.resumeWrites=async c=>{const v=await original(c);Object.defineProperty(v,'status',{enumerable:true,get(){touched=true;return'RESUMED';}});return v;};const r=await runBackupSequence(f.options);assert.equal(r.code,'WRITE_RESUME_NOT_VERIFIED');assert.equal(r.writesState,'RESUME_UNKNOWN');assert.equal(r.lockRetained,true);assert.equal(touched,false);assert.equal(f.snapshots.size,0);});
