import { describe, expect, it } from 'vitest';

import { findOrganizationsBlockingDeletion } from '@/lib/gdpr/deletion-blockers';

/**
 * Subskrypcja należy do FIRMY. Usunięcie konta jedynej osoby, która może nią
 * zarządzać, zostawiłoby kartę obciążaną co miesiąc bez nikogo, kto zatrzyma
 * opłaty. Do 01.10.2026 usuwanie konta tego nie sprawdzało.
 */

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

function fakeAdmin(tables: Tables, failOn?: string) {
  const from = (table: string) => {
    const conditions: Array<(row: Row) => boolean> = [];
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { conditions.push((r) => r[key] === value); return query; },
      neq: (key: string, value: unknown) => { conditions.push((r) => r[key] !== value); return query; },
      in: (key: string, values: unknown[]) => { conditions.push((r) => values.includes(r[key])); return query; },
      then: (resolve: (v: { data: Row[] | null; error: { message: string } | null }) => unknown) =>
        resolve(table === failOn
          ? { data: null, error: { message: 'database unavailable' } }
          : { data: (tables[table] ?? []).filter((r) => conditions.every((c) => c(r))), error: null }),
    };
    return query;
  };
  return { from } as unknown as Parameters<typeof findOrganizationsBlockingDeletion>[0];
}

const owner = (organization_id: string, user_id = 'user-1', role = 'owner', status = 'active') =>
  ({ organization_id, user_id, role, status });
const sub = (tenant_id: string, status = 'active', cancel_at_period_end = false) =>
  ({ tenant_id, status, cancel_at_period_end });
const tenants = [{ id: 'org-a', name: 'Firma A' }, { id: 'org-b', name: 'Firma B' }];

describe('usunięcie konta a subskrypcja firmy', () => {
  it('jedyny właściciel z płatną subskrypcją — blokada z nazwą firmy', async () => {
    const admin = fakeAdmin({ memberships: [owner('org-a')], subscriptions: [sub('org-a')], tenants });
    expect(await findOrganizationsBlockingDeletion(admin, 'user-1')).toEqual(['Firma A']);
  });

  it.each(['trialing', 'past_due', 'unpaid', 'incomplete'])('status %s dalej obciąża kartę — blokada', async (status) => {
    const admin = fakeAdmin({ memberships: [owner('org-a')], subscriptions: [sub('org-a', status)], tenants });
    expect(await findOrganizationsBlockingDeletion(admin, 'user-1')).toEqual(['Firma A']);
  });

  it.each([
    ['anulowana', sub('org-a', 'canceled')],
    ['wygasła', sub('org-a', 'incomplete_expired')],
    ['wstrzymana', sub('org-a', 'paused')],
    ['anulowana na koniec okresu', sub('org-a', 'active', true)],
  ])('subskrypcja %s — można usuwać', async (_label, s) => {
    const admin = fakeAdmin({ memberships: [owner('org-a')], subscriptions: [s], tenants });
    expect(await findOrganizationsBlockingDeletion(admin, 'user-1')).toEqual([]);
  });

  it('jednoosobowa firma bez subskrypcji — można usuwać (faktury zostają w firmie)', async () => {
    const admin = fakeAdmin({ memberships: [owner('org-a')], subscriptions: [], tenants });
    expect(await findOrganizationsBlockingDeletion(admin, 'user-1')).toEqual([]);
  });

  it.each([
    ['drugi właściciel', owner('org-a', 'user-2')],
    ['administrator', owner('org-a', 'user-2', 'admin')],
  ])('w firmie zostaje %s, który anuluje subskrypcję — można usuwać', async (_label, other) => {
    const admin = fakeAdmin({ memberships: [owner('org-a'), other], subscriptions: [sub('org-a')], tenants });
    expect(await findOrganizationsBlockingDeletion(admin, 'user-1')).toEqual([]);
  });

  it.each([
    ['zwykły członek', owner('org-a', 'user-2', 'member')],
    ['księgowa', owner('org-a', 'user-2', 'accountant')],
    ['odwołany właściciel', owner('org-a', 'user-2', 'owner', 'revoked')],
  ])('%s nie zarządza płatnościami — blokada', async (_label, other) => {
    const admin = fakeAdmin({ memberships: [owner('org-a'), other], subscriptions: [sub('org-a')], tenants });
    expect(await findOrganizationsBlockingDeletion(admin, 'user-1')).toEqual(['Firma A']);
  });

  it('członek bez prawa do płatności w płatnej firmie — jego konto można usuwać', async () => {
    const admin = fakeAdmin({
      memberships: [owner('org-a', 'user-1', 'member'), owner('org-a', 'user-2')],
      subscriptions: [sub('org-a')], tenants,
    });
    expect(await findOrganizationsBlockingDeletion(admin, 'user-1')).toEqual([]);
  });

  it('kilka firm — wymienia tylko te, w których subskrypcja zostałaby bez opiekuna', async () => {
    const admin = fakeAdmin({
      memberships: [owner('org-a'), owner('org-b'), owner('org-b', 'user-2', 'admin')],
      subscriptions: [sub('org-a'), sub('org-b')], tenants,
    });
    expect(await findOrganizationsBlockingDeletion(admin, 'user-1')).toEqual(['Firma A']);
  });

  it.each(['memberships', 'subscriptions', 'tenants'])('błąd odczytu %s — rzuca zamiast przepuszczać', async (table) => {
    const admin = fakeAdmin({ memberships: [owner('org-a')], subscriptions: [sub('org-a')], tenants }, table);
    await expect(findOrganizationsBlockingDeletion(admin, 'user-1')).rejects.toThrow('gdpr_blocker_lookup_failed');
  });
});
