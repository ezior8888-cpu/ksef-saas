import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile, unlink, open } from 'node:fs/promises';
import path from 'node:path';
import { runBackupSequence, REQUIRED_WRITERS, SOURCE_REVISION } from './run-backup-sequence.mjs';
import { fixture } from './fixtures/backup-sequence-fixture.mjs';

const receipt = ctx => ({schemaVersion:1,status:'RESUMED',runId:ctx.runId,windowId:ctx.windowId,
  sourceRevision:ctx.sourceRevision,sealSha256:ctx.sealSha256,coveredWriters:[...REQUIRED_WRITERS],
  sourceReadsStopped:true,originalStateRestored:true,startedAtUtc:new Date().toISOString(),completedAtUtc:new Date().toISOString(),
  verificationEvidence:{synthetic:true}});
async function prepared(t) {
  const f=await fixture(t); f.adapters.closeSourceClients=async()=>{f.calls.push('close');};
  f.adapters.resumeWrites=async ctx=>{f.calls.push('resume');return receipt(ctx);};return f;
}
test('durable local source boundary and explicit resume precede every upload and history read',async t=>{
  const f=await prepared(t),original=f.adapters.resumeWrites;
  f.adapters.resumeWrites=async ctx=>{
    const intent=JSON.parse(await readFile(path.join(ctx.runRoot,'write-resume-intent.json'),'utf8'));
    assert.equal(intent.sealSha256,ctx.sealSha256);
    const seal=JSON.parse(await readFile(path.join(ctx.runRoot,'postgresql','source-seal.json'),'utf8'));
    assert.equal(seal.runId,ctx.runId);assert.equal(ctx.sourceRevision,SOURCE_REVISION);
    assert.ok((await readdir(f.root)).includes('.backup.lock'));return original(ctx);
  };
  const r=await runBackupSequence(f.options);assert.equal(r.status,'SEQUENCE_COMPLETE_REQUIRES_ACCEPTANCE',JSON.stringify(r));
  assert.equal(r.writesState,'RESUMED');assert.equal(r.manifest.schemaVersion,2);
  assert.ok(f.calls.indexOf('close')<f.calls.indexOf('consistency-after'));
  assert.ok(f.calls.indexOf('consistency-after')<f.calls.indexOf('resume'));
  assert.ok(f.calls.indexOf('resume')<f.calls.indexOf('upload-database'));
  assert.equal(f.calls.filter(x=>x==='resume').length,1);
  const db=r.manifest.snapshots.find(s=>s.kind==='database');
  for(const part of ['seal','resume'])assert.ok(db.members.some(m=>m.sha256===r.manifest.sourceBoundary[part].evidence.sha256));
});
for(const field of ['resumeWrites','closeSourceClients'])test('mandatory '+field+' checked before source operations',async t=>{
 const f=await prepared(t);delete f.adapters[field];await assert.rejects(runBackupSequence(f.options),/REQUIRED_ADAPTER_MISSING/);assert.deepEqual(f.calls,[]);
});
test('operational resume needs its own authorization before effects',async t=>{
 const f=await prepared(t);await assert.rejects(runBackupSequence({...f.options,mode:'separately-authorized',authorization:{backup:true}}),/SEPARATE_AUTHORIZATION_REQUIRED/);assert.deepEqual(f.calls,[]);
});
for(const [name,change] of Object.entries({missing:()=>undefined,boolean:()=>true,
 wrongRun:r=>({...r,runId:'another-run'}),wrongWindow:r=>({...r,windowId:'another-window'}),wrongRevision:r=>({...r,sourceRevision:'f'.repeat(40)}),
 wrongSeal:r=>({...r,sealSha256:'f'.repeat(64)}),partialWriters:r=>({...r,coveredWriters:REQUIRED_WRITERS.slice(1)}),
 unstopped:r=>({...r,sourceReadsStopped:false}),unrestored:r=>({...r,originalStateRestored:false}),
 absentProof:r=>({...r,verificationEvidence:{}}),early:r=>({...r,startedAtUtc:'2000-01-01T00:00:00.000Z'}),
 future:r=>({...r,completedAtUtc:'2100-01-01T00:00:00.000Z'})}))test('invalid resume receipt '+name+' retains lock and blocks uploads',async t=>{
 const f=await prepared(t);let count=0;f.adapters.resumeWrites=async ctx=>{count++;return change(receipt(ctx));};
 const r=await runBackupSequence(f.options);assert.equal(r.status,'INCOMPLETE');assert.equal(r.stage,'resume-writes');
 assert.equal(r.writesState,'RESUME_UNKNOWN');assert.equal(r.lockRetained,true);assert.equal(count,1);assert.equal(f.snapshots.size,0);
});
test('source failure keeps writes held and never auto-resumes in cleanup',async t=>{
 const f=await prepared(t);f.adapters.databaseCommand=async()=>({exitCode:3});
 const r=await runBackupSequence(f.options);assert.equal(r.writesState,'HELD');assert.equal(r.lockRetained,true);assert.ok(!f.calls.includes('resume'));
});
test('source operations must be confirmed stopped before seal and resume',async t=>{
 const f=await prepared(t),original=f.adapters.observeConsistency;
 f.adapters.observeConsistency=async ctx=>({...await original(ctx),sourceOperationsStopped:false});
 const r=await runBackupSequence(f.options);assert.equal(r.code,'CONSISTENCY_INTERVAL_NOT_VERIFIED');assert.equal(r.writesState,'HELD');assert.ok(!f.calls.includes('resume'));
});
test('resume exception is uncertain and never retried',async t=>{
 const f=await prepared(t);let count=0;f.adapters.resumeWrites=async()=>{count++;throw Error('PRIVATE');};
 const r=await runBackupSequence(f.options);assert.equal(r.writesState,'RESUME_UNKNOWN');assert.equal(r.lockRetained,true);assert.equal(count,1);assert.equal(f.snapshots.size,0);assert.ok(!JSON.stringify(r).includes('PRIVATE'));
});
test('resume timeout and late completion cannot begin upload or replace uncertain state',async t=>{
 const f=await prepared(t);let finish;f.adapters.resumeWrites=ctx=>new Promise(resolve=>{finish=()=>resolve(receipt(ctx));});
 const r=await runBackupSequence({...f.options,stepTimeoutMs:350,maxDurationMs:15000});
 assert.equal(r.stage,'resume-writes');assert.equal(r.writesState,'RESUME_UNKNOWN');assert.equal(r.lockRetained,true);
 finish();await new Promise(resolve=>setTimeout(resolve,20));assert.equal(r.writesState,'RESUME_UNKNOWN');assert.equal(f.snapshots.size,0);
});
for(const action of ['change','remove','extra'])test('post-resume source '+action+' cannot upload a different set',async t=>{
 const f=await prepared(t);f.adapters.resumeWrites=async ctx=>{
  const filename=path.join(ctx.runRoot,'postgresql',action==='extra'?'extra.txt':'postgres.dump');
  if(action==='remove')await unlink(filename);else await writeFile(filename,'SYNTHETIC CHANGE',{mode:0o600});return receipt(ctx);
 };
 const r=await runBackupSequence(f.options);assert.equal(r.status,'INCOMPLETE');assert.equal(r.writesState,'RESUMED');assert.equal(f.snapshots.size,0);
});
test('confirmed resume remains reported if receipt cannot be stored locally',async t=>{
 const f=await prepared(t);f.adapters.resumeWrites=async ctx=>{await writeFile(path.join(ctx.runRoot,'postgresql','write-resume.json'),'collision',{mode:0o600});return receipt(ctx);};
 const r=await runBackupSequence(f.options);assert.equal(r.status,'INCOMPLETE');assert.equal(r.writesState,'RESUMED');assert.equal(r.lockRetained,true);assert.equal(f.snapshots.size,0);
});
test('long failing history read starts after resume and continues to exclude a parallel backup',async t=>{
 const f=await prepared(t);let entered,finish;
 const began=new Promise(resolve=>{entered=resolve;});
 f.adapters.repositories.read=async()=>{entered();await new Promise(resolve=>{finish=resolve;});throw Error('synthetic history failure');};
 const pending=runBackupSequence(f.options);await Promise.race([began,pending.then(r=>{throw Error('Run ended before history read: '+JSON.stringify(r));})]);
 try {assert.ok(f.calls.includes('resume'));const second=await runBackupSequence({...f.options,runId:'synthetic-other-run'});assert.equal(second.stage,'lock');}
 finally {finish();}
 const r=await pending;assert.equal(r.writesState,'RESUMED');assert.equal(r.status,'INCOMPLETE');assert.equal(f.calls.filter(x=>x==='resume').length,1);
 const disk=JSON.parse(await readFile(path.join(f.root,f.options.runId,'sequence-failed.json'),'utf8'));assert.equal(disk.writesState,'RESUMED');
});

