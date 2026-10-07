import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobContext } from '@/lib/jobs/registry';
import type { KsefEnvironment } from '@/types/ksef';

/**
 * Cykl życia faktury, PR 4b — cron `cron.ksef-lifecycle-reconcile`:
 *   I1  queued bez zlecenia → release (szkic) albo failed ENQUEUE_LOST;
 *   I6  failed klasy transient → ponowienie co godzinę, po 24 → TRANSIENT_EXHAUSTED;
 *   I7  failed KSEF_PAUSED po zdjęciu hamulca → ponowienie;
 *   hamulec włączony albo nieczytelny → żadnych ponowień, I1 nadal porządkowane;
 *   dokument specjalny → pominięty (zdarzenia nie da się odtworzyć);
 *   I5  (A3) zalegający wpis `sent` / zamiar `intent` > 48 h przy fakturze
 *       failed/rejected → „tylko uzgodnij” z aktorem NULL, najwyżej raz na
 *       dobę, po trzech próbach w tygodniu — operator (alarm).
 */

const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';
const ID3 = '33333333-3333-4333-8333-333333333333';
const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Row = Record<string, unknown>;
/** Filtry `eq` zapytania w kolejności wywołań (kolumna, wartość). */
type Recorded = Array<[string, unknown]>;

const m = vi.hoisted(() => ({
  tables: { invoices: [] as Row[], audit_logs: [] as Row[] },
  violations: [] as Array<{ invariant: string; invoice_id: string; tenant_id: string; detail?: Row }>,
  release: vi.fn(),
  send: vi.fn(),
  paused: vi.fn(),
  env: vi.fn((): KsefEnvironment => 'test'),
  captureMessage: vi.fn(),
  captureException: vi.fn(),
  updates: [] as Array<{ table: string; patch: Row; filters: Recorded }>,
  /** Każde `select(kolumny)` — test sprawdza, co cron naprawdę pobiera. */
  selects: [] as Array<{ table: string; columns: string }>,
  /** Każde `in(kolumna, wartości)` — rozmiary paczek i listy rodzajów. */
  ins: [] as Array<{ table: string; column: string; values: unknown[] }>,
  /** Hak po wykonaniu zapytania (np. przesunięcie zegara między odczytem a zleceniem). */
  afterQuery: undefined as undefined | ((query: { table: string; filters: Recorded }) => void),
}));

/** Kolumny z `select('a, b, rel(c, d)')` — podział po przecinkach najwyższego poziomu. */
function splitColumns(columns: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of columns) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      out.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/**
 * Wiersz tak, jak oddaje go PostgREST: tylko wybrane kolumny. Kolumna wybrana,
 * a nieobecna w danych testu → null; niewybrana → brak klucza (undefined).
 * `rel(a, b)` wybiera klucze relacji (obiekt albo tablica obiektów).
 */
function project(row: Row, columns: string): Row {
  const out: Row = {};
  for (const col of splitColumns(columns)) {
    if (col === '*') {
      Object.assign(out, row);
      continue;
    }
    const rel = /^(\w+)\(([\s\S]*)\)$/.exec(col);
    if (!rel) {
      out[col] = row[col] ?? null;
      continue;
    }
    const [, name, inner] = rel;
    const pick = (v: unknown): Row | null => (v !== null && typeof v === 'object' ? project(v as Row, inner!) : null);
    const value = row[name!];
    out[name!] = Array.isArray(value) ? value.map(pick) : pick(value);
  }
  // Kopia jak z sieci — zdarzenie nie dzieli obiektów z danymi testu.
  return structuredClone(out);
}

/**
 * Minimalny klient: filtry eq/in/is/lt/gte na tabelach w pamięci, select
 * z projekcją kolumn, order/limit po filtrach, update z zapisem łatki.
 */
