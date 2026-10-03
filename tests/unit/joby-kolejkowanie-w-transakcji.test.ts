import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Cykl życia faktury, PR 3 (W16/W2 z rewizji 03.10.2026): zmiana stanu
 * faktury (`draft → queued`) i zapis zlecenia pg-boss muszą być JEDNĄ
 * transakcją Postgresa. Do 03.10.2026 web najpierw wysyłał zlecenie, a potem
 * osobno pisał `queued` z sesji klienta — błąd między tymi krokami zostawiał
 * zlecenie bez statusu albo status bez zlecenia (faktura zamrożona w `queued`).
 */

const h = vi.hoisted(() => ({
  log: [] as string[],
  send: vi.fn(),
  transactional: true,
}));

vi.mock('@/lib/jobs/boss', () => ({
  startBoss: async () => ({
    getDb: () => {
      const executeSql = async (sql: string, values?: unknown[]) => {
        h.log.push(`SQL ${sql.trim().split(/\s+/).slice(0, 2).join(' ')} ${JSON.stringify(values ?? [])}`);
        return { rows: [], rowCount: 0 };
      };
      if (!h.transactional) return { executeSql };
      return {
        executeSql,
        withTransaction: async <T,>(fn: (tx: { executeSql: typeof executeSql }) => Promise<T>): Promise<T> => {
          h.log.push('BEGIN');
          try {
            const result = await fn({ executeSql });
            h.log.push('COMMIT');
            return result;
          } catch (e) {
            h.log.push('ROLLBACK');
            throw e;
          }
        },
      };
    },
    send: (...args: unknown[]) => {
      h.log.push(`SEND ${String(args[0])}`);
      return h.send(...args);
    },
  }),
}));

import { sendJobEvent } from '@/lib/jobs/enqueue';

const event = {
  name: 'invoice/submit.requested',
  data: { invoiceId: 'inv-1', tenantId: 'ten-1' },
  groupId: 'ten-1',
  singletonKey: 'inv-1',
};

beforeEach(() => {
  h.log.length = 0;
  h.send.mockReset();
  h.transactional = true;
});

describe('zlecenie i krok w jednej transakcji', () => {
  it('krok wykonuje się przed zapisem zlecenia, na tym samym połączeniu, a zlecenie dostaje db transakcji', async () => {
    h.send.mockResolvedValue('job-1');

    const result = await sendJobEvent(event, {
      inTransaction: async (tx) => {
        await tx.executeSql('SELECT public.enqueue_ksef_send($1,$2,$3)', ['inv-1', 'ten-1', 'proba-1']);
      },
    });

    expect(result).toEqual({ ids: ['job-1'] });
    expect(h.log).toEqual([
      'BEGIN',
      'SQL SELECT public.enqueue_ksef_send($1,$2,$3) ["inv-1","ten-1","proba-1"]',
      'SEND invoice.submit.requested',
      'COMMIT',
    ]);
    expect(h.send).toHaveBeenCalledWith(
      'invoice.submit.requested',
      event.data,
      expect.objectContaining({
        singletonKey: 'inv-1',
        group: { id: 'ten-1' },
        db: expect.objectContaining({ executeSql: expect.any(Function) }),
      }),
    );
  });

  it('błąd zapisu zlecenia wycofuje krok i wychodzi do wołającego', async () => {
    h.send.mockRejectedValue(new Error('Queue invoice.submit.requested does not exist'));

    await expect(
      sendJobEvent(event, { inTransaction: async (tx) => { await tx.executeSql('SELECT 1', []); } }),
    ).rejects.toThrow('does not exist');

    expect(h.log.at(-1)).toBe('ROLLBACK');
    expect(h.log).not.toContain('COMMIT');
  });

  it('błąd kroku nie tworzy zlecenia', async () => {
    await expect(
      sendJobEvent(event, { inTransaction: async () => { throw Object.assign(new Error('Faktura nie jest szkicem'), { code: 'P0002' }); } }),
    ).rejects.toMatchObject({ code: 'P0002' });

    expect(h.send).not.toHaveBeenCalled();
    expect(h.log).toEqual(['BEGIN', 'ROLLBACK']);
  });

  it('backend bez transakcji odmawia, zanim cokolwiek wyśle', async () => {
    h.transactional = false;

    await expect(
      sendJobEvent(event, { inTransaction: async () => undefined }),
    ).rejects.toThrow(/transakcj/);

    expect(h.send).not.toHaveBeenCalled();
    expect(h.log).toEqual([]);
  });

  it('bez kroku zachowanie jak dotąd: jedna kolejka, bez transakcji', async () => {
    h.send.mockResolvedValue('job-2');

    await expect(sendJobEvent(event)).resolves.toEqual({ ids: ['job-2'] });
    expect(h.log).toEqual(['SEND invoice.submit.requested']);
  });
});
