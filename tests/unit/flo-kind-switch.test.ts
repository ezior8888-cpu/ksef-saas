import { describe, expect, it } from 'vitest';

import { blockedKinds, kindStatus } from '@/lib/flo/flags';
import {
  isKindEnabledForTenant,
  listTenantOverrides,
  resolveSwitch,
  setKindForTenant,
} from '@/lib/flo/kind-switch';
import { createProposal } from '@/lib/flo/proposals';
import { createFakeDb } from './flo-fake-db';

/**
 * M8 — przełączniki funkcji agenta (krok 53).
 *
 * Trzy warstwy, każda może tylko ZABRAĆ. Kolejność jest tu całą treścią.
 */

const OK = { enabled: true };
const BLOCKED = {
  enabled: false,
  reason: 'legal' as const,
  note: 'Czeka na opinię prawnika.',
};

// ═══════════════════════════════════════════════════════════════
// Rozstrzyganie warstw
// ═══════════════════════════════════════════════════════════════

describe('trzy warstwy, w tej kolejności', () => {
  it('domyślnie wszystko włączone', () => {
    expect(resolveSwitch({ globalKill: false, codeStatus: OK })).toEqual({
      enabled: true,
      decidedBy: null,
    });
  });

  it('globalny wyłącznik wygrywa ze wszystkim', () => {
    const verdict = resolveSwitch({
      globalKill: true,
      codeStatus: OK,
      tenantOverride: { enabled: true, reason: 'klient prosił' },
    });
    expect(verdict.enabled).toBe(false);
    expect(verdict.decidedBy).toBe('global_kill');
  });

  it('blokada w kodzie wyłącza mimo braku wpisu konta', () => {
    const verdict = resolveSwitch({ globalKill: false, codeStatus: BLOCKED });
    expect(verdict.enabled).toBe(false);
    expect(verdict.decidedBy).toBe('code_block');
    expect(verdict.note).toContain('prawnika');
  });

  it('WPIS KONTA NIE ODWRACA BLOKADY W KODZIE', () => {
    // Gdyby odwracał, jeden UPDATE o drugiej w nocy wypuszczałby na klienta
    // funkcję, której nikt nie zatwierdził — a właśnie przed tym miało
    // chronić trzymanie tamtej listy w commicie.
    const verdict = resolveSwitch({
      globalKill: false,
      codeStatus: BLOCKED,
      tenantOverride: { enabled: true, reason: 'bardzo proszę' },
    });
    expect(verdict.enabled).toBe(false);
    expect(verdict.decidedBy).toBe('code_block');
  });

  it('wpis konta może wyłączyć funkcję dozwoloną', () => {
    const verdict = resolveSwitch({
      globalKill: false,
      codeStatus: OK,
      tenantOverride: { enabled: false, reason: 'klient nie chce ponagleń' },
    });
    expect(verdict.enabled).toBe(false);
    expect(verdict.decidedBy).toBe('tenant_override');
    expect(verdict.note).toBe('klient nie chce ponagleń');
  });

  it('wpis konta może jawnie potwierdzić włączenie', () => {
    expect(
      resolveSwitch({
        globalKill: false,
        codeStatus: OK,
        tenantOverride: { enabled: true, reason: 'przywrócone po zgłoszeniu' },
      }).enabled,
    ).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// Odczyt z bazy
// ═══════════════════════════════════════════════════════════════

describe('odczyt przełącznika', () => {
  it('konto bez żadnego wpisu ma wszystko włączone', async () => {
    const db = createFakeDb();
    const verdict = await isKindEnabledForTenant(
      'payment.chase',
      't1',
      db.client,
      async () => false,
    );
    expect(verdict).toEqual({ enabled: true, decidedBy: null });
  });

  it('wpis wyłączający jest respektowany', async () => {
    const db = createFakeDb({
      flo_kind_flags: [
        {
          tenant_id: 't1',
          kind: 'payment.chase',
          enabled: false,
          reason: 'klient prowadzi windykację sam',
        },
      ],
    });

    const verdict = await isKindEnabledForTenant(
      'payment.chase',
      't1',
      db.client,
      async () => false,
    );
    expect(verdict.enabled).toBe(false);
    expect(verdict.note).toContain('windykację');
  });

  it('wpis DRUGIEGO konta nie dotyczy tego', async () => {
    const db = createFakeDb({
      flo_kind_flags: [
        { tenant_id: 'inne', kind: 'payment.chase', enabled: false, reason: 'x' },
      ],
    });
    expect(
      (await isKindEnabledForTenant('payment.chase', 't1', db.client, async () => false))
        .enabled,
    ).toBe(true);
  });

  it('blokada w kodzie NIE PYTA bazy ani flag globalnych', async () => {
    // Nie ma po co: i tak nic tego nie odwróci.
    const db = createFakeDb();
    let askedGlobal = false;

    const blocked = blockedKinds()[0]!.kind;
    const verdict = await isKindEnabledForTenant(blocked, 't1', db.client, async () => {
      askedGlobal = true;
      return false;
    });

    expect(verdict.decidedBy).toBe('code_block');
    expect(askedGlobal).toBe(false);
    expect(db.writes).toBe(0);
  });

  it('globalny wyłącznik ucisza wszystko', async () => {
    const db = createFakeDb();
    const verdict = await isKindEnabledForTenant(
      'expense.review',
      't1',
      db.client,
      async () => true,
    );
    expect(verdict.enabled).toBe(false);
    expect(verdict.decidedBy).toBe('global_kill');
  });
});

// ═══════════════════════════════════════════════════════════════
// Ustawianie
// ═══════════════════════════════════════════════════════════════

describe('ustawianie przełącznika', () => {
  it('POWÓD JEST OBOWIĄZKOWY', async () => {
    // Wyłącznik bez powodu po pół roku jest nie do odróżnienia od pomyłki
    // i nikt nie odważy się go cofnąć.
    const db = createFakeDb();
    await expect(
      setKindForTenant(
        { tenantId: 't1', kind: 'payment.chase', enabled: false, reason: '  ' },
        db.client,
      ),
    ).rejects.toThrow('wymaga powodu');
    expect(db.tables.flo_kind_flags).toHaveLength(0);
  });

  it('zapisuje wpis i oddaje go w liście odstępstw', async () => {
    const db = createFakeDb();
    await setKindForTenant(
      {
        tenantId: 't1',
        kind: 'payment.chase',
        enabled: false,
        reason: 'klient prowadzi windykację sam',
      },
      db.client,
    );

    expect(await listTenantOverrides('t1', db.client)).toEqual([
      {
        kind: 'payment.chase',
        enabled: false,
        reason: 'klient prowadzi windykację sam',
      },
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════
// Ćwiczenie z planu: jedna funkcja milczy, reszta działa
// ═══════════════════════════════════════════════════════════════

describe('ĆWICZENIE — wyłączamy jedną funkcję, reszta działa', () => {
  const base = {
    tenantId: 't1',
    topicKey: 'x',
    title: 'Tytuł',
    body: 'Treść',
    fingerprint: 'f',
    expiresAt: new Date('2026-12-01T00:00:00.000Z'),
  } as const;

  it('wyłączony rodzaj NIE ZOSTAWIA ŚLADU w bazie', async () => {
    const db = createFakeDb({
      flo_kind_flags: [
        {
          tenant_id: 't1',
          kind: 'payment.chase',
          enabled: false,
          reason: 'ćwiczenie M8',
        },
      ],
    });

    const result = await createProposal(
      { ...base, kind: 'payment.chase' },
      db.client,
      async () => false,
    );

    expect(result.status).toBe('disabled');
    expect(db.tables.flo_proposals).toHaveLength(0);
  });

  it('POZOSTAŁE rodzaje działają bez zmian', async () => {
    const db = createFakeDb({
      flo_kind_flags: [
        {
          tenant_id: 't1',
          kind: 'payment.chase',
          enabled: false,
          reason: 'ćwiczenie M8',
        },
      ],
    });

    const result = await createProposal(
      { ...base, kind: 'expense.review', topicKey: 'y' },
      db.client,
      async () => false,
    );

    expect(result.status).toBe('created');
    expect(db.tables.flo_proposals).toHaveLength(1);
  });

  it('globalny wyłącznik ucisza WSZYSTKIE rodzaje naraz', async () => {
    const db = createFakeDb();

    for (const kind of ['expense.review', 'ksef.status', 'invoice.final'] as const) {
      const result = await createProposal(
        { ...base, kind, topicKey: kind },
        db.client,
        async () => true,
      );
      expect(result.status).toBe('disabled');
    }

    expect(db.tables.flo_proposals).toHaveLength(0);
  });

  it('lista zablokowanych w kodzie nadal działa niezależnie', () => {
    const blocked = blockedKinds();
    expect(blocked.length).toBeGreaterThan(0);
    for (const entry of blocked) {
      expect(kindStatus(entry.kind).enabled).toBe(false);
    }
  });
});