function fakeAdmin() {
  return {
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      if (fn === 'ksef_lifecycle_violations') return { data: m.violations, error: null };
      if (fn === 'release_ksef_enqueue') return { data: await m.release(args), error: null };
      throw new Error(`rpc ${fn}`);
    },
    from: (table: 'invoices' | 'audit_logs') => {
      const filters: Array<(r: Row) => boolean> = [];
      const recorded: Recorded = [];
      let patch: Row | null = null;
      let columns: string | null = null;
      const orderBy: Array<{ key: string; ascending: boolean }> = [];
      let limit: number | null = null;
      const run = () => {
        let rows = m.tables[table].filter((r) => filters.every((f) => f(r)));
        if (patch) {
          rows.forEach((r) => Object.assign(r, patch));
          m.updates.push({ table, patch, filters: recorded });
        }
        if (orderBy.length > 0) {
          rows = [...rows].sort((a, b) => {
            for (const { key, ascending } of orderBy) {
              const [x, y] = [String(a[key]), String(b[key])];
              if (x !== y) return (x < y ? -1 : 1) * (ascending ? 1 : -1);
            }
            return 0;
          });
        }
        if (limit !== null) rows = rows.slice(0, limit);
        const data = columns === null ? rows.map((r) => ({ ...r })) : rows.map((r) => project(r, columns!));
        m.afterQuery?.({ table, filters: recorded });
        return { data, error: null, count: rows.length };
      };
      const q = {
        select: (c = '*') => {
          columns = c;
          m.selects.push({ table, columns: c });
          return q;
        },
        update: (p: Row) => { patch = p; return q; },
        eq: (k: string, v: unknown) => {
          recorded.push([k, v]);
          // `kolumna->>klucz` jak w PostgREST: tekst z jsonb.
          const [col, key] = k.split('->>');
          filters.push((r) => (key ? String((r[col!] as Row | undefined)?.[key!] ?? '') === v : r[k] === v));
          return q;
        },
        in: (k: string, vs: unknown[]) => {
          m.ins.push({ table, column: k, values: [...vs] });
          filters.push((r) => vs.includes(r[k]));
          return q;
        },
        is: (k: string, v: unknown) => { filters.push((r) => r[k] === v || (v === null && r[k] === undefined)); return q; },
        lt: (k: string, v: string) => { filters.push((r) => String(r[k]) < v); return q; },
        gte: (k: string, v: string) => { filters.push((r) => String(r[k]) >= v); return q; },
        order: (k: string, o?: { ascending?: boolean }) => {
          orderBy.push({ key: k, ascending: o?.ascending !== false });
          return q;
        },
        limit: (n: number) => { limit = n; return q; },
        then: (ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, fail),
      };
      return q;
    },
  };
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeAdmin() }));
vi.mock('@/lib/jobs/enqueue', () => ({ sendJobEvent: m.send }));
vi.mock('@/lib/ksef/submission-holds', () => ({ isKsefSubmissionPaused: m.paused }));
vi.mock('@/lib/ksef/claim-environment', () => ({ requireConfiguredKsefEnvironment: m.env }));
vi.mock('@sentry/nextjs', () => ({ captureMessage: m.captureMessage, captureException: m.captureException }));

import {
  ENQUEUE_LOST_MESSAGE,
  I1_RELEASE_REASON,
  LIFECYCLE_RECONCILE_MAX,
  LIFECYCLE_REQUEUE_MAX,
  runKsefLifecycleReconcile,
  TRANSIENT_EXHAUSTED_MESSAGE,
} from '@/lib/jobs/runners/ksef-lifecycle-reconcile';

const ctx: JobContext = {
  attempt: 0,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  step: { run: async (_n, fn) => fn(), sleep: vi.fn(), sendEvent: vi.fn(), scheduleAfter: vi.fn() },
};

const OLD = '2026-10-03T08:00:00.000Z'; // ponad godzinę przed „teraz”
const NOW = new Date('2026-10-03T12:00:00.000Z');
/** „Dziś” w Polsce przy NOW (14:00 czasu polskiego). */
const TODAY = '2026-10-03';

function failedRow(id: string, code: string, extra: Row = {}): Row {
  return {
    id, tenant_id: TENANT, direction: 'outgoing', ksef_status: 'failed', invoice_kind: 'regular',
    last_error_code: code, updated_at: OLD, tenants: { nip: '5260001246' }, issue_date: TODAY, special_data: null,
    fa3_data: { internalNumber: `FV/${id.slice(0, 2)}`, type: 'VAT', lines: [{ ordinal: 1 }], seller: { nip: '5260001246' } },
    ...extra,
  };
}

/** Zaliczka (ZAL): dane wysyłki w kopercie `fa3_data.advanceEnvelope` (od 02.10.2026). */
function zalRow(id: string, code: string, issueDate: string, extra: Row = {}): Row {
  return failedRow(id, code, {
    invoice_kind: 'advance',
    issue_date: issueDate,
    fa3_data: {
      internalNumber: `FZ/${id.slice(0, 2)}`, type: 'ZAL', issueDate, lines: [{ ordinal: 1 }], seller: { nip: '5260001246' },
      advanceEnvelope: { invoiceType: 'advance', issueDate },
    },
    ...extra,
  });
}

