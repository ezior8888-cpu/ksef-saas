/** Pure signal policy. Input must come from authenticated complete receipts. */
export function assessBackupSignal({ nowUtc, lastCompleteAtUtc, scheduledStartUtc, running, failed, notificationFailed }) {
  const utc = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString().slice(0, 19) === value.slice(0, 19) ? Date.parse(value) : NaN;
  const now = utc(nowUtc), last = lastCompleteAtUtc === null ? null : utc(lastCompleteAtUtc), scheduled = utc(scheduledStartUtc);
  if (!Number.isFinite(now) || !Number.isFinite(scheduled) || scheduled > now || (last !== null && (!Number.isFinite(last) || last > now))
    || typeof running !== 'boolean' || typeof failed !== 'boolean' || typeof notificationFailed !== 'boolean') return { state: 'ALERT', reasons: ['INVALID_MONITOR_INPUT'], g09Accepted: false };
  const reasons = [];
  if (last === null) reasons.push('NO_COMPLETE_BACKUP');
  else if (now - last > 26 * 3_600_000) reasons.push('LAST_COMPLETE_OLDER_THAN_26H');
  if (failed) reasons.push('RUN_FAILED');
  if (notificationFailed) reasons.push('SIGNAL_DELIVERY_FAILED');
  if (now >= scheduled + 3 * 3_600_000 && (last === null || last < scheduled)) reasons.push('DAILY_DEADLINE_MISSED');
  return { state: reasons.length ? 'ALERT' : running ? 'RUNNING' : 'HEALTHY_REPORTED_RECEIPT', reasons, g09Accepted: false };
}
