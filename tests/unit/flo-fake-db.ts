/**
 * Atrapa klienta bazy dla testów agenta FLO.
 *
 * PO CO: najważniejsza własność wykonawcy — „pięćdziesiąt równoległych
 * kliknięć daje jedno wykonanie” — jest własnością WSPÓŁBIEŻNOŚCI. Testu na
 * to nie da się napisać atrapą, która odpowiada natychmiast: pierwszy
 * wywołujący wygrywałby zawsze, bo nikt nie zdążyłby mu wejść w drogę.
 *
 * Dlatego każda operacja tej atrapy oddaje sterowanie (`await Promise.resolve()`)
 * zanim dotknie danych. Dzięki temu wszystkie równoległe wywołania zdążą
 * przejść przez odczyt, zanim którekolwiek wykona zapis — czyli dokładnie
 * ten przeplot, który w prawdziwej bazie robią osobne połączenia.
 *
 * Obsługuje tylko te operacje, których agent naprawdę używa. Świadomie nie
 * jest to symulator PostgREST-a — gdyby nim był, testowalibyśmy własną
 * imitację zamiast własnego kodu.
 */

import type { FloDbClient } from '@/lib/flo/db-types';

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

interface Tables {
  flo_proposals: Row[];
  flo_approvals: Row[];
  flo_decisions: Row[];
  flo_prefs: Row[];
  flo_usage: Row[];
  flo_shadow: Row[];
}

export interface FakeDb {
  client: FloDbClient;
  tables: Tables;
  /** Ile razy sięgnięto do zapisu — do wykrywania niepotrzebnego ruchu. */
  writes: number;
}

const yieldToOthers = () => Promise.resolve();

export function createFakeDb(seed: Partial<Tables> = {}): FakeDb {
  const tables: Tables = {
    flo_proposals: seed.flo_proposals ?? [],
    flo_approvals: seed.flo_approvals ?? [],
    flo_decisions: seed.flo_decisions ?? [],
    flo_prefs: seed.flo_prefs ?? [],
    flo_usage: seed.flo_usage ?? [],
    flo_shadow: seed.flo_shadow ?? [],
  };
  const state = { writes: 0 };

  function makeQuery(rows: Row[], filters: Filter[], mode: 'read' | 'update' | 'delete', patch?: Row) {
    const apply = () => rows.filter((row) => filters.every((f) => f(row)));

    const run = async (): Promise<{ data: Row[] | null; error: null }> => {
      await yieldToOthers();
      const matched = apply();
      if (mode === 'update' && patch) {
        state.writes++;
        for (const row of matched) Object.assign(row, patch);
      }
      if (mode === 'delete') {
        state.writes++;
        for (const row of matched) {
          const idx = rows.indexOf(row);
          if (idx >= 0) rows.splice(idx, 1);
        }
      }
      return { data: matched.map((r) => ({ ...r })), error: null };
    };

    const builder = {
      eq: (col: string, value: unknown) =>
        makeQuery(rows, [...filters, (r) => r[col] === value], mode, patch),
      neq: (col: string, value: unknown) =>
        makeQuery(rows, [...filters, (r) => r[col] !== value], mode, patch),
      in: (col: string, values: readonly unknown[]) =>
        makeQuery(rows, [...filters, (r) => values.includes(r[col])], mode, patch),
      is: (col: string, value: unknown) =>
        makeQuery(rows, [...filters, (r) => (r[col] ?? null) === value], mode, patch),
      lt: (col: string, value: string | number) =>
        makeQuery(rows, [...filters, (r) => String(r[col]) < String(value)], mode, patch),
      lte: (col: string, value: string | number) =>
        makeQuery(rows, [...filters, (r) => String(r[col]) <= String(value)], mode, patch),
      gt: (col: string, value: string | number) =>
        makeQuery(rows, [...filters, (r) => String(r[col] ?? '') > String(value)], mode, patch),
      gte: (col: string, value: string | number) =>
        makeQuery(rows, [...filters, (r) => String(r[col] ?? '') >= String(value)], mode, patch),
      order: () => builder,
      limit: () => builder,
      select: () => makeQuery(rows, filters, mode, patch),
      maybeSingle: async () => {
        const { data } = await run();
        return { data: data?.[0] ?? null, error: null };
      },
      single: async () => {
        const { data } = await run();
        return { data: data?.[0] ?? null, error: null };
      },
      then: (resolve: (v: { data: Row[] | null; error: null }) => unknown, reject?: (e: unknown) => unknown) =>
        run().then(resolve, reject),
    };

    return builder;
  }

  const client = {
    from(table: keyof Tables) {
      const rows = tables[table];
      return {
        select: () => makeQuery(rows, [], 'read'),
        insert: (payload: Row | Row[]) => {
          const incoming = Array.isArray(payload) ? payload : [payload];
          const inserted: Row[] = [];
          const run = async () => {
            await yieldToOthers();
            state.writes++;
            for (const row of incoming) {
              const withId = { id: row.id ?? `id-${rows.length + 1}`, ...row };
              rows.push(withId);
              inserted.push(withId);
            }
            return { data: inserted.map((r) => ({ ...r })), error: null };
          };
          return {
            select: () => ({
              maybeSingle: async () => {
                const { data } = await run();
                return { data: data?.[0] ?? null, error: null };
              },
              single: async () => {
                const { data } = await run();
                return { data: data?.[0] ?? null, error: null };
              },
            }),
            then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
              run().then(resolve, reject),
          };
        },
        upsert: (payload: Row | Row[], opts?: { onConflict?: string }) => {
          const incoming = Array.isArray(payload) ? payload : [payload];
          const keys = (opts?.onConflict ?? 'id').split(',').map((k) => k.trim());
          const run = async () => {
            await yieldToOthers();
            state.writes++;
            for (const row of incoming) {
              const existing = rows.find((r) => keys.every((k) => r[k] === row[k]));
              if (existing) Object.assign(existing, row);
              else rows.push({ ...row });
            }
            return { data: null, error: null };
          };
          return {
            select: () => makeQuery(rows, [], 'read'),
            then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
              run().then(resolve, reject),
          };
        },
        update: (patch: Row) => makeQuery(rows, [], 'update', patch),
        delete: () => makeQuery(rows, [], 'delete'),
      };
    },
  } as unknown as FloDbClient;

  return {
    client,
    tables,
    get writes() {
      return state.writes;
    },
  } as FakeDb;
}