/** Korekta (KOR): dane wysyłki w `special_data.correctionData` (00137). */
function korRow(id: string, code: string, issueDate: string, extra: Row = {}): Row {
  return failedRow(id, code, {
    invoice_kind: 'correction',
    issue_date: issueDate,
    fa3_data: {
      internalNumber: `FK/${id.slice(0, 2)}`, type: 'KOR', issueDate, lines: [{ ordinal: 1 }], seller: { nip: '5260001246' },
    },
    special_data: { correctionData: { invoiceType: 'correction', issueDate } },
    ...extra,
  });
}

/** Wiersz audytu automatycznego ponowienia (aktor NULL) sprzed `hoursAgo` godzin. */
function autoRequeueAudit(invoiceId: string, hoursAgo: number): Row {
  return {
    action: 'invoice.send_requeued', user_id: null, entity_id: invoiceId,
    created_at: new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString(),
  };
}

type Tx = { executeSql: ReturnType<typeof vi.fn> };
const sqlCalls: Array<[string, unknown[]]> = [];

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  m.tables = { invoices: [], audit_logs: [] };
  m.violations = [];
  m.updates = [];
  m.selects = [];
  m.ins = [];
  m.afterQuery = undefined;
  sqlCalls.length = 0;
  m.env.mockImplementation(() => 'test');
  m.paused.mockResolvedValue(false);
  m.release.mockResolvedValue(true);
  m.send.mockImplementation(async (_event: unknown, options?: { inTransaction?: (tx: Tx) => Promise<void> }) => {
    const tx: Tx = { executeSql: vi.fn(async (sql: string, values: unknown[]) => { sqlCalls.push([sql, values]); return { rows: [], rowCount: 1 }; }) };
    await options?.inTransaction?.(tx);
    return { ids: ['job'] };
  });
});

describe('I1 — queued bez zlecenia', () => {
  it('bez dowodu kontaktu: release_ksef_enqueue (szkic); z dowodem: failed ENQUEUE_LOST', async () => {
    m.violations = [
      { invariant: 'I1', invoice_id: ID1, tenant_id: TENANT },
      { invariant: 'I1', invoice_id: ID2, tenant_id: TENANT },
      { invariant: 'I3', invoice_id: ID3, tenant_id: TENANT },
    ];
    m.tables.invoices = [{ id: ID2, tenant_id: TENANT, ksef_status: 'queued' }];
    m.release.mockImplementation(async (args: { p_invoice_id: string }) => args.p_invoice_id === ID1);

    const report = await runKsefLifecycleReconcile(ctx);

    expect(m.release).toHaveBeenCalledWith({ p_invoice_id: ID1, p_tenant_id: TENANT, p_reason: I1_RELEASE_REASON });
    expect(report).toMatchObject({ i1Released: 1, i1Lost: 1, errors: 0 });
    expect(m.tables.invoices[0]).toMatchObject({
      ksef_status: 'failed', last_error_code: 'ENQUEUE_LOST', last_error: ENQUEUE_LOST_MESSAGE, ksef_send_owner: null,
    });
    expect(m.captureMessage).toHaveBeenCalled();
  });
});

