import { beforeEach, describe, expect, it, vi } from 'vitest';

// AUD-91: (1) zdarzenie z kilkoma kolejkami (wynik wysyłki → powiadomienie
// + Offline24) szło kolejnymi `boss.send` — błąd przy drugiej kolejce
// zostawiał pierwszą, a ponowienie dublowało powiadomienie. Teraz wszystkie
// kolejki jednego zdarzenia w jednej transakcji pg-boss. (2) Fan-out skrzynki
// szedł bez `groupId`, więc limit „na NIP” nie działał — dwa przebiegi tej
// samej firmy mogły iść równolegle.

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  withTransaction: vi.fn(),
  txDb: { executeSql: vi.fn() },
}));

vi.mock('@/lib/jobs/config', () => ({ getJobsBackend: () => 'pgboss' }));
vi.mock('@/lib/jobs/boss', () => ({
  startBoss: async () => ({
    send: mocks.send,
    getDb: () => ({ executeSql: vi.fn(), withTransaction: mocks.withTransaction }),
  }),
}));

import { sendJobEvent } from '@/lib/jobs/enqueue';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.send.mockImplementation(async (queue: string) => `job-${queue}`);
  mocks.withTransaction.mockImplementation(async (fn: (db: unknown) => Promise<unknown>) => fn(mocks.txDb));
});

describe('fan-out do kilku kolejek', () => {
  it('wysyła do wszystkich kolejek zdarzenia w jednej transakcji', async () => {
    const result = await sendJobEvent({ name: 'invoice/submit.succeeded', data: { invoiceId: 'x' } });
    expect(mocks.withTransaction).toHaveBeenCalledOnce();
    expect(mocks.send).toHaveBeenCalledTimes(2);
    for (const call of mocks.send.mock.calls) {
      expect(call[2]).toEqual(expect.objectContaining({ db: mocks.txDb }));
    }
    expect(result.ids).toEqual(['job-invoice.submit.succeeded.notify', 'job-invoice.submit.succeeded.offline-queue']);
  });

  it('błąd drugiej kolejki wycofuje całość (błąd idzie do nadawcy)', async () => {
    mocks.send
      .mockImplementationOnce(async () => 'job-1')
      .mockImplementationOnce(async () => { throw new Error('fixture queue down'); });
    mocks.withTransaction.mockImplementation(async (fn: (db: unknown) => Promise<unknown>) => {
      try { return await fn(mocks.txDb); } catch (e) { throw e; }
    });
    await expect(sendJobEvent({ name: 'invoice/submit.failed', data: { invoiceId: 'x' } })).rejects.toThrow('fixture queue down');
    expect(mocks.withTransaction).toHaveBeenCalledOnce();
  });

  it('zdarzenie z jedną kolejką idzie bez transakcji', async () => {
    await sendJobEvent({ name: 'invoice/submit.requested', data: { invoiceId: 'x' } }, { groupId: 't1' });
    expect(mocks.withTransaction).not.toHaveBeenCalled();
    expect(mocks.send).toHaveBeenCalledWith('invoice.submit.requested', { invoiceId: 'x' }, { group: { id: 't1' } });
  });
});

describe('fan-out skrzynki', () => {
  it('każde zdarzenie inbox/poll.tenant ma groupId = NIP firmy', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase/server', () => ({
      createAdminClient: async () => ({
        from: () => {
          const q = {
            select: () => q,
            // Firmy z certyfikatem i NIP-em zweryfikowanym w bieżącym środowisku (#63).
            not: () => q,
            eq: () => Promise.resolve({ data: [{ id: 't1', nip: '1234567890' }, { id: 't2', nip: '5260001246' }], error: null }),
          };
          return q;
        },
      }),
    }));
    const { runInboxPolling } = await import('@/lib/inngest/jobs/inbox-polling');
    const sendEvent = vi.fn();
    await runInboxPolling({
      attempt: 0,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      step: { run: async (_n: string, fn: () => unknown) => fn(), sleep: vi.fn(), sendEvent, scheduleAfter: vi.fn() },
    } as never);
    const events = sendEvent.mock.calls[0]![1] as { name: string; groupId?: string }[];
    expect(events.map((e) => e.groupId)).toEqual(['1234567890', '5260001246']);
  });

  it('worker przepuszcza jeden przebieg skrzynki na NIP naraz', async () => {
    vi.resetModules();
    const { getRegisteredJobs } = await import('@/lib/jobs/registry');
    await import('@/lib/jobs/handlers/package-d');
    const job = getRegisteredJobs().find((j) => j.queue === 'inbox.poll.tenant');
    expect(job?.groupConcurrency).toBe(1);
  });

  it('adapter Inngest nie przekazuje groupId (pojęcie pg-boss) do Inngest', async () => {
    const { toJobContext } = await import('@/lib/jobs/inngest-adapter');
    const inngestSend = vi.fn();
    const ctx = toJobContext({ step: { run: vi.fn(), sleep: vi.fn(), sendEvent: inngestSend }, logger: {}, attempt: 0 });
    await ctx.step.sendEvent('x', [{ name: 'inbox/poll.tenant', data: { tenantId: 't1' }, groupId: '1234567890' }]);
    expect(inngestSend).toHaveBeenCalledWith('x', [{ name: 'inbox/poll.tenant', data: { tenantId: 't1' } }]);
  });
});
