import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: mocks.admin }));

import { hashRecoveryCode } from '@/lib/auth/backup-codes';
import { consumeRecoveryCode } from '@/lib/auth/mfa-recovery';

interface RecoveryRow {
  id: string;
  user_id: string;
  code_hash: string;
  code_salt: string;
  used_at: string | null;
}

type FilterColumn = 'id' | 'user_id' | 'used_at';
type Filters = Map<FilterColumn, string | null>;
type QueryResult<T> = { data: T[] | null; error: { message: string } | null };

const USER = 'recovery-user-a';
const OTHER_USER = 'recovery-user-b';
const CODE = 'ABCDE-FGHJK';
const storedCode = hashRecoveryCode(CODE);

function fixture(overrides: Partial<RecoveryRow> = {}): RecoveryRow {
  return {
    id: 'recovery-code-a',
    user_id: USER,
    code_hash: storedCode.hash,
    code_salt: storedCode.salt,
    used_at: null,
    ...overrides,
  };
}

function barrier(participants: number) {
  let arrivals = 0;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  return async () => {
    arrivals += 1;
    if (arrivals === participants) release();
    await ready;
  };
}

function deferredThen<T>(execute: () => Promise<T>): Promise<T>['then'] {
  return (onfulfilled, onrejected) => execute().then(onfulfilled, onrejected);
}

/**
 * In-memory database model: reads capture snapshots, while writes compare
 * their filters against current state and mutate it in one synchronous step.
 * The real scrypt hash/verifier stays active; only the database is replaced.
 */
function database(rows: RecoveryRow[] = [fixture()]) {
  const state = {
    rows,
    snapshots: [] as RecoveryRow[][],
    writes: [] as Filters[],
    afterSnapshot: undefined as undefined | (() => Promise<void>),
    beforeWrite: undefined as undefined | (() => void),
    readError: false,
    missingReadData: false,
    writeError: false,
    writeResponse: 'normal' as 'normal' | 'missing' | 'multiple',
  };

  const matches = (row: RecoveryRow, filters: Filters) =>
    [...filters].every(([column, value]) => row[column] === value);

  const from = vi.fn((table: string) => {
    expect(table).toBe('mfa_recovery_codes');
    return {
      select: () => {
        const filters: Filters = new Map();
        const query = {
          eq: (column: FilterColumn, value: string) => {
            filters.set(column, value);
            return query;
          },
          is: (column: FilterColumn, value: null) => {
            filters.set(column, value);
            return query;
          },
          returns: () => query,
          then: deferredThen<QueryResult<RecoveryRow>>(async () => {
            const snapshot = state.rows.filter((row) => matches(row, filters))
              .map((row) => ({ ...row }));
            state.snapshots.push(snapshot);
            await state.afterSnapshot?.();
            if (state.readError) return { data: null, error: { message: 'synthetic read failure' } };
            return { data: state.missingReadData ? null : snapshot, error: null };
          }),
        };
        return query;
      },
      update: (patch: { used_at: string }) => {
        const filters: Filters = new Map();
        let returning = false;
        const query = {
          eq: (column: FilterColumn, value: string) => {
            filters.set(column, value);
            return query;
          },
          is: (column: FilterColumn, value: null) => {
            filters.set(column, value);
            return query;
          },
          select: (columns: string) => {
            expect(columns).toBe('id');
            returning = true;
            return query;
          },
          then: deferredThen<QueryResult<{ id: string }>>(async () => {
            state.writes.push(new Map(filters));
            state.beforeWrite?.();
            if (state.writeError) return { data: null, error: { message: 'synthetic write failure' } };

            // No await between comparing and setting used_at: a database CAS.
            const updated = state.rows.filter((row) => matches(row, filters));
            for (const row of updated) row.used_at = patch.used_at;

            if (!returning || state.writeResponse === 'missing') return { data: null, error: null };
            if (state.writeResponse === 'multiple') {
              return { data: [{ id: 'unexpected-a' }, { id: 'unexpected-b' }], error: null };
            }
            return { data: updated.map((row) => ({ id: row.id })), error: null };
          }),
        };
        return query;
      },
    };
  });

  mocks.admin.mockReturnValue({ from });
  return state;
}

