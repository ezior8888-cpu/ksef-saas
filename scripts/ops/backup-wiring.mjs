#!/usr/bin/env node
/** Private configuration and lazy adapter composition. CLI is offline check-only.
 * A structurally valid configuration is not operational approval or evidence.
 * No imports of private executable modules, env sourcing, freeze/resume or scheduler.
 * The caller supplies reviewed evidence/recovery/notification operations separately.
 */
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SOURCE_REVISION, runBackupSequence } from './run-backup-sequence.mjs';
import { createBackupDatabaseCommand } from './backup-database-command.mjs';
import { createBackupResticAdapter } from './backup-restic.mjs';
import { createBackupResticReaderCommand } from './backup-restic-reader-command.mjs';
import { runBackupCommand } from './backup-runtime.mjs';
import { openBackupSourceClients, validateBackupSourceConfig } from './backup-source-clients.mjs';

const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const only = (x, keys) => record(x) && Object.keys(x).every(k => keys.includes(k));
const absolute = x => typeof x === 'string' && x.length <= 4096 && !/[\0\r\n]/.test(x) && !/^[\\/]{2}/.test(x)
  && (path.posix.isAbsolute(x) || path.win32.isAbsolute(x));
const hostname = x => typeof x === 'string' && x.length <= 253 && x.split('.').every(p => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(p));
const empty = x => record(x) && Object.keys(x).length === 0;
class WiringError extends Error { constructor(code) { super(code); this.code = code; } }
const fail = code => { throw new WiringError(code); };
const inertCommand = async () => { fail('CHECK_MUST_NOT_EXECUTE'); };
const TOP_KEYS = ['schemaVersion','scope','sourceRevision','coordinator','databaseCommand','sources','restic'];
const RESTIC_KEYS = ['repositories','readerRepositories','writerClientId','readerClientId','writerEnv','readerHost','readerRemoteEnvironment'];
function writerEnvironment(env) {
  if (!record(env)) return false;
  return Object.entries(env).every(([k,v]) => (k === 'PATH' && v === '/usr/bin:/bin') || (k === 'LANG' && v === 'C')
    || (['HOME','AWS_SHARED_CREDENTIALS_FILE','AWS_CONFIG_FILE'].includes(k) && absolute(v))
    || (k === 'AWS_PROFILE' && typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v)));
}
function repositoryBindings(value) {
  return record(value) && Object.keys(value).length === 3 && ['database','application','supabase'].every(kind =>
    only(value[kind],['repositoryFile','passwordFile']) && absolute(value[kind].repositoryFile) && absolute(value[kind].passwordFile));
}
function sshHost(value) { return only(value,['hostname','user','port','identityFile','knownHostsFile']); }

