import { describe, expect, it } from 'vitest';

import {
  countTodayTasks,
  groupByDay,
  sortByUrgency,
} from '@/components/flo/timeline';
import type { FloProposalView } from '@/types/flo';

/**
 * Układanie propozycji na osi zdarzeń (krok 2 toru B).
 *
 * Testujemy czystą logikę bez renderowania: kolejność, grupowanie po dniu
 * klienta i liczbę do odznaki „N zadań dziś”.
 */

function proposal(over: Partial<FloProposalView> = {}): FloProposalView {
  return {
    id: 'p1',
    kind: 'payment.chase',
    variant: 'preview',
    title: 'Tytuł',
    body: 'Treść',
    evidence: [],
    primary: { label: 'Wyślij', intent: 'approve' },
    secondary: [],
    expiresAt: '2026-08-30T12:00:00.000Z',
    priority: 10,
    createdAt: '2026-08-24T09:00:00.000Z',
    ...over,
  };
}

const now = new Date('2026-08-24T10:00:00.000Z');

describe('groupByDay — oś zdarzeń', () => {
  it('grupuje po dniu klienta, od najstarszego do najnowszego', () => {
    const groups = groupByDay(
      [
        proposal({ id: 'dzis', createdAt: '2026-08-24T06:34:00.000Z' }),
        proposal({ id: 'wczoraj', createdAt: '2026-08-23T12:31:00.000Z' }),
      ],
      now,
    );

    expect(groups.map((g) => g.label)).toEqual(['WCZORAJ', 'DZIŚ']);
    expect(groups[1]!.items.map((i) => i.id)).toEqual(['dzis']);
  });

  it('w obrębie dnia najnowsze jest na dole, tuż nad polem rozmowy', () => {
    const groups = groupByDay(
      [
        proposal({ id: 'pozniej', createdAt: '2026-08-24T09:48:00.000Z' }),
        proposal({ id: 'wczesniej', createdAt: '2026-08-24T06:34:00.000Z' }),
      ],
      now,
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]!.items.map((i) => i.id)).toEqual(['wczesniej', 'pozniej']);
  });

  it('nocne zdarzenie trafia do polskiego „dziś”, nie do wczoraj', () => {
    // 22:30 UTC 24.08 = 00:30 dnia 25.08 w Warszawie
    const groups = groupByDay(
      [proposal({ createdAt: '2026-08-24T22:30:00.000Z' })],
      new Date('2026-08-25T06:00:00.000Z'),
    );

    expect(groups.map((g) => g.label)).toEqual(['DZIŚ']);
  });

  it('karta ze złym znacznikiem czasu wypada z osi, ale jej nie wywraca', () => {
    const groups = groupByDay(
      [proposal({ id: 'zla', createdAt: 'nonsens' }), proposal({ id: 'dobra' })],
      now,
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]!.items.map((i) => i.id)).toEqual(['dobra']);
  });

  it('brak propozycji to pusta oś, nie awaria', () => {
    expect(groupByDay([], now)).toEqual([]);
  });
});

describe('sortByUrgency — kolejność do powiadomień', () => {
  it('niższy priorytet pierwszy, przy remisie nowsze', () => {
    const sorted = sortByUrgency([
      proposal({ id: 'c', priority: 50, createdAt: '2026-08-24T08:00:00.000Z' }),
      proposal({ id: 'a', priority: 0 }),
      proposal({ id: 'b', priority: 50, createdAt: '2026-08-24T09:00:00.000Z' }),
    ]);

    expect(sorted.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('nie rusza tablicy wejściowej', () => {
    const input = [proposal({ id: 'x', priority: 90 }), proposal({ id: 'y' })];
    sortByUrgency(input);
    expect(input.map((i) => i.id)).toEqual(['x', 'y']);
  });
});

describe('countTodayTasks — liczba do odznaki', () => {
  it('liczy tylko dzisiejsze sprawy wymagające decyzji', () => {
    const list = [
      proposal({ id: 'dzis-decyzja' }),
      proposal({ id: 'dzis-info', variant: 'info' }),
      proposal({ id: 'wczoraj', createdAt: '2026-08-23T09:00:00.000Z' }),
      proposal({ id: 'wygasla', expiresAt: '2026-08-24T09:59:00.000Z' }),
    ];

    expect(countTodayTasks(list, now)).toBe(1);
  });

  it('pusta lista daje zero, a nie wyjątek', () => {
    expect(countTodayTasks([], now)).toBe(0);
  });
});
