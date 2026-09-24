import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cancelGdprRequest, cancelOwnGdprRequest, createGdprRequest,
  executeGdprRequest, findDueGdprRequests, getActiveGdprRequest,
} from '@/lib/gdpr/deletion';

const mocks = vi.hoisted(() => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/supabase/server', () => mocks);

type Row = Record<string, string | null>;
type DbResult = { data: Row[] | null; error: { message: string; code?: string } | null };
type Operation = {
  kind: 'select' | 'insert' | 'update'; values: Row | null;
  filters: Array<[string, string]>; included: Array<[string, string[]]>;
};
function database() {
  const rows: Row[] = [];
  const operations: Operation[] = [];
  const rpc = vi.fn(async () => ({ data: null, error: null as { message: string } | null }));
  const deleteUser = vi.fn<(userId: string) => Promise<{ error: { message: string } | null }>>()
    .mockResolvedValue({ error: null });
  let lookupError = false;
  let pageSize = 1000;
  let sequence = 0;
  const from = vi.fn(() => {
    let fields = '*';
    let due: string | undefined;
    const operation: Operation = { kind: 'select', values: null, filters: [], included: [] };
    const project = (row: Row): Row => fields === '*' ? { ...row }
      : Object.fromEntries(fields.split(',').map((key) => [key.trim(), row[key.trim()]]));
    const execute = (): DbResult => {
      operations.push(structuredClone(operation));
      if (operation.kind === 'select' && lookupError) return { data: null, error: { message: 'database unavailable' } };
      if (operation.kind === 'insert') {
        // Model wymaganego UNIQUE z propozycji schematu; nie wykonujemy SQL.
        if (rows.some((row) => row.user_id === operation.values?.user_id
          && ['pending', 'processing'].includes(row.status ?? ''))) {
          return { data: null, error: { code: '23505', message: 'active user constraint' } };
        }
        const row = { id: 'request-' + ++sequence, status: 'pending', ...operation.values };
        rows.push(row);
        return { data: [project(row)], error: null };
      }
      const matching = rows.filter((row) => operation.filters.every(([key, value]) => row[key] === value)
        && operation.included.every(([key, values]) => values.includes(row[key] ?? ''))
        && (!due || (row.scheduled_for ?? '') <= due));
      if (operation.kind === 'update') {
        for (const row of matching) Object.assign(row, operation.values);
      }
      return { data: matching.slice(0, pageSize).map(project), error: null };
    };
    const query = {
      select(columns: string) { fields = columns; return query; },
      eq(key: string, value: string) { operation.filters.push([key, value]); return query; },
      in(key: string, values: string[]) { operation.included.push([key, values]); return query; },
      insert(values: Row[]) { operation.kind = 'insert'; operation.values = values[0]; return query; },
      update(values: Row) { operation.kind = 'update'; operation.values = values; return query; },
      lte(_key: string, value: string) { due = value; return query; },
      then<TResult1 = DbResult, TResult2 = never>(
        onfulfilled?: ((value: DbResult) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ): Promise<TResult1 | TResult2> { return Promise.resolve(execute()).then(onfulfilled, onrejected); },
      async maybeSingle() {
        const result = execute();
        if ((result.data?.length ?? 0) > 1) return { data: null, error: { code: 'PGRST116', message: 'multiple rows' } };
        return { data: result.data?.[0] ?? null, error: result.error };
      },
    };
    return query;
  });
  return {
    rows, operations, from, rpc, auth: { admin: { deleteUser } },
    failLookup: () => { lookupError = true; },
    setPageSize: (size: number) => { pageSize = size; },
  };
}
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const input = { userId: 'user-1', userEmail: 'owner@example.test' };
let db: ReturnType<typeof database>;
beforeEach(() => { vi.clearAllMocks(); db = database(); mocks.createAdminClient.mockReturnValue(db); });

function dueRequest() {
  const token = 'ab'.repeat(32);
  db.rows.push({ id: 'due-request', status: 'pending', user_id: input.userId,
    user_email: input.userEmail, scheduled_for: '2020-01-01', cancel_token_hash: hash(token) });
  return token;
}

describe('GDPR token and request safety', () => {
  it('stores only SHA-256 and returns plaintext only for a new email', async () => {
    const created = await createGdprRequest(input);
    expect(created.cancelToken).toMatch(/^[a-f0-9]{64}$/);
    expect(created.alreadyScheduled).toBe(false);
    expect(db.rows[0].cancel_token_hash).toBe(hash(created.cancelToken!));
    expect(db.rows[0]).not.toHaveProperty('cancel_token');
    expect(JSON.stringify(db.operations)).not.toContain(created.cancelToken);
  });

  it('accepts the raw link once but never a hash stolen from the database', async () => {
    const created = await createGdprRequest(input);
    expect(await cancelGdprRequest(db.rows[0].cancel_token_hash!, null)).toEqual({ ok: false });
    expect(db.rows[0].status).toBe('pending');
    expect(await cancelGdprRequest(created.cancelToken!, 'confirmed')).toEqual({ ok: true, requestId: created.id });
    expect(await cancelGdprRequest(created.cancelToken!, null)).toEqual({ ok: false });
  });

  it('keeps old email links usable after a hash backfill', async () => {
    const token = dueRequest();
    expect((await cancelGdprRequest(token, null)).ok).toBe(true);
  });

  it('repeated requests preserve the previous token and deadline without a new email token', async () => {
    const first = await createGdprRequest(input);
    const savedHash = db.rows[0].cancel_token_hash;
    const second = await createGdprRequest(input);
    expect(db.rows).toHaveLength(1);
    expect(second).toEqual({ id: first.id, scheduledFor: first.scheduledFor, cancelToken: null, alreadyScheduled: true });
    expect(db.rows[0].cancel_token_hash).toBe(savedHash);
    expect((await cancelGdprRequest(first.cancelToken!, null)).ok).toBe(true);
  });

  it('handles a concurrent UNIQUE conflict by reusing the winning request without rotating its token', async () => {
    const results = await Promise.all([createGdprRequest(input), createGdprRequest(input)]);
    expect(db.rows).toHaveLength(1);
    const created = results.find((result) => !result.alreadyScheduled)!;
    const repeated = results.find((result) => result.alreadyScheduled)!;
    expect(repeated.id).toBe(created.id);
    expect(repeated.cancelToken).toBeNull();
    expect((await cancelGdprRequest(created.cancelToken!, null)).ok).toBe(true);
    expect(db.rows.every((row) => row.status === 'canceled')).toBe(true);
  });

  it('refuses to create another request when lookup fails or legacy active duplicates exist', async () => {
    db.failLookup();
    await expect(createGdprRequest(input)).rejects.toThrow('gdpr_request_lookup_failed');
    expect(db.rows).toHaveLength(0);
    db = database(); mocks.createAdminClient.mockReturnValue(db);
    dueRequest(); db.rows.push({ ...db.rows[0], id: 'legacy-duplicate' });
    await expect(createGdprRequest(input)).rejects.toThrow('gdpr_request_lookup_failed');
    expect(db.rows).toHaveLength(2);
  });

  it('does not create a new request while deletion is processing', async () => {
    dueRequest(); db.rows[0].status = 'processing';
    await expect(createGdprRequest(input)).rejects.toThrow('gdpr_request_processing');
    expect(db.rows).toHaveLength(1);
  });

  it('allows own authenticated cancellation without an email token and leaves other users untouched', async () => {
    dueRequest();
    db.rows.push({ ...db.rows[0], id: 'other-request', user_id: 'other-user' });
    expect(await cancelOwnGdprRequest(input.userId)).toEqual({ ok: true, requestId: 'due-request' });
    expect(db.rows[0].status).toBe('canceled');
    expect(db.rows[1].status).toBe('pending');
  });

  it('active request UI data excludes the token hash and email', async () => {
    dueRequest();
    expect(await getActiveGdprRequest(db as unknown as Parameters<typeof getActiveGdprRequest>[0], input.userId)).toEqual({ id: 'due-request', scheduled_for: '2020-01-01', status: 'pending' });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('rejects malformed tokens before accessing the database', async () => {
    for (const token of ['', 'short', '../token', 'a'.repeat(65)]) expect(await cancelGdprRequest(token, null)).toEqual({ ok: false });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('filters pending before the database page limit so old completed rows cannot starve work', async () => {
    db.setPageSize(2);
    for (let index = 0; index < 3; index++) db.rows.push({ id: 'old-' + index, status: 'executed', scheduled_for: '2020-01-01' });
    dueRequest();
    expect(await findDueGdprRequests()).toEqual([{ id: 'due-request', scheduled_for: '2020-01-01', status: 'pending' }]);
  });

  it('reports failure to read due requests instead of silently reporting an empty queue', async () => {
    db.failLookup();
    await expect(findDueGdprRequests()).rejects.toThrow('gdpr_due_requests_lookup_failed');
  });
});

describe('GDPR atomic processing claim', () => {
  it('does not claim or delete before the cooling-off deadline', async () => {
    dueRequest(); db.rows[0].scheduled_for = '2099-01-01';
    expect((await executeGdprRequest('due-request')).ok).toBe(false);
    expect(db.rows[0].status).toBe('pending');
    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('does not delete if cancellation won the row first', async () => {
    const token = dueRequest();
    expect((await cancelGdprRequest(token, null)).ok).toBe(true);
    expect((await executeGdprRequest('due-request')).ok).toBe(false);
    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('allows only one worker and rejects both cancellation paths after its claim', async () => {
    const token = dueRequest();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    db.rpc.mockImplementationOnce(async () => { await gate; return { data: null, error: null }; });
    const first = executeGdprRequest('due-request');
    await Promise.resolve();
    expect(db.rows[0].status).toBe('processing');
    expect(db.rows[0].processing_started_at).toBeTruthy();
    expect((await cancelGdprRequest(token, null)).ok).toBe(false);
    expect((await cancelOwnGdprRequest(input.userId)).ok).toBe(false);
    expect((await executeGdprRequest('due-request')).ok).toBe(false);
    expect(db.auth.admin.deleteUser).not.toHaveBeenCalled();
    release();
    expect(await first).toEqual({ ok: true });
    expect(db.rpc).toHaveBeenCalledOnce();
    expect(db.auth.admin.deleteUser).toHaveBeenCalledExactlyOnceWith(input.userId);
    expect(db.rows[0].status).toBe('executed');
  });

  it('never reclaims processing left by a crashed worker', async () => {
    dueRequest(); db.rows[0].status = 'processing'; db.rows[0].processing_started_at = '2020-01-01';
    expect((await executeGdprRequest('due-request')).ok).toBe(false);
    expect(db.rows[0].status).toBe('processing');
    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('records an uncertain failure without automatically repeating deletion', async () => {
    dueRequest(); db.auth.admin.deleteUser.mockResolvedValueOnce({ error: { message: 'response lost' } });
    expect(await executeGdprRequest('due-request')).toEqual({ ok: false, error: 'auth_delete_failed' });
    expect(db.rows[0].status).toBe('failed');
    expect((await executeGdprRequest('due-request')).ok).toBe(false);
    expect(db.auth.admin.deleteUser).toHaveBeenCalledOnce();
  });
});