beforeEach(() => { vi.resetAllMocks(); });

describe('atomic recovery code consumption', () => {
  it('accepts a real stored hash once and rejects sequential replay', async () => {
    const db = database();

    expect(await consumeRecoveryCode(USER, 'abcde fghjk')).toBe(true);
    expect(db.rows[0].used_at).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(db.rows[0].used_at!))).toBe(false);
    expect(await consumeRecoveryCode(USER, CODE)).toBe(false);
    expect(db.writes).toHaveLength(1);
  });

  it('allows exactly one of two requests that both read the same unused code', async () => {
    const db = database();
    db.afterSnapshot = barrier(2);

    const results = await Promise.all([
      consumeRecoveryCode(USER, CODE),
      consumeRecoveryCode(USER, CODE),
    ]);

    expect(db.snapshots).toHaveLength(2);
    expect(db.snapshots.map((snapshot) => snapshot[0].used_at)).toEqual([null, null]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.filter((result) => !result)).toHaveLength(1);
    expect(db.writes).toHaveLength(2);
    expect(db.rows[0].used_at).not.toBeNull();
  });

  it('does not find or consume another user\u0027s valid code', async () => {
    const db = database();

    expect(await consumeRecoveryCode(OTHER_USER, CODE)).toBe(false);

    expect(db.rows[0].used_at).toBeNull();
    expect(db.writes).toHaveLength(0);
  });

  it('rechecks ownership at the write even if the read snapshot is stale', async () => {
    const db = database();
    db.beforeWrite = () => { db.rows[0].user_id = OTHER_USER; };

    expect(await consumeRecoveryCode(USER, CODE)).toBe(false);

    expect(db.rows[0].used_at).toBeNull();
    expect(db.writes).toHaveLength(1);
  });

  it('reports failure when another consumer uses the code after the read', async () => {
    const db = database();
    const competingUse = '2026-09-14T09:00:00.000Z';
    db.beforeWrite = () => { db.rows[0].used_at = competingUse; };

    expect(await consumeRecoveryCode(USER, CODE)).toBe(false);

    expect(db.rows[0].used_at).toBe(competingUse);
  });

  it('reports failure when regeneration removes the matched code before the write', async () => {
    const db = database();
    db.beforeWrite = () => { db.rows.length = 0; };

    expect(await consumeRecoveryCode(USER, CODE)).toBe(false);
    expect(db.writes).toHaveLength(1);
  });

  it('consumes only the matching code and preserves the other unused codes', async () => {
    const otherStored = hashRecoveryCode('ZZZZZ-ZZZZZ');
    const db = database([
      fixture({ id: 'nonmatching-code', code_hash: otherStored.hash, code_salt: otherStored.salt }),
      fixture(),
      fixture({ id: 'other-user-code', user_id: OTHER_USER }),
    ]);

    expect(await consumeRecoveryCode(USER, CODE)).toBe(true);

    expect(db.rows[0].used_at).toBeNull();
    expect(db.rows[1].used_at).not.toBeNull();
    expect(db.rows[2].used_at).toBeNull();
  });

  it('does not write when the real verifier rejects the code', async () => {
    const db = database();

    expect(await consumeRecoveryCode(USER, 'ABCDE-FGHJM')).toBe(false);

    expect(db.writes).toHaveLength(0);
    expect(db.rows[0].used_at).toBeNull();
  });

  it.each(['readError', 'missingReadData'] as const)('fails closed on %s', async (failure) => {
    const db = database();
    db[failure] = true;

    expect(await consumeRecoveryCode(USER, CODE)).toBe(false);

    expect(db.writes).toHaveLength(0);
  });

  it('does not authorize consumption when the conditional write fails', async () => {
    const db = database();
    db.writeError = true;

    expect(await consumeRecoveryCode(USER, CODE)).toBe(false);

    expect(db.rows[0].used_at).toBeNull();
  });

  it.each(['missing', 'multiple'] as const)(
    'requires exactly one returned row instead of accepting a %s write result',
    async (response) => {
      const db = database();
      db.writeResponse = response;

      expect(await consumeRecoveryCode(USER, CODE)).toBe(false);
    },
  );
});