export function checkBackupWiring(config) {
  const issues = [];
  if (!only(config,TOP_KEYS)) issues.push('UNEXPECTED_CONFIG_FIELDS');
  if (config?.schemaVersion !== 1 || config?.scope !== 'PREPARATION_ONLY' || config?.sourceRevision !== SOURCE_REVISION) issues.push('SCOPE_OR_REVISION_INVALID');
  const coordinator = config?.coordinator;
  if (!only(coordinator,['hostname','root','readerRoot']) || !hostname(coordinator.hostname)
    || !absolute(coordinator.root) || !absolute(coordinator.readerRoot) || coordinator.root === coordinator.readerRoot) issues.push('COORDINATOR_INCOMPLETE');
  const db = config?.databaseCommand;
  try {
    if (!only(db,['pgContainer','host','env']) || !sshHost(db.host) || !empty(db.env)) throw Error();
    createBackupDatabaseCommand({...db,command:inertCommand});
  } catch { issues.push('DATABASE_TRANSPORT_INCOMPLETE'); }
  try { validateBackupSourceConfig(config?.sources); } catch { issues.push('SOURCE_CLIENTS_INCOMPLETE'); }
  const restic = config?.restic;
  try {
    if (!only(restic,RESTIC_KEYS) || !repositoryBindings(restic.repositories) || !repositoryBindings(restic.readerRepositories)
      || !writerEnvironment(restic.writerEnv) || !sshHost(restic.readerHost)) throw Error();
    const reader = createBackupResticReaderCommand({host:restic.readerHost,repositories:restic.readerRepositories,env:{},
      remoteEnvironment:restic.readerRemoteEnvironment,command:inertCommand});
    createBackupResticAdapter({...restic,writerCommand:inertCommand,readerCommand:reader,readerEnv:{},readerRoot:coordinator?.readerRoot});
  } catch { issues.push('REPOSITORY_TRANSPORT_INCOMPLETE'); }
  if (restic?.readerHost?.hostname === coordinator?.hostname && typeof coordinator?.hostname === 'string') issues.push('READER_NOT_SEPARATE');
  return {schemaVersion:1,status:issues.length?'CONFIGURATION_INCOMPLETE':'CONFIGURATION_STRUCTURALLY_VALID',configurationComplete:issues.length===0,
    issues,operationalReady:false,evidenceVerified:false,connectionsPerformed:false,freezeProcedureExecuted:false,g09Accepted:false};
}

