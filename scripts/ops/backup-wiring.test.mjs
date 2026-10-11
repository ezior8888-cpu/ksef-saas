import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, chmod, writeFile, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { checkBackupWiring, readBackupPrivateConfig, createBackupWiring, main } from './backup-wiring.mjs';
import { SOURCE_REVISION } from './run-backup-sequence.mjs';

function config(root = '/synthetic/coordinator') {
  const repositories = side => Object.fromEntries(['database','application','supabase'].map(kind => [kind,{repositoryFile:'/synthetic/'+side+'/'+kind+'.repository',passwordFile:'/synthetic/'+side+'/'+kind+'.password'}]));
  const host = hostname => ({hostname,user:'root',port:22,identityFile:'/synthetic/private/identity',knownHostsFile:'/synthetic/private/known_hosts'});
  const db = databaseName => ({host:'127.0.0.1',port:5432,user:'synthetic',password:'SYNTHETIC_PRIVATE_PASSWORD',databaseName,tls:{mode:'loopback-tunnel'}});
  const s3 = endpoint => ({endpoint,region:'eu-test-1',accessKeyId:'SYNTHETIC_PRIVATE_ACCESS',secretAccessKey:'SYNTHETIC_PRIVATE_SECRET',tls:{mode:'loopback-tunnel'}});
  return {schemaVersion:1,scope:'PREPARATION_ONLY',sourceRevision:SOURCE_REVISION,
    coordinator:{hostname:'ops.fixture.invalid',root,readerRoot:path.join(root,'reader')},
    databaseCommand:{pgContainer:'synthetic-postgres',host:host('db.fixture.invalid'),env:{}},
    sources:{database:{postgres:db('postgres'),supabase:db('_supabase')},s3:{application:s3('http://127.0.0.1:19000'),supabase:s3('http://127.0.0.1:19001')},bucketBindings:{applicationPrimary:'synthetic-primary',applicationBackups:{mode:'shared',bucket:'synthetic-primary'}}},
    restic:{repositories:repositories('writer'),readerRepositories:repositories('reader'),writerClientId:'synthetic-writer',readerClientId:'synthetic-reader',writerEnv:{PATH:'/usr/bin:/bin'},readerHost:host('reader.fixture.invalid'),readerRemoteEnvironment:{HOME:'/synthetic/reader-home'}}};
}
async function temporary(t) {
  const root=await mkdtemp(path.join(os.tmpdir(),'f0-wiring-test-')); await chmod(root,0o700);
  t.after(async()=>{if(path.dirname(path.resolve(root))!==path.resolve(os.tmpdir())||!path.basename(root).startsWith('f0-wiring-test-'))throw Error('UNSAFE_CLEANUP');await rm(root,{recursive:true,force:true});});return root;
}
const operations = () => ({preflight:async()=>({}),observeConsistency:async()=>({}),captureRecovery:async()=>({}),notify:async()=>{}});

