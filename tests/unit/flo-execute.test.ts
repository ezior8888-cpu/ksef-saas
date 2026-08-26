import { beforeEach, describe, expect, it } from 'vitest';

import { executeProposal } from '@/lib/flo/execute';
import { fingerprintOf } from '@/lib/flo/fingerprint';
import { registerFloHandler, resetFloHandlers } from '@/lib/flo/handlers';

import { createFakeDb } from './flo-fake-db';

/**
 * Wykonawca propozycji (krok 11 planu agenta FLO).
 *
 * Najważniejszy test w tym pliku to ten o pięćdziesięciu równoległych
 * kliknięciach. Chodzi w nim o jedyną awarię z całego katalogu, której nie
 * da się cofnąć: dwie wysyłki tej samej faktury do rejestru państwowego.
 */

const NOW = new Date('2026-08-26T12:00:00.000Z');
const PAYLOAD = { topic: 'rok-2026' };
const FINGERPRINT = fingerprintOf({ topic: 'rok-2026' });

function proposal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prop-1',
    tenant_id: 'ten-1',
    kind: 'wrapped.ready',
    topic_key: 'wrapped:2026',
    status: 'approved',
    priority: 50,
    title: 'Podsumowanie roku gotowe',
    body: 'Siedem ekranów do przewinięcia.',
    payload: PAYLOAD,
    evidence: [],
    fingerprint: FINGERPRINT,
    expires_at: '2026-09-01T00:00:00.000Z',
    created_at: '2026-08-26T09:00:00.000Z',
    approved_at: null,
    approved_by: null,
    executed_at: null,
    dismissed_reason: null,
    ...overrides,
  };
}

function approval(overrides: Record<string, unknown> = {}) {
  return {
    id: 'apr-1',
    proposal_id: 'prop-1',
    tenant_id: 'ten-1',
    user_id: 'usr-1',
    snapshot: { title: 'Podsumowanie roku gotowe' },
    created_at: '2026-08-26T11:59:00.000Z',
    consumed_at: null,
    expires_at: '2026-08-26T12:20:00.000Z',
    ...overrides,
  };
}

const ARGS = { proposalId: 'prop-1', userId: 'usr-1', approvalId: 'apr-1' };

beforeEach(() => {
  resetFloHandlers();
});

describe('wykonawca — droga szczęśliwa', () => {
  it('wykonuje, zamyka propozycję i zużywa żeton', async () => {
    let calls = 0;
    registerFloHandler('wrapped.ready', async () => {
      calls++;
      return { summary: 'podsumowanie wygenerowane' };
    });

    const db = createFakeDb({
      flo_proposals: [proposal()],
      flo_approvals: [approval()],
    });

    const result = await executeProposal(ARGS, NOW, db.client);

    expect(result).toEqual({ ok: true });
    expect(calls).toBe(1);
    expect(db.tables.flo_proposals[0]!.status).toBe('done');
    expect(db.tables.flo_proposals[0]!.executed_at).toBe(NOW.toISOString());
    expect(db.tables.flo_approvals[0]!.consumed_at).toBe(NOW.toISOString());
  });

  it('zapisuje decyzję, żeby agent wiedział, że to się przydaje', async () => {
    registerFloHandler('wrapped.ready', async () => ({ summary: 'ok' }));
    const db = createFakeDb({
      flo_proposals: [proposal()],
      flo_approvals: [approval()],
    });

    await executeProposal(ARGS, NOW, db.client);

    expect(db.tables.flo_decisions[0]).toMatchObject({
      tenant_id: 'ten-1',
      kind: 'wrapped.ready',
      accepted: 1,
      dismissed: 0,
    });
  });
});

describe('wykonawca — pięćdziesiąt równoległych kliknięć', () => {
  it('wykonuje DOKŁADNIE RAZ', async () => {
    let calls = 0;
    registerFloHandler('wrapped.ready', async () => {
      calls++;
      // Wykonanie trwa — w tym oknie reszta wywołań próbuje wejść.
      await new Promise((r) => setTimeout(r, 1));
      return { summary: 'ok' };
    });

    const db = createFakeDb({
      flo_proposals: [proposal()],
      flo_approvals: [approval()],
    });

    const results = await Promise.all(
      Array.from({ length: 50 }, () => executeProposal(ARGS, NOW, db.client)),
    );

    // Jedno wykonanie. Nie „mniej więcej jedno” — dokładnie jedno.
    expect(calls).toBe(1);
    // Żaden z pozostałych czterdziestu dziewięciu nie dostaje błędu:
    // ich kliknięcie doprowadziło do działania, więc straszenie ich
    // komunikatem byłoby kłamstwem.
    expect(results.every((r) => r.ok)).toBe(true);
    expect(db.tables.flo_proposals[0]!.status).toBe('done');
    // Żeton zużyty raz.
    expect(db.tables.flo_approvals[0]!.consumed_at).toBe(NOW.toISOString());
  });
});

