/** Explicit pinned SSH transport for repository READ operations only.
 * Imports/factory perform no I/O. Only invocation can contact an approved reader.
 * Remote credentials are never copied or passed as argv values: remoteEnvironment
 * accepts file pointers only. Those remote files, their permissions and service
 * credentials must already be independently provisioned and reviewed. No remote
 * file/host independence or working repository authentication is proved here.
 * In particular, SFTP requires the private remote HOME/.ssh setup to be reviewed.
 * Private local SSH files/ancestors must remain stable while SSH reopens them.
 * Windows supports injected synthetic transports only; real runtime is Linux.
 */
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { BackupRuntimeError, runBackupCommand } from './backup-runtime.mjs';

const SOURCES = ['database', 'application', 'supabase'];
const REMOTE_POINTERS = ['HOME', 'AWS_SHARED_CREDENTIALS_FILE', 'AWS_CONFIG_FILE'];
const HASH = /^[a-f0-9]{64}$/;
const CODES = new Set(['INVALID_RESTIC_READER_TRANSPORT','INVALID_RESTIC_READER_COMMAND',
  'UNSAFE_RESTIC_READER_SSH_FILE','RESTIC_READER_ABORTED','RESTIC_READER_TIMEOUT','RESTIC_READER_COMMAND_FAILED']);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const quote = argument => "'" + argument.replaceAll("'", "'\\''") + "'";