for(const step of ['upload','history','notification'])test('failure during '+step+' preserves confirmed resumed state and never retries resume',async t=>{
 const f=await prepared(t);let count=0;const original=f.adapters.resumeWrites;f.adapters.resumeWrites=async ctx=>{count++;return original(ctx);};
 if(step==='upload')f.adapters.repositories.backup=async()=>{throw Error('synthetic');};
 if(step==='history')f.adapters.repositories.read=async()=>{throw Error('synthetic');};
 if(step==='notification')f.adapters.notify=async ctx=>{if(ctx.event==='synthetic-complete')throw Error('synthetic');};
 const r=await runBackupSequence(f.options);assert.equal(r.status,'INCOMPLETE');assert.equal(r.writesState,'RESUMED');assert.equal(count,1);
});
test('mutation during upload is rejected before its read can certify the snapshot',async t=>{
 const f=await prepared(t),original=f.adapters.repositories.backup;let reads=0;
 f.adapters.repositories.backup=async ctx=>{const result=await original(ctx);await writeFile(path.join(ctx.directory,'extra-after-seal'),'synthetic',{mode:0o600});return result;};
 f.adapters.repositories.read=async()=>{reads++;throw Error('must not read');};
 const r=await runBackupSequence(f.options);assert.equal(r.status,'INCOMPLETE');assert.equal(r.writesState,'RESUMED');assert.equal(reads,0);
});

