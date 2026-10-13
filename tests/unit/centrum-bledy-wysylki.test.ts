import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Centrum dowodzenia — błędy wysyłki (`/admin/centrum/bledy`, brief C-22
 * faza 3, plan A5): filtry z adresu, przerwane wykonania, odcisk wzorca,
 * incydenty ze stanem faktur, świeżość cronów i loader, który przy błędzie
 * odczytu zgłasza problem zamiast pustej, zielonej listy.
 */

const db = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  /** Błąd każdego zapytania o `ksef_send_attempts` (np. brak tabeli). */
  ledgerError: null as { code?: string; message: string } | null,
  /** Wiersze listy i licznik pasujących (PostgREST przycina listę do `max_rows`). */
  listRows: [] as Array<Record<string, unknown>>,
  listCount: 0 as number | null,
  /** Odpowiedź `head` bez licznika (PostgREST 404 bez treści: brak tabeli albo nieprzeładowany schemat). */
  headWithoutCount: false,
  calls: [] as Array<{ table: string; method: string; args: unknown[] }>,
}));

vi.mock('@/lib/auth/admin-guard', () => ({ requireAdmin: db.requireAdmin }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const result = () =>
        table === 'ksef_send_attempts' && db.headWithoutCount
          ? { data: null, count: null, error: null, status: 404 }
          : table === 'ksef_send_attempts' && db.ledgerError
            ? { data: null, count: null, error: db.ledgerError, status: 404 }
            : table === 'ksef_send_attempts'
              ? { data: db.listRows, count: db.listCount, error: null, status: 200 }
              : { data: [], count: 0, error: null, status: 200 };
      const q: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'gte', 'lt', 'is', 'in', 'or', 'order', 'limit']) {
        q[method] = (...args: unknown[]) => { db.calls.push({ table, method, args }); return q; };
      }
      q.maybeSingle = async () => ({ ...result(), data: null });
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve);
      return q;
    },
  }),
}));

import { loadSendErrorsView } from '@/lib/admin/centrum/attempts';
import {
  attemptMessage,
  cronFreshness,
  effectiveStatus,
  fingerprint,
  groupIncidents,
  INTERRUPTED_AFTER_MS,
  messageTemplate,
  parseSendErrorFilters,
  recoveryState,
  type AttemptRow,
  type CronRun,
} from '@/lib/admin/centrum/send-errors';

const NOW = new Date('2026-10-13T12:00:00.000Z');
const T = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

let seq = 0;
function row(patch: Partial<AttemptRow> = {}): AttemptRow {
  seq += 1;
  return {
    id: `row-${seq}`,
    tenantId: T,
    tenantName: 'Firma',
    invoiceId: `inv-${seq}`,
    internalNumber: `FV/${seq}`,
    invoiceStatus: 'failed',
    invoiceSubmittedAt: null,
    sendAttemptId: null,
    jobId: null,
    execution: 0,
    environment: 'test',
    workerSha: null,
    status: 'failed',
    stage: 'ksef',
    result: null,
    errorCode: 'KSEF_UNAVAILABLE',
    errorClass: 'transient',
    errorMessage: 'RetryAfterError: KSeF HTTP 503: Service Unavailable',
    httpStatus: 503,
    ksefCode: null,
    retryable: true,
    startedAt: '2026-10-13T11:00:00.000Z',
    finishedAt: '2026-10-13T11:00:05.000Z',
    ...patch,
  };
}

