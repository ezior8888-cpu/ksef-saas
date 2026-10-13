/** Run the synchronous bounded file comparator off the coordinator event loop. */
import { Worker } from 'node:worker_threads';
export async function runBackupReferenceCheck(input, { signal, timeoutMs } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error('INVALID_REFERENCE_TIMEOUT');
  if (signal?.aborted) throw new Error('REFERENCE_CHECK_ABORTED');
  const worker = new Worker(new URL('./backup-reference-worker.mjs', import.meta.url), { workerData: input });
  let timer, abort;
  try {
    return await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error, result) => { if (settled) return; settled = true; if (error) reject(new Error(error)); else resolve(result); };
      abort = () => finish('REFERENCE_CHECK_ABORTED');
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      timer = setTimeout(() => finish('REFERENCE_CHECK_TIMEOUT'), timeoutMs);
      worker.once('error', () => finish('REFERENCE_CHECK_FAILED'));
      worker.once('exit', code => finish(code === 0 ? 'REFERENCE_CHECK_NO_RESULT' : 'REFERENCE_CHECK_FAILED'));
      worker.once('message', value => value?.ok === true ? finish(null, { report: value.report, verifiedPayloadFiles: value.verifiedPayloadFiles }) : finish('REFERENCE_CHECK_FAILED'));
    });
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
    await worker.terminate();
  }
}