test('complete configuration check stays offline and never certifies readiness',()=>{
 const result=checkBackupWiring(config()); assert.equal(result.configurationComplete,true,JSON.stringify(result));
 assert.equal(result.operationalReady,false); assert.equal(result.evidenceVerified,false);
 assert.ok(!JSON.stringify(result).includes('PRIVATE')); assert.ok(!JSON.stringify(result).includes('fixture.invalid'));
});
test('draft and unknown fields report safe gaps without clients or private values',()=>{
 const c=config(); c.restic.readerHost=null;c.sources.database.postgres.password=null;c.unexpected='PRIVATE';
 const r=checkBackupWiring(c); assert.equal(r.configurationComplete,false);assert.ok(r.issues.includes('UNEXPECTED_CONFIG_FIELDS'));
 assert.ok(!JSON.stringify(r).includes('PRIVATE'));
});
test('reader endpoint cannot equal the declared coordinator endpoint',()=>{
 const c=config();c.restic.readerHost.hostname=c.coordinator.hostname;
 assert.ok(checkBackupWiring(c).issues.includes('READER_NOT_SEPARATE'));
});
test('reader files and writer environment cannot silently use ambient or arbitrary credential values',()=>{
 const c=config(); delete c.restic.readerRepositories;c.restic.writerEnv.AWS_SECRET_ACCESS_KEY='PRIVATE';
 assert.equal(checkBackupWiring(c).configurationComplete,false);
});
test('private config reads actual bounded JSON and rejects directories and oversized files',async t=>{
 const root=await temporary(t),file=path.join(root,'config.json');await writeFile(file,JSON.stringify(config(root)),{mode:0o600});
 assert.equal((await readBackupPrivateConfig(file)).sourceRevision,SOURCE_REVISION);
 await assert.rejects(readBackupPrivateConfig(root),/PRIVATE_CONFIG_UNREADABLE/);
 await assert.rejects(readBackupPrivateConfig(file,{maxBytes:2}),/PRIVATE_CONFIG_UNREADABLE/);
});
test('CLI exposes only a safe offline check and rejects execution flags',async t=>{
 const root=await temporary(t),file=path.join(root,'config.json');await writeFile(file,JSON.stringify(config(root)),{mode:0o600});
 let output='';assert.equal(await main(['--check',file],text=>output+=text),0);assert.ok(!output.includes('PRIVATE'));assert.ok(!output.includes(root));
 assert.equal(await main(['--execute',file],()=>{}),2);
});
test('wiring factory requires operational callbacks and separate execution authorization before clients',async()=>{
 const c=config();assert.throws(()=>createBackupWiring(c,{operations:{}}),/WIRING_OPERATIONS_MISSING/);
 const runner=createBackupWiring(c,{operations:operations()});
 await assert.rejects(runner.run({runId:'synthetic-run-100'}),/SEPARATE_AUTHORIZATION_REQUIRED/);
});
test('failed preflight never opens source clients or starts SSH',async t=>{
 const root=await temporary(t),c=config(root);await mkdir(c.coordinator.readerRoot,{mode:0o700});let commands=0;
 const runner=createBackupWiring(c,{operations:operations(),command:async()=>{commands++;throw Error('must not execute');}});
 const result=await runner.run({runId:'synthetic-run-100',authorization:{backup:true},mode:'synthetic'});
 assert.equal(result.status,'INCOMPLETE');assert.equal(result.code,'PREFLIGHT_INCOMPLETE');assert.equal(commands,0);
 assert.equal(result.sourceClientsOpened,false);
});

import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fixture as sequenceFixture } from './fixtures/backup-sequence-fixture.mjs';
import { inventoryBackupFiles } from './backup-artifacts.mjs';

