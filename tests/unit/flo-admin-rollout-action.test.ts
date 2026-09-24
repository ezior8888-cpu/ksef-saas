import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Przycisk odsłaniania w panelu operatora — co naprawdę robi akcja.
 *
 * Reguła decyzji ma własne testy (`flo-rollout.test.ts`, `canSetStage`).
 * Ten plik pilnuje czegoś innego i ważniejszego: **akcja serwerowa to
 * zwykły endpoint POST.** Guard z `app/admin/layout.tsx` chroni renderowanie
 * strony, nie to wywołanie. Bez `requireAdmin()` w pierwszej linii akcji
 * wystarczyłoby znać jej adres, żeby odsłonić funkcję wszystkim klientom —
 * i żaden test reguły decyzji by tego nie zauważył.
 */

const fake = vi.hoisted(() => ({ client: null as unknown }));
const auth = vi.hoisted(() => ({
  requireAdmin: vi.fn(async () => ({ userId: 'admin-1', email: 'admin@faktflow.pl' })),
}));
const audit = vi.hoisted(() => ({
  logAuditSystem: vi.fn<(entry: unknown) => Promise<void>>(),
}));

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/auth/admin-guard', () => auth);
vi.mock('@/lib/audit/log-system', () => audit);
vi.mock('@/lib/flo/db-types', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/flo/db-types')>()),
  floDb: () => fake.client,
}));

import { setRolloutStageAction } from '@/app/admin/flo/actions';

import { createFakeDb } from './flo-fake-db';

const KIND = 'payment.chase';

let db: ReturnType<typeof createFakeDb>;

function seedRollout(overrides: Record<string, unknown> = {}) {
  return {
    kind: KIND,
    stage: 10,
    stage_since: '2026-09-01T00:00:00.000Z',
    complaints: 0,
    halted: false,
    halt_reason: null,
    ...overrides,
  };
}

function rowFor(kind = KIND) {
  return db.tables.flo_rollout.find((r) => r.kind === kind);
}

beforeEach(() => {
  auth.requireAdmin.mockClear();
  auth.requireAdmin.mockImplementation(async () => ({
    userId: 'admin-1',
    email: 'admin@faktflow.pl',
  }));
  audit.logAuditSystem.mockClear();
  db = createFakeDb({});
  fake.client = db.client;
});

describe('kto może przestawić kanarka', () => {
  it('nie-admin nie przestawia niczego', async () => {
    // `requireAdmin()` w produkcji rzuca NEXT_REDIRECT. Tu wystarczy, że
    // rzuca cokolwiek — chodzi o to, że akcja NIE idzie dalej.
    auth.requireAdmin.mockImplementation(async () => {
      throw new Error('NEXT_REDIRECT');
    });

    await expect(setRolloutStageAction(KIND, 10)).rejects.toThrow('NEXT_REDIRECT');
    expect(db.tables.flo_rollout).toHaveLength(0);
    expect(audit.logAuditSystem).not.toHaveBeenCalled();
  });

  it('sprawdzenie admina idzie PRZED czymkolwiek innym', async () => {
    // Nawet dla argumentów, które i tak zostałyby odrzucone, autoryzacja
    // ma być pierwsza — inaczej akcja zdradza, co istnieje w systemie.
    auth.requireAdmin.mockImplementation(async () => {
      throw new Error('NEXT_REDIRECT');
    });

    await expect(setRolloutStageAction('nie.istnieje', 999)).rejects.toThrow(
      'NEXT_REDIRECT',
    );
  });
});

describe('czego akcja nie przyjmuje', () => {
  it('rodzaju spoza planu odsłaniania', async () => {
    // `invoice.final` jest poprawnym rodzajem karty, ale nie ma go
    // w `ROLLOUT_ORDER` — kanarek go nie dotyczy.
    const result = await setRolloutStageAction('invoice.final', 10);

    expect(result).toMatchObject({ success: false });
    expect(db.tables.flo_rollout).toHaveLength(0);
  });

  it('rodzaju, który w ogóle nie istnieje', async () => {
    const result = await setRolloutStageAction('wymyslony.rodzaj', 10);

    expect(result).toMatchObject({ success: false });
    expect(db.tables.flo_rollout).toHaveLength(0);
  });

  it('etapu spoza czterech dozwolonych', async () => {
    for (const stage of [1, 25, 99, 101, -10]) {
      const result = await setRolloutStageAction(KIND, stage);
      expect(result, `etap ${stage}`).toMatchObject({ success: false });
    }
    expect(db.tables.flo_rollout).toHaveLength(0);
  });
});

describe('co akcja zapisuje', () => {
  it('odsłonięcie zapisuje etap i zostawia ślad w audycie', async () => {
    const result = await setRolloutStageAction(KIND, 10);

    expect(result).toMatchObject({ success: true });
    expect(rowFor()?.stage).toBe(10);
    expect(rowFor()?.stage_since).not.toBeNull();

    expect(audit.logAuditSystem).toHaveBeenCalledTimes(1);
    expect(audit.logAuditSystem.mock.calls[0]![0]).toMatchObject({
      action: 'admin.flo.rollout.changed',
      entityType: 'flo_rollout',
      entityId: KIND,
      userId: 'admin-1',
      metadata: { kind: KIND, from: 0, to: 10, direction: 'reveal' },
    });
  });

  it('odmowa reguły nie zapisuje ani etapu, ani audytu', async () => {
    db = createFakeDb({
      flo_rollout: [seedRollout({ halted: true, halt_reason: 'zły odbiorca' })],
    });
    fake.client = db.client;

    const result = await setRolloutStageAction(KIND, 50);

    expect(result).toMatchObject({ success: false, error: 'zły odbiorca' });
    expect(rowFor()?.stage).toBe(10);
    expect(audit.logAuditSystem).not.toHaveBeenCalled();
  });

  it('schowanie działa także przy wstrzymanej funkcji', async () => {
    db = createFakeDb({
      flo_rollout: [seedRollout({ stage: 50, halted: true, halt_reason: 'skarga' })],
    });
    fake.client = db.client;

    const result = await setRolloutStageAction(KIND, 0);

    expect(result).toMatchObject({ success: true });
    expect(rowFor()?.stage).toBe(0);
    expect(audit.logAuditSystem.mock.calls[0]![0]).toMatchObject({
      metadata: { from: 50, to: 0, direction: 'hide' },
    });
  });

  it('ślad w audycie należy do platformy, nie do konta klienta', async () => {
    await setRolloutStageAction(KIND, 10);

    const entry = audit.logAuditSystem.mock.calls[0]![0] as {
      tenantId: unknown;
    };
    expect(entry.tenantId).toBeNull();
  });
});