function failure(code, remoteMayStillRun = false) {
  const safe = CODES.has(code) ? code : 'RESTIC_READER_COMMAND_FAILED';
  return Object.assign(new Error('Backup repository read incomplete: ' + safe), { code:safe, remoteMayStillRun, discardClientRequired:remoteMayStillRun });
}
const fail = code => { throw failure(code); };
function remotePath(value) {
  return typeof value === 'string' && value.length > 1 && value.length <= 4096 && path.posix.isAbsolute(value)
    && !value.startsWith('//') && !/[\0\r\n]/.test(value) && path.posix.normalize(value) === value && !value.endsWith('/');
}
function localPath(value) {
  return typeof value === 'string' && path.isAbsolute(value) && !/[\0\r\n]/.test(value)
    && !value.startsWith('\\\\') && !value.startsWith('//')
    && path.resolve(value) !== path.parse(path.resolve(value)).root
    && (process.platform !== 'win32' || !value.slice(2).includes(':'));
}
function validateConfiguration(config) {
  if (!record(config) || !record(config.host) || !record(config.env) || Object.keys(config.env).length !== 0
    || !record(config.remoteEnvironment) || Object.entries(config.remoteEnvironment).some(([key,value]) => !REMOTE_POINTERS.includes(key) || !remotePath(value))
    || !record(config.repositories) || Object.keys(config.repositories).length !== SOURCES.length
    || (config.command !== undefined && typeof config.command !== 'function')) fail('INVALID_RESTIC_READER_TRANSPORT');
  const host=config.host;
  if (typeof host.hostname !== 'string' || host.hostname.length > 253
    || !host.hostname.split('.').every(part => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(part))
    || typeof host.user !== 'string' || !/^[a-z_][a-z0-9_-]{0,31}$/.test(host.user) || host.port !== 22) fail('INVALID_RESTIC_READER_TRANSPORT');
  for (const filename of [host.identityFile, host.knownHostsFile]) {
    // These values additionally pass through OpenSSH's own option parser.
    if (!localPath(filename) || /[\s'"%\x00-\x1f\x7f]/.test(filename)) fail('INVALID_RESTIC_READER_TRANSPORT');
  }
  for (const source of SOURCES) {
    const repository=config.repositories[source];
    if (!record(repository) || !remotePath(repository.repositoryFile) || !remotePath(repository.passwordFile)) fail('INVALID_RESTIC_READER_TRANSPORT');
  }
}
async function privateSshFile(filename) {
  let cursor=path.dirname(path.resolve(filename)); const immediate=cursor;
  while (true) {
    const stat=await lstat(cursor);
    if (!stat.isDirectory() || stat.isSymbolicLink()
      || (cursor===immediate && process.platform!=='win32' && ((stat.mode&0o077)!==0 || stat.uid!==process.getuid()))) fail('UNSAFE_RESTIC_READER_SSH_FILE');
    const parent=path.dirname(cursor); if (parent===cursor) break; cursor=parent;
  }
  const handle=await open(filename,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
  try {
    const stat=await handle.stat();
    if (!stat.isFile() || stat.size<1 || stat.size>1024**2
      || (process.platform!=='win32' && ((stat.mode&0o077)!==0 || stat.uid!==process.getuid()))) fail('UNSAFE_RESTIC_READER_SSH_FILE');
  } finally { await handle.close(); }
}
function validateCommand(spec, repositories) {
  if (!record(spec) || Object.keys(spec).some(key=>!['executable','args','env','stdoutFile'].includes(key))
    || spec.executable!=='restic' || !record(spec.env) || Object.keys(spec.env).length!==0 || !Array.isArray(spec.args)
    || spec.args.some(arg=>typeof arg!=='string'||/[\0\r\n]/.test(arg))
    || spec.args[0]!=='--repository-file'||spec.args[2]!=='--password-file'||spec.args[4]!=='--no-cache'
    || !repositories.some(repository=>spec.args[1]===repository.repositoryFile&&spec.args[3]===repository.passwordFile)) fail('INVALID_RESTIC_READER_COMMAND');
  const args=spec.args.slice(5), [operation]=args;
  const permitted=(operation==='cat'&&args.length===2&&args[1]==='config')
    || (operation==='snapshots'&&args.length===3&&args[1]==='--json'&&HASH.test(args[2]))
    || (operation==='check'&&args.length===2&&args[1]==='--read-data')
    || (operation==='dump'&&args.length===3&&HASH.test(args[1])&&remotePath(args[2]));
  if (!permitted || (operation==='dump' ? !localPath(spec.stdoutFile) : spec.stdoutFile!==undefined)) fail('INVALID_RESTIC_READER_COMMAND');
}

export function createBackupResticReaderCommand(config) {
  validateConfiguration(config);
  const host={...config.host}, repositories=SOURCES.map(source=>({...config.repositories[source]}));
  const remoteEnvironment=Object.fromEntries(REMOTE_POINTERS.filter(key=>Object.hasOwn(config.remoteEnvironment,key)).map(key=>[key,config.remoteEnvironment[key]]));
  const command=config.command??runBackupCommand;
  return async (spec,context={}) => {
    const started=performance.now();
    validateCommand(spec,repositories);
    if (!Number.isSafeInteger(context.timeoutMs)||context.timeoutMs<1||context.timeoutMs>12*60*60*1000
      || (context.signal!==undefined&&!(context.signal instanceof AbortSignal))) fail('INVALID_RESTIC_READER_COMMAND');
    if (context.signal?.aborted) fail('RESTIC_READER_ABORTED');
    try { await privateSshFile(host.identityFile); await privateSshFile(host.knownHostsFile); }
    catch { throw failure('UNSAFE_RESTIC_READER_SSH_FILE'); }
    if (context.signal?.aborted) fail('RESTIC_READER_ABORTED');
    const timeoutMs=Math.floor(context.timeoutMs-(performance.now()-started));
    if (timeoutMs<1) fail('RESTIC_READER_TIMEOUT');
    const remote=['/usr/bin/env','-i','PATH=/usr/bin:/bin','LANG=C',
      ...Object.entries(remoteEnvironment).map(([key,value])=>key+'='+value),'/usr/bin/restic',...spec.args];
    // Same pinning and no-forwarding policy as the reviewed PostgreSQL transport.
    const args=[
      '-F','/dev/null','-T','-p','22','-i',host.identityFile,
      '-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',
      '-o','UserKnownHostsFile='+host.knownHostsFile,'-o','GlobalKnownHostsFile=/dev/null',
      '-o','IdentitiesOnly=yes','-o','IdentityAgent=none',
      '-o','PreferredAuthentications=publickey','-o','PasswordAuthentication=no',
      '-o','KbdInteractiveAuthentication=no','-o','GSSAPIAuthentication=no','-o','HostbasedAuthentication=no',
      '-o','ForwardAgent=no','-o','ClearAllForwardings=yes','-o','PermitLocalCommand=no',
      '-o','ProxyCommand=none','-o','ProxyJump=none','-o','ControlMaster=no','-o','ControlPath=none',
      '-o','UpdateHostKeys=no','-o','ConnectTimeout=15','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=2',
      host.user+'@'+host.hostname,remote.map(quote).join(' '),
    ];
    try {
      const result=await command({executable:'ssh',args,env:{},...(spec.stdoutFile===undefined?{}:{stdoutFile:spec.stdoutFile})},{...context,timeoutMs});
      if (!result||result.exitCode!==0) throw failure('RESTIC_READER_COMMAND_FAILED',true);
      return result;
    } catch(error) {
      const errorResult=error instanceof BackupRuntimeError?error:failure('RESTIC_READER_COMMAND_FAILED',true);
      errorResult.remoteMayStillRun=true;errorResult.discardClientRequired=true;throw errorResult;
    }
  };
}
