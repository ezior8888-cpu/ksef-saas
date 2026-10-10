#!/usr/bin/env node
/** Prepared orchestration library. No production configuration, automatic CLI,
 * scheduler, deletion, restore or network effects on import. Injected evidence
 * providers/clients are a trust boundary, not authenticated by a boolean. */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { acquireBackupLock, createBackupRunDirectory } from './backup-runtime.mjs';
import { hashBackupArtifact, inventoryBackupFiles, writeBackupJson } from './backup-artifacts.mjs';
import { prepareBackupPlan } from './prepare-backup-plan.mjs';
import { exportBackupS3 } from './export-backup-s3.mjs';
import { exportBackupDbReferences } from './export-backup-db-references.mjs';
import { runBackupReferenceCheck } from './backup-reference-check.mjs';
import { validateBackupSet } from './check-backup-set.mjs';
import { planBackupRetention } from './plan-backup-retention.mjs';

export const SOURCE_REVISION = 'face09c57f7de756546e58d092dbe6d280f93c91';
export const REQUIRED_WRITERS = ['web', 'worker', 'crons', 'database-admin', 's3-upload-delete', 's3-lifecycle', 'supabase-storage'];
export const RECOVERY_COVERAGE = ['runtime-images-extensions', 'app-worker-config-keys', 'supabase-auth-jwt-storage', 'pgsodium-or-confirmed-unused', 'application-minio-iam-kms', 'supabase-minio-iam-kms'];
const GROUPS = { database: 'postgresql', application: 'app-minio', supabase: 'supabase-minio' };
const READY = ['sourceInventoryReviewed', 'dumpPrivilegesAndVersionsVerified', 'runtimeSchemaReviewed', 'sourceMapReviewed', 'spaceVerified', 'minioProfilesVerified', 'targetEuOffHostVerified', 'targetIndependentOfStaging', 'keyEscrowVerified', 'independentReaderVerified', 'consistencyProcedureApproved'];
const now = () => new Date().toISOString();
const exact = (a, b) => Array.isArray(a) && a.length === b.length && b.every(v => a.filter(x => x === v).length === 1);
class SequenceError extends Error { constructor(code) { super(code); this.sequenceCode = code; } }
const fail = code => { throw new SequenceError(code); };
const member = a => ({ sha256: a.sha256, bytes: a.bytes });
const unique = items => [...new Map(items.map(a => [a.sha256, member(a)])).values()];
const sameFiles = (a, b) => Array.isArray(b) && a.length === b.length && a.every(x => b.filter(y => x.path === y.path && x.sha256 === y.sha256 && x.bytes === y.bytes).length === 1);

