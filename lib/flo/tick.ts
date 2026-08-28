/**
 * Puls agenta FLO (krok 13 planu).
 *
 * Codziennie o 07:30 czasu polskiego — czyli zanim ktokolwiek otworzy
 * aplikację, ale już po ciszy nocnej. Ten cron jest miejscem, w którym
 * agent „patrzy na dane”: dziś sprząta po sobie, a od bloku 3 będą się tu
 * dokładać reguły kolejnych funkcji.
 *
 * ŚWIADOMIE NIE MA TU DRUGIEJ DEFINICJI DLA INNGESTA. Produkcja pracuje na
 * pg-boss od 18 sierpnia, a Inngest jest w trakcie odpinania — dokładanie
 * do niego nowych funkcji byłoby długiem w chwili powstania. Starsze zadania
 * mają jeszcze bliźniaki z okresu przejściowego, nowe już nie.
 */

import { logAuditSystem } from '@/lib/audit/log-system';
import { floDb, type FloDbClient } from '@/lib/flo/db-types';
import { expireStale } from '@/lib/flo/proposals';
import type { JobContext } from '@/lib/jobs/registry';

/**
 * Po tylu minutach propozycja w stanie „wykonuję” jest uznana za porzuconą.
 *
 * Wykonawca zwalnia ją sam, gdy coś pójdzie nie tak — ale jeśli worker
 * zginie w połowie (restart kontenera, OOM), nie ma kto tego zrobić.
 * Bez tego strażnika karta zostałaby zablokowana na zawsze, a klient
 * patrzyłby na „wykonuję” do końca świata. Cisza jest stanem zabronionym,
 * więc i wieczne „w toku” też.
 */
const STUCK_AFTER_MS = 15 * 60_000;

export interface FloTickResult {
  expired: number;
  released: number;
}

export async function runFloTick(
  _ctx?: JobContext,
  now: Date = new Date(),
  db: FloDbClient = floDb(),
): Promise<FloTickResult> {
  const expired = await expireStale(now, db);
  const released = await releaseStuck(now, db);

  // ── miejsce na reguły funkcji ──────────────────────────────
  //
  // Od bloku 3 każda funkcja agenta dokłada tu swoje pytanie do danych:
  // W-04 szuka zgubionych dokumentów, P-01 rytmu fakturowania, T-02
  // przelicza limit. Kolejność będzie miała znaczenie (najpierw fakty,
  // potem propozycje), więc nowe reguły dopisujemy NA KOŃCU, a nie
  // wciskamy między istniejące.

  return { expired, released };
}

/**
 * Podnosi propozycje porzucone w połowie wykonania.
 *
 * Wracają do stanu „zatwierdzona”, a nie „otwarta”: człowiek już się na nie
 * zgodził, więc odbieranie mu tej zgody byłoby cofaniem jego decyzji.
 * Żeton zgody jest w tym momencie zużyty, więc realne wykonanie i tak
 * wymaga ponownego kliknięcia — i dobrze, bo nie wiemy, jak daleko zaszła
 * przerwana próba.
 */
async function releaseStuck(now: Date, db: FloDbClient): Promise<number> {
  const cutoff = new Date(now.getTime() - STUCK_AFTER_MS).toISOString();

  const stuck = await db
    .from('flo_proposals')
    .select('id, tenant_id, kind, approved_at')
    .eq('status', 'executing')
    .lt('approved_at', cutoff);

  if (stuck.error) throw new Error(stuck.error.message);
  const rows = stuck.data ?? [];
  if (rows.length === 0) return 0;

  const { error } = await db
    .from('flo_proposals')
    .update({ status: 'approved' })
    .in(
      'id',
      rows.map((r) => r.id),
    );
  if (error) throw new Error(error.message);

  for (const row of rows) {
    // Operator ma o tym wiedzieć: pojedynczy przypadek to restart kontenera,
    // seria oznacza, że wykonawca gdzieś się wiesza.
    await logAuditSystem({
      tenantId: row.tenant_id,
      userId: null,
      action: 'flo.proposal.failed',
      entityType: 'flo_proposal',
      entityId: row.id,
      metadata: {
        actor: 'flo',
        kind: row.kind,
        error: 'porzucona w stanie „wykonuję" — podniesiona przez flo.tick',
      },
    });
  }

  return rows.length;
}