async function integratedWiring(t,{s3Failure=false,closeFailure=false,badConsistency=false}={}) {
 const f=await sequenceFixture(t),c=config(f.root),events=[],stored=new Map();let counter=0;
 await chmod(f.root,0o700);await mkdir(c.coordinator.readerRoot,{mode:0o700});
 const credentials=path.join(f.root,'credentials');await mkdir(credentials,{mode:0o700});
 for(const name of ['identity','known_hosts'])await writeFile(path.join(credentials,name),'SYNTHETIC FILE',{mode:0o600});
 for(const host of [c.databaseCommand.host,c.restic.readerHost]){host.identityFile=path.join(credentials,'identity');host.knownHostsFile=path.join(credentials,'known_hosts');}
 const sha=value=>createHash('sha256').update(value).digest('hex');
 for(const kind of ['database','application','supabase'])f.preflight.targets[kind].repositoryId=sha('synthetic-repo-'+kind);
 class PgClient extends EventEmitter {
  constructor(options){super();this.options=options;this.inner=options.database==='postgres'?f.db.client:f.db.supabaseClient;events.push('construct-db');}
  async connect(){assert.ok((await import('node:fs')).existsSync(path.join(f.root,'.backup.lock')));events.push('connect-db');}
  async query(query){return this.inner.query(query);}
  async end(){events.push('close-db');if(closeFailure)throw Error('PRIVATE END ERROR');}
 }
 class S3Client {
  constructor(){events.push('construct-s3');}
  async send(command){if(s3Failure)throw Error('PRIVATE ENDPOINT');assert.equal(command.constructor.name,'ListBucketsCommand');return {Buckets:[]};}
  destroy(){events.push('close-s3');}
 }
 const response=value=>({exitCode:0,stdout:Buffer.from(typeof value==='string'?value:JSON.stringify(value)),stderr:Buffer.alloc(0)});
 const command=async spec=>{
  let args=spec.args;
  if(spec.executable==='ssh') {
   // Synthetic names/paths contain no apostrophe. Never evaluates shell text.
   const remote=[...args.at(-1).matchAll(/'([^']*)'/g)].map(m=>m[1]);
   if(remote[0]==='/usr/bin/docker'){await writeFile(spec.stdoutFile,'SYNTHETIC DATABASE BYTES',{flag:'wx',mode:0o600});return response('');}
   assert.ok(remote.includes('/usr/bin/restic'));args=remote.slice(remote.indexOf('/usr/bin/restic')+1);
  }
  const verb=args[5],kind=path.posix.basename(args[1]).split('.')[0];events.push(verb);
  if(verb==='cat')return response({version:2,id:f.preflight.targets[kind].repositoryId});
  if(verb==='backup') {
   assert.equal(events.filter(x=>x==='close-db').length,2);assert.equal(events.filter(x=>x==='close-s3').length,2);
   const directory=args.at(-1),id=sha('snapshot-'+(++counter)),payload=new Map();
   for(const file of await inventoryBackupFiles(directory))payload.set(file.path,await readFile(file.path));
   const tags=args.flatMap((arg,i)=>arg==='--tag'?[args[i+1]]:[]);
   stored.set(id,{row:{id,hostname:args[args.indexOf('--host')+1],paths:[directory],tags,time:new Date().toISOString()},payload});
   return response({message_type:'summary',snapshot_id:id});
  }
  if(verb==='snapshots')return response([stored.get(args.at(-1)).row]);
  if(verb==='check')return response('');
  if(verb==='dump'){await writeFile(spec.stdoutFile,stored.get(args[6]).payload.get(args[7]),{flag:'wx',mode:0o600});return response('');}
  assert.fail('Unexpected synthetic command');
 };
 if(badConsistency){const original=f.adapters.observeConsistency;f.adapters.observeConsistency=async ctx=>({...await original(ctx),entireIntervalVerified:false});}
 const runner=createBackupWiring(c,{operations:f.adapters,command,sourceConstructors:{PgClient,S3Client}});
 return {...f,c,runner,events,stored};
}
test('full private wiring composes actual sequence and separate SSH reader with synthetic clients', {skip:process.platform==='win32'},async t=>{
 const f=await integratedWiring(t);
 const r=await f.runner.run({runId:'synthetic-wiring-001',authorization:{backup:true},mode:'synthetic'});
 assert.equal(r.status,'SEQUENCE_COMPLETE_REQUIRES_ACCEPTANCE',JSON.stringify(r));assert.equal(f.stored.size,4);
 assert.equal(r.sourceClientCleanup.status,'LOCAL_CLOSE_COMPLETED');assert.equal(r.sourceClientsOpened,true);
});
test('uncertain S3 failure propagates through full wiring and retains the run lock',async t=>{
 const f=await integratedWiring(t,{s3Failure:true});
 const r=await f.runner.run({runId:'synthetic-wiring-002',authorization:{backup:true},mode:'synthetic'});
 assert.equal(r.status,'INCOMPLETE');assert.equal(r.lockRetained,true);assert.equal(f.stored.size,0);
 assert.equal(f.events.filter(x=>x==='close-db').length,2);assert.ok(!JSON.stringify(r).includes('PRIVATE'));
});
test('failed client close blocks full wiring before upload and keeps the lock',async t=>{
 const f=await integratedWiring(t,{closeFailure:true});
 const r=await f.runner.run({runId:'synthetic-wiring-003',authorization:{backup:true},mode:'synthetic'});
 assert.equal(r.status,'INCOMPLETE');assert.equal(r.stage,'close-source-clients');assert.equal(r.lockRetained,true);assert.equal(f.stored.size,0);
});

test('failed consistency still closes sources under lock and retains it when cleanup fails',async t=>{
 const f=await integratedWiring(t,{badConsistency:true,closeFailure:true});
 const r=await f.runner.run({runId:'synthetic-wiring-004',authorization:{backup:true},mode:'synthetic'});
 assert.equal(r.status,'INCOMPLETE');assert.equal(r.code,'CONSISTENCY_INTERVAL_NOT_VERIFIED');assert.equal(r.lockRetained,true);
 assert.equal(f.stored.size,0);assert.equal(f.events.filter(x=>x==='close-db').length,2);
});
test('invalid caller signal cannot leave the reusable wiring permanently locked',async()=>{
 const runner=createBackupWiring(config(),{operations:operations()});
 await assert.rejects(runner.run({runId:'synthetic-wiring-005',authorization:{backup:true},signal:{}}));
 await assert.rejects(runner.run({runId:'synthetic-wiring-006',authorization:{backup:true},signal:{}}),e=>e.message!=='WIRING_ALREADY_RUNNING');
});
