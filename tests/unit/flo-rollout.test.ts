import { describe, expect, it } from 'vitest';

import { resolveSwitch, isKindEnabledForTenant } from '@/lib/flo/kind-switch';
import {
  bucketOf,
  canAdvance,
  isInCanary,
  nextStage,
  readRollout,
  recordComplaint,
  ROLLOUT_ORDER,
  ROLLOUT_STAGES,
  setStage,
  STAGE_MIN_DAYS,
  type RolloutState,
} from '@/lib/flo/rollout';
import { KIND_RADIUS } from '@/lib/flo/shadow';
import { createFakeDb } from './flo-fake-db';

/**
 * Wdrożenie kanarkowe (krok 55).
 *
 * Reguła, która decyduje o sensie mechanizmu: JEDNA REKLAMACJA ZATRZYMUJE
 * ROZWIJANIE.
 */

const NOW = new Date('2026-09-16T09:00:00.000Z');

function state(overrides: Partial<RolloutState> = {}): RolloutState {
  return {
    kind: 'payment.chase',
    stage: 10,
    stageSince: '2026-09-01T00:00:00.000Z',
    complaints: 0,
    halted: false,
    haltReason: null,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// Przydział kont
// ═══════════════════════════════════════════════════════════════

describe('przydział konta do kanarka', () => {
  it('STABILNY — to samo konto zawsze w tym samym kubełku', () => {
    // Konto, które wpada i wypada z kanarka, dostaje funkcję znikającą
    // bez powodu — a to jest gorsze niż jej brak.
    const first = bucketOf('payment.chase', 'tenant-abc');
    for (let i = 0; i < 50; i++) {
      expect(bucketOf('payment.chase', 'tenant-abc')).toBe(first);
    }
  });

  it('RÓŻNY PODZIAŁ dla każdej funkcji', () => {
    // Bez tego garstka klientów dostawałaby wszystkie surowe funkcje
    // produktu, jedna po drugiej.
    const buckets = ROLLOUT_ORDER.map((entry) => bucketOf(entry.kind, 'tenant-abc'));
    expect(new Set(buckets).size).toBeGreaterThan(5);
  });

  it('dzieli konta w miarę równo', () => {
    const counts = new Array(10).fill(0);
    for (let i = 0; i < 2_000; i++) {
      counts[Math.floor(bucketOf('payment.chase', `tenant-${i}`) / 10)]++;
    }
    // Przy 2000 kont i dziesięciu przedziałach oczekujemy ~200 w każdym.
    for (const count of counts) {
      expect(count).toBeGreaterThan(120);
      expect(count).toBeLessThan(300);
    }
  });

  it('kubełek zawsze w zakresie 0–99', () => {
    for (let i = 0; i < 500; i++) {
      const bucket = bucketOf('invoice.batch', `t-${i}`);
      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThan(100);
    }
  });

  it('etap 0 nie wpuszcza nikogo, etap 100 wpuszcza wszystkich', () => {
    expect(isInCanary(state({ stage: 0 }), 'tenant-abc')).toBe(false);
    expect(isInCanary(state({ stage: 100 }), 'tenant-abc')).toBe(true);
    expect(isInCanary(null, 'tenant-abc')).toBe(false);
  });

  it('rozwinięcie etapu tylko DODAJE konta, nigdy nie zabiera', () => {
    // Klient, który miał funkcję przy 10%, musi mieć ją przy 50%.
    const tenants = Array.from({ length: 300 }, (_, i) => `t-${i}`);
    const at10 = tenants.filter((t) => isInCanary(state({ stage: 10 }), t));
    const at50 = new Set(tenants.filter((t) => isInCanary(state({ stage: 50 }), t)));

    for (const tenant of at10) {
      expect(at50.has(tenant), tenant).toBe(true);
    }
    expect(at50.size).toBeGreaterThan(at10.length);
  });
});

// ═══════════════════════════════════════════════════════════════
// JEDNA REKLAMACJA ZATRZYMUJE ROZWIJANIE
// ═══════════════════════════════════════════════════════════════

describe('jedna reklamacja zatrzymuje rozwijanie', () => {
  it('JEDNO zgłoszenie wystarczy — nie „kilka", nie „istotny odsetek"', () => {
    // Przy promieniu 4 pojedyncze zgłoszenie to jeden dokument w rejestrze
    // państwowym, którego nie da się cofnąć.
    const verdict = canAdvance(state({ complaints: 1 }), 'payment.chase', NOW);
    expect(verdict.can).toBe(false);
    if (verdict.can) return;
    expect(verdict.reason).toBe('halted_by_complaint');
  });

  it('flaga wstrzymania działa nawet przy zerowym liczniku', () => {
    const verdict = canAdvance(
      state({ halted: true, haltReason: 'operator wstrzymał ręcznie' }),
      'payment.chase',
      NOW,
    );
    expect(verdict.can).toBe(false);
    if (verdict.can) return;
    expect(verdict.detail).toContain('operator wstrzymał');
  });

  it('zgłoszenie sprawdzane PRZED czasem etapu', () => {
    // Odwrotna kolejność dawałaby „poczekaj jeszcze dwa dni" w sytuacji,
    // w której czekanie nic nie zmieni.
    const verdict = canAdvance(
      state({ complaints: 1, stageSince: NOW.toISOString() }),
      'payment.chase',
      NOW,
    );
    expect(verdict.can).toBe(false);
    if (verdict.can) return;
    expect(verdict.reason).toBe('halted_by_complaint');
  });

  it('zatrzymanie NIE COFA etapu', async () => {
    // Odsłonięcie i schowanie funkcji tego samego dnia jest dla klienta
    // gorsze niż jedno i drugie osobno.
    const db = createFakeDb({
      flo_rollout: [
        {
          kind: 'payment.chase',
          stage: 50,
          stage_since: '2026-09-01T00:00:00.000Z',
          complaints: 0,
          halted: false,
          halt_reason: null,
        },
      ],
    });

    await recordComplaint(
      { kind: 'payment.chase', reason: 'wysłano do zapłaconej faktury', currentComplaints: 0 },
      NOW,
      db.client,
    );

    const after = await readRollout('payment.chase', db.client);
    expect(after?.stage).toBe(50);
    expect(after?.halted).toBe(true);
    expect(after?.complaints).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// Etapy i czas
// ═══════════════════════════════════════════════════════════════

describe('etapy 10 → 50 → 100', () => {
  it('tydzień na każdym etapie', () => {
    const tooYoung = canAdvance(
      state({ stageSince: new Date(NOW.getTime() - 3 * 86_400_000).toISOString() }),
      'payment.chase',
      NOW,
    );
    expect(tooYoung.can).toBe(false);
    if (tooYoung.can) return;
    expect(tooYoung.reason).toBe('stage_too_young');
    expect(tooYoung.detail).toContain(`3 z ${STAGE_MIN_DAYS}`);
  });

  it('po tygodniu wolno rozwinąć', () => {
    const ready = canAdvance(
      state({
        stageSince: new Date(NOW.getTime() - (STAGE_MIN_DAYS + 1) * 86_400_000).toISOString(),
      }),
      'payment.chase',
      NOW,
    );
    expect(ready).toEqual({ can: true, from: 10, to: 50 });
  });

  it('etapy idą po kolei i zatrzymują się na stu', () => {
    expect([...ROLLOUT_STAGES]).toEqual([0, 10, 50, 100]);
    expect(nextStage(0)).toBe(10);
    expect(nextStage(10)).toBe(50);
    expect(nextStage(50)).toBe(100);
    expect(nextStage(100)).toBe(100);
  });

  it('funkcja u wszystkich nie ma dokąd się rozwijać', () => {
    const verdict = canAdvance(
      state({ stage: 100, stageSince: '2026-01-01T00:00:00.000Z' }),
      'payment.chase',
      NOW,
    );
    expect(verdict.can).toBe(false);
    if (verdict.can) return;
    expect(verdict.reason).toBe('already_full');
  });

  it('nieodsłonięta funkcja zaczyna od etapu 10%', () => {
    const verdict = canAdvance(null, 'payment.chase', NOW);
    expect(verdict.can).toBe(false);
    if (verdict.can) return;
    expect(verdict.reason).toBe('not_started');
  });

  it('PROMIEŃ 3 NIE WCHODZI DO KANARKA bez prawnika', () => {
    // Kanarek mierzy trafność; tam problemem nie jest trafność, tylko
    // prawo do wypowiadania się.
    const verdict = canAdvance(state({ kind: 'tax.deadline' }), 'tax.deadline', NOW);
    expect(verdict.can).toBe(false);
    if (verdict.can) return;
    expect(verdict.reason).toBe('needs_lawyer');
  });

  it('kolejność z planu: od pomyłek wewnątrz konta do rejestru państwowego', () => {
    expect(ROLLOUT_ORDER.map((entry) => entry.feature)).toEqual([
      'W-01', 'W-02', 'K-01', 'X-01', 'X-02', 'B-01', 'K-02', 'P-01', 'P-02',
    ]);
    // Ostatnie pozycje to promień 4.
    expect(KIND_RADIUS[ROLLOUT_ORDER[ROLLOUT_ORDER.length - 1]!.kind]).toBe(4);
  });

  it('zapis etapu ustawia znacznik czasu', async () => {
    const db = createFakeDb();
    await setStage({ kind: 'expense.review', stage: 10 }, NOW, db.client);
    const stored = await readRollout('expense.review', db.client);
    expect(stored?.stage).toBe(10);
    expect(stored?.stageSince).toBe(NOW.toISOString());
  });
});

// ═══════════════════════════════════════════════════════════════
// Kanarek jako czwarta warstwa przełącznika
// ═══════════════════════════════════════════════════════════════

describe('kanarek w rozstrzyganiu warstw', () => {
  const OK = { enabled: true };

  it('konto poza kanarkiem nie widzi funkcji', () => {
    const verdict = resolveSwitch({
      globalKill: false,
      codeStatus: OK,
      canary: { inCanary: false, stage: 10 },
    });
    expect(verdict.enabled).toBe(false);
    expect(verdict.decidedBy).toBe('canary');
    expect(verdict.note).toContain('10%');
  });

  it('konto w kanarku widzi', () => {
    expect(
      resolveSwitch({
        globalKill: false,
        codeStatus: OK,
        canary: { inCanary: true, stage: 10 },
      }).enabled,
    ).toBe(true);
  });

  it('WPIS OPERATORA PRZEBIJA KANARKA w obie strony', () => {
    // Bez tego nie dałoby się wpuścić testera do wczesnego dostępu ani
    // wypisać klienta, który poprosił o wyłączenie.
    const forcedOn = resolveSwitch({
      globalKill: false,
      codeStatus: OK,
      tenantOverride: { enabled: true, reason: 'tester alfy' },
      canary: { inCanary: false, stage: 10 },
    });
    expect(forcedOn.enabled).toBe(true);
    expect(forcedOn.decidedBy).toBe('tenant_override');

    const forcedOff = resolveSwitch({
      globalKill: false,
      codeStatus: OK,
      tenantOverride: { enabled: false, reason: 'klient poprosił' },
      canary: { inCanary: true, stage: 100 },
    });
    expect(forcedOff.enabled).toBe(false);
  });

  it('rodzaj SPOZA listy kanarkowej działa bez wiersza w flo_rollout', async () => {
    // Pomyłka tych funkcji zostaje wewnątrz konta — nie potrzebują kanarka.
    const db = createFakeDb();
    const verdict = await isKindEnabledForTenant(
      'milestone.money',
      't1',
      db.client,
      async () => false,
    );
    expect(verdict.enabled).toBe(true);
  });

  it('rodzaj Z listy kanarkowej bez wiersza jest nieodsłonięty', async () => {
    const db = createFakeDb();
    const verdict = await isKindEnabledForTenant(
      'payment.chase',
      't1',
      db.client,
      async () => false,
    );
    expect(verdict.enabled).toBe(false);
    expect(verdict.decidedBy).toBe('canary');
  });

  it('po odsłonięciu na 100% widzą wszyscy', async () => {
    const db = createFakeDb({
      flo_rollout: [
        {
          kind: 'payment.chase',
          stage: 100,
          stage_since: '2026-09-01T00:00:00.000Z',
          complaints: 0,
          halted: false,
          halt_reason: null,
        },
      ],
    });

    for (const tenant of ['t1', 't2', 't3']) {
      const verdict = await isKindEnabledForTenant(
        'payment.chase',
        tenant,
        db.client,
        async () => false,
      );
      expect(verdict.enabled, tenant).toBe(true);
    }
  });
});
