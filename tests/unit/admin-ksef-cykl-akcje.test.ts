import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Akcje operatora `/admin/ksef` (PR 3c cyklu życia): `requireAdmin()` przed
 * kluczem serwisowym, RPC `requeue_ksef_send` / `reset_ksef_send` z aktorem
 * = operator, zlecenie pg-boss w tej samej transakcji, audyt systemowy.
 */

const ID = '11111111-1111-4111-8111-111111111111';
const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OPERATOR = { userId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', email: 'operator@example.test' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const m = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  admin: vi.fn(),
  rpc: vi.fn(),
  send: vi.fn(),
  paused: vi.fn(),
  audit: vi.fn(),
  revalidate: vi.fn(),
  invoice: null as Record<string, unknown> | null,
  /** Wpisy `ksef_submissions` faktury; bez `status` = `sent`. */
  openSent: [] as Array<{ id: string; status?: string }>,
}));

vi.mock('@/lib/auth/admin-guard', () => ({ requireAdmin: m.requireAdmin }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: m.admin }));
vi.mock('@/lib/jobs/enqueue', () => ({ sendJobEvent: m.send }));
vi.mock('@/lib/ksef/submission-holds', () => ({ isKsefSubmissionPaused: m.paused }));
vi.mock('@/lib/ksef/claim-environment', () => ({ requireConfiguredKsefEnvironment: () => 'test' }));
vi.mock('@/lib/audit/log-system', () => ({ logAuditSystem: m.audit }));
vi.mock('next/cache', () => ({ revalidatePath: m.revalidate }));

import { operatorRequeueAction, operatorResetAction } from '@/app/admin/ksef/actions';
import { OPERATOR_MESSAGES } from '@/lib/admin/ksef-operator-policy';

type Tx = { executeSql: ReturnType<typeof vi.fn> };

function fakeAdminClient() {
  return {
    from: (table: string) => {
      const statusOk: Array<(status: string) => boolean> = [];
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => { if (k === 'status') statusOk.push((st) => st === v); return q; },
        in: (k: string, vs: unknown[]) => { if (k === 'status') statusOk.push((st) => vs.includes(st)); return q; },
        limit: () => q,
        maybeSingle: async () => ({ data: table === 'invoices' ? m.invoice : null, error: null }),
        then: (ok: (v: unknown) => unknown) => ok({
          data: table === 'ksef_submissions'
            ? m.openSent.filter((r) => statusOk.every((f) => f(r.status ?? 'sent')))
            : [],
          error: null,
        }),
      };
      return q;
    },
    rpc: m.rpc,
  };
}

function sendRunningStep(tx: Tx, outcome: 'ok' | Error = 'ok') {
  m.send.mockImplementation(async (_event: unknown, options?: { inTransaction?: (tx: Tx) => Promise<void> }) => {
    await options?.inTransaction?.(tx);
    if (outcome !== 'ok') throw outcome;
    return { ids: ['job-1'] };
  });
}

function row(extra: Record<string, unknown> = {}) {
  return {
    id: ID, tenant_id: TENANT, direction: 'outgoing', invoice_kind: 'regular', ksef_status: 'failed',
    last_error_code: 'INFRA', internal_number: 'FV/9', tenants: { nip: '5260001246' },
    fa3_data: { internalNumber: 'FV/9', type: 'VAT', lines: [{ ordinal: 1 }], seller: { nip: '5260001246' } },
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  m.requireAdmin.mockResolvedValue(OPERATOR);
  m.admin.mockImplementation(fakeAdminClient);
  m.rpc.mockResolvedValue({ data: { id: ID }, error: null });
  m.paused.mockResolvedValue(false);
  m.invoice = row();
  m.openSent = [];
});