describe('filtry z adresu', () => {
  it('domyślnie 7 dni i wszystkie błędy', () => {
    expect(parseSendErrorFilters({})).toEqual({ period: '7d', status: 'errors', code: null, errorClass: null, stage: null });
  });

  it('nieznane wartości wracają do domyślnych — nic spoza listy nie trafia do zapytania', () => {
    expect(parseSendErrorFilters({
      period: '1y', status: 'drop', code: 'x),or(1.eq.1', class: 'cokolwiek', stage: 'XML;--',
    })).toEqual({ period: '7d', status: 'errors', code: null, errorClass: null, stage: null });
  });

  it('klucze prototypu (toString, __proto__, constructor) nie przechodzą jako okres, klasa ani etap', () => {
    expect(parseSendErrorFilters({ period: 'toString', class: '__proto__', stage: 'constructor' }))
      .toEqual({ period: '7d', status: 'errors', code: null, errorClass: null, stage: null });
    expect(parseSendErrorFilters({ period: '__proto__', class: 'hasOwnProperty' }).period).toBe('7d');
  });

  it('poprawne wartości przechodzą (pierwsza z powtórzonych)', () => {
    expect(parseSendErrorFilters({ period: '24h', status: 'refused', code: ['NO_CERTIFICATE', 'INFRA'], class: 'setup', stage: 'enqueue' }))
      .toEqual({ period: '24h', status: 'refused', code: 'NO_CERTIFICATE', errorClass: 'setup', stage: 'enqueue' });
  });
});

describe('status efektywny', () => {
  it('started bez wyniku dłużej niż próg to przerwane (worker padł w trakcie)', () => {
    const old = new Date(NOW.getTime() - INTERRUPTED_AFTER_MS - 1000).toISOString();
    expect(effectiveStatus({ status: 'started', startedAt: old, finishedAt: null }, NOW)).toBe('interrupted');
    expect(effectiveStatus({ status: 'started', startedAt: NOW.toISOString(), finishedAt: null }, NOW)).toBe('started');
    expect(effectiveStatus({ status: 'failed', startedAt: old, finishedAt: old }, NOW)).toBe('failed');
  });
});

describe('komunikat wiersza', () => {
  it('przerwane wykonanie bez zapisanego błędu dostaje opis z etapem; zwykły błąd — swój komunikat', () => {
    const old = new Date(NOW.getTime() - INTERRUPTED_AFTER_MS - 1000).toISOString();
    expect(attemptMessage({ status: 'started', stage: 'ksef', startedAt: old, finishedAt: null, errorMessage: null }, NOW))
      .toContain('„odpowiedź KSeF”');
    expect(attemptMessage({ status: 'failed', stage: 'xml', startedAt: old, finishedAt: old, errorMessage: 'XSD' }, NOW)).toBe('XSD');
    expect(attemptMessage({ status: 'succeeded', stage: 'finalize', startedAt: old, finishedAt: old, errorMessage: null }, NOW)).toBeNull();
  });
});

describe('odcisk wzorca', () => {
  it('komunikaty różniące się numerem faktury, sesji i UUID mają ten sam szablon', () => {
    const a = 'KSeF ma już fakturę o tym numerze — numer KSeF [NIP]-20261001-ABCDEF012345-01 (sesja 20261013-SE-0123456789-ABCDEF0123-45), próba 3f2a9c4e-1b2d-4c3e-8f9a-0123456789ab';
    const b = 'KSeF ma już fakturę o tym numerze — numer KSeF [NIP]-20261002-ABCDEF054321-02 (sesja 20261012-SE-9876543210-FEDCBA9876-01), próba 00000000-1111-4222-8333-444444444444';
    expect(messageTemplate(a)).toBe(messageTemplate(b));
  });

  it('numery KSeF różnych faktur (z NIP-em albo zamaskowane) dają jeden szablon — duplikaty 440 w jednym incydencie', () => {
    const a = 'KSeF ma już fakturę o tym numerze — numer KSeF [NIP]-20250826-0100001AF629-AF';
    const b = 'KSeF ma już fakturę o tym numerze — numer KSeF 1234567890-20250827-B1C2D3E4F5A6-7F';
    expect(messageTemplate(a)).toBe(messageTemplate(b));
    expect(fingerprint(row({ errorMessage: a }), NOW)).toBe(fingerprint(row({ errorMessage: b }), NOW));
  });

  it('inny kod albo etap — inny odcisk', () => {
    expect(fingerprint(row(), NOW)).not.toBe(fingerprint(row({ errorCode: 'KSEF_RATE_LIMIT' }), NOW));
    expect(fingerprint(row(), NOW)).not.toBe(fingerprint(row({ stage: 'claim' }), NOW));
    expect(fingerprint(row({ invoiceId: 'a' }), NOW)).toBe(fingerprint(row({ invoiceId: 'b' }), NOW));
  });
});

