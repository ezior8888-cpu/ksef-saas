/**
 * Cursor-based (keyset) pagination dla list w aplikacji.
 *
 * Dlaczego nie `limit + offset`:
 *   - OFFSET 10000 wymaga od PG przeskanowania pierwszych 10000 wierszy
 *     przed zwróceniem 11000-go — dla list rosnących liniowo z czasem
 *     (faktury, expenses, audit_logs) latencja rośnie liniowo.
 *   - W trakcie listingowania nowe wiersze przesuwają stronowanie — user
 *     widzi duplikaty lub gubi rekordy między stronami.
 *
 * Keyset pagination używa naturalnego klucza sortowania (np. `created_at DESC,
 * id DESC`) jako kursora. Każda strona zwraca własny `nextCursor`, klient
 * przekazuje go w kolejnym requeście jako `cursor=...`.
 *
 * Wymaga:
 *   - DETERMINISTYCZNY sort (zawsze `created_at DESC, id DESC` lub
 *     `issue_date DESC, id DESC` — id jako tie-breaker dla duplikatów timestamp).
 *   - Index pokrywający sort (już mamy `idx_invoices_tenant_created`).
 */

/**
 * Lekki interfejs zamiast `PostgrestFilterBuilder` z @supabase/supabase-js.
 * Pełne generics PostgrestFilterBuilder są wewnętrzną szczegółowością SDK —
 * wymagają GenericSchema + Relationship + RelationName + Result + RelatedKey
 * w 5 parametrach. Tu potrzebujemy tylko `.or()` które zwraca builder dla
 * dalszego łańcucha — definiujemy strukturalny typ pasujący do każdej query.
 */
interface OrFilterable {
  or: (filter: string) => unknown;
}

/**
 * Format kursora — base64-encoded JSON z polami sortowania.
 * Klient nie powinien go parsować ręcznie, traktuje jako opaque string.
 */
export interface CursorPayload {
  /** Pole sortujące, najczęściej timestamp ISO. */
  sortValue: string;
  /** UUID rekordu na granicy strony (tie-breaker). */
  id: string;
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function decodeCursor(raw: string | null | undefined): CursorPayload | null {
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as unknown;
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'sortValue' in parsed &&
      'id' in parsed &&
      typeof (parsed as CursorPayload).sortValue === 'string' &&
      typeof (parsed as CursorPayload).id === 'string'
    ) {
      return parsed as CursorPayload;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Aplikuje keyset filter na PostgREST query builder. Format:
 *   `(sort_col, id) < (cursor.sortValue, cursor.id)`  — dla DESC sort.
 *
 * Postgres rozumie row-wise comparison, ale PostgREST eksponuje to przez
 * `.or()` z dwoma warunkami:
 *   sort_col < X
 *   OR (sort_col = X AND id < cursor_id)
 *
 * @param query — PostgREST builder z już wybranymi kolumnami
 * @param sortColumn — nazwa kolumny używanej do sortowania (`issue_date`, `created_at`)
 * @param cursor — payload z poprzedniego strony (lub null dla pierwszej)
 * @param order — kierunek sortowania, najczęściej 'desc' dla "najnowsze pierwsze"
 */
export function applyCursorFilter<Builder extends OrFilterable>(
  query: Builder,
  sortColumn: string,
  cursor: CursorPayload | null,
  order: 'asc' | 'desc' = 'desc',
): Builder {
  if (!cursor) return query;
  const cmp = order === 'desc' ? 'lt' : 'gt';
  const eqOrLt = order === 'desc' ? 'lt' : 'gt';

  // PostgREST `.or()` przyjmuje filter string w stylu `col.op.value`.
  // Quoting: timestamp ISO string nie ma przecinków/kropek — bezpieczne.
  const filterString =
    `${sortColumn}.${cmp}.${cursor.sortValue},` +
    `and(${sortColumn}.eq.${cursor.sortValue},id.${eqOrLt}.${cursor.id})`;
  return query.or(filterString) as Builder;
}

/**
 * Standardowy limit dla list — 50 rekordów na stronę. Mobile może chcieć
 * mniej (overhead JSON parse), web dashboard więcej (mniej round-tripów).
 */
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export function clampPageSize(
  raw: number | string | null | undefined,
  fallback = DEFAULT_PAGE_SIZE,
): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
  if (typeof n !== 'number' || Number.isNaN(n) || n <= 0) return fallback;
  return Math.min(n, MAX_PAGE_SIZE);
}

export interface PaginatedResult<T> {
  items: T[];
  /** Cursor do następnej strony, lub null gdy więcej nie ma. */
  nextCursor: string | null;
}

/**
 * Helper do złożenia odpowiedzi po fetch'u — wycina ostatni rekord jeśli
 * pobraliśmy `limit + 1` (signalling "jest jeszcze").
 *
 * Konwencja: query woła `.limit(limit + 1)`, ten helper zwraca obciętą
 * listę + cursor dla rekordu na pozycji `limit`-tej (czyli "ostatniego
 * widzialnego"), żeby kolejna strona zaczęła od następnego.
 */
export function buildPaginatedResult<T extends { id: string }>(
  rows: T[],
  limit: number,
  sortField: keyof T,
): PaginatedResult<T> {
  if (rows.length <= limit) {
    return { items: rows, nextCursor: null };
  }
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  if (!last) {
    return { items, nextCursor: null };
  }
  const sortValue = last[sortField];
  if (typeof sortValue !== 'string') {
    return { items, nextCursor: null };
  }
  return {
    items,
    nextCursor: encodeCursor({ sortValue, id: last.id }),
  };
}
