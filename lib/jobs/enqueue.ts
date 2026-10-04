/**
 * Dispatcher enqueue — JEDYNY punkt, przez który apka wysyła joby: boss.send
 * do kolejek z EVENT_QUEUE_MAP (pg-boss w naszym Postgresie; Inngest odpięty
 * w etapie 10). Nieznana wartość `JOBS_BACKEND` = błąd, zlecenie nie wychodzi.
 */

import type { Db as IDatabase } from 'pg-boss';

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
   */
  groupId?: string;
  /**
   * pg-boss `singletonKey`: w kolejce czeka najwyżej jeden job z tym kluczem.
   * Dla zdarzeń, które może wysłać kilku nadawców naraz (skrzynka i cron
   * uzupełniający dla tej samej faktury — K2), drugie zlecenie nie dubluje
   * pracy, dopóki pierwsze nie zostało wykonane.
   */
  singletonKey?: string;
}

export interface SendJobOptions {
  /** Opóźnij wykonanie (ms) — pg-boss `startAfter`. */
  startAfterMs?: number;
  /** Klucz grupy (per-tenant/per-NIP concurrency w pg-boss 12). */
  groupId?: string;
  /**
   * Krok wykonywany w TEJ SAMEJ transakcji Postgresa co zapis zlecenia
   * (cykl życia faktury, W16/W2): np. RPC `enqueue_ksef_send` zmieniające
   * `draft → queued`. Gdy zapis zlecenia padnie, krok jest wycofany; gdy
   * padnie krok, zlecenie nie powstaje. Wymaga wbudowanego `Db` pg-boss
   * (`withTransaction`) — inny backend kończy błędem, zanim cokolwiek wyśle.
   */
  inTransaction?: (tx: Pick<IDatabase, 'executeSql'>) => Promise<void>;
}

/** Identyfikatory utworzonych jobów pg-boss (`{ ids }`). */
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

  getJobsBackend();

  const { startBoss } = await import('./boss');
  const boss = await startBoss();
  const startAfter =
    options?.startAfterMs !== undefined
      ? { startAfter: Math.ceil(options.startAfterMs / 1000) }
      : {};

  const sendOptionsFor = (e: JobEvent) => {
    const groupId = e.groupId ?? options?.groupId;
    return {
      ...startAfter,
      ...(groupId ? { group: { id: groupId } } : {}),
      ...(e.singletonKey ? { singletonKey: e.singletonKey } : {}),
    };
  };
  const db = boss.getDb() as TransactionalDb;

  if (options?.inTransaction) {
    // Krok wołającego + wszystkie zlecenia na jednym połączeniu: BEGIN … COMMIT.
    // Kolejki sprawdzamy przed BEGIN, żeby nieznany event nie otwierał transakcji.
    const planned = events.map((e) => ({ event: e, queues: queuesForEvent(e.name) }));
    if (typeof db.withTransaction !== 'function') {
      throw new Error('Kolejka nie obsługuje transakcji — zlecenie nie zostało wysłane');
    }
    const step = options.inTransaction;
    const ids = await db.withTransaction(async (tx) => {
      await step(tx);
      const txIds: string[] = [];
      for (const { event, queues } of planned) {
        for (const queue of queues) {
          const id = await boss.send(queue, event.data, { ...sendOptionsFor(event), db: tx });
          if (id) txIds.push(id);
        }
      }
      return txIds;
    });
    return { ids };
  }

  const ids: string[] = [];
  for (const e of events) {
    const sendOptions = sendOptionsFor(e);
    // Fan-out: jeden event może mieć kilku odbiorców (patrz EVENT_QUEUE_MAP) —
    // publikujemy do KAŻDEJ kolejki.
    const queues = queuesForEvent(e.name);
    if (queues.length > 1 && typeof db.withTransaction === 'function') {
      // Wszystkie kolejki zdarzenia albo żadna (AUD-91): błąd przy drugiej
      // zostawiał pierwszą, a ponowienie nadawcy dublowało powiadomienie.
      const sent = await db.withTransaction(async (tx) => {
        const txIds: string[] = [];
        for (const queue of queues) {
          const id = await boss.send(queue, e.data, { ...sendOptions, db: tx });
          if (id) txIds.push(id);
        }
        return txIds;
      });
      ids.push(...sent);
      continue;
    }
    for (const queue of queues) {
      const id = await boss.send(queue, e.data, sendOptions);
      if (id) ids.push(id);
    }
  }
  return { ids };
}

/**
 * `getDb()` pg-boss zwraca interfejs `IDatabase`; wbudowany `Db` (pula z
 * `connectionString`) ma też `withTransaction`, który przypina jedno
 * połączenie na BEGIN…COMMIT.
 */
type TransactionalDb = IDatabase & {
  withTransaction?: <T>(fn: (db: IDatabase) => Promise<T>) => Promise<T>;
};