describe('incydenty', () => {
  it('każda próba liczona, faktury raz, stan teraz z faktur; najliczniejsze na górze', () => {
    const rows = [
      row({ invoiceId: 'A', invoiceStatus: 'accepted', startedAt: '2026-10-13T10:00:00.000Z' }),
      row({ invoiceId: 'A', invoiceStatus: 'accepted', startedAt: '2026-10-13T10:05:00.000Z' }),
      row({ invoiceId: 'B', invoiceStatus: 'failed', startedAt: '2026-10-13T11:30:00.000Z' }),
      row({ invoiceId: 'C', errorCode: 'NO_CERTIFICATE', errorClass: 'setup', stage: 'credentials', httpStatus: null, errorMessage: 'brak certyfikatu' }),
    ];
    const [top, other] = groupIncidents(rows, NOW);
    expect(top).toMatchObject({
      errorCode: 'KSEF_UNAVAILABLE', count: 3, invoices: 2, tenants: 1,
      firstAt: '2026-10-13T10:00:00.000Z', lastAt: '2026-10-13T11:30:00.000Z', sampleInvoiceId: 'B',
    });
    expect(top!.recovery).toMatchObject({ accepted: 1, open: 1 });
    expect(other).toMatchObject({ errorCode: 'NO_CERTIFICATE', count: 1, invoices: 1 });
  });
});

describe('stan faktury teraz', () => {
  it('sending bez znacznika albo starsze niż 30 min to „utknęła” (I2) — nie „w toku”', () => {
    expect(recoveryState('sending', null, NOW)).toBe('stuck');
    expect(recoveryState('sending', '2026-10-13T11:00:00.000Z', NOW)).toBe('stuck');
    expect(recoveryState('sending', '2026-10-13T11:50:00.000Z', NOW)).toBe('in_progress');
    expect(recoveryState('queued', null, NOW)).toBe('in_progress');
    const [incident] = groupIncidents([row({ invoiceStatus: 'sending', invoiceSubmittedAt: '2026-10-13T10:00:00.000Z' })], NOW);
    expect(incident!.recovery.stuck).toBe(1);
  });
});

describe('świeżość cronów', () => {
  it('brak przebiegu albo przebieg po terminie = nieświeży', () => {
    const runs = new Map<string, CronRun | null>([
      ['cron.ops-heartbeat', { at: '2026-10-13T11:59:30.000Z', status: 'succeeded' }],
      ['cron.critical-alerts-monitor', { at: '2026-10-13T11:30:00.000Z', status: 'succeeded' }],
    ]);
    const byQueue = Object.fromEntries(cronFreshness(runs, NOW).map((c) => [c.queue, c.stale]));
    expect(byQueue).toEqual({
      'cron.ops-heartbeat': false,
      'cron.critical-alerts-monitor': true,
      'cron.ksef-lifecycle-reconcile': true,
    });
  });

  it('świeży przebieg zakończony błędem to „failing” — cron żyje, ale nie robi swojej pracy', () => {
    const runs = new Map<string, CronRun | null>([
      ['cron.critical-alerts-monitor', { at: '2026-10-13T11:58:00.000Z', status: 'failed' }],
    ]);
    const monitor = cronFreshness(runs, NOW).find((c) => c.queue === 'cron.critical-alerts-monitor')!;
    expect(monitor).toMatchObject({ stale: false, failing: true });
  });
});

