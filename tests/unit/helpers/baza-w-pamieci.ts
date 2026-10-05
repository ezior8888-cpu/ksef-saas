/**
 * Baza w pamięci dla testów łańcucha „import → baza → eksport”: ten sam
 * klient obsługuje zapytania silnika importu (`@/lib/supabase/server`)
 * i pobierania danych eksportu (`@/lib/supabase/admin`). Wiersze zapisane
 * przez import czyta potem eksport — bez ręcznego przepisywania.
 *
 * Obsługa: select (kolumny, count/head), insert (wiersz albo tablica, z
 * `.select()` zwraca wstawione), update, delete, eq/neq/in/is/not/gte/lte/gt,
 * `or` dla kontroli środowiska z data-fetchera, order, limit, range, single,
 * maybeSingle.
 */

export type Row = Record<string, unknown>;

export interface MemoryTables {
  [table: string]: Row[];
}

let nextId = 1;

export function memoryClient(tables: MemoryTables, options: { failInsertInto?: readonly string[] } = {}) {
  function from(table: string) {
    const rows = (tables[table] ??= []);
    const predicates: Array<(r: Row) => boolean> = [];
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: Row | Row[] = {};
    let head = false;
    let singular = false;
    let sort: { key: string; ascending: boolean } | null = null;
    let limitN: number | null = null;
    let window: [number, number] | null = null;
    let inserted: Row[] = [];

    const exec = () => {
      if (op === 'insert') {
        if (options.failInsertInto?.includes(table)) return { data: null, error: { message: 'db down' }, count: null };
        const list = Array.isArray(payload) ? payload : [payload];
        inserted = list.map((p) => ({ id: p.id ?? `${table}-${nextId++}`, ...p }));
        rows.push(...inserted);
        const data = inserted.map((r) => ({ ...r }));
        return { data: singular ? data[0] ?? null : data, error: null, count: null };
      }
      let hit = rows.filter((r) => predicates.every((p) => p(r)));
      if (op === 'update') {
        hit.forEach((r) => Object.assign(r, payload));
        const data = hit.map((r) => ({ ...r }));
        return { data: singular ? data[0] ?? null : data, error: null, count: null };
      }
      if (op === 'delete') {
        for (const r of hit) rows.splice(rows.indexOf(r), 1);
        const data = hit.map((r) => ({ ...r }));
        return { data: singular ? data[0] ?? null : data, error: null, count: null };
      }
      if (sort) {
        const { key, ascending } = sort;
        hit = [...hit].sort((a, b) => String(a[key] ?? '').localeCompare(String(b[key] ?? '')) * (ascending ? 1 : -1));
      }
      const count = hit.length;
      if (window) hit = hit.slice(window[0], window[1] + 1);
      if (limitN !== null) hit = hit.slice(0, limitN);
      const data = hit.map((r) => ({ ...r }));
      return { data: head ? null : singular ? data[0] ?? null : data, error: null, count };
    };

    const q = {
      select: (_cols?: string, options?: { head?: boolean; count?: string }) => {
        head = Boolean(options?.head);
        return q;
      },
      insert: (p: Row | Row[]) => { op = 'insert'; payload = p; return q; },
      update: (p: Row) => { op = 'update'; payload = p; return q; },
      delete: () => { op = 'delete'; return q; },
      eq: (k: string, v: unknown) => { predicates.push((r) => r[k] === v); return q; },
      neq: (k: string, v: unknown) => { predicates.push((r) => r[k] !== v); return q; },
      in: (k: string, vs: unknown[]) => { predicates.push((r) => vs.includes(r[k])); return q; },
      is: (k: string, v: unknown) => { predicates.push((r) => (r[k] ?? null) === v); return q; },
      not: (k: string, operator: string, v: unknown) => {
        if (operator === 'is') predicates.push((r) => (r[k] ?? null) !== v);
        else if (operator === 'in') {
          const values = String(v).replace(/^\(|\)$/g, '').split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
          predicates.push((r) => !values.includes(String(r[k])));
        } else predicates.push((r) => r[k] !== v);
        return q;
      },
      gte: (k: string, v: unknown) => { predicates.push((r) => String(r[k]) >= String(v)); return q; },
      lte: (k: string, v: unknown) => { predicates.push((r) => String(r[k]) <= String(v)); return q; },
      gt: (k: string, v: unknown) => { predicates.push((r) => String(r[k]) > String(v)); return q; },
      or: (expr: string) => {
        // Kontrola proweniencji data-fetchera: przyjęte bez środowiska albo z innego.
        const m = /^ksef_environment\.is\.null,ksef_environment\.neq\.(test|demo|production)$/.exec(expr);
        if (!m) throw new Error(`baza w pamięci: nieobsługiwany filtr or(${expr})`);
        predicates.push((r) => r.ksef_environment == null || r.ksef_environment !== m[1]);
        return q;
      },
      order: (key: string, o?: { ascending?: boolean }) => { sort = { key, ascending: o?.ascending ?? true }; return q; },
      limit: (n: number) => { limitN = n; return q; },
      range: (a: number, b: number) => { window = [a, b]; return q; },
      single: () => { singular = true; return q; },
      maybeSingle: () => { singular = true; return q; },
      then: <A, B>(ok: (v: ReturnType<typeof exec>) => A, fail?: (e: unknown) => B) => Promise.resolve(exec()).then(ok, fail),
    };
    return q;
  }
  return { from };
}