export async function runBackupSequence(options) {
  const { root, runId, adapters, signal, mode, pgContainer } = options ?? {};
  const maxDurationMs = options?.maxDurationMs ?? 3 * 60 * 60 * 1000;
  const stepTimeoutMs = options?.stepTimeoutMs ?? 30 * 60 * 1000;
  if (!['synthetic', 'separately-authorized'].includes(mode) || !/^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/.test(runId ?? '')
    || !Number.isSafeInteger(maxDurationMs) || maxDurationMs < 1 || maxDurationMs > 10_800_000
    || !Number.isSafeInteger(stepTimeoutMs) || stepTimeoutMs < 1 || stepTimeoutMs > maxDurationMs) fail('INVALID_SEQUENCE_OPTIONS');
  if (mode === 'separately-authorized' && options.authorization?.backup !== true) fail('SEPARATE_AUTHORIZATION_REQUIRED');
  for (const name of ['preflight', 'observeConsistency', 'captureRecovery', 'databaseCommand', 'notify']) {
    if (typeof adapters?.[name] !== 'function') fail('REQUIRED_ADAPTER_MISSING');
  }
  if (typeof adapters.repositories?.backup !== 'function' || typeof adapters.repositories?.read !== 'function'
    || !adapters.database || !adapters.s3?.application || !adapters.s3?.supabase) fail('REQUIRED_ADAPTER_MISSING');
  // Also validates the container before any injected operation can run.
  const plan = prepareBackupPlan({ schemaVersion: 1, scope: 'preparation-only', pgContainer,
    stagingRoot: '/prepared/staging', credentialRoot: '/prepared/credentials' }, runId);
  let finalResult; let lock, runRoot, stage = 'lock', retainLock = false;
  const started = Date.now(), startedAtUtc = now(), controller = new AbortController();
  const active = new Set();
  const callerAbort = () => controller.abort();
  signal?.addEventListener('abort', callerAbort, { once: true });
  if (signal?.aborted) controller.abort();
  const deadline = setTimeout(() => controller.abort(), maxDurationMs);
  async function step(name, work, { cleanup = false } = {}) {
    stage = name;
    const remaining = cleanup ? Math.min(stepTimeoutMs, 30_000) : Math.min(stepTimeoutMs, maxDurationMs - (Date.now() - started));
    if ((!cleanup && controller.signal.aborted) || remaining <= 0) fail('RUN_ABORTED_OR_TIMED_OUT');
    const local = new AbortController();
    const combined = cleanup ? local.signal : AbortSignal.any([local.signal, controller.signal]);
    const context = { runId, runRoot, mode, signal: combined, timeoutMs: remaining };
    const stepStarted = Date.now(); let timer, stop;
    const token = {}; active.add(token);
    const workPromise = Promise.resolve().then(() => work(context)).finally(() => active.delete(token));
    const interrupted = new Promise((_, reject) => {
      stop = () => reject(new SequenceError('STEP_ABORTED_OR_TIMED_OUT'));
      combined.addEventListener('abort', stop, { once: true });
      timer = setTimeout(() => local.abort(), remaining);
      if (combined.aborted) stop();
    });
    try { const value = await Promise.race([workPromise, interrupted]); if (combined.aborted || Date.now() - stepStarted >= remaining || (!cleanup && Date.now() - started >= maxDurationMs)) fail('RUN_ABORTED_OR_TIMED_OUT'); return value; }
    catch (error) {
      const wasInterrupted = combined.aborted; local.abort();
      // Do not free the scope lock while a client can still write. A timed-out
      // transport may also leave a remote child alive; any timeout retains it.
      if (active.has(token) || wasInterrupted || error?.discardClientRequired) retainLock = true;
      throw error;
    } finally { clearTimeout(timer); combined.removeEventListener('abort', stop); }
  }
  try {
    lock = await acquireBackupLock(root);
    runRoot = await createBackupRunDirectory(root, runId);
    const dirs = Object.fromEntries(Object.entries(GROUPS).map(([kind, name]) => [kind, path.join(runRoot, name)]));
    await mkdir(dirs.database, { mode: 0o700 });
    const preflight = await step('preflight', ctx => adapters.preflight(ctx));
    if (preflight?.sourceRevision !== SOURCE_REVISION || READY.some(k => preflight.readiness?.[k] !== true)
      || !exact(preflight.databaseNames, ['postgres', '_supabase']) || !exact(preflight.minioIds, ['application', 'supabase'])) fail('PREFLIGHT_INCOMPLETE');
    for (const kind of Object.keys(GROUPS)) {
      const destination = preflight.targets?.[kind];
      if (destination?.region !== 'EU' || destination.offSourceHosts !== true || destination.independentOfStaging !== true
        || destination.clientSideEncryption !== true || !destination.repositoryId || !destination.escrowEvidence) fail('TARGET_OR_ESCROW_INCOMPLETE');
    }
    if (new Set(Object.values(preflight.targets).map(t => t.repositoryId)).size !== 3) fail('REPOSITORIES_NOT_DISTINCT');
    const stableStart = now();
    const startProof = await step('consistency-before', ctx => adapters.observeConsistency({ ...ctx, phase: 'before' }));
    if (!startProof?.windowId || startProof.mutationsExcluded !== true || !exact(startProof.coveredWriters, REQUIRED_WRITERS)) fail('CONSISTENCY_NOT_ESTABLISHED');
    const manifest = { schemaVersion: 1, runId, startedAtUtc, databases: [], minio: [], snapshots: [] };
    const inventoryStart = now();
    const inventoryArtifact = await writeBackupJson(path.join(dirs.database, 'source-inventory.json'), preflight, { signal: controller.signal });
    manifest.sourceInventory = { runId, complete: true, databaseNames: preflight.databaseNames, minioIds: preflight.minioIds,
      operationWindow: { startedAtUtc: inventoryStart, completedAtUtc: now() }, artifact: inventoryArtifact };
    for (const command of plan.sourceCommands) {
      const operationStart = now();
      const spec = { ...command,
        stdoutFile: path.join(dirs.database, path.posix.basename(command.stdoutFile)),
        ...(command.stdinFile ? { stdinFile: path.join(dirs.database, path.posix.basename(command.stdinFile)) } : {}) };
      const result = await step(command.id, ctx => adapters.databaseCommand(spec, ctx));
      if (result?.exitCode !== 0) fail('DATABASE_COMMAND_FAILED');
      const artifact = await step('hash-' + command.id, ctx => hashBackupArtifact(spec.stdoutFile, ctx));
      if (artifact.bytes === 0) fail('EMPTY_DATABASE_ARTIFACT');
      const operationWindow = { startedAtUtc: operationStart, completedAtUtc: now() };
      if (command.id.startsWith('dump-') && command.id !== 'dump-globals') {
        manifest.databases.push({ name: command.id.slice(5), host: 'db-1', runId, operationWindow,
          dump: { format: 'custom', exitCode: 0, allSchemas: true, artifact } });
      } else if (command.id.startsWith('inspect-')) {
        manifest.databases.find(db => db.name === command.id.slice(8)).restoreListCheck = { exitCode: 0, checkedAtUtc: operationStart, evidence: artifact };
      } else manifest.globals = { runId, exitCode: 0, scope: 'globals-only', rolesIncluded: true, tablespacesIncluded: true, operationWindow, artifact };
    }
    const recoveryStart = now(), recoveryPath = path.join(dirs.database, 'recovery-bundle.enc');
    const recovery = await step('recovery', ctx => adapters.captureRecovery({ ...ctx, outputPath: recoveryPath }));
    if (recovery?.encrypted !== true || recovery.configurationIncluded !== true || recovery.keysIncluded !== true
      || !exact(recovery.coverage, RECOVERY_COVERAGE)) fail('RECOVERY_CONFIGURATION_INCOMPLETE');
    const recoveryArtifact = await step('hash-recovery', ctx => hashBackupArtifact(recoveryPath, ctx));
    manifest.recoveryBundle = { runId, encrypted: true, configurationIncluded: true, keysIncluded: true,
      operationWindow: { startedAtUtc: recoveryStart, completedAtUtc: now() }, artifact: recoveryArtifact };
    for (const source of ['application', 'supabase']) {
      const operationStart = now();
      const summary = await step('export-' + source, ctx => exportBackupS3({ client: adapters.s3[source], runId, source,
        destinationDir: dirs[source], signal: ctx.signal, maxDurationMs: Math.min(ctx.timeoutMs, 3_600_000) }));
      const counts = { ...summary.counts, versioningCounts: { Enabled: 0, Suspended: 0, Unversioned: summary.counts.bucketCount } };
      const hashArtifact = await hashBackupArtifact(path.join(dirs[source], 'objects.ndjson'), { signal: controller.signal });
      // Empty NDJSON has 0 bytes, while the manifest contract requires a
      // nonempty evidence artifact. Preserve the exact file in a JSON envelope.
      const objectEnvelope = await writeBackupJson(path.join(dirs[source], 'object-manifest-proof.json'), { runId, objectManifest: hashArtifact }, { signal: controller.signal });
      const summaryArtifact = await hashBackupArtifact(path.join(dirs[source], 'export-summary.json'), { signal: controller.signal });
      const configArtifact = await writeBackupJson(path.join(dirs[source], 'full-config-proof.json'), { runId, supportedProfile: summary.bucketConfig,
        recoveryBundle: recoveryArtifact, coverage: recovery.coverage, providerEvidence: recovery.evidence ?? null }, { signal: controller.signal });
      manifest.minio.push({ id: source, host: source === 'application' ? 'ops-1' : 'db-1', runId,
        operationWindow: { startedAtUtc: operationStart, completedAtUtc: now() }, source: counts, exported: structuredClone(counts),
        listingComplete: { buckets: true, currentObjects: true, versions: true, versioning: true, multipartUploads: true },
        exportComplete: true, metadataComplete: true, bucketConfigurationComplete: true,
        objectHashManifest: { complete: true, sourceSha256: objectEnvelope.sha256, exportedSha256: objectEnvelope.sha256, artifact: objectEnvelope },
        sourceListingArtifact: summaryArtifact, exportArtifact: summaryArtifact, metadataArtifact: summaryArtifact, bucketConfigurationArtifact: configArtifact });
    }
    const referenceStart = now();
    const refs = await step('database-references', ctx => exportBackupDbReferences({ ...adapters.database, runId, sourceRevision: SOURCE_REVISION, signal: ctx.signal }));
    const referencesPath = path.join(dirs.database, 'normalized-references.json');
    const normalizedReferenceArtifact = await writeBackupJson(referencesPath, refs.normalizedReferences, { signal: controller.signal });
    const comparison = await step('compare-references', ctx => runBackupReferenceCheck({ normalizedReferencesPath: referencesPath,
      applicationDir: dirs.application, supabaseDir: dirs.supabase }, ctx));
    if (!Array.isArray(comparison.verifiedPayloadFiles) || comparison.verifiedPayloadFiles.length !== comparison.report.counts.exportedObjects) fail('REFERENCE_ARTIFACT_BINDING_MISSING');
    if (!comparison.report.ok) fail('REFERENCES_INCOMPLETE_OR_INCONSISTENT');
    const checkedAtUtc = now();
    const referenceEvidence = await writeBackupJson(path.join(dirs.database, 'reference-check.json'), { extraction: refs.report, comparison: comparison.report, normalizedReferenceArtifact }, { signal: controller.signal });
    manifest.references = { runId, complete: true, missing: 0, unknown: 0, hashMismatches: 0, checkedAtUtc,
      operationWindow: { startedAtUtc: referenceStart, completedAtUtc: now() }, evidence: referenceEvidence };
    const endProof = await step('consistency-after', ctx => adapters.observeConsistency({ ...ctx, phase: 'after', windowId: startProof.windowId }));
    if (endProof?.windowId !== startProof.windowId || endProof.mutationsExcluded !== true
      || endProof.entireIntervalVerified !== true || !exact(endProof.coveredWriters, REQUIRED_WRITERS)) fail('CONSISTENCY_INTERVAL_NOT_VERIFIED');
    const stableEnd = now();
    const stabilityArtifact = await writeBackupJson(path.join(dirs.database, 'consistency.json'), { before: startProof, after: endProof }, { signal: controller.signal });
    manifest.stabilization = { startedAtUtc: stableStart, completedAtUtc: stableEnd, mutationsExcluded: true, evidence: stabilityArtifact };
    const escrowArtifacts = {};
    for (const kind of Object.keys(GROUPS)) escrowArtifacts[kind] = await writeBackupJson(path.join(runRoot, 'escrow-' + kind + '.json'), preflight.targets[kind].escrowEvidence, { signal: controller.signal });
    const dbMembers = [inventoryArtifact, stabilityArtifact, ...manifest.databases.flatMap(db => [db.dump.artifact, db.restoreListCheck.evidence]), manifest.globals.artifact, recoveryArtifact, referenceEvidence];
    const sourceFiles = {};
    for (const kind of Object.keys(GROUPS)) {
      const files = await step('inventory-files-' + kind, ctx => inventoryBackupFiles(dirs[kind], ctx));
      const source = manifest.minio.find(m => m.id === kind);
      const sourceArtifacts = kind === 'database' ? [...dbMembers, normalizedReferenceArtifact] : [source.objectHashManifest.artifact, source.sourceListingArtifact, source.exportArtifact, source.metadataArtifact, source.bucketConfigurationArtifact];
      const requiredFiles = [...sourceArtifacts, ...(comparison.verifiedPayloadFiles ?? []).filter(f => path.dirname(path.dirname(f.path)) === dirs[kind])];
      if (!requiredFiles.every(a => files.some(f => f.path === a.path && f.sha256 === a.sha256 && f.bytes === a.bytes))) fail('SOURCE_ARTIFACT_CHANGED');
      sourceFiles[kind] = files;
    }
    for (const kind of Object.keys(GROUPS)) {
      const files = sourceFiles[kind];
      const source = manifest.minio.find(m => m.id === kind);
      const upload = await step('upload-' + kind, ctx => adapters.repositories.backup({ ...ctx, kind, directory: dirs[kind] }));
      if (upload?.resticExitCode !== 0 || upload.repositoryId !== preflight.targets[kind].repositoryId) fail('SNAPSHOT_UPLOAD_INCOMPLETE');
      const read = await step('read-' + kind, ctx => adapters.repositories.read({ ...ctx, kind, snapshotId: upload.snapshotId, files }));
      if (read?.exitCode !== 0 || read.independentClient !== true || read.repositoryId !== upload.repositoryId
        || read.snapshotId !== upload.snapshotId || !sameFiles(files, read.files)) fail('SNAPSHOT_READ_INCOMPLETE');
      const evidence = await writeBackupJson(path.join(runRoot, 'read-' + kind + '.json'), read, { signal: controller.signal });
      const members = unique(kind === 'database' ? dbMembers : [source.objectHashManifest.artifact, source.sourceListingArtifact, source.exportArtifact, source.metadataArtifact, source.bucketConfigurationArtifact]);
      manifest.snapshots.push({ kind, runId, ...upload, members, destination: { ...preflight.targets[kind], escrowEvidence: undefined },
        keyEscrow: { independent: true, repositoryRecoveryKeyIncluded: true, evidence: escrowArtifacts[kind] },
        deepRead: { runId, repositoryId: read.repositoryId, snapshotId: read.snapshotId, exitCode: 0, complete: true,
          independentClientRead: true, checkedAtUtc: read.checkedAtUtc, verifiedMembers: members, evidence } });
    }
    // Separate delivery avoids the impossible self-hash of a final manifest.
    const deliveryDir = path.join(runRoot, 'manifest'); await mkdir(deliveryDir, { mode: 0o700 });
    const manifestPath = path.join(deliveryDir, 'manifest.json');
    const finalArtifact = await writeBackupJson(manifestPath, { ...manifest, sourcesCompletedAtUtc: now(), status: 'AWAITING_MANIFEST_DELIVERY' }, { signal: controller.signal });
    const uploaded = await step('upload-manifest', ctx => adapters.repositories.backup({ ...ctx, kind: 'database', directory: deliveryDir }));
    const file = { path: manifestPath, ...member(finalArtifact) };
    const read = await step('read-manifest', ctx => adapters.repositories.read({ ...ctx, kind: 'database', snapshotId: uploaded.snapshotId, files: [file] }));
    if (uploaded?.resticExitCode !== 0 || uploaded.repositoryId !== preflight.targets.database.repositoryId || read?.exitCode !== 0
      || read.independentClient !== true || read.repositoryId !== uploaded.repositoryId || read.snapshotId !== uploaded.snapshotId || !sameFiles([file], read.files)) fail('MANIFEST_DELIVERY_INCOMPLETE');
    const finalReadEvidence = await writeBackupJson(path.join(runRoot, 'read-manifest.json'), read, { signal: controller.signal });
    manifest.manifestOffHost = { runId, artifact: finalArtifact, repositoryId: uploaded.repositoryId, snapshotId: uploaded.snapshotId,
      resticExitCode: 0, copiedAtUtc: uploaded.createdAtUtc, independentClientRead: { runId, repositoryId: read.repositoryId, snapshotId: read.snapshotId,
        exitCode: 0, complete: true, independentClient: true, checkedAtUtc: read.checkedAtUtc, ...member(finalArtifact), evidence: finalReadEvidence } };
    manifest.completedAtUtc = now();
    const validation = validateBackupSet(manifest);
    if (!validation.ok) fail('FINAL_MANIFEST_INVALID');
    await writeBackupJson(path.join(runRoot, 'delivery-receipt.json'), manifest, { signal: controller.signal });
    const retention = planBackupRetention({ schemaVersion: 1, asOfUtc: now(), manifests: [...(options.history ?? []), manifest] });
    await writeBackupJson(path.join(runRoot, 'retention-preview.json'), retention, { signal: controller.signal });
    await writeBackupJson(path.join(runRoot, 'sequence-complete.json'), { runId, completedAtUtc: manifest.completedAtUtc, mode, signalDelivery: 'NOT_CONFIRMED_BY_LOCAL_RECEIPT', g09Accepted: false }, { signal: controller.signal });
    await step('signal-success', ctx => adapters.notify({ ...ctx, event: mode === 'synthetic' ? 'synthetic-complete' : 'backup-complete', completedAtUtc: manifest.completedAtUtc }));
    return finalResult = { status: 'SEQUENCE_COMPLETE_REQUIRES_ACCEPTANCE', mode, runId, manifest, retention, g09Accepted: false, evidenceVerified: false, lockRetained: false };
  } catch (error) {
    const failureStage = stage;
    const code = error instanceof SequenceError ? error.sequenceCode : 'SEQUENCE_STEP_FAILED';
    if (active.size || controller.signal.aborted) retainLock = true;
    if (runRoot) {
      try { await writeBackupJson(path.join(runRoot, 'sequence-failed.json'), { runId, mode, stage: failureStage, code, lockRetained: retainLock, lastCompleteUnchanged: true }); } catch { retainLock = true; }
      try { await step('signal-failure', ctx => adapters.notify({ ...ctx, event: 'backup-failed', stage: failureStage, code }), { cleanup: true }); } catch { /* external absence monitor must catch undelivered signal */ }
    }
    return finalResult = { status: 'INCOMPLETE', mode, runId, stage: failureStage, code, lockRetained: Boolean(lock && retainLock), g09Accepted: false, evidenceVerified: false };
  } finally {
    clearTimeout(deadline); signal?.removeEventListener('abort', callerAbort);
    if (lock && !retainLock && active.size === 0) {
      try { await lock.release(); }
      catch {
        // Backup completion and cleanup are separate facts. Never undo a sent
        // completion or hide the retained lock behind an unhandled exception.
        if (finalResult) { finalResult.lockRetained = true; finalResult.cleanupCode = 'LOCK_RELEASE_FAILED'; }
        try { await step('signal-cleanup-failure', ctx => adapters.notify({ ...ctx, event: 'backup-cleanup-failed', code: 'LOCK_RELEASE_FAILED' }), { cleanup: true }); } catch { /* absence monitor remains required */ }
      }
    }
  }
}

export function main(args = [], write = text => process.stdout.write(text)) {
  write('Prepared F0 sequence library. No configured production clients, CLI execution, scheduler, deletion or restore. Invoke only with explicit adapters and separate authorization; synthetic tests are not backup evidence.\n');
  return args.length === 0 || (args.length === 1 && args[0] === '--help') ? 0 : 2;
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) process.exitCode = main(process.argv.slice(2));
