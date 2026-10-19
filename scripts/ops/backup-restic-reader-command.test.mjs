import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createBackupResticReaderCommand } from './backup-restic-reader-command.mjs';
import { BackupRuntimeError, runBackupCommand } from './backup-runtime.mjs';

const snapshot = 'a'.repeat(64);
const bindings = Object.fromEntries(['database','application','supabase'].map(kind => [kind, {
  repositoryFile: '/reader-private/' + kind + '.repository', passwordFile: '/reader-private/' + kind + '.password',
}]));
const prefix = ['--repository-file', bindings.database.repositoryFile, '--password-file', bindings.database.passwordFile, '--no-cache'];
const spec = (args, extra = {}) => ({ executable: 'restic', args: [...prefix, ...args], env: {}, ...extra });
const quoted = value => "'" + value.replaceAll("'", "'\\''") + "'";
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'f0-restic-reader-test-'));
  await chmod(root, 0o700);
  t.after(async () => {
    if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('f0-restic-reader-test-')) throw new Error('UNSAFE_TEST_CLEANUP');
    await rm(root, { recursive: true, force: true });
  });
  const identityFile = path.join(root, 'identity'), knownHostsFile = path.join(root, 'known_hosts');
  await writeFile(identityFile, 'SYNTHETIC_NOT_A_KEY', { mode: 0o600 });
  await writeFile(knownHostsFile, 'SYNTHETIC_NOT_A_HOST_KEY', { mode: 0o600 });
  return { root, config: { repositories: bindings, env: {}, remoteEnvironment: {
    HOME: '/reader-private/home', AWS_SHARED_CREDENTIALS_FILE: '/reader-private/aws-credentials', AWS_CONFIG_FILE: '/reader-private/aws-config',
  }, host: { hostname: 'reader.fixture.invalid', user: 'backup-reader', port: 22, identityFile, knownHostsFile } } };
}

test('pinned reader allows only four exact read operations and clears remote environment', async t => {
  const { root, config } = await fixture(t), calls = [];
  const reader = createBackupResticReaderCommand({ ...config, command: async (command, context) => { calls.push({ command, context }); return { exitCode: 0, stdout: Buffer.alloc(0) }; } });
  const controller = new AbortController();
  const commands = [spec(['cat','config']), spec(['snapshots','--json',snapshot]), spec(['check','--read-data']), spec(['dump',snapshot,'/staging/run/payload.bin'], { stdoutFile: path.join(root, 'read.payload') })];
  for (const command of commands) await reader(command, { timeoutMs: 1000, signal: controller.signal, maxStdoutBytes: 4096 });
  for (let i = 0; i < calls.length; i++) {
    const { command, context } = calls[i];
    assert.equal(command.executable, 'ssh'); assert.deepEqual(command.env, {});
    assert.deepEqual(command.args.slice(0,7), ['-F','/dev/null','-T','-p','22','-i',config.host.identityFile]);
    for (const flag of ['BatchMode=yes','StrictHostKeyChecking=yes','UserKnownHostsFile=' + config.host.knownHostsFile,
      'GlobalKnownHostsFile=/dev/null','IdentitiesOnly=yes','IdentityAgent=none','PasswordAuthentication=no','KbdInteractiveAuthentication=no',
      'ForwardAgent=no','ClearAllForwardings=yes','ProxyCommand=none','ProxyJump=none','ControlMaster=no','ControlPath=none','PermitLocalCommand=no','UpdateHostKeys=no']) assert.ok(command.args.includes(flag));
    assert.equal(command.args.at(-2), 'backup-reader@reader.fixture.invalid');
    const remote = ['/usr/bin/env','-i','PATH=/usr/bin:/bin','LANG=C', ...Object.entries(config.remoteEnvironment).map(([key,value]) => key + '=' + value), '/usr/bin/restic', ...commands[i].args];
    assert.equal(command.args.at(-1), remote.map(quoted).join(' '));
    assert.equal(command.stdoutFile, commands[i].stdoutFile);
    assert.equal(context.signal, controller.signal); assert.ok(context.timeoutMs <= 1000 && context.timeoutMs > 0);
    assert.equal(context.maxStdoutBytes, 4096);
  }
});

test('invalid argv, arbitrary repository, secret env, file redirection and destructive operations never invoke transport', async t => {
  const { root, config } = await fixture(t); let calls = 0;
  const reader = createBackupResticReaderCommand({ ...config, command: async () => { calls++; } });
  const invalid = [
    spec(['backup','/staging']), spec(['init']), spec(['forget','--prune']), spec(['unlock']), spec(['restore',snapshot]),
    spec(['cat','masterkey']), spec(['snapshots','--json']), spec(['snapshots','--json','latest']), spec(['check','--read-data','--no-lock']),
    spec(['dump',snapshot,'../../outside'], { stdoutFile: path.join(root,'dump') }), spec(['dump',snapshot,'/staging/file']),
    spec(['cat','config'], { stdoutFile: path.join(root,'output') }), spec(['cat','config'], { stdinFile: path.join(root,'input') }),
    spec(['cat','config'], { env: { AWS_SECRET_ACCESS_KEY: 'PRIVATE_SECRET' } }), spec(['cat','config'], { executable:'sh' }),
    spec(['cat','config'], { args: ['--repository-file','/unapproved/repository',...prefix.slice(2),'cat','config'] }),
    spec(['cat','config'], { args: [...prefix,'cat','config','; id'] }),
  ];
  for (const command of invalid) await assert.rejects(reader(command, { timeoutMs: 1000 }), { code:'INVALID_RESTIC_READER_COMMAND' });
  assert.equal(calls, 0);
});

