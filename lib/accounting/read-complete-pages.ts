/** PostgREST may cap a successful response. A partial accounting read is an error. */
export const ACCOUNTING_PAGE_SIZE = 500;

type Page<T> = {
  data: T[] | null;
  count: number | null;
  error: { message: string } | null;
};

export async function readCompletePages<T extends { id: string }>(
  label: string,
  fetchPage: (from: number, to: number) => PromiseLike<Page<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  let total: number | null = null;
  let lastId: string | null = null;

  for (let from = 0; total === null || from < total; from += ACCOUNTING_PAGE_SIZE) {
    const page = await fetchPage(from, from + ACCOUNTING_PAGE_SIZE - 1);
    if (page.error) throw new Error(`${label}: ${page.error.message}`);
    if (!page.data || typeof page.count !== 'number' ||
        !Number.isSafeInteger(page.count) || page.count < 0 ||
        (total !== null && page.count !== total)) {
      throw new Error(`${label}: nie można potwierdzić liczby rekordów`);
    }
    total = page.count;
    if (page.data.length !== Math.min(ACCOUNTING_PAGE_SIZE, Math.max(0, total - from))) {
      throw new Error(`${label}: niepełna strona danych`);
    }
    for (const row of page.data) {
      // Callers page by immutable id; a duplicate/reordered row must not be
      // counted twice as a different invoice or cost.
      if (typeof row.id !== 'string' || !row.id ||
          (lastId !== null && row.id <= lastId)) {
        throw new Error(`${label}: niestabilna kolejność stron danych`);
      }
      rows.push(row);
      lastId = row.id;
    }
  }

  return rows;
}
