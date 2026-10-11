/** Prepared Healthchecks.io full-backup signal provider. No effects on import or
 * construction, no env lookup, no retry, no recipient or check configuration.
 * The UUID is a credential: never persist it, a URL, HTTP body or raw errors.
 * Official contract: https://healthchecks.io/docs/http_api/ (2026-10-11).
 * UUID endpoints can return 200 for ignored pings. Only exact 200 + "OK" counts
 * as provider acceptance; it cannot prove the backup, routing or human delivery.
 */
import path from 'node:path';
import { writeDurableBackupJson } from './backup-source-seal.mjs';

const REVISION = 'face09c57f7de756546e58d092dbe6d280f93c91';
const EVENTS = ['synthetic-complete', 'backup-complete', 'backup-failed', 'backup-cleanup-failed'];
const STATES = ['NOT_CONFIRMED', 'FREEZE_UNKNOWN', 'HELD', 'RESUME_UNKNOWN', 'RESUMED'];
class NotificationError extends Error {
  constructor(code, dispatched = false) {
    super(code); this.code = code;
    this.notificationOutcomeUnknown = dispatched;
    // An aborted injected transport or local evidence writer may remain
    // active. Keep the scope lock even when timeout precedes dispatch.
    this.discardClientRequired = code === 'NOTIFICATION_ABORTED_OR_TIMED_OUT';
  }
}
const fail = (code, dispatched) => { throw new NotificationError(code, dispatched); };
function utc(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function localPath(value) {
  return typeof value === 'string' && value.length <= 4096 && path.isAbsolute(value)
    && path.resolve(value) === value && value !== path.parse(value).root && !/[\0\r\n]/.test(value)
    && !/^[\\/]{2}/.test(value) && (process.platform !== 'win32' || !value.slice(2).includes(':'));
}

/** Factory inputs are private reviewed configuration. authorization is a caller
 * permission assertion, not independent proof of account/recipient acceptance.
 * Synthetic mode requires an injected fetch; production must be authorized
 * separately and never accepts synthetic-complete. Injected fetch/persist are
 * trusted test/host boundaries, never a sandbox for untrusted executable code.
 */
export function createBackupHealthchecksNotification(options = {}) {
  const { checkUuid, mode, fetch: injectedFetch, persist = writeDurableBackupJson } = options;
  const authorized = options.authorization?.sendNotifications === true;
  if (typeof checkUuid !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(checkUuid)
    || !['synthetic', 'separately-authorized'].includes(mode) || typeof persist !== 'function'
    || (injectedFetch !== undefined && typeof injectedFetch !== 'function')) fail('NOTIFICATION_INVALID_CONFIG');
  if (mode === 'synthetic' && injectedFetch === undefined) fail('NOTIFICATION_SYNTHETIC_TRANSPORT_REQUIRED');
  if (mode === 'separately-authorized' && !authorized) fail('NOTIFICATION_AUTHORIZATION_REQUIRED');
  const send = injectedFetch ?? globalThis.fetch;
  if (typeof send !== 'function') fail('NOTIFICATION_INVALID_CONFIG');

  return async function notify(input) {
    const runId = input?.runId, runRoot = input?.runRoot, event = input?.event,
      sourceRevision = input?.sourceRevision, writesState = input?.writesState,
      callerSignal = input?.signal, timeoutMs = input?.timeoutMs, invocationStarted = input?.startedAtUtc;
    if (input?.mode !== mode || typeof runId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/.test(runId) || !localPath(runRoot)
      || sourceRevision !== REVISION || !EVENTS.includes(event) || !STATES.includes(writesState)
      || (event === 'synthetic-complete' && mode !== 'synthetic') || (event === 'backup-complete' && mode !== 'separately-authorized')
      || (event.endsWith('-complete') && writesState !== 'RESUMED')
      || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 1_800_000
      || !utc(invocationStarted) || Date.parse(invocationStarted) > Date.now()
      || (callerSignal !== undefined && !(callerSignal instanceof AbortSignal))) fail('NOTIFICATION_INVALID_CONTEXT');
    if (mode === 'separately-authorized' && process.platform !== 'linux') fail('NOTIFICATION_UNSUPPORTED_PLATFORM');
    if (callerSignal?.aborted) fail('NOTIFICATION_ABORTED_OR_TIMED_OUT');

    const controller = new AbortController(), started = Date.now(), startedAtUtc = new Date(started).toISOString();
    const budget = Math.min(timeoutMs, 30_000), evidenceRef = 'notification-healthchecks-' + event;
    let dispatched = false, reader, timer, interrupt;
    const check = () => {
      if (controller.signal.aborted || Date.now() - started >= budget) fail('NOTIFICATION_ABORTED_OR_TIMED_OUT', dispatched);
    };
    const abort = () => controller.abort();
    callerSignal?.addEventListener('abort', abort, { once: true });
    if (callerSignal?.aborted) abort();
    const interrupted = new Promise((_, reject) => {
      interrupt = () => {
        // A stalled reader must not keep this callback alive or allow a late
        // transport result to publish an accepted receipt.
        try { Promise.resolve(reader?.cancel()).catch(() => {}); } catch { /* no raw diagnostics */ }
        reject(new NotificationError('NOTIFICATION_ABORTED_OR_TIMED_OUT', dispatched));
      };
      controller.signal.addEventListener('abort', interrupt, { once: true });
      timer = setTimeout(abort, budget);
      if (controller.signal.aborted) interrupt();
    });
    async function save(filename, value) {
      check();
      try {
        const result = await persist(filename, value, { signal: controller.signal, mode });
        check();
        if (!/^[a-f0-9]{64}$/.test(result?.sha256 ?? '')) fail('NOTIFICATION_EVIDENCE_WRITE_FAILED', dispatched);
        return result;
      } catch (error) {
        check();
        if (error instanceof NotificationError) throw error;
        fail('NOTIFICATION_EVIDENCE_WRITE_FAILED', dispatched);
      }
    }
    const work = async () => {
      const base = { schemaVersion: 1, runId, sourceRevision, startedAtUtc, event };
      // Fresh exclusive creation is also the replay guard. A failed attempt
      // leaves its intent for review; never blindly resend and refresh age.
      await save(path.join(runRoot, evidenceRef + '-intent.json'), { ...base, provider: 'healthchecks',
        synthetic: mode === 'synthetic', status: 'OUTCOME_UNKNOWN' });
      check(); dispatched = true;
      const response = await send(`https://hc-ping.com/${checkUuid}${event.endsWith('-complete') ? '' : '/fail'}`, {
        method: 'GET', redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer',
        signal: controller.signal,
      });
      try { check(); }
      catch (error) {
        // The outer deadline may have ended before an uncooperative fetch
        // resolves. Its late response still needs cancellation here.
        try { Promise.resolve(response?.body?.cancel()).catch(() => {}); } catch { /* private response */ }
        throw error;
      }
      if (response?.status !== 200 || response.redirected === true || !response.body || typeof response.body.getReader !== 'function') {
        try { Promise.resolve(response?.body?.cancel()).catch(() => {}); } catch { /* private response */ }
        fail('NOTIFICATION_PROVIDER_UNCONFIRMED', dispatched);
      }
      reader = response.body.getReader();
      const bytes = [];
      while (true) {
        const chunk = await reader.read(); check();
        if (chunk.done) break;
        if (!(chunk.value instanceof Uint8Array) || chunk.value.length + bytes.length > 2) fail('NOTIFICATION_PROVIDER_UNCONFIRMED', dispatched);
        bytes.push(...chunk.value);
      }
      if (bytes.length !== 2 || bytes[0] !== 79 || bytes[1] !== 75) fail('NOTIFICATION_PROVIDER_UNCONFIRMED', dispatched);
      check();
      const completedAtUtc = new Date().toISOString();
      const artifact = await save(path.join(runRoot, evidenceRef + '.json'), {
        ...base, completedAtUtc, provider: 'healthchecks', synthetic: mode === 'synthetic', status: 'PROVIDER_ACCEPTED', httpStatus: 200,
      });
      check();
      return { ...base, completedAtUtc: new Date().toISOString(), status: 'PROVIDER_ACCEPTED',
        evidence: { sha256: artifact.sha256, evidenceRef } };
    };
    try { return await Promise.race([Promise.resolve().then(work), interrupted]); }
    catch (error) {
      if (error instanceof NotificationError) throw error;
      if (controller.signal.aborted || Date.now() - started >= budget) fail('NOTIFICATION_ABORTED_OR_TIMED_OUT', dispatched);
      fail('NOTIFICATION_PROVIDER_UNCONFIRMED', dispatched);
    } finally {
      clearTimeout(timer); callerSignal?.removeEventListener('abort', abort);
      controller.signal.removeEventListener('abort', interrupt); controller.abort();
      try { Promise.resolve(reader?.cancel()).catch(() => {}); } catch { /* no untrusted diagnostics */ }
    }
  };
}