describe('loader', () => {
  beforeEach(() => {
    db.requireAdmin.mockReset();
    db.ledgerError = null;
    db.calls = [];
    db.listRows = [];
    db.listCount = 0;
    db.headWithoutCount = false;
  });

  it('najpierw requireAdmin, potem dane; odmowa operatora nie czyta bazy', async () => {
    db.requireAdmin.mockRejectedValue(new Error('NEXT_REDIRECT'));
    await expect(loadSendErrorsView(parseSendErrorFilters({}), NOW)).rejects.toThrow('NEXT_REDIRECT');
    expect(db.calls).toEqual([]);
  });

  it('brak tabeli (migracja niewgrana): jawny problem i liczniki „nie wiadomo”, nie zero', async () => {
    db.ledgerError = { code: 'PGRST205', message: "Could not find the table 'public.ksef_send_attempts'" };
    const view = await loadSendErrorsView(parseSendErrorFilters({}), NOW);
    // Kilka zapytań o brakującą tabelę — jeden komunikat.
    expect(view.problems.filter((p) => p.includes('00150'))).toHaveLength(1);
    expect(view.counts).toEqual({ succeeded: null, failed: null, refused: null, waiting: null, interrupted: null });
    expect(view.rows).toEqual([]);
  });

  it('licznik bez wartości (PostgREST 404 bez treści przy head) to „nie wiadomo”, nie zero', async () => {
    db.headWithoutCount = true;
    const view = await loadSendErrorsView(parseSendErrorFilters({}), NOW);
    expect(view.counts).toEqual({ succeeded: null, failed: null, refused: null, waiting: null, interrupted: null });
    expect(view.problems.filter((p) => p.includes('00150'))).toHaveLength(1);
  });

  it('błąd odczytu początku dziennika to undefined („nie wiadomo”), pusty dziennik to null', async () => {
    db.ledgerError = { code: 'PGRST205', message: 'brak' };
    expect((await loadSendErrorsView(parseSendErrorFilters({}), NOW)).ledgerSince).toBeUndefined();
    db.ledgerError = null;
    expect((await loadSendErrorsView(parseSendErrorFilters({}), NOW)).ledgerSince).toBeNull();
  });

  it('UPO: failed oraz pending bez wyniku ponad godzinę', async () => {
    await loadSendErrorsView(parseSendErrorFilters({}), NOW);
    const upoOr = db.calls.find((c) => c.table === 'upo_receipts' && c.method === 'or');
    expect(String(upoOr?.args[0])).toBe('status.eq.failed,and(status.eq.pending,created_at.lt."2026-10-13T11:00:00.000Z")');
  });

  it('obcięcie wykryte po liczniku, nie po długości listy (PostgREST przycina do max_rows)', async () => {
    db.listRows = Array.from({ length: 3 }, (_, k) => ({
      id: `r${k}`, tenant_id: T, invoice_id: `i${k}`, status: 'failed', stage: 'ksef', started_at: '2026-10-13T10:00:00.000Z', finished_at: '2026-10-13T10:00:01.000Z',
    }));
    db.listCount = 1500;
    const view = await loadSendErrorsView(parseSendErrorFilters({}), NOW);
    expect(view.truncated).toBe(true);
    expect(view.matching).toBe(1500);

    db.listCount = 3;
    expect((await loadSendErrorsView(parseSendErrorFilters({}), NOW)).truncated).toBe(false);
  });

  it('„wszystkie błędy” obejmują porażki, odmowy i przerwane wykonania z oknem okresu', async () => {
    await loadSendErrorsView(parseSendErrorFilters({ period: '24h' }), NOW);
    const listOr = db.calls.find((c) => c.table === 'ksef_send_attempts' && c.method === 'or');
    expect(String(listOr?.args[0])).toMatch(/^status\.in\.\(failed,refused\),and\(status\.eq\.started,finished_at\.is\.null,started_at\.lt\."2026-10-13T11:40:00\.000Z"\)$/);
    expect(db.calls).toContainEqual({ table: 'ksef_send_attempts', method: 'gte', args: ['started_at', '2026-10-12T12:00:00.000Z'] });
  });
});
