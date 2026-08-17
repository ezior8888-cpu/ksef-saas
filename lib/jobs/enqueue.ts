/**
 * Dispatcher enqueue — JEDYNY punkt, przez który apka wysyła joby.
 *
 * Wg `JOBS_BACKEND`:
 *   - 'inngest' → passthrough do inngest.send (obecne zachowanie, default),
 *   - 'pgboss'  → boss.send do kolejki z EVENT_QUEUE_MAP.
 *
 * Etap 7 planu podmieni ~14 wywołań `inngest.send` w apce na te funkcje.
 * Dynamic import klientów — worker w trybie pgboss nie dotyka SDK Inngest.
 */

import { getJobsBackend } from './config';
import { queuesForEvent } from './queues';

export interface JobEvent {
  name: string;
  data: object;
}

export interface SendJobOptions {
  /** Opóźnij wykonanie (ms) — pg-boss `startAfter`; w Inngest ignorowane (brak użycia). */
  startAfterMs?: number;
  /** Klucz grupy (per-tenant/per-NIP concurrency w pg-boss 12). */
  groupId?: string;
}

export async function sendJobEvent(
  event: JobEvent,
  options?: SendJobOptions,
): Promise<void> {
  await sendJobEvents([event], options);
}

export async function sendJobEvents(
  events: JobEvent[],
  options?: SendJobOptions,
): Promise<void> {
  if (events.length === 0) return;

  if (getJobsBackend() === 'inngest') {
    const { inngest } = await import('../inngest/client');
    await inngest.send(events.map((e) => ({ name: e.name, data: e.data })));
    return;
  }

  const { startBoss } = await import('./boss');
  const boss = await startBoss();
  const sendOptions = {
    ...(options?.startAfterMs !== undefined
      ? { startAfter: Math.ceil(options.startAfterMs / 1000) }
      : {}),
    ...(options?.groupId ? { group: { id: options.groupId } } : {}),
  };

  for (const e of events) {
    // Fan-out: jeden event może mieć kilku odbiorców (patrz EVENT_QUEUE_MAP) —
    // publikujemy do KAŻDEJ kolejki, co odtwarza zachowanie Inngest.
    for (const queue of queuesForEvent(e.name)) {
      await boss.send(queue, e.data, sendOptions);
    }
  }
}
