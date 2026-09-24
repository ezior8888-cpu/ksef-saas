import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createRefund: vi.fn(),
  sendEmail: vi.fn(),
  captureException: vi.fn(),
  adminClient: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({ captureException: mocks.captureException }));
vi.mock('@/lib/stripe/client', () => ({
  getStripe: () => ({ refunds: { create: mocks.createRefund } }),
}));
vi.mock('@/lib/email/send', () => ({ sendRefundIssuedEmail: mocks.sendEmail }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.adminClient }));

import { issueRefund } from '@/lib/admin/refunds';

type Row = Record<string, unknown>;
type ErrorRow = { code?: string; message: string };
type Result = { data: unknown; error: ErrorRow | null };

type State = {
  payment: Row;
  operation: Row | null;
  refunds: Row[];
  calls: string[];
  failRefundInsert: boolean;
  throwRefundInsert: boolean;
  failPaymentUpdate: boolean;
  failCompletion: boolean;
  emailOwner: boolean;
  nullPriorRefundRead: boolean;
};

let state: State;
const input = {
  paymentId: '11111111-1111-4111-8111-111111111111',
  adminUserId: '22222222-2222-4222-8222-222222222222',
  reason: 'Customer request',
};
const stripeResponse = {
  id: 're_local',
  amount: 12000,
  currency: 'pln',
  status: 'succeeded',
};

function ok(data: unknown): Result {
  return { data, error: null };
}

function failure(message: string, code?: string): Result {
  return { data: null, error: { message, code } };
}

class FakeQuery {
  private mode: 'select' | 'insert' | 'update' = 'select';
  private row: Row = {};
  private filters: Record<string, unknown> = {};

  constructor(private readonly table: string) {}

  select(): this { return this; }
  insert(row: Row): this { this.mode = 'insert'; this.row = row; return this; }
  update(row: Row): this { this.mode = 'update'; this.row = row; return this; }
  eq(column: string, value: unknown): this { this.filters[column] = value; return this; }
  limit(): this { return this; }
  order(): this { return this; }

  async single(): Promise<Result> { return this.execute(); }
  async maybeSingle(): Promise<Result> { return this.execute(); }
  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private execute(): Result {
    if (this.table === 'stripe_payments') {
      if (this.mode === 'select') {
        return this.filters.id === state.payment.id ? ok({ ...state.payment }) : ok(null);
      }
      state.calls.push('payment-update');
      if (state.failPaymentUpdate) return failure('payment update failed');
      if (this.filters.id !== state.payment.id || this.filters.status !== state.payment.status) {
        return ok(null);
      }
      Object.assign(state.payment, this.row);
      return ok({ id: state.payment.id });
    }

    if (this.table === 'stripe_refunds') {
      if (this.mode === 'select') {
        return ok(state.nullPriorRefundRead
          ? null
          : state.refunds.filter((row) => row.payment_id === this.filters.payment_id));
      }
      state.calls.push('refund-insert');
      if (state.throwRefundInsert) throw new Error('refund insert transport exception');
      if (state.failRefundInsert) return failure('refund insert failed');
      const row = { id: 'local-refund-id', ...this.row };
      state.refunds.push(row);
      return ok({ id: row.id });
    }

    if (this.table === 'stripe_refund_operations') {
      if (this.mode === 'select') {
        return this.filters.payment_id === state.operation?.payment_id
          ? ok({ ...state.operation })
          : ok(null);
      }
      if (this.mode === 'insert') {
        state.calls.push('operation-claim');
        if (state.operation) return failure('duplicate operation', '23505');
        state.operation = { ...this.row };
        return ok({ payment_id: state.operation.payment_id });
      }
      state.calls.push('operation-update');
      if (!state.operation || this.filters.payment_id !== state.operation.payment_id ||
          this.filters.status !== state.operation.status) return ok(null);
      if (state.failCompletion && this.row.status === 'completed') {
        return failure('completion update failed');
      }
      Object.assign(state.operation, this.row);
      return ok({ payment_id: state.operation.payment_id });
    }

    if (this.table === 'memberships') return ok(state.emailOwner ? { user_id: 'owner-local' } : null);
    if (this.table === 'tenants') return ok({ name: 'Tenant Local' });
    throw new Error('Unexpected query: ' + this.table);
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  state = {
    payment: {
      id: input.paymentId,
      tenant_id: '33333333-3333-4333-8333-333333333333',
      stripe_payment_intent_id: 'pi_local',
      stripe_charge_id: null,
      amount_cents: 12000,
      currency: 'pln',
      status: 'succeeded',
    },
    operation: null,
    refunds: [],
    calls: [],
    failRefundInsert: false,
    throwRefundInsert: false,
    failPaymentUpdate: false,
    failCompletion: false,
    emailOwner: false,
    nullPriorRefundRead: false,
  };
  mocks.adminClient.mockImplementation(() => ({
    from: (table: string) => new FakeQuery(table),
    auth: { admin: { getUserById: async () => ({ data: { user: { email: 'owner@example.test' } } }) } },
  }));
  mocks.createRefund.mockResolvedValue({ ...stripeResponse });
  mocks.sendEmail.mockResolvedValue(undefined);
});

