import { describe, expect, it } from 'vitest';

import {
  isMutedAt,
  MUTE_AFTER_DISMISSALS,
  MUTE_DAYS,
  nextDecisionState,
  recordDecision,
  muteKind,
  unmuteKind,
  isMuted,
  type DecisionState,
} from '@/lib/flo/decisions';

import { createFakeDb } from './flo-fake-db';

/**
 * Pamięć decyzji i wyciszanie (krok 12 planu agenta FLO).
 *
 * Reguła jest prosta i dlatego łatwo ją zepsuć w niewłaściwą stronę:
 * agent, który milknie za szybko, przestaje być użyteczny; agent, który
 * nie milknie wcale, uczy ludzi ignorowania powiadomień.
 */

const NOW = new Date('2026-08-26T12:00:00.000Z');

function state(overrides: Partial<DecisionState> = {}): DecisionState {
  return { accepted: 0, dismissed: 0, mutedUntil: null, ...overrides };
}

describe('reguła wyciszania', () => {
  it('pierwsze odrzucenie jeszcze nie ucisza', () => {
    const next = nextDecisionState(null, 'dismissed', NOW);
    expect(next.dismissed).toBe(1);
    expect(next.mutedUntil).toBeNull();
    expect(isMutedAt(next, NOW)).toBe(false);
  });

  it('drugie odrzucenie z rzędu ucisza na kwartał', () => {
    const next = nextDecisionState(state({ dismissed: 1 }), 'dismissed', NOW);
    expect(next.dismissed).toBe(MUTE_AFTER_DISMISSALS);
    expect(isMutedAt(next, NOW)).toBe(true);

    const days = (Date.parse(next.mutedUntil!) - NOW.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(MUTE_DAYS);
  });

  it('przyjęcie zeruje serię odrzuceń', () => {
    // „Dwa odrzucenia Z RZĘDU”, nie „dwa w całym życiu konta”. Ktoś, kto raz
    // odrzucił, potem skorzystał, a po pół roku odrzucił znowu, nie prosił
    // o ciszę.
    const afterOneNo = nextDecisionState(null, 'dismissed', NOW);
    const afterYes = nextDecisionState(afterOneNo, 'accepted', NOW);
    expect(afterYes.dismissed).toBe(0);
    expect(afterYes.accepted).toBe(1);

    const afterSecondNo = nextDecisionState(afterYes, 'dismissed', NOW);
    expect(isMutedAt(afterSecondNo, NOW)).toBe(false);
  });

  it('przyjęcie zdejmuje wyciszenie', () => {
    // Klient skorzystał z propozycji, którą wcześniej wyciszył — cisza
    // przestała mieć sens.
    const muted = nextDecisionState(state({ dismissed: 1 }), 'dismissed', NOW);
    expect(isMutedAt(muted, NOW)).toBe(true);

    const revived = nextDecisionState(muted, 'accepted', NOW);
    expect(revived.mutedUntil).toBeNull();
    expect(isMutedAt(revived, NOW)).toBe(false);
  });

  it('wyciszenie wygasa samo', () => {
    const muted = nextDecisionState(state({ dismissed: 1 }), 'dismissed', NOW);
    const afterQuarter = new Date(NOW.getTime() + (MUTE_DAYS + 1) * 86_400_000);
    expect(isMutedAt(muted, afterQuarter)).toBe(false);
  });

  it('brak wpisu to brak wyciszenia', () => {
    expect(isMutedAt(null, NOW)).toBe(false);
  });
});

describe('zapis decyzji', () => {
  it('zapamiętuje przyjęcie i odrzucenie', async () => {
    const db = createFakeDb();

    await recordDecision('ten-1', 'payment.chase', 'dismissed', NOW, db.client);
    expect(await isMuted('ten-1', 'payment.chase', NOW, db.client)).toBe(false);

    await recordDecision('ten-1', 'payment.chase', 'dismissed', NOW, db.client);
    expect(await isMuted('ten-1', 'payment.chase', NOW, db.client)).toBe(true);
  });

  it('wyciszenie nie przenosi się na inne rodzaje spraw', async () => {
    // Ktoś, kto nie chce słyszeć o ponagleniach, nadal chce wiedzieć
    // o odrzuceniu faktury przez KSeF.
    const db = createFakeDb();
    await recordDecision('ten-1', 'payment.chase', 'dismissed', NOW, db.client);
    await recordDecision('ten-1', 'payment.chase', 'dismissed', NOW, db.client);

    expect(await isMuted('ten-1', 'payment.chase', NOW, db.client)).toBe(true);
    expect(await isMuted('ten-1', 'ksef.fix', NOW, db.client)).toBe(false);
  });

  it('wyciszenie nie przenosi się na inne organizacje', async () => {
    const db = createFakeDb();
    await recordDecision('ten-1', 'payment.chase', 'dismissed', NOW, db.client);
    await recordDecision('ten-1', 'payment.chase', 'dismissed', NOW, db.client);

    expect(await isMuted('ten-2', 'payment.chase', NOW, db.client)).toBe(false);
  });

  it('„nigdy więcej takich” ucisza natychmiast', async () => {
    // To nie jest drugie odrzucenie z rzędu, tylko jasna prośba. Czekanie
    // z ciszą do następnego razu byłoby ignorowaniem tego, co człowiek
    // właśnie powiedział.
    const db = createFakeDb();
    await muteKind('ten-1', 'feature.hint', NOW, db.client);
    expect(await isMuted('ten-1', 'feature.hint', NOW, db.client)).toBe(true);
  });

  it('cisza jest odwracalna z ustawień', async () => {
    const db = createFakeDb();
    await muteKind('ten-1', 'feature.hint', NOW, db.client);
    await unmuteKind('ten-1', 'feature.hint', NOW, db.client);
    expect(await isMuted('ten-1', 'feature.hint', NOW, db.client)).toBe(false);
  });
});