describe('operatorRequeueAction', () => {
  it('ponowna wysyłka: requeue_ksef_send z aktorem = operator w kroku transakcji, zdarzenie z sendAttemptId, audyt', async () => {
    const tx: Tx = { executeSql: vi.fn(async () => ({ rows: [{ id: ID }], rowCount: 1 })) };
    sendRunningStep(tx);

    const result = await operatorRequeueAction(ID, { reconcileOnly: false });

    expect(result).toEqual({ success: true, message: OPERATOR_MESSAGES.requeued });
    const event = m.send.mock.calls[0]![0] as { singletonKey: string; groupId: string; data: Record<string, unknown> };
    expect(event.singletonKey).toBe(ID);
    expect(event.groupId).toBe(TENANT);
    expect(event.data).toMatchObject({ tenantId: TENANT, invoiceId: ID, nip: '5260001246', environment: 'test' });
    expect(event.data.sendAttemptId).toMatch(UUID);
    const [sql, values] = tx.executeSql.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/public\.requeue_ksef_send\(/);
    expect(values).toEqual([ID, TENANT, event.data.sendAttemptId, OPERATOR.userId, false]);
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'invoice.operator_requeue', userId: OPERATOR.userId, entityId: ID,
      metadata: expect.objectContaining({ operator: OPERATOR.email, previousCode: 'INFRA' }),
    }));
    expect(m.revalidate).toHaveBeenCalledWith(`/admin/ksef/${ID}`);
  });

  it('„tylko uzgodnij” bez otwartego wpisu sent: odmowa bez zlecenia', async () => {
    await expect(operatorRequeueAction(ID, { reconcileOnly: true })).resolves.toEqual({
      success: false, error: OPERATOR_MESSAGES.noOpenSent,
    });
    expect(m.send).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });

  it('„tylko uzgodnij” z wpisem sent: RPC z p_reconcile_only = true, audyt operator_reconcile', async () => {
    m.invoice = row({ ksef_status: 'rejected', last_error_code: null });
    m.openSent = [{ id: 'sub-1' }];
    const tx: Tx = { executeSql: vi.fn(async () => ({ rows: [{ id: ID }], rowCount: 1 })) };
    sendRunningStep(tx);

    const result = await operatorRequeueAction(ID, { reconcileOnly: true });

    expect(result).toEqual({ success: true, message: OPERATOR_MESSAGES.reconcileQueued });
    const [, values] = tx.executeSql.mock.calls[0] as [string, unknown[]];
    expect(values[3]).toBe(OPERATOR.userId);
    expect(values[4]).toBe(true);
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'invoice.operator_reconcile' }));
  });

  it.each([
    ['cudzy duplikat 440', 'KSEF_DUPLICATE_RECONCILE', OPERATOR_MESSAGES.duplicateRequeue],
    ['inne środowisko', 'ENV_MISMATCH', OPERATOR_MESSAGES.envMismatchRequeue],
    ['błąd treści', 'XSD_INVALID', OPERATOR_MESSAGES.terminal],
  ])('A4: akcja decyduje jak przycisk — %s: „Wyślij ponownie” odmówione bez zlecenia', async (_l, code, reason) => {
    m.invoice = row({ last_error_code: code });
    await expect(operatorRequeueAction(ID, { reconcileOnly: false })).resolves.toEqual({ success: false, error: reason });
    expect(m.send).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });

  it('A4: ENQUEUE_LOST — „Wyślij ponownie” operatora zlecone', async () => {
    m.invoice = row({ last_error_code: 'ENQUEUE_LOST' });
    const tx: Tx = { executeSql: vi.fn(async () => ({ rows: [{ id: ID }], rowCount: 1 })) };
    sendRunningStep(tx);
    await expect(operatorRequeueAction(ID, { reconcileOnly: false })).resolves.toEqual({ success: true, message: OPERATOR_MESSAGES.requeued });
  });

  it('A2: „tylko uzgodnij” przy samym zamiarze wysyłki (intent) — zlecenie; wpis zamknięty (abandoned) — odmowa', async () => {
    m.openSent = [{ id: 'sub-1', status: 'abandoned' }];
    await expect(operatorRequeueAction(ID, { reconcileOnly: true })).resolves.toEqual({
      success: false, error: OPERATOR_MESSAGES.noOpenSent,
    });

    m.openSent = [{ id: 'sub-2', status: 'intent' }];
    const tx: Tx = { executeSql: vi.fn(async () => ({ rows: [{ id: ID }], rowCount: 1 })) };
    sendRunningStep(tx);
    await expect(operatorRequeueAction(ID, { reconcileOnly: true })).resolves.toEqual({
      success: true, message: OPERATOR_MESSAGES.reconcileQueued,
    });
    const event = m.send.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(event.data.reconcileOnly).toBe(true);
  });

  it.each([
    ['dokument specjalny', { invoice_kind: 'correction' }, OPERATOR_MESSAGES.special],
    ['przychodząca', { direction: 'incoming' }, OPERATOR_MESSAGES.incoming],
    ['bez pozycji', { fa3_data: { internalNumber: 'FV/9' } }, OPERATOR_MESSAGES.incomplete],
  ])('%s → odmowa bez zlecenia', async (_l, patch, message) => {
    m.invoice = row(patch);
    await expect(operatorRequeueAction(ID, { reconcileOnly: false })).resolves.toEqual({ success: false, error: message });
    expect(m.send).not.toHaveBeenCalled();
  });

  it('hamulec operatora: odmowa; awaria odczytu hamulca też (fail-closed)', async () => {
    m.paused.mockResolvedValue(true);
    await expect(operatorRequeueAction(ID, { reconcileOnly: false })).resolves.toEqual({ success: false, error: OPERATOR_MESSAGES.paused });
    m.paused.mockRejectedValue(new Error('db'));
    await expect(operatorRequeueAction(ID, { reconcileOnly: false })).resolves.toEqual({ success: false, error: OPERATOR_MESSAGES.pausedUnknown });
    expect(m.send).not.toHaveBeenCalled();
  });

  it('odmowa RPC (P0001) wraca komunikatem RPC, bez audytu', async () => {
    const tx: Tx = { executeSql: vi.fn(async () => { throw Object.assign(new Error('Błąd treści dokumentu (XSD_INVALID) — wróć do szkicu i popraw'), { code: 'P0001' }); }) };
    sendRunningStep(tx);
    await expect(operatorRequeueAction(ID, { reconcileOnly: false })).resolves.toEqual({
      success: false, error: 'Błąd treści dokumentu (XSD_INVALID) — wróć do szkicu i popraw',
    });
    expect(m.audit).not.toHaveBeenCalled();
  });

  it('brak faktury → komunikat, bez efektów', async () => {
    m.invoice = null;
    await expect(operatorRequeueAction(ID, { reconcileOnly: false })).resolves.toEqual({ success: false, error: OPERATOR_MESSAGES.notFound });
  });
});