test('remote environment only accepts explicit absolute POSIX file pointers and never credential values', async t => {
  const { config } = await fixture(t);
  for (const remoteEnvironment of [{ AWS_SECRET_ACCESS_KEY:'PRIVATE_SECRET' }, { PATH:'/other' }, { HOME:'relative' },
    { HOME:'/private/../other' }, { HOME:'/private\nOTHER=secret' }, { AWS_CONFIG_FILE:'C:\\private\\config' }, null]) {
    assert.throws(() => createBackupResticReaderCommand({ ...config, remoteEnvironment }), { code:'INVALID_RESTIC_READER_TRANSPORT' });
  }
  for (const host of [{ user:undefined }, { user:'backup-reader;id' }, { hostname:'-oProxyCommand=id' }, { identityFile:'relative' }, { knownHostsFile:'/private/host%h' }]) {
    assert.throws(() => createBackupResticReaderCommand({ ...config, host:{...config.host,...host} }), { code:'INVALID_RESTIC_READER_TRANSPORT' });
  }
  assert.throws(() => createBackupResticReaderCommand({ ...config, env:{ SECRET:'PRIVATE_SECRET' } }), { code:'INVALID_RESTIC_READER_TRANSPORT' });
});

test('remote pointer metacharacters are quoted as one assignment without shell expansion', async t => {
  const { config } = await fixture(t); let remote;
  const value = "/reader-private/home'$(id)";
  const reader = createBackupResticReaderCommand({ ...config, remoteEnvironment:{HOME:value}, command:async command => { remote=command.args.at(-1); return {exitCode:0}; } });
  await reader(spec(['cat','config']), {timeoutMs:1000});
  assert.ok(remote.includes(quoted('HOME=' + value)));
});

test('pre-abort skips transport; runtime timeout/abort and raw failures retain remote uncertainty without diagnostics', async t => {
  const { config } = await fixture(t); let calls=0;
  const controller=new AbortController(); controller.abort();
  const inactive=createBackupResticReaderCommand({...config,command:async()=>{calls++;}});
  await assert.rejects(inactive(spec(['cat','config']),{timeoutMs:1000,signal:controller.signal}),{code:'RESTIC_READER_ABORTED'});
  assert.equal(calls,0);
  for(const failure of [new BackupRuntimeError('COMMAND_TIMEOUT'),new BackupRuntimeError('COMMAND_ABORTED'),new Error('PRIVATE_SECRET')]) {
    const reader=createBackupResticReaderCommand({...config,command:async()=>{throw failure;}});
    await assert.rejects(reader(spec(['cat','config']),{timeoutMs:1000}),error=>error.discardClientRequired===true&&error.remoteMayStillRun===true&&!error.message.includes('PRIVATE_SECRET')&&!error.cause);
  }
});

test('dump stdout is streamed through runtime into a fresh local file and cannot overwrite', async t => {
  const {root,config}=await fixture(t), output=path.join(root,'read.payload'); let spawns=0;
  const reader=createBackupResticReaderCommand({...config,command:(command,context)=>runBackupCommand(command,{...context,spawnImpl:(_executable,_args,options)=>{
    spawns++;assert.equal(options.shell,false);return spawn(process.execPath,['-e',"process.stdout.write('synthetic remote repository bytes')"],options);
  }})});
  const command=spec(['dump',snapshot,'/staging/file.bin'],{stdoutFile:output});
  const result=await reader(command,{timeoutMs:1000,maxStdoutBytes:1024});
  assert.equal(result.stdout.length,0);assert.equal(await readFile(output,'utf8'),'synthetic remote repository bytes');
  await assert.rejects(reader(command,{timeoutMs:1000,maxStdoutBytes:1024}),{code:'OUTPUT_EXISTS'});
  assert.equal(spawns,1);
});

test('private SSH files and non-symlink parents are required before any transport', async t => {
  const {root,config}=await fixture(t), actual=path.join(root,'actual'),alias=path.join(root,'alias');
  await mkdir(actual,{mode:0o700});await writeFile(path.join(actual,'identity'),'fixture',{mode:0o600});
  await symlink(actual,alias,process.platform==='win32'?'junction':'dir');
  const reader=createBackupResticReaderCommand({...config,host:{...config.host,identityFile:path.join(alias,'identity')},command:async()=>assert.fail('must not run')});
  await assert.rejects(reader(spec(['cat','config']),{timeoutMs:1000}),{code:'UNSAFE_RESTIC_READER_SSH_FILE'});
  await writeFile(config.host.identityFile,'');
  const empty=createBackupResticReaderCommand({...config,command:async()=>assert.fail('must not run')});
  await assert.rejects(empty(spec(['cat','config']),{timeoutMs:1000}),{code:'UNSAFE_RESTIC_READER_SSH_FILE'});
});

