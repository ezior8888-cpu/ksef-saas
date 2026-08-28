import { describe, expect, it } from 'vitest';

import {
  captureUndo,
  evaluateUndo,
  readUndoRecord,
  undoableUntil,
  undoAction,
  UNDO_WINDOW_MS,
  type UndoRecord,
} from '@/lib/flo/undo';
import { runFloTick } from '@/lib/flo/tick';

import { createFakeDb } from './flo-fake-db';

/**
 * Cofnięcie czynności agenta i puls (krok 13 planu).
 *
 * Cofnięcie jest drugą połową zasady „FLO robi sam tylko rzeczy odwracalne”.
 * Bez działającego cofnięcia „odwracalne” jest deklaracją, a nie własnością.
 */

const NOW = new Date('2026-08-26T12:00:00.000Z');

function record(overrides: Partial<UndoRecord> = {}): UndoRecord {
  return {
    at: '2026-08-26T11:55:00.000Z',
    table: 'expenses',
    rowId: 'exp-1',
    before: { kpir_column: null, is_reviewed: false },
    after: { kpir_column: 'col_13', is_reviewed: true },
    ...overrides,
  };
}

describe('cofnięcie — reguła', () => {
  it('przepuszcza zmianę sprzed pięciu minut', () => {
    const verdict = evaluateUndo(
      record(),
      { kpir_column: 'col_13', is_reviewed: true },
      NOW,
    );
    expect(verdict.ok).toBe(true);
  });

  it('odmawia po dziesięciu minutach', () => {
    // Cofanie po tygodniu to już nie cofnięcie, tylko edycja historii —
    // a przy księgach edycja historii wymaga świadomej decyzji.
    const old = record({ at: '2026-08-26T11:45:00.000Z' });
    const verdict = evaluateUndo(
      old,
      { kpir_column: 'col_13', is_reviewed: true },
      NOW,
    );
    expect(verdict).toMatchObject({ ok: false, reason: 'expired' });
  });

  it('nie kasuje pracy człowieka', () => {
    // Ktoś poprawił kategorię ręcznie po tym, jak agent ją ustawił.
    // Cofnięcie przywróciłoby stan sprzed obu zmian, czyli skasowało
    // cudzą decyzję. Wycofujemy się.
    const verdict = evaluateUndo(
      record(),
      { kpir_column: 'col_10', is_reviewed: true },
      NOW,
    );
    expect(verdict).toMatchObject({ ok: false, reason: 'changed' });
  });

  it('odmawia, gdy dokument zniknął', () => {
    expect(evaluateUndo(record(), null, NOW)).toMatchObject({
      ok: false,
      reason: 'changed',
    });
  });

  it('odmawia, gdy czynności w ogóle nie da się cofnąć', () => {
    expect(evaluateUndo(null, {}, NOW)).toMatchObject({
      ok: false,
      reason: 'not_undoable',
    });
  });

  it('liczy okno cofnięcia od momentu zmiany', () => {
    const r = record();
    expect(Date.parse(undoableUntil(r)) - Date.parse(r.at)).toBe(UNDO_WINDOW_MS);
  });

  it('odrzuca uszkodzony zapis cofnięcia zamiast zgadywać', () => {
    expect(readUndoRecord({})).toBeNull();
    expect(readUndoRecord({ undo: { at: 'x' } })).toBeNull();
    expect(readUndoRecord({ undo: { ...record(), table: 'audit_logs' } })).toBeNull();
    expect(readUndoRecord({ undo: record() })).not.toBeNull();
  });

  it('zapisuje stan sprzed i po zmianie', () => {
    const captured = captureUndo(
      'expenses',
      'exp-9',
      { kpir_column: null },
      { kpir_column: 'col_13' },
      NOW,
    );
    expect(captured.at).toBe(NOW.toISOString());
    expect(captured.before).toEqual({ kpir_column: null });
  });
});

