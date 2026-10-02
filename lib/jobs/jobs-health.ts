/**
 * Stan kolejek pg-boss dla zewnętrznego strażnika (AUD-34).
 *
 * Heartbeat (`heartbeat.ts`) potwierdzał tylko, że worker żyje i baza
 * odpowiada. Zadania mogły jednak latami czekać w kolejce, pg-boss porzucać
 * joby zabitego workera, a crony przestać się tworzyć — i nikt by się nie
 * dowiedział. Te same trzy rzeczy sprawdza teraz heartbeat przed pingiem;
 * problem = brak pinga = alarm u strażnika (Healthchecks), niezależnie od
 * tego, czy działają nasze kanały alertów.
 */

import { startBoss } from './boss';

export interface QueueHealthRow {
  name: string;
  /** Zadania gotowe do wykonania, które czekają dłużej niż `OVERDUE_MINUTES`. */
  overdue: number;
  /** Zadania porzucone przez pg-boss (np. po śmierci workera) w ostatniej godzinie. */
  failed: number;
  /** Ostatnio utworzone zadanie tej kolejki (dla cronów: ostatnie uruchomienie). */
  last_created: string | null;
}

const OVERDUE_MINUTES = 15;

/** Jedno zapytanie na minutę; `pgboss.job` trzyma ukończone zadania 7 dni. */
const QUEUE_HEALTH_SQL = `
  SELECT name,
         count(*) FILTER (WHERE state IN ('created', 'retry')
                            AND start_after < now() - interval '${OVERDUE_MINUTES} minutes')::int AS overdue,
         count(*) FILTER (WHERE state = 'failed'
                            AND completed_on > now() - interval '1 hour')::int AS failed,
         max(created_on) AS last_created
    FROM pgboss.job
   GROUP BY name`;

export async function readQueueHealth(): Promise<QueueHealthRow[]> {
  const boss = await startBoss();
  const { rows } = await boss.getDb().executeSql(QUEUE_HEALTH_SQL);
  return (rows as QueueHealthRow[]).map((row) => ({
    name: row.name,
    overdue: Number(row.overdue) || 0,
    failed: Number(row.failed) || 0,
    last_created: row.last_created ? new Date(row.last_created).toISOString() : null,
  }));
}

/**
 * Najdłuższa dopuszczalna przerwa między uruchomieniami crona. Co godzinę
 * i częściej: 2 h; codziennie: 26 h; rzadziej (tydzień, miesiąc): bez oceny.
 */
export function cronMaxGapMs(cron: string): number | null {
  const [, hour, dayOfMonth, month, dayOfWeek] = cron.trim().split(/\s+/);
  if (hour === undefined) return null;
  const everyDay = dayOfMonth === '*' && month === '*' && dayOfWeek === '*';
  if (!everyDay) return null;
  return hour.startsWith('*') ? 2 * 60 * 60 * 1000 : 26 * 60 * 60 * 1000;
}

/** Lista problemów (pusta = zdrowo). W treści tylko nazwy kolejek i liczby. */
export function evaluateJobsHealth(
  rows: QueueHealthRow[],
  crons: readonly { queue: string; cron: string }[],
  now: number,
  options: { schedulesDisabled: boolean },
): string[] {
  const problems: string[] = [];
  for (const row of rows) {
    if (row.overdue > 0) problems.push(`zaległe: ${row.name} (${row.overdue})`);
  }
  for (const row of rows) {
    if (row.failed > 0) problems.push(`porzucone: ${row.name} (${row.failed})`);
  }
  if (options.schedulesDisabled) return problems;

  const lastByQueue = new Map(rows.map((row) => [row.name, row.last_created]));
  for (const { queue, cron } of crons) {
    const maxGap = cronMaxGapMs(cron);
    const last = lastByQueue.get(queue);
    // Brak wpisu = cron nowy albo jeszcze nieuruchomiony — nie zgadujemy.
    if (maxGap === null || !last) continue;
    if (now - Date.parse(last) > maxGap) problems.push(`cron stoi: ${queue}`);
  }
  return problems;
}