export async function readBackupPrivateConfig(filename,{maxBytes=1024*1024}={}) {
  let handle;
  try {
    if (!absolute(filename) || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 1024*1024) throw Error();
    let cursor=path.dirname(path.resolve(filename));const immediate=cursor;
    while(true) {
      const s=await lstat(cursor);
      if(!s.isDirectory()||s.isSymbolicLink()||(cursor===immediate&&process.platform!=='win32'&&((s.mode&0o077)!==0||s.uid!==process.getuid()))) throw Error();
      const parent=path.dirname(cursor);if(parent===cursor)break;cursor=parent;
    }
    handle=await open(filename,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
    const before=await handle.stat();
    if(!before.isFile()||before.nlink!==1||before.size<1||before.size>maxBytes||(process.platform!=='win32'&&((before.mode&0o077)!==0||before.uid!==process.getuid()))) throw Error();
    const data=Buffer.alloc(maxBytes+1);let bytes=0;
    while(bytes<data.length) { const r=await handle.read(data,bytes,data.length-bytes,null);if(!r.bytesRead)break;bytes+=r.bytesRead; }
    const after=await handle.stat();
    if(bytes!==before.size||bytes>maxBytes||after.size!==before.size||after.mtimeMs!==before.mtimeMs)throw Error();
    return JSON.parse(data.subarray(0,bytes).toString('utf8').replace(/^\uFEFF/,''));
  } catch { fail('PRIVATE_CONFIG_UNREADABLE'); }
  finally { if(handle)try{await handle.close();}catch{fail('PRIVATE_CONFIG_UNREADABLE');} }
}

export function createBackupWiring(config,{operations,command=runBackupCommand,sourceConstructors}={}) {
  if(!checkBackupWiring(config).configurationComplete)fail('WIRING_CONFIG_INCOMPLETE');
  if(!record(operations)||['preflight','observeConsistency','captureRecovery','notify','resumeWrites'].some(k=>typeof operations[k]!=='function'))fail('WIRING_OPERATIONS_MISSING');
  if(typeof command!=='function')fail('WIRING_COMMAND_INVALID');
  const saved=structuredClone(config),provided={...operations};let running=false;
  return {async run({runId,authorization,signal,mode='separately-authorized',maxDurationMs,stepTimeoutMs,history}={}) {
    if(authorization?.backup!==true||(mode==='separately-authorized'&&authorization?.resumeWrites!==true))fail('SEPARATE_AUTHORIZATION_REQUIRED');
    if(signal!==undefined&&!(signal instanceof AbortSignal))fail('WIRING_SIGNAL_INVALID');
    if(running)fail('WIRING_ALREADY_RUNNING');running=true;
    let sourcePromise,sourceBundle,closed=false,result;
    const lifetime=new AbortController();
    const combined=signal?AbortSignal.any([signal,lifetime.signal]):lifetime.signal;
    const sources=async sourceSignal=>{
      if(closed)fail('SOURCE_CLIENTS_ALREADY_CLOSED');
      sourcePromise??=openBackupSourceClients(saved.sources,{signal:sourceSignal?AbortSignal.any([sourceSignal,combined]):combined,constructors:sourceConstructors})
        .then(bundle=>{sourceBundle=bundle;return bundle;});
      return sourcePromise;
    };
    try {
      const dbCommand=createBackupDatabaseCommand({...saved.databaseCommand,command});
      const readerCommand=createBackupResticReaderCommand({host:saved.restic.readerHost,repositories:saved.restic.readerRepositories,env:{},
        remoteEnvironment:saved.restic.readerRemoteEnvironment,command});
      const repositories=createBackupResticAdapter({...saved.restic,writerCommand:command,readerCommand,readerEnv:{},readerRoot:saved.coordinator.readerRoot});
      const adapters={...provided,databaseCommand:dbCommand,repositories,
        async closeSourceClients(){
          closed=true;
          if(sourcePromise)await sourcePromise.catch(()=>undefined);
          const cleanup=sourceBundle?await sourceBundle.close():null;
          if(cleanup?.discardClientRequired||cleanup?.status==='LOCAL_CLOSE_INCOMPLETE')throw Object.assign(new WiringError('SOURCE_CLIENT_CLEANUP_INCOMPLETE'),{discardClientRequired:true});
        },
        database:{bucketBindings:structuredClone(saved.sources.bucketBindings),
          client:{async query(query){return(await sources(query.signal)).database.client.query(query);}},
          supabaseClient:{async query(query){return(await sources(query.signal)).database.supabaseClient.query(query);}}},
        s3:Object.fromEntries(['application','supabase'].map(kind=>[kind,{async send(request,options){return(await sources(options?.abortSignal)).s3[kind].send(request,options);}}]))};
      result=await runBackupSequence({root:saved.coordinator.root,runId,authorization,signal:combined,mode,pgContainer:saved.databaseCommand.pgContainer,
        adapters,...(maxDurationMs===undefined?{}:{maxDurationMs}),...(stepTimeoutMs===undefined?{}:{stepTimeoutMs}),...(history===undefined?{}:{history})});
      return result;
    } catch(error) { if(error instanceof WiringError)throw error;fail('WIRING_RUN_FAILED'); }
    finally {
      closed=true;lifetime.abort();
      try { if(sourcePromise)await sourcePromise.catch(()=>undefined); }
      finally {
        try {
          const cleanup=sourceBundle?await sourceBundle.close():null;
          if(result){result.sourceClientOpenAttempted=Boolean(sourcePromise);result.sourceClientsOpened=Boolean(sourceBundle);result.sourceClientCleanup=cleanup;
            if(cleanup?.discardClientRequired)result.sourceCleanupCode='SOURCE_CLIENT_CLEANUP_INCOMPLETE';}
        } finally { running=false; }
      }
    }
  }};
}

export async function main(args=[],write=text=>process.stdout.write(text)) {
  if(args.length===0||(args.length===1&&args[0]==='--help')) {
    write('Preparation only. --check ABSOLUTE_PRIVATE_JSON validates configuration offline; no connections, backups, freeze/resume, or approval.\n');return 0;
  }
  if(args.length!==2||args[0]!=='--check'){write('Only offline --check is supported.\n');return 2;}
  try {const result=checkBackupWiring(await readBackupPrivateConfig(args[1]));write(JSON.stringify(result,null,2)+'\n');return result.configurationComplete?0:1;}
  catch {write('{"status":"PRIVATE_CONFIG_UNREADABLE","operationalReady":false}\n');return 1;}
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)process.exitCode=await main(process.argv.slice(2));