describe('cofnięcie — wykonanie', () => {
  function fakeRows(row: Record<string, unknown> | null) {
    const state = { row, updated: null as Record<string, unknown> | null };
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: state.row, error: null }),
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: async () => {
            state.updated = patch;
            if (state.row) Object.assign(state.row, patch);
            return { error: null };
          },
        }),
      }),
    };
    return { client, state };
  }

  const proposal = {
    id: 'prop-1',
    tenant_id: 'ten-1',
    kind: 'expense.review',
    topic_key: 'expense:exp-1',
    status: 'done',
    priority: 50,
    title: 'Orlen, 312,40 zł',
    body: 'Zaksięgowałem w kolumnie 13.',
    payload: { undo: record() },
    evidence: [],
    fingerprint: 'x',
    expires_at: '2026-09-01T00:00:00.000Z',
    created_at: '2026-08-26T11:55:00.000Z',
    approved_at: null,
    approved_by: null,
    executed_at: '2026-08-26T11:55:00.000Z',
    dismissed_reason: null,
  };

  it('przywraca poprzednie wartości', async () => {
    const db = createFakeDb({ flo_proposals: [{ ...proposal }] });
    const rows = fakeRows({ kpir_column: 'col_13', is_reviewed: true });

    const result = await undoAction('prop-1', 'usr-1', NOW, db.client, rows.client as never);

    expect(result.ok).toBe(true);
    expect(rows.state.updated).toEqual({ kpir_column: null, is_reviewed: false });
    expect(db.tables.flo_proposals[0]!.status).toBe('dismissed');
  });

  it('nie rusza dokumentu, gdy człowiek zmienił go w międzyczasie', async () => {
    const db = createFakeDb({ flo_proposals: [{ ...proposal }] });
    const rows = fakeRows({ kpir_column: 'col_10', is_reviewed: true });

    const result = await undoAction('prop-1', 'usr-1', NOW, db.client, rows.client as never);

    expect(result).toMatchObject({ ok: false, reason: 'changed' });
    expect(rows.state.updated).toBeNull();
  });
});

describe('puls agenta', () => {
  it('wygasza przeterminowane propozycje', async () => {
    const db = createFakeDb({
      flo_proposals: [
        { id: 'a', status: 'open', expires_at: '2026-08-25T00:00:00.000Z' },
        { id: 'b', status: 'open', expires_at: '2026-09-01T00:00:00.000Z' },
      ],
    });

    const result = await runFloTick(undefined, NOW, db.client);

    expect(result.expired).toBe(1);
    expect(db.tables.flo_proposals[0]!.status).toBe('expired');
    expect(db.tables.flo_proposals[0]!.dismissed_reason).toBe('auto_expired');
    // Druga propozycja nietknięta — puls nie sprząta na zapas.
    expect(db.tables.flo_proposals[1]!.status).toBe('open');
  });

  it('podnosi propozycje porzucone w połowie wykonania', async () => {
    // Worker zginął w trakcie (restart kontenera, brak pamięci). Bez tego
    // strażnika karta zostałaby w stanie „wykonuję” na zawsze, a klient
    // patrzyłby na to do końca świata.
    const db = createFakeDb({
      flo_proposals: [
        {
          id: 'stuck',
          tenant_id: 'ten-1',
          kind: 'payment.chase',
          status: 'executing',
          approved_at: '2026-08-26T11:30:00.000Z',
          expires_at: '2026-09-01T00:00:00.000Z',
        },
      ],
    });

    const result = await runFloTick(undefined, NOW, db.client);

    expect(result.released).toBe(1);
    // Wraca do „zatwierdzona”, nie do „otwarta”: człowiek już się zgodził,
    // więc odbieranie mu tej zgody byłoby cofaniem jego decyzji.
    expect(db.tables.flo_proposals[0]!.status).toBe('approved');
  });

  it('nie rusza wykonania, które trwa krótko', async () => {
    const db = createFakeDb({
      flo_proposals: [
        {
          id: 'busy',
          tenant_id: 'ten-1',
          kind: 'payment.chase',
          status: 'executing',
          approved_at: '2026-08-26T11:58:00.000Z',
          expires_at: '2026-09-01T00:00:00.000Z',
        },
      ],
    });

    const result = await runFloTick(undefined, NOW, db.client);

    expect(result.released).toBe(0);
    expect(db.tables.flo_proposals[0]!.status).toBe('executing');
  });
});