test('aborted step never starts work queued behind the abort microtask',async t=>{
 const f=await prepared(t),controller=new AbortController(),original=AbortSignal.any;
 t.mock.method(AbortSignal,'any',function(signals){const combined=original.call(this,signals);queueMicrotask(()=>controller.abort());return combined;});
 const r=await runBackupSequence({...f.options,signal:controller.signal});
 assert.equal(r.status,'INCOMPLETE');assert.ok(!f.calls.includes('preflight'));assert.ok(!f.calls.includes('resume'));
});
test('source fsync failure keeps writes held and cannot call resume or upload',async t=>{
 const f=await prepared(t),original=f.adapters.databaseCommand;let patched=false;
 f.adapters.databaseCommand=async(spec,ctx)=>{
  const result=await original(spec,ctx);
  if(!patched){patched=true;const handle=await open(spec.stdoutFile,'r'),stat=await handle.stat(),prototype=Object.getPrototypeOf(handle),sync=prototype.sync;await handle.close();
   t.mock.method(prototype,'sync',async function(){const current=await this.stat();if(current.dev===stat.dev&&current.ino===stat.ino)throw Error('synthetic fsync failure');return sync.call(this);});
  }return result;
 };
 const r=await runBackupSequence(f.options);assert.equal(r.status,'INCOMPLETE');assert.equal(r.stage,'seal-local-sources');assert.equal(r.writesState,'HELD');
 assert.equal(r.lockRetained,true);assert.ok(!f.calls.includes('resume'));assert.equal(f.snapshots.size,0);
});
for(const phase of ['before','after'])for(const field of ['runId','sourceRevision'])test('consistency '+phase+' cannot refer to another '+field,async t=>{
 const f=await prepared(t),original=f.adapters.observeConsistency;f.adapters.observeConsistency=async ctx=>({...await original(ctx),...(ctx.phase===phase?{[field]:'another-value'}:{})});
 const r=await runBackupSequence(f.options);assert.equal(r.status,'INCOMPLETE');assert.equal(r.lockRetained,true);assert.ok(!f.calls.includes('resume'));
});
test('operational mode refuses unsupported platform before any adapter', {skip:process.platform==='linux'},async t=>{
 const f=await prepared(t);await assert.rejects(runBackupSequence({...f.options,mode:'separately-authorized',authorization:{backup:true,resumeWrites:true}}),/UNSUPPORTED_SEQUENCE_PLATFORM/);assert.deepEqual(f.calls,[]);
});
