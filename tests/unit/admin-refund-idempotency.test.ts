import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  invoiceAppearsBeforeClaim: boolean;
  claimError: boolean;
  financialCase: Row | null;
  settlementError: boolean;
  settlementThrows: boolean;
  settlementResult: string | null;
  preflightResult: string;
  preflightError: boolean;
  preflightThrows: boolean;
  caseBeforePreflight: boolean;
};

let state: State;
const input = {
  paymentId: '11111111-1111-4111-8111-111111111111',
  adminUserId: '22222222-2222-4222-8222-222222222222',
  reason: 'Customer request',
};
const operatorTenantId = '44444444-4444-4444-8444-444444444444';
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
        throw new Error('Refund operation must be claimed through the atomic RPC');
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
  vi.stubEnv('FAKTFLOW_OPERATOR_TENANT_ID', operatorTenantId);
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
    invoiceAppearsBeforeClaim: false,
    claimError: false,
    financialCase: null,
    settlementError: false,
    settlementThrows: false,
    settlementResult: null,
    preflightResult: 'clear',
    preflightError: false,
    preflightThrows: false,
    caseBeforePreflight: false,
  };
  mocks.adminClient.mockImplementation(() => ({
    from: (table: string) => new FakeQuery(table),
    rpc: async (name: string, args: Row): Promise<Result> => {
      if (name === 'admin_refund_financial_preflight') {
        state.calls.push('financial-preflight-rpc');
        expect(args).toEqual({ p_payment_id: input.paymentId });
        expect(state.operation?.status).toBe('processing');
        if (state.caseBeforePreflight) {
          state.financialCase = {
            stripe_refund_id: 're_external',
            case_state: 'open',
            hold_active: true,
          };
        }
        if (state.preflightThrows) throw new Error('preflight response lost');
        if (state.preflightError) return failure('preflight database error');
        if (state.financialCase?.hold_active) return ok('held');
        return ok(state.preflightResult);
      }
      if (name === 'settle_admin_refund_case') {
        state.calls.push('case-settle-rpc');
        expect(args).toEqual({
          p_payment_id: input.paymentId,
          p_stripe_refund_id: stripeResponse.id,
        });
        if (state.settlementThrows) throw new Error('settlement transport lost');
        if (state.settlementError) return failure('settlement RPC failed');
        if (state.settlementResult !== null) return ok(state.settlementResult);
        if (!state.financialCase) return ok('missing_case');
        if (state.financialCase.stripe_refund_id !== stripeResponse.id ||
            state.operation?.status !== 'completed' ||
            state.payment.status !== 'refunded' ||
            !state.refunds.some((row) =>
              row.stripe_refund_id === stripeResponse.id &&
              row.payment_id === input.paymentId && row.status === 'succeeded')) {
          return ok('needs_reconciliation');
        }
        state.financialCase.case_state = 'settled';
        // The database hold is historical and remains active after alert closure.
        return ok('settled');
      }
      if (name !== 'claim_admin_refund_uninvoiced') {
        throw new Error('Unexpected RPC: ' + name);
      }
      state.calls.push('operation-claim-rpc');
      expect(args).toMatchObject({
        p_payment_id: input.paymentId,
        p_tenant_id: state.payment.tenant_id,
        p_admin_user_id: input.adminUserId,
        p_reason: input.reason,
        p_operator_tenant_id: operatorTenantId,
      });
      if (state.claimError) return failure('refund claim failed');
      if (state.invoiceAppearsBeforeClaim) {
        state.payment.vat_invoice_id = 'vat-invoice';
      }
      if (state.payment.vat_invoice_id) return ok('invoice_exists');
      if (state.payment.status !== 'succeeded') return ok('not_succeeded');
      if (state.operation) return ok('already_claimed');
      state.operation = {
        payment_id: state.payment.id,
        tenant_id: state.payment.tenant_id,
        idempotency_key: 'admin-full-refund-v1:' + input.paymentId,
        amount_cents: state.payment.amount_cents,
        currency: state.payment.currency,
        stripe_payment_reference: state.payment.stripe_payment_intent_id ?? state.payment.stripe_charge_id,
        status: 'processing',
        requested_by_user_id: input.adminUserId,
        reason: input.reason,
      };
      return ok('claimed');
    },
    auth: { admin: { getUserById: async () => ({ data: { user: { email: 'owner@example.test' } } }) } },
  }));
  mocks.createRefund.mockResolvedValue({ ...stripeResponse });
  mocks.sendEmail.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('admin full refund idempotency', () => {
  it('claims before Stripe, uses a stable key and explicit full amount, then records success', async () => {
    mocks.createRefund.mockImplementation(async () => {
      expect(state.calls).toContain('operation-claim-rpc');
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

  it('stops before Stripe when an external case lands after the admin claim', async () => {
    state.caseBeforePreflight = true;

    const result = await issueRefund(input);

    expect(result).toMatchObject({ success: false, reconciliationRequired: true });
    expect(state.calls.indexOf('operation-claim-rpc'))
      .toBeLessThan(state.calls.indexOf('financial-preflight-rpc'));
    expect(state.financialCase).toMatchObject({ case_state: 'open', hold_active: true });
    expect(state.operation).toMatchObject({
      status: 'reconciliation_required',
      reconciliation_reason: 'financial_case_before_stripe',
    });
    expect(mocks.createRefund).not.toHaveBeenCalled();
    expect((await issueRefund(input)).success).toBe(false);
    expect(mocks.createRefund).not.toHaveBeenCalled();
  });

  it.each(['busy', 'missing_reference', 'missing_payment', 'unexpected'])(
    'fails closed when financial preflight returns %s', async (status) => {
      state.preflightResult = status;

      const result = await issueRefund(input);

      expect(result).toMatchObject({ success: false, reconciliationRequired: true });
      expect(state.operation).toMatchObject({
        status: 'reconciliation_required',
        reconciliation_reason: 'financial_preflight_unconfirmed',
      });
      expect(mocks.createRefund).not.toHaveBeenCalled();
    },
  );

  it.each(['error', 'throws'] as const)(
    'fails closed when financial preflight RPC has %s', async (failureMode) => {
      state.preflightError = failureMode === 'error';
      state.preflightThrows = failureMode === 'throws';

      const result = await issueRefund(input);

      expect(result).toMatchObject({ success: false, reconciliationRequired: true });
      expect(state.operation).toMatchObject({
        status: 'reconciliation_required',
        reconciliation_reason: 'financial_preflight_unconfirmed',
      });
      expect(mocks.createRefund).not.toHaveBeenCalled();
    },
  );

  it('settles a webhook case received before the admin Stripe response and keeps its hold', async () => {
    mocks.createRefund.mockImplementation(async () => {
      expect(state.operation?.status).toBe('processing');
      state.financialCase = {
        stripe_refund_id: stripeResponse.id,
        case_state: 'awaiting_admin',
        hold_active: true,
      };
      return { ...stripeResponse };
    });

    const result = await issueRefund(input);

    expect(result.success).toBe(true);
    expect(state.financialCase).toMatchObject({
      case_state: 'settled', hold_active: true,
    });
    expect(state.calls.lastIndexOf('operation-update'))
      .toBeLessThan(state.calls.indexOf('case-settle-rpc'));
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  it.each(['error', 'throws', 'unexpected'] as const)(
    'keeps a completed refund successful when settlement RPC returns %s',
    async (failureMode) => {
      mocks.createRefund.mockImplementation(async () => {
        state.financialCase = {
          stripe_refund_id: stripeResponse.id,
          case_state: 'awaiting_admin',
          hold_active: true,
        };
        return { ...stripeResponse };
      });
      state.settlementError = failureMode === 'error';
      state.settlementThrows = failureMode === 'throws';
      state.settlementResult = failureMode === 'unexpected'
        ? 'needs_reconciliation' : null;

      const result = await issueRefund(input);

      expect(result).toMatchObject({ success: true, stripeRefundId: stripeResponse.id });
      expect(state.payment.status).toBe('refunded');
      expect(state.operation?.status).toBe('completed');
      expect(state.financialCase).toMatchObject({
        case_state: 'awaiting_admin', hold_active: true,
      });
      expect(mocks.captureException).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Financial case settlement was not confirmed' }),
        expect.objectContaining({ tags: { area: 'billing.refund.case_settlement' } }),
      );
      expect((await issueRefund(input)).success).toBe(false);
      expect(mocks.createRefund).toHaveBeenCalledOnce();
    },
  );

  it('does not reverse a completed refund if alert delivery itself fails', async () => {
    state.settlementError = true;
    mocks.captureException.mockImplementation(() => {
      throw new Error('Sentry unavailable');
    });

    await expect(issueRefund(input)).resolves.toMatchObject({
      success: true, stripeRefundId: stripeResponse.id,
    });
    expect(state.operation?.status).toBe('completed');
    expect(mocks.createRefund).toHaveBeenCalledOnce();
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

  it('refuses a refund when a VAT invoice is already linked', async () => {
    state.payment.vat_invoice_id = 'vat-invoice';

    const result = await issueRefund(input);

    expect(result.success).toBe(false);
    expect(state.operation).toBeNull();
    expect(mocks.createRefund).not.toHaveBeenCalled();
  });

  it('refuses a refund if the VAT invoice appears after the initial payment read', async () => {
    state.invoiceAppearsBeforeClaim = true;

    const result = await issueRefund(input);

    expect(result.success).toBe(false);
    expect(state.calls).toContain('operation-claim-rpc');
    expect(state.operation).toBeNull();
    expect(mocks.createRefund).not.toHaveBeenCalled();
  });

  it('fails closed without the operator tenant configuration', async () => {
    vi.stubEnv('FAKTFLOW_OPERATOR_TENANT_ID', undefined);

    const result = await issueRefund(input);

    expect(result.success).toBe(false);
    expect(state.calls).not.toContain('operation-claim-rpc');
    expect(state.operation).toBeNull();
    expect(mocks.createRefund).not.toHaveBeenCalled();
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