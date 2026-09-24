import { describe, expect, it } from 'vitest';

import { muteKind } from '@/lib/flo/decisions';
import { createProposal, type CreateProposalInput } from '@/lib/flo/proposals';
import { accuracyByKind, recordShadow } from '@/lib/flo/shadow';

import { createFakeDb } from './flo-fake-db';

/**
 * Tryb cichy wreszcie podpięty do rzeczywistości.
 *
 * Do tej pory `recordShadow` wołały wyłącznie testy: tabela `flo_shadow`
 * stała pusta, a bramka gotowości w panelu liczyła trafność z zera i nigdy
 * nie mogła zapalić się na zielono. Ten plik pilnuje jednej granicy —
 * KTÓRE milczenie agenta wolno zmierzyć, a które jest decyzją człowieka
 * i mierzeniu nie podlega.
 */

const TENANT = 'ten-1';
const KIND = 'payment.confirm';
const NOW = new Date('2026-09-24T07:30:00.000Z');
const noKill = async () => false;

function proposal(overrides: Partial<CreateProposalInput> = {}): CreateProposalInput {
  return {
    tenantId: TENANT,
    kind: KIND,
    topicKey: `${KIND}:inv-1`,
    title: 'Zapłacił?',
    body: 'Faktura FV/1 jest po terminie.',
    fingerprint: 'odcisk-1',
    expiresAt: new Date('2026-10-24T07:30:00.000Z'),
    payload: { invoiceId: 'inv-1', contractorName: 'Nowak Sp. z o.o.' },
    ...overrides,
  };
}

/** Kanarek na 100% — konto widzi funkcję normalnie. */
function odsloniete() {
  return [{ kind: KIND, stage: 100, stage_since: '2026-09-01T00:00:00.000Z' }];
}

describe('które milczenie wolno zmierzyć', () => {
  it('konto poza kanarkiem: zamiast karty wpis do trybu cichego', async () => {
    // Brak wiersza w `flo_rollout` = etap 0 = nikt nie widzi funkcji.
    // To jest dokładnie ten stan, w którym agent wie, co by powiedział.
    const db = createFakeDb({});

    const result = await createProposal(proposal(), db.client, noKill);

    expect(result.status).toBe('disabled');
    expect(db.tables.flo_proposals).toHaveLength(0);
    expect(db.tables.flo_shadow).toHaveLength(1);
    expect(db.tables.flo_shadow[0]).toMatchObject({
      tenant_id: TENANT,
      kind: KIND,
    });
  });

  it('konto W kanarku dostaje kartę i NIE trafia do trybu cichego', async () => {
    // Dwa zapisy o tej samej sprawie zawyżałyby próbkę o przypadki,
    // które i tak już widać w wątku klienta.
    const db = createFakeDb({ flo_rollout: odsloniete() });

    const result = await createProposal(proposal(), db.client, noKill);

    expect(result.status).toBe('created');
    expect(db.tables.flo_proposals).toHaveLength(1);
    expect(db.tables.flo_shadow).toHaveLength(0);
  });
});

describe('czego mierzyć nie wolno', () => {
  it('wyłącznik globalny: ani karty, ani wpisu', async () => {
    // Zatrzymanie agenta to decyzja człowieka. Liczenie w tym czasie
    // „co by powiedział" mierzyłoby awarię, a nie trafność.
    const db = createFakeDb({});

    const result = await createProposal(proposal(), db.client, async () => true);

    expect(result.status).toBe('disabled');
    expect(db.tables.flo_shadow).toHaveLength(0);
  });

  it('rodzaj zablokowany w kodzie: ani karty, ani wpisu', async () => {
    // Przy blokadzie prawnej nie mamy prawa nawet POLICZYĆ, co byśmy
    // powiedzieli — nie tylko powiedzieć.
    const db = createFakeDb({});

    const result = await createProposal(
      proposal({ kind: 'payment.score', topicKey: 'payment.score:x' }),
      db.client,
      noKill,
    );

    expect(result.status).toBe('disabled');
    expect(db.tables.flo_shadow).toHaveLength(0);
  });

  it('konto wypisane przez operatora: ani karty, ani wpisu', async () => {
    // Wpis operatora to też decyzja człowieka, nie brak odsłonięcia.
    const db = createFakeDb({
      flo_rollout: odsloniete(),
      flo_kind_flags: [
        { tenant_id: TENANT, kind: KIND, enabled: false, reason: 'klient prosił' },
      ],
    });

    const result = await createProposal(proposal(), db.client, noKill);

    expect(result.status).toBe('disabled');
    expect(db.tables.flo_shadow).toHaveLength(0);
  });

  it('wyciszony rodzaj: cisza jest prawdziwą odpowiedzią, nie brakiem danych', async () => {
    const db = createFakeDb({});
    await muteKind(TENANT, KIND, NOW, db.client);

    const result = await createProposal(proposal(), db.client, noKill);

    expect(result.status).toBe('muted');
    expect(db.tables.flo_shadow).toHaveLength(0);
  });
});

describe('co dokładnie ląduje we wpisie', () => {
  it('klucz tematu i odcisk — bez treści karty i bez kontrahenta', async () => {
    // `flo_shadow` oglądamy my, nie klient. Tytuł, treść i nazwa firmy
    // nie mają tam czego szukać.
    const db = createFakeDb({});

    await createProposal(proposal(), db.client, noKill);

    const zapis = db.tables.flo_shadow[0]!.proposal as Record<string, unknown>;
    expect(Object.keys(zapis).sort()).toEqual(['fingerprint', 'topicKey']);
    expect(zapis.topicKey).toBe(`${KIND}:inv-1`);
    expect(JSON.stringify(zapis)).not.toContain('Nowak');
  });
});

describe('jedna sprawa to jeden wpis', () => {
  it('ten sam temat w kolejnych przebiegach nie mnoży wpisów', async () => {
    // Puls chodzi codziennie, a zaległa faktura potrafi wisieć miesiąc.
    // Bez tego „sto propozycji" z bramki gotowości znaczyłoby trzy sprawy.
    const db = createFakeDb({});

    for (let dzien = 0; dzien < 30; dzien++) {
      await createProposal(proposal(), db.client, noKill);
    }

    expect(db.tables.flo_shadow).toHaveLength(1);
  });

  it('różne sprawy to różne wpisy', async () => {
    const db = createFakeDb({});

    await createProposal(proposal({ topicKey: `${KIND}:inv-1` }), db.client, noKill);
    await createProposal(proposal({ topicKey: `${KIND}:inv-2` }), db.client, noKill);

    expect(db.tables.flo_shadow).toHaveLength(2);
  });

  it('sprawa rozstrzygnięta i wracająca po czasie to NOWY wpis', async () => {
    // Duplikat rozpoznajemy tylko wśród wpisów bez rozstrzygnięcia.
    // Ten sam kontrahent zalegający drugi raz w roku to druga sprawa.
    const db = createFakeDb({});

    await createProposal(proposal(), db.client, noKill);
    db.tables.flo_shadow[0]!.matched = true;

    await createProposal(proposal(), db.client, noKill);

    expect(db.tables.flo_shadow).toHaveLength(2);
  });

  it('powtórka zgłasza się jako niezapisana', async () => {
    const db = createFakeDb({});
    const wpis = { topicKey: 'k', fingerprint: 'f' };

    await expect(
      recordShadow({ tenantId: TENANT, kind: KIND, proposal: wpis }, db.client),
    ).resolves.toBe(true);
    await expect(
      recordShadow({ tenantId: TENANT, kind: KIND, proposal: wpis }, db.client),
    ).resolves.toBe(false);
  });

  it('ten sam temat u innego konta to osobna sprawa', async () => {
    const db = createFakeDb({});

    await createProposal(proposal(), db.client, noKill);
    await createProposal(proposal({ tenantId: 'ten-2' }), db.client, noKill);

    expect(db.tables.flo_shadow).toHaveLength(2);
  });
});

describe('trafność czytana z zebranych wpisów', () => {
  it('nierozstrzygnięte liczą się jako oczekujące, nie jako pomyłki', async () => {
    // Panel pokazuje jedno i drugie osobno. Wrzucenie oczekujących do
    // mianownika trafności dawałoby 0% przy funkcji, która niczego jeszcze
    // nie pomyliła.
    const db = createFakeDb({});

    await createProposal(proposal({ topicKey: `${KIND}:a` }), db.client, noKill);
    await createProposal(proposal({ topicKey: `${KIND}:b` }), db.client, noKill);
    db.tables.flo_shadow[0]!.matched = true;

    const [stat] = await accuracyByKind(db.client);

    expect(stat).toMatchObject({ kind: KIND, settled: 1, matched: 1, pending: 1 });
    expect(stat!.accuracy).toBe(100);
  });

  it('czyta WSZYSTKIE wpisy, nie tylko pierwszą stronę', async () => {
    // Ta tabela rośnie z każdym przebiegiem pulsu na każdym koncie poza
    // kanarkiem, więc jako pierwsza w całym agencie przekroczy próg, przy
    // którym PostgREST tnie odpowiedź. Ucięcie zaniżałoby trafność po cichu.
    const db = createFakeDb({
      flo_shadow: Array.from({ length: 1200 }, (_, i) => ({
        id: `s-${i}`,
        tenant_id: TENANT,
        kind: KIND,
        proposal: { topicKey: `${KIND}:${i}`, fingerprint: 'f' },
        actual: null,
        matched: true,
      })),
    });

    const [stat] = await accuracyByKind(db.client);

    expect(stat).toMatchObject({ settled: 1200, matched: 1200 });
  });
});
