import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { SOURCE_REVISION, REQUIRED_WRITERS, RECOVERY_COVERAGE } from '../run-backup-sequence.mjs';
import { makeSyntheticBackupDbClients } from './backup-db-client.mjs';
import { inventoryBackupFiles } from '../backup-artifacts.mjs';
const readyKeys = ['sourceInventoryReviewed','dumpPrivilegesAndVersionsVerified','runtimeSchemaReviewed','sourceMapReviewed','spaceVerified','minioProfilesVerified','targetEuOffHostVerified','targetIndependentOfStaging','keyEscrowVerified','independentReaderVerified','consistencyProcedureApproved'];
export async function fixture(t, dbOptions = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'f0-sequence-synthetic-'));
  t.after(async () => {
    if (path.dirname(path.resolve(root)) !== path.resolve(tmpdir()) || !path.basename(root).startsWith('f0-sequence-synthetic-')) throw new Error('UNSAFE_TEST_CLEANUP');
    await rm(root, { recursive: true, force: true });
  });
  const calls = [], events = [], snapshots = new Map();
  let sequence = 0;
  const preflight = { sourceRevision: SOURCE_REVISION, databaseNames: ['postgres','_supabase'], minioIds: ['application','supabase'],
    readiness: Object.fromEntries(readyKeys.map(k => [k,true])), targets: Object.fromEntries(['database','application','supabase'].map(kind => [kind,
      { repositoryId: 'synthetic-repo-' + kind, region: 'EU', offSourceHosts: true, independentOfStaging: true, clientSideEncryption: true,
        escrowEvidence: { synthetic: true, kind } }])) };
  const db = makeSyntheticBackupDbClients(dbOptions);
  const emptyS3 = { async send(command) { assert.equal(command.constructor.name, 'ListBucketsCommand'); return { Buckets: [] }; } };
  const adapters = {
    async preflight() { calls.push('preflight'); return structuredClone(preflight); },
    async observeConsistency(ctx) { calls.push('consistency-' + ctx.phase); return { windowId: 'synthetic-window', mutationsExcluded: true,
      entireIntervalVerified: ctx.phase === 'after', coveredWriters: REQUIRED_WRITERS }; },
    async captureRecovery(ctx) { calls.push('recovery'); await writeFile(ctx.outputPath, 'SYNTHETIC ENCRYPTED RECOVERY', { flag: 'wx', mode: 0o600 });
      return { encrypted: true, configurationIncluded: true, keysIncluded: true, coverage: RECOVERY_COVERAGE, evidence: { synthetic: true } }; },
    async databaseCommand(spec) { calls.push(spec.id); await writeFile(spec.stdoutFile, 'SYNTHETIC ' + spec.id, { flag: 'wx', mode: 0o600 }); return { exitCode: 0 }; },
    database: db.options, s3: { application: emptyS3, supabase: emptyS3 },
    repositories: {
      async backup(ctx) {
        calls.push('upload-' + (path.basename(ctx.directory) === 'manifest' ? 'manifest' : ctx.kind));
        const snapshotId = createHash('sha256').update('synthetic snapshot ' + (++sequence)).digest('hex');
        snapshots.set(snapshotId, await inventoryBackupFiles(ctx.directory));
        return { repositoryId: preflight.targets[ctx.kind].repositoryId, snapshotId, createdAtUtc: new Date().toISOString(), resticExitCode: 0 };
      },
      async read(ctx) { calls.push('read-' + (path.basename(ctx.files[0].path) === 'manifest.json' ? 'manifest' : ctx.kind));
        return { repositoryId: preflight.targets[ctx.kind].repositoryId, snapshotId: ctx.snapshotId, exitCode: 0, independentClient: true,
          files: snapshots.get(ctx.snapshotId), checkedAtUtc: new Date().toISOString(), evidence: { synthetic: true } }; }
    },
    async notify(event) { events.push(event.event); }
  };
  const options = { root, runId: 'synthetic-run-001', mode: 'synthetic', pgContainer: 'synthetic-postgres', adapters };
  return { root, calls, events, preflight, adapters, options, db, snapshots };
}