describe('operatorResetAction', () => {
  it('reset_ksef_send z firmą i aktorem = operator, audyt operator_reset, odświeżenie', async () => {
    await expect(operatorResetAction(ID)).resolves.toEqual({ success: true, message: OPERATOR_MESSAGES.reset });
    expect(m.rpc).toHaveBeenCalledWith('reset_ksef_send', { p_invoice_id: ID, p_tenant_id: TENANT, p_actor_user_id: OPERATOR.userId });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'invoice.operator_reset', userId: OPERATOR.userId }));
    expect(m.revalidate).toHaveBeenCalledWith(`/invoices/${ID}`);
  });

  it('odmowa RPC (dowód kontaktu) wraca komunikatem RPC', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'Faktura mogła dotrzeć do KSeF — wymaga uzgodnienia, nie powrotu do szkicu' } });
    await expect(operatorResetAction(ID)).resolves.toEqual({
      success: false, error: 'Faktura mogła dotrzeć do KSeF — wymaga uzgodnienia, nie powrotu do szkicu',
    });
    expect(m.audit).not.toHaveBeenCalled();
  });
});

describe('autoryzacja operatora przed każdą operacją', () => {
  it.each([
    ['requeue', () => operatorRequeueAction(ID, { reconcileOnly: false })],
    ['reset', () => operatorResetAction(ID)],
  ])('%s: odmowa requireAdmin zatrzymuje wszystko przed kluczem serwisowym', async (_l, action) => {
    m.requireAdmin.mockRejectedValue(new Error('synthetic authorization denied'));
    await expect(action()).rejects.toThrow('synthetic authorization denied');
    expect(m.admin).not.toHaveBeenCalled();
    expect(m.send).not.toHaveBeenCalled();
    expect(m.rpc).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });
});
