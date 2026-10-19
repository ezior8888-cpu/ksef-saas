import test from 'node:test';
import assert from 'node:assert/strict';
import { assessBackupSignal } from './check-backup-signal.mjs';
const input = { nowUtc:'2026-10-10T03:30:00Z', lastCompleteAtUtc:'2026-10-10T02:00:00Z', scheduledStartUtc:'2026-10-10T00:30:00Z', running:false, failed:false, notificationFailed:false };
test('only a reported full completion clears daily deadline', () => {
  assert.equal(assessBackupSignal(input).state, 'HEALTHY_REPORTED_RECEIPT');
  assert.deepEqual(assessBackupSignal({...input,lastCompleteAtUtc:'2026-10-09T02:00:00Z',running:true}).reasons,['DAILY_DEADLINE_MISSED']);
});
test('starting a new run cannot reset 26-hour freshness', () => {
  assert.ok(assessBackupSignal({...input,lastCompleteAtUtc:'2026-10-09T01:29:59Z',running:true}).reasons.includes('LAST_COMPLETE_OLDER_THAN_26H'));
});
test('zero history and failed delivery are visible even without a running worker', () => {
  const r=assessBackupSignal({...input,lastCompleteAtUtc:null,notificationFailed:true});
  assert.deepEqual(r.reasons,['NO_COMPLETE_BACKUP','SIGNAL_DELIVERY_FAILED','DAILY_DEADLINE_MISSED']);
});
test('failed new run alarms despite a recent old complete backup', () => assert.deepEqual(assessBackupSignal({...input,failed:true}).reasons,['RUN_FAILED']));
test('future, invalid calendar and nonboolean inputs fail closed', () => {
  for(const values of [{nowUtc:'2026-02-30T03:30:00Z'},{lastCompleteAtUtc:'2026-10-11T00:00:00Z'},{running:'false'},{scheduledStartUtc:'2026-10-11T00:30:00Z'}]) assert.deepEqual(assessBackupSignal({...input,...values}).reasons,['INVALID_MONITOR_INPUT']);
});
