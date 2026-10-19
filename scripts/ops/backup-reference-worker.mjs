import { parentPort, workerData } from 'node:worker_threads';
import { prepareBackupReferenceInput } from './prepare-backup-reference-input.mjs';
if (parentPort) {
  try { const { report, verifiedPayloadFiles } = prepareBackupReferenceInput(workerData); parentPort.postMessage({ ok: true, report, verifiedPayloadFiles }); }
  catch { parentPort.postMessage({ ok: false }); }
}
