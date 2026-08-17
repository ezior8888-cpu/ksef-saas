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
  /**
   * Klucz grupy dla limitów równoległości pg-boss (odpowiednik
   * `concurrency: { key: 'event.data.X' }` w Inngest — tam wyliczany
   * automatycznie z payloadu, tu podawany przy wysyłce).
   * Ustawiany PER EVENT, bo fan-out może dotyczyć wielu tenantów naraz.
   * Na backendzie Inngest pole jest usuwane przed wysyłką.
   */
  groupId?: string;
}

export interface SendJobOptions {
  /** Opóźnij wykonanie (ms) — pg-boss `startAfter`; w Inngest ignorowane (brak użycia). */
  startAfterMs?: number;
  /** Klucz grupy (per-tenant/per-NIP concurrency w pg-boss 12). */
  groupId?: string;
}

/**
 * Wynik wysyłki w kształcie zgodnym z `inngest.send` (`{ ids }`), żeby
 * miejsca zwracające userowi „jobId" działały tak samo na obu backendach.
 */
export interface SendJobResult {
  ids: string[];
}

export async function sendJobEvent(
  event: JobEvent,
  options?: SendJobOptions,
): Promise<SendJobResult> {
  return sendJobEvents([event], options);
}

export async function sendJobEvents(
  events: JobEvent[],
  options?: SendJobOptions,
): Promise<SendJobResult> {
  if (events.length === 0) return { ids: [] };

  if (getJobsBackend() === 'inngest') {
    const { inngest } = await import('../inngest/client');
    // `groupId` to pojęcie pg-boss — Inngest wylicza klucz z payloadu sam.
    const res = await inngest.send(
      events.map((e) => ({ name: e.name, data: e.data })),
    );
    return { ids: (res as { ids?: string[] }).ids ?? [] };
  }

  const { startBoss } = await import('./boss');
  const boss = await startBoss();
  const startAfter =
    options?.startAfterMs !== undefined
      ? { startAfter: Math.ceil(options.startAfterMs / 1000) }
      : {};

  const ids: string[] = [];
  for (const e of events) {
    const groupId = e.groupId ?? options?.groupId;
    const sendOptions = {
      ...startAfter,
      ...(groupId ? { group: { id: groupId } } : {}),
    };
    // Fan-out: jeden event może mieć kilku odbiorców (patrz EVENT_QUEUE_MAP) —
    // publikujemy do KAŻDEJ kolejki, co odtwarza zachowanie Inngest.
    for (const queue of queuesForEvent(e.name)) {
      const id = await boss.send(queue, e.data, sendOptions);
      if (id) ids.push(id);
    }
  }
  return { ids };
}