describe('I6 — automatyczne ponowienie klasy transient', () => {
  it('failed INFRA starszy niż godzina: requeue_ksef_send z aktorem NULL, zdarzenie z sendAttemptId', async () => {
    m.tables.invoices = [failedRow(ID1, 'INFRA')];

    const report = await runKsefLifecycleReconcile(ctx);

    expect(report).toMatchObject({ requeued: 1, exhausted: 0, errors: 0 });
    const event = m.send.mock.calls[0]![0] as { singletonKey: string; data: Record<string, unknown> };
    expect(event.singletonKey).toBe(ID1);
    expect(event.data).toMatchObject({ invoiceId: ID1, tenantId: TENANT, nip: '5260001246', environment: 'test' });
    expect(event.data.sendAttemptId).toMatch(UUID);
    const [sql, values] = sqlCalls[0]!;
    expect(sql).toMatch(/public\.requeue_ksef_send\(/);
    expect(values).toEqual([ID1, TENANT, event.data.sendAttemptId, null, false]);
  });

  it('świeżo zmieniony (< 1 h) nie jest ponawiany', async () => {
    m.tables.invoices = [failedRow(ID1, 'KSEF_UNAVAILABLE', { updated_at: new Date(NOW.getTime() - 10 * 60_000).toISOString() })];
    const report = await runKsefLifecycleReconcile(ctx);
    expect(report.requeued).toBe(0);
    expect(m.send).not.toHaveBeenCalled();
  });

  it('po 24 automatycznych ponowieniach w dobie: TRANSIENT_EXHAUSTED zamiast kolejnego', async () => {
    m.tables.invoices = [failedRow(ID1, 'KSEF_SESSION'), failedRow(ID2, 'INFRA')];
    for (let h = 1; h <= LIFECYCLE_REQUEUE_MAX; h++) m.tables.audit_logs.push(autoRequeueAudit(ID1, h));
    // Ponowienia ludzi (aktor ≠ NULL) i stare (> 25 h) nie liczą się.
    m.tables.audit_logs.push({ ...autoRequeueAudit(ID2, 2), user_id: 'operator' });
    m.tables.audit_logs.push(autoRequeueAudit(ID2, 30));

    const report = await runKsefLifecycleReconcile(ctx);

    expect(report).toMatchObject({ exhausted: 1, requeued: 1 });
    expect(m.tables.invoices[0]).toMatchObject({ last_error_code: 'TRANSIENT_EXHAUSTED', last_error: TRANSIENT_EXHAUSTED_MESSAGE, ksef_status: 'failed' });
    expect(m.send).toHaveBeenCalledTimes(1);
    expect((m.send.mock.calls[0]![0] as { singletonKey: string }).singletonKey).toBe(ID2);
    expect(m.captureMessage).toHaveBeenCalled();
  });

  it('dokument specjalny i kody spoza auto_requeue są pomijane', async () => {
    m.tables.invoices = [
      failedRow(ID1, 'INFRA', { invoice_kind: 'correction' }),
      failedRow(ID2, 'CREDENTIALS_UNAVAILABLE'),
      failedRow(ID3, 'XSD_INVALID'),
    ];
    const report = await runKsefLifecycleReconcile(ctx);
    expect(report).toMatchObject({ requeued: 0, skippedSpecial: 1 });
    expect(m.send).not.toHaveBeenCalled();
  });

  it('błąd jednego ponowienia nie zatrzymuje reszty', async () => {
    m.tables.invoices = [failedRow(ID1, 'INFRA'), failedRow(ID2, 'INFRA')];
    m.send.mockRejectedValueOnce(Object.assign(new Error('Błąd treści dokumentu'), { code: 'P0001' }));
    const report = await runKsefLifecycleReconcile(ctx);
    expect(report).toMatchObject({ requeued: 1, errors: 1 });
    expect(m.captureException).toHaveBeenCalledTimes(1);
  });
});

describe('I7 i hamulec', () => {
  it('po zdjęciu hamulca failed KSEF_PAUSED jest ponawiany', async () => {
    m.tables.invoices = [failedRow(ID1, 'KSEF_PAUSED', { updated_at: new Date(NOW.getTime() - 60_000).toISOString() })];
    const report = await runKsefLifecycleReconcile(ctx);
    expect(report).toMatchObject({ resumedAfterPause: 1, requeued: 0 });
    expect(sqlCalls[0]![1]).toEqual([ID1, TENANT, expect.stringMatching(UUID), null, false]);
  });

  it('hamulec włączony: I1 porządkowane, zero ponowień', async () => {
    m.paused.mockResolvedValue(true);
    m.violations = [{ invariant: 'I1', invoice_id: ID1, tenant_id: TENANT }];
    m.tables.invoices = [failedRow(ID2, 'INFRA'), failedRow(ID3, 'KSEF_PAUSED')];
    const report = await runKsefLifecycleReconcile(ctx);
    expect(report).toMatchObject({ paused: true, i1Released: 1, requeued: 0, resumedAfterPause: 0 });
    expect(m.send).not.toHaveBeenCalled();
  });

  it('hamulec nieczytelny (awaria bazy): zero ponowień — fail-closed', async () => {
    m.paused.mockRejectedValue(new Error('db'));
    m.tables.invoices = [failedRow(ID1, 'INFRA')];
    const report = await runKsefLifecycleReconcile(ctx);
    expect(report).toMatchObject({ paused: null, requeued: 0 });
    expect(m.send).not.toHaveBeenCalled();
  });
});

/** Wiersz audytu automatycznego „tylko uzgodnij” (aktor NULL, reconcile_only) sprzed `hoursAgo` godzin. */
function autoReconcileAudit(invoiceId: string, hoursAgo: number): Row {
  return { ...autoRequeueAudit(invoiceId, hoursAgo), details_json: { reconcile_only: true } };
}
const i5 = (invoiceId: string) => ({ invariant: 'I5', invoice_id: invoiceId, tenant_id: TENANT, detail: { session: 'S-1' } });

describe('I5 — zalegający wpis: automatyczne „tylko uzgodnij” (A3)', () => {
  it('failed RESULT_UNCERTAIN z wpisem sprzed 3 dni: jedno zlecenie reconcileOnly (RPC z p_reconcile_only = true, aktor NULL)', async () => {
    m.violations = [i5(ID1)];
    m.tables.invoices = [failedRow(ID1, 'RESULT_UNCERTAIN')];

    const report = await runKsefLifecycleReconcile(ctx);

    expect(report).toMatchObject({ i5Reconciled: 1, requeued: 0, errors: 0 });
    expect(m.send).toHaveBeenCalledTimes(1);
    const event = m.send.mock.calls[0]![0] as { singletonKey: string; data: Record<string, unknown> };
    expect(event.singletonKey).toBe(ID1);
    expect(event.data).toMatchObject({ invoiceId: ID1, reconcileOnly: true });
    expect(sqlCalls[0]![1]).toEqual([ID1, TENANT, event.data.sendAttemptId, null, true]);
  });

  it('rejected z otwartym wpisem też (RPC dopuszcza rejected w trybie uzgodnienia); kilka wierszy I5 tej samej faktury = jedno zlecenie', async () => {
    m.violations = [i5(ID1), i5(ID1)];
    m.tables.invoices = [failedRow(ID1, 'KSEF_REJECTED', { ksef_status: 'rejected' })];
    const report = await runKsefLifecycleReconcile(ctx);
    expect(report.i5Reconciled).toBe(1);
    expect(m.send).toHaveBeenCalledTimes(1);
  });

  it('najwyżej raz na dobę: próba sprzed 5 h — czekamy; ponowienia I6 (bez reconcile_only) się nie liczą', async () => {
    m.violations = [i5(ID1), i5(ID2)];
    m.tables.invoices = [failedRow(ID1, 'RESULT_UNCERTAIN'), failedRow(ID2, 'TRANSIENT_EXHAUSTED')];
    m.tables.audit_logs.push(autoReconcileAudit(ID1, 5));
    m.tables.audit_logs.push({ ...autoRequeueAudit(ID2, 2), details_json: { reconcile_only: false } });

    const report = await runKsefLifecycleReconcile(ctx);

    expect(report).toMatchObject({ i5Reconciled: 1, i5Deferred: 1 });
    expect((m.send.mock.calls[0]![0] as { singletonKey: string }).singletonKey).toBe(ID2);
  });

  it(`po ${3} próbach w tygodniu: bez kolejnej — operator (alarm)`, async () => {
    m.violations = [i5(ID1)];
    m.tables.invoices = [failedRow(ID1, 'RESULT_UNCERTAIN')];
    for (const h of [26, 50, 74].slice(0, LIFECYCLE_RECONCILE_MAX)) m.tables.audit_logs.push(autoReconcileAudit(ID1, h));

    const report = await runKsefLifecycleReconcile(ctx);

    expect(report).toMatchObject({ i5Reconciled: 0, i5NeedsOperator: 1 });
    expect(m.send).not.toHaveBeenCalled();
    expect(m.captureMessage).toHaveBeenCalled();
  });

  it('faktura poza failed/rejected (accepted z niezamkniętym wpisem, queued) — tylko alarm, bez zlecenia', async () => {
    m.violations = [i5(ID1), i5(ID2)];
    m.tables.invoices = [
      failedRow(ID1, 'RESULT_UNCERTAIN', { ksef_status: 'accepted', ksef_number: 'K-1' }),
      failedRow(ID2, 'RESULT_UNCERTAIN', { ksef_status: 'queued' }),
    ];
    const report = await runKsefLifecycleReconcile(ctx);
    expect(report).toMatchObject({ i5Reconciled: 0, i5Other: 2 });
    expect(m.send).not.toHaveBeenCalled();
  });

  it('dokument specjalny — pominięty (zdarzenia nie da się odtworzyć, A4)', async () => {
    m.violations = [i5(ID1)];
    m.tables.invoices = [failedRow(ID1, 'RESULT_UNCERTAIN', { invoice_kind: 'correction' })];
    const report = await runKsefLifecycleReconcile(ctx);
    expect(report).toMatchObject({ i5Reconciled: 0, skippedSpecial: 1 });
    expect(m.send).not.toHaveBeenCalled();
  });

  it('hamulec włączony: bez uzgadniania z crona', async () => {
    m.paused.mockResolvedValue(true);
    m.violations = [i5(ID1)];
    m.tables.invoices = [failedRow(ID1, 'RESULT_UNCERTAIN')];
    const report = await runKsefLifecycleReconcile(ctx);
    expect(report.i5Reconciled).toBe(0);
    expect(m.send).not.toHaveBeenCalled();
  });
});
