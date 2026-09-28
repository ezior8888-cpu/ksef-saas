import { describe, expect, it } from 'vitest';

import { readCompletePages } from '@/lib/accounting/read-complete-pages';

describe('complete accounting pages', () => {
  it('rejects a repeated row across page boundaries even when the exact count is unchanged', async () => {
    const firstPage = Array.from({ length: 500 }, (_, index) => ({
      id: `row-${String(index).padStart(4, '0')}`,
    }));
    await expect(readCompletePages('expenses', (from) => Promise.resolve({
      data: from === 0 ? firstPage : [{ id: firstPage[0]!.id }],
      count: 501,
      error: null,
    }))).rejects.toThrow('niestabilna kolejność stron danych');
  });

  it('rejects a successful response capped below the requested page size', async () => {
    await expect(readCompletePages('invoices', () => Promise.resolve({
      data: Array.from({ length: 400 }, (_, index) => ({ id: `row-${index}` })),
      count: 600,
      error: null,
    }))).rejects.toThrow('niepełna strona danych');
  });
});