test('world-readable SSH credentials are rejected on POSIX', {skip:process.platform==='win32'}, async t=>{
  const {config}=await fixture(t);await chmod(config.host.identityFile,0o644);
  const reader=createBackupResticReaderCommand({...config,command:async()=>assert.fail('must not run')});
  await assert.rejects(reader(spec(['cat','config']),{timeoutMs:1000}),{code:'UNSAFE_RESTIC_READER_SSH_FILE'});
});


test('explicit SSH ports including loopback high ports remain pinned without creating forwarding', async t => {
  const { config } = await fixture(t);
  for (const port of [1, 22, 1024, 49222, 65535]) {
    await t.test('port ' + port, async () => {
      const calls = [];
      const reader = createBackupResticReaderCommand({
        ...config, host: { ...config.host, hostname: '127.0.0.1', port },
        command: async command => { calls.push(command); return { exitCode: 0 }; },
      });
      assert.equal(calls.length, 0);
      await reader(spec(['cat', 'config']), { timeoutMs: 1000 });
      assert.equal(calls.length, 1);
      const command = calls[0];
      assert.equal(command.executable, 'ssh');
      assert.deepEqual(command.env, {});
      assert.deepEqual(command.args.slice(0, 7), ['-F', '/dev/null', '-T', '-p', String(port), '-i', config.host.identityFile]);
      assert.equal(command.args.filter(argument => argument === '-p').length, 1);
      assert.equal(command.args.at(-2), 'backup-reader@127.0.0.1');
      for (const option of ['StrictHostKeyChecking=yes', 'UserKnownHostsFile=' + config.host.knownHostsFile,
        'GlobalKnownHostsFile=/dev/null', 'IdentitiesOnly=yes', 'IdentityAgent=none', 'BatchMode=yes',
        'ForwardAgent=no', 'ClearAllForwardings=yes', 'ProxyCommand=none', 'ProxyJump=none',
        'PermitLocalCommand=no', 'ControlMaster=no', 'ControlPath=none']) assert.ok(command.args.includes(option));
      assert.equal(command.args.some(argument => ['-R', '-L', '-D', '-A'].includes(argument) || argument.startsWith('HostKeyAlias=')), false);
    });
  }
});

test('SSH port must be an explicit integer in range without coercion or option injection', async t => {
  const { config } = await fixture(t); let calls = 0, coercions = 0;
  const injectedObject = { toString() { coercions++; return '22 -oStrictHostKeyChecking=no'; }, valueOf() { coercions++; return 22; } };
  const invalid = [undefined, null, false, true, '22', '49222', '22 -oStrictHostKeyChecking=no',
    '22\nProxyCommand=id', 0, -1, 65536, 22.5, Number.NaN, Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, 22n, [], [22], {}, injectedObject];
  for (const port of invalid) {
    assert.throws(() => createBackupResticReaderCommand({
      ...config, host: { ...config.host, port }, command: async () => { calls++; },
    }), { code: 'INVALID_RESTIC_READER_TRANSPORT' });
  }
  const hostWithoutPort = { ...config.host }; delete hostWithoutPort.port;
  assert.throws(() => createBackupResticReaderCommand({ ...config, host: hostWithoutPort }), { code: 'INVALID_RESTIC_READER_TRANSPORT' });
  assert.equal(calls, 0);
  assert.equal(coercions, 0);
});

test('reader captures the reviewed port and host configuration before caller mutation', async t => {
  const { config } = await fixture(t); let received;
  const supplied = {
    ...config, host: { ...config.host, hostname: '127.0.0.1', port: 49222 },
    command: async command => { received = command; return { exitCode: 0 }; },
  };
  const reader = createBackupResticReaderCommand(supplied);
  supplied.host.port = '22 -oStrictHostKeyChecking=no';
  supplied.host.hostname = 'unreviewed.fixture.invalid';
  supplied.host.user = 'other-user';
  supplied.host.identityFile = path.join(path.dirname(config.host.identityFile), 'unreviewed-identity');
  supplied.host.knownHostsFile = path.join(path.dirname(config.host.knownHostsFile), 'unreviewed-known-hosts');
  supplied.command = async () => assert.fail('must keep the original injected transport');
  await reader(spec(['cat', 'config']), { timeoutMs: 1000 });
  assert.deepEqual(received.args.slice(0, 7), ['-F', '/dev/null', '-T', '-p', '49222', '-i', config.host.identityFile]);
  assert.equal(received.args.at(-2), 'backup-reader@127.0.0.1');
  assert.ok(received.args.includes('UserKnownHostsFile=' + config.host.knownHostsFile));
  assert.ok(received.args.includes('StrictHostKeyChecking=yes'));
});