describe('wykonawca — odmowy', () => {
  it('nie wykonuje na nieaktualnych danych i mówi, co się zmieniło', async () => {
    let calls = 0;
    registerFloHandler('wrapped.ready', async () => {
      calls++;
      return { summary: 'ok' };
    });

    const db = createFakeDb({
      // Odcisk nie zgadza się z aktualnym stanem — świat się zmienił.
      flo_proposals: [proposal({ fingerprint: 'odcisk-z-innego-swiata' })],
      flo_approvals: [approval()],
    });

    const result = await executeProposal(ARGS, NOW, db.client);

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ reason: 'stale' });
    expect(calls).toBe(0);
    // Żeton NIE został zużyty — człowiek zatwierdzi jeszcze raz, świadomie.
    expect(db.tables.flo_approvals[0]!.consumed_at).toBeNull();
    expect(db.tables.flo_proposals[0]!.dismissed_reason).toBe('stale');
  });

  it('odmawia bez ważnego żetonu zgody', async () => {
    let calls = 0;
    registerFloHandler('wrapped.ready', async () => {
      calls++;
      return { summary: 'ok' };
    });

    const db = createFakeDb({
      flo_proposals: [proposal()],
      flo_approvals: [approval({ consumed_at: '2026-08-26T11:00:00.000Z' })],
    });

    const result = await executeProposal(ARGS, NOW, db.client);

    expect(result).toMatchObject({ ok: false, reason: 'blocked' });
    expect(calls).toBe(0);
    // Propozycja wraca do stanu sprzed próby — nie zostaje zablokowana.
    expect(db.tables.flo_proposals[0]!.status).toBe('approved');
  });

  it('odmawia, gdy żeton dotyczy innej sprawy', async () => {
    registerFloHandler('wrapped.ready', async () => ({ summary: 'ok' }));
    const db = createFakeDb({
      flo_proposals: [proposal()],
      flo_approvals: [approval({ proposal_id: 'prop-INNA' })],
    });

    const result = await executeProposal(ARGS, NOW, db.client);
    expect(result).toMatchObject({ ok: false, reason: 'blocked' });
  });

  it('nie wykonuje propozycji po terminie', async () => {
    let calls = 0;
    registerFloHandler('wrapped.ready', async () => {
      calls++;
      return { summary: 'ok' };
    });

    const db = createFakeDb({
      flo_proposals: [proposal({ expires_at: '2026-08-26T11:00:00.000Z' })],
      flo_approvals: [approval()],
    });

    const result = await executeProposal(ARGS, NOW, db.client);

    expect(result).toMatchObject({ ok: false, reason: 'expired' });
    expect(calls).toBe(0);
    expect(db.tables.flo_proposals[0]!.status).toBe('expired');
  });

  it('mówi wprost, gdy nie umie czegoś wykonać', async () => {
    // Rejestr pusty — rodzaj bez wykonawcy.
    const db = createFakeDb({
      flo_proposals: [proposal()],
      flo_approvals: [approval()],
    });

    const result = await executeProposal(ARGS, NOW, db.client);

    expect(result).toMatchObject({ ok: false, reason: 'blocked' });
    expect(db.tables.flo_proposals[0]!.status).toBe('approved');
  });

  it('powtórka po wykonaniu nie jest błędem', async () => {
    let calls = 0;
    registerFloHandler('wrapped.ready', async () => {
      calls++;
      return { summary: 'ok' };
    });

    const db = createFakeDb({
      flo_proposals: [proposal({ status: 'done' })],
      flo_approvals: [approval()],
    });

    const result = await executeProposal(ARGS, NOW, db.client);

    expect(result).toEqual({ ok: true });
    expect(calls).toBe(0);
  });
});

describe('wykonawca — awaria w trakcie', () => {
  it('nie odtwarza zużytego żetonu po nieudanym wykonaniu', async () => {
    registerFloHandler('wrapped.ready', async () => {
      throw new Error('Resend zwrócił 503');
    });

    const db = createFakeDb({
      flo_proposals: [proposal()],
      flo_approvals: [approval()],
    });

    const result = await executeProposal(ARGS, NOW, db.client);

    expect(result).toMatchObject({ ok: false, reason: 'blocked' });
    // Żeton pozostaje zużyty: gdyby funkcja wychodząca zdążyła zadziałać,
    // druga próba wysłałaby to samo dwa razy. Człowiek zatwierdza od nowa.
    expect(db.tables.flo_approvals[0]!.consumed_at).toBe(NOW.toISOString());
    expect(db.tables.flo_proposals[0]!.status).toBe('approved');
  });

  it('nie pokazuje klientowi treści błędu technicznego', async () => {
    registerFloHandler('wrapped.ready', async () => {
      throw new Error('ECONNREFUSED 10.0.0.5:5432 pod=worker-7');
    });

    const db = createFakeDb({
      flo_proposals: [proposal()],
      flo_approvals: [approval()],
    });

    const result = await executeProposal(ARGS, NOW, db.client);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).not.toContain('ECONNREFUSED');
      expect(result.message).not.toContain('10.0.0.5');
    }
  });
});
