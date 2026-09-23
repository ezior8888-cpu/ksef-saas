import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * „Nie teraz" i „Nigdy więcej takich" — co naprawdę zapisuje akcja serwerowa
 * (plan FLO 2, K2.16).
 *
 * Ten plik istnieje, bo test mutacyjny pokazał lukę: reguła ciszy miała
 * własne testy, ale nikt nie sprawdzał, CZYM woła ją akcja. Podmiana
 * `proposal.topic_key` na `proposal.kind` w `dismissProposal` przechodziła
 * wtedy bez jednego czerwonego testu — a to jest dokładnie ta jedna linijka,
 * od której zależy, czy „nie chcę tej faktury" wycisza jedną sprawę, czy
 * całą funkcję.
 */

const fake = vi.hoisted(() => ({ client: null as unknown }));

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

vi.mock('@/lib/supabase/auth-context', () => ({
  requireUserAndActiveOrg: async () => ({
    tenantId: 'ten-1',
    user: { id: 'user-1' },
  }),
}));

vi.mock('@/lib/flo/db-types', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/flo/db-types')>()),
  floDb: () => fake.client,
}));

import { dismissProposal } from '@/app/actions/flo';
import { listMutedKinds, listMutedSubjects } from '@/lib/flo/decisions';
import { createProposal, type CreateProposalInput } from '@/lib/flo/proposals';

import { createFakeDb } from './flo-fake-db';

const TENANT = 'ten-1';
const KIND = 'onboarding.step';
const NOW = new Date('2026-09-23T10:00:00.000Z');
const noKill = async () => false;

let db: ReturnType<typeof createFakeDb>;

function seedCard(id: string, topicKey: string) {
  return {
    id,
    tenant_id: TENANT,
    kind: KIND,
    topic_key: topicKey,
    status: 'open',
    expires_at: '2026-10-23T00:00:00.000Z',
    dismissed_reason: null,
  };
}

function card(topicKey: string): CreateProposalInput {
  return {
    tenantId: TENANT,
    kind: KIND,
    topicKey,
    title: 'Dokończ konfigurację',
    body: 'Zostały dwa kroki.',
    fingerprint: 'fp',
    expiresAt: new Date(NOW.getTime() + 7 * 86_400_000),
  };
}

beforeEach(() => {
  db = createFakeDb({
    flo_proposals: [
      seedCard('p-adobe', `${KIND}:adobe`),
      seedCard('p-adobe-2', `${KIND}:adobe`),
      seedCard('p-ovh', `${KIND}:ovh`),
      seedCard('p-never', `${KIND}:google`),
    ],
  });
  fake.client = db.client;
});

describe('dismissProposal — co ląduje w pamięci decyzji', () => {
  it('„Nie teraz" zapisuje odpowiedź o SPRAWIE, nie o rodzaju', async () => {
    await dismissProposal('p-adobe', 'not_now');

    const keys = db.tables.flo_decisions.map((row) => row.kind);
    expect(keys).toEqual([`${KIND}:adobe`]);
    expect(keys).not.toContain(KIND);
  });

  it('REGRESJA: dwa „nie teraz" o różnych sprawach nie zamykają rodzaju', async () => {
    await dismissProposal('p-adobe', 'not_now');
    await dismissProposal('p-ovh', 'not_now');

    expect(await listMutedKinds(TENANT, NOW, db.client)).toEqual([]);
    // Temat, o który jeszcze nie pytaliśmy — inaczej zadziałałaby zwykła
    // deduplikacja („jeden temat = jedna żywa karta"), a nie cisza.
    const result = await createProposal(card(`${KIND}:notion`), db.client, noKill);
    expect(result.status).toBe('created');
  });

  it('dwa „nie teraz" o tej samej sprawie zamykają tę jedną sprawę', async () => {
    await dismissProposal('p-adobe', 'not_now');
    await dismissProposal('p-adobe-2', 'not_now');

    expect(await listMutedSubjects(TENANT, NOW, db.client)).toEqual([
      { topicKey: `${KIND}:adobe`, mutedUntil: expect.any(String) },
    ]);
    expect(
      (await createProposal(card(`${KIND}:adobe`), db.client, noKill)).status,
    ).toBe('muted');
    expect(
      (await createProposal(card(`${KIND}:notion`), db.client, noKill)).status,
    ).toBe('created');
  });

  it('„Nigdy więcej takich" zamyka cały rodzaj — bo to jasna prośba', async () => {
    await dismissProposal('p-never', 'never');

    expect(await listMutedKinds(TENANT, NOW, db.client)).toEqual([KIND]);
    expect(
      (await createProposal(card(`${KIND}:cokolwiek`), db.client, noKill)).status,
    ).toBe('muted');
  });

  it('„Skończyliśmy współpracę" zamyka JEDNĄ sprawę, nie cały rodzaj', async () => {
    // Karta P-03 pyta o konkretnego klienta. Gdyby ten przycisk uciszał
    // rodzaj, jedna zakończona współpraca zabrałaby pytania o wszystkich
    // pozostałych klientów.
    await dismissProposal('p-adobe', 'never_subject');

    expect(await listMutedSubjects(TENANT, NOW, db.client)).toEqual([
      { topicKey: `${KIND}:adobe`, mutedUntil: expect.any(String) },
    ]);
    expect(await listMutedKinds(TENANT, NOW, db.client)).toEqual([]);
    expect(
      (await createProposal(card(`${KIND}:notion`), db.client, noKill)).status,
    ).toBe('created');
  });

  it('karta znika z wątku z właściwym powodem', async () => {
    await dismissProposal('p-adobe', 'not_now');
    await dismissProposal('p-never', 'never');

    const rows = db.tables.flo_proposals;
    expect(rows.find((r) => r.id === 'p-adobe')).toMatchObject({
      status: 'dismissed',
      dismissed_reason: 'not_now',
    });
    expect(rows.find((r) => r.id === 'p-never')).toMatchObject({
      status: 'dismissed',
      dismissed_reason: 'never',
    });
  });

  it('cudzej karty nie da się odrzucić', async () => {
    db.tables.flo_proposals.push({
      ...seedCard('obca', `${KIND}:obca`),
      tenant_id: 'ten-2',
    });

    await dismissProposal('obca', 'not_now');

    expect(db.tables.flo_decisions).toHaveLength(0);
    expect(db.tables.flo_proposals.find((r) => r.id === 'obca')!.status).toBe('open');
  });
});