describe('admin full refund idempotency', () => {
  it('claims before Stripe, uses a stable key and explicit full amount, then records success', async () => {
    mocks.createRefund.mockImplementation(async () => {
      expect(state.calls).toContain('operation-claim');
      expect(state.operation?.status).toBe('processing');
      return { ...stripeResponse };
    });

    const result = await issueRefund(input);

    expect(result).toEqual({
      success: true, refundId: 'local-refund-id', stripeRefundId: 're_local',
    });
    expect(mocks.createRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent: 'pi_local', amount: 12000,
        metadata: expect.objectContaining({ paymentId: input.paymentId }),
      }),
      { idempotencyKey: 'admin-full-refund-v1:' + input.paymentId },
    );
    expect(state.operation).toMatchObject({
      status: 'completed',
      requested_by_user_id: input.adminUserId,
      reason: input.reason,
      stripe_refund_id: 're_local',
      refund_id: 'local-refund-id',
      amount_cents: 12000,
      currency: 'pln',
      stripe_payment_reference: 'pi_local',
    });
    expect(state.payment.status).toBe('refunded');
    expect(state.refunds).toHaveLength(1);
  });

  it('blocks concurrent and later repeats without another Stripe request', async () => {
    let release: (value: typeof stripeResponse) => void = () => undefined;
    mocks.createRefund.mockImplementation(() => new Promise((resolve) => { release = resolve; }));

    const first = issueRefund(input);
    await vi.waitFor(() => expect(mocks.createRefund).toHaveBeenCalledOnce());
    const second = await issueRefund(input);

    expect(second).toMatchObject({ success: false, operationPending: true });
    expect(mocks.createRefund).toHaveBeenCalledOnce();
    release({ ...stripeResponse });
    expect((await first).success).toBe(true);
    expect((await issueRefund(input)).success).toBe(false);
    expect(mocks.createRefund).toHaveBeenCalledOnce();
  });

  it('keeps a lost Stripe response blocked for reconciliation', async () => {
    mocks.createRefund.mockRejectedValue(new Error('network timeout after acceptance'));

    const result = await issueRefund(input);

    expect(result).toMatchObject({ success: false, reconciliationRequired: true });
    expect(state.operation).toMatchObject({
      status: 'reconciliation_required',
      reconciliation_reason: 'stripe_request_ambiguous',
    });
    expect(state.payment.status).toBe('succeeded');
    expect(state.refunds).toHaveLength(0);
    expect((await issueRefund(input)).success).toBe(false);
    expect(mocks.createRefund).toHaveBeenCalledOnce();
  });

  it('does not report success if the local refund record fails after Stripe succeeds', async () => {
    state.failRefundInsert = true;

    const result = await issueRefund(input);

    expect(result).toMatchObject({ success: false, reconciliationRequired: true });
    expect(state.operation).toMatchObject({
      status: 'reconciliation_required',
      stripe_refund_id: 're_local',
      reconciliation_reason: 'refund_record_failed',
    });
    expect(state.payment.status).toBe('succeeded');
    expect((await issueRefund(input)).success).toBe(false);
    expect(mocks.createRefund).toHaveBeenCalledOnce();
  });

  it('treats a pending Stripe refund as unresolved, without changing payment status', async () => {
    mocks.createRefund.mockResolvedValue({ ...stripeResponse, status: 'pending' });

    const result = await issueRefund(input);

    expect(result).toMatchObject({ success: false, reconciliationRequired: true });
    expect(state.operation).toMatchObject({
      status: 'reconciliation_required',
      stripe_refund_id: 're_local',
      reconciliation_reason: 'stripe_status_pending',
    });
    expect(state.payment.status).toBe('succeeded');
    expect(state.refunds).toMatchObject([{ status: 'pending' }]);
  });

  it('does not report success if payment status cannot be persisted', async () => {
    state.failPaymentUpdate = true;

    const result = await issueRefund(input);

    expect(result).toMatchObject({ success: false, reconciliationRequired: true });
    expect(state.operation).toMatchObject({
      status: 'reconciliation_required',
      reconciliation_reason: 'payment_status_update_failed',
    });
    expect(state.payment.status).toBe('succeeded');
  });

  it('blocks historical refund rows even when the payment still appears succeeded', async () => {
    state.refunds.push({ id: 'old-refund', payment_id: input.paymentId });

    const result = await issueRefund(input);

    expect(result).toMatchObject({ success: false, reconciliationRequired: true });
    expect(state.operation).toBeNull();
    expect(mocks.createRefund).not.toHaveBeenCalled();
  });
  it('awaits the best-effort email only after a confirmed refund', async () => {
    state.emailOwner = true;
    let releaseEmail: () => void = () => undefined;
    mocks.sendEmail.mockImplementation(() => new Promise<void>((resolve) => {
      releaseEmail = resolve;
    }));

    let settled = false;
    const task = issueRefund(input).then((result) => {
      settled = true;
      return result;
    });
    await vi.waitFor(() => expect(mocks.sendEmail).toHaveBeenCalledOnce());
    expect(settled).toBe(false);
    expect(state.operation?.status).toBe('completed');

    releaseEmail();
    expect((await task).success).toBe(true);
  });

  it('does not send a success email for an unresolved Stripe refund', async () => {
    state.emailOwner = true;
    mocks.createRefund.mockResolvedValue({ ...stripeResponse, status: 'pending' });

    const result = await issueRefund(input);

    expect(result).toMatchObject({ success: false, reconciliationRequired: true });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
  it('rejects invalid operator input before claiming an operation', async () => {
    const invalidReason = await issueRefund({ ...input, reason: 'x'.repeat(501) });
    expect(invalidReason.success).toBe(false);
    expect(state.operation).toBeNull();
    expect(mocks.createRefund).not.toHaveBeenCalled();

    state.payment.currency = '??';
    const invalidCurrency = await issueRefund(input);
    expect(invalidCurrency.success).toBe(false);
    expect(state.operation).toBeNull();
    expect(mocks.createRefund).not.toHaveBeenCalled();
  });
  it('does not report success when the final operation update fails', async () => {
    state.failCompletion = true;

    const result = await issueRefund(input);

    expect(result).toMatchObject({ success: false, reconciliationRequired: true });
    expect(state.payment.status).toBe('refunded');
    expect(state.operation).toMatchObject({
      status: 'reconciliation_required',
      stripe_refund_id: 're_local',
      reconciliation_reason: 'operation_completion_failed',
    });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
  it('fails closed when prior refund lookup returns no usable result', async () => {
    state.nullPriorRefundRead = true;

    const result = await issueRefund(input);

    expect(result.success).toBe(false);
    expect(state.operation).toBeNull();
    expect(mocks.createRefund).not.toHaveBeenCalled();
  });
  it('contains a thrown storage error after Stripe and leaves a blocked operation', async () => {
    state.throwRefundInsert = true;

    const result = await issueRefund(input);

    expect(result).toMatchObject({ success: false, reconciliationRequired: true });
    expect(state.operation).toMatchObject({
      status: 'reconciliation_required',
      stripe_refund_id: 're_local',
      reconciliation_reason: 'post_stripe_storage_exception',
    });
    expect(state.payment.status).toBe('succeeded');
    expect(mocks.createRefund).toHaveBeenCalledOnce();
  });
});