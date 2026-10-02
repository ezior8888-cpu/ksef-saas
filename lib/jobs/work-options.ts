import type { JobDefinition } from './registry';

export interface WorkOptions {
  batchSize: number;
  localConcurrency?: number;
  groupConcurrency?: number;
  perJobResults: true;
}

/**
 * Opcje `boss.work` z definicji joba. `localConcurrency` — ilu workerów
 * pobiera z kolejki naraz w tym procesie; bez niego pg-boss bierze jeden
 * job i kolejka jest globalnie szeregowa (AUD-36). `groupConcurrency`
 * ogranicza równoległość per firma/NIP (grupa z `groupId` przy wysyłce).
 */
export function workOptionsFor(def: Pick<JobDefinition<never>, 'batchSize' | 'localConcurrency' | 'groupConcurrency'>): WorkOptions {
  return {
    batchSize: def.batchSize ?? 1,
    ...(def.localConcurrency !== undefined ? { localConcurrency: def.localConcurrency } : {}),
    ...(def.groupConcurrency !== undefined ? { groupConcurrency: def.groupConcurrency } : {}),
    // Każdy job paczki rozliczany osobno (AUD-35, `run-job.ts`).
    perJobResults: true,
  };
}
