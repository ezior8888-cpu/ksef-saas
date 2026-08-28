import { describe, expect, it } from 'vitest';

import {
  assertBudget,
  DAILY_HARD_LIMIT_PLN,
  estimateCostUsd,
  evaluateBudget,
  MONTHLY_HARD_LIMIT_PLN,
  MONTHLY_TARGET_PLN,
  recordUsage,
  USD_PLN,
} from '@/lib/flo/budget';
import { generateCopy, modelFor, validateModelCopy } from '@/lib/flo/llm';
import { formatDays, formatPlnPlain } from '@/lib/flo/money';

import { createFakeDb } from './flo-fake-db';

/**
 * Warstwa modelu i bezpiecznik kosztowy (kroki 15-16 planu).
 *
 * Dwie własności, których pilnują te testy:
 *   · model nie ma jak napisać liczby — a gdyby napisał, wyjście leci do kosza,
 *   · przekroczony budżet nie wyłącza agenta, tylko upraszcza mu zdania.
 */

const NOW = new Date('2026-08-26T12:00:00.000Z');
const VALUES = {
  kontrahent: 'Nowak Sp. z o.o.',
  kwota: formatPlnPlain(4300),
  dni: formatDays(8),
  numer: '5/2026',
};

describe('wybór modelu', () => {
  it('domyślnie tańszy model', () => {
    expect(modelFor('payment.chase')).toBe('claude-haiku-4-5');
    expect(modelFor('expense.review')).toBe('claude-haiku-4-5');
  });

  it('mocniejszy tylko tam, gdzie danych jest dużo, a wywołanie jedno', () => {
    expect(modelFor('accountant.package')).toBe('claude-sonnet-5');
    expect(modelFor('wrapped.ready')).toBe('claude-sonnet-5');
  });
});

describe('walidacja wyjścia modelu', () => {
  const allowed = ['kontrahent', 'kwota', 'dni', 'numer'];

  it('przepuszcza poprawne zdanie z placeholderami', () => {
    const raw = JSON.stringify({
      title: '{{kontrahent}} — {{kwota}} po terminie',
      body: 'Faktura {{numer}} czeka {{dni}}. Przeczytaj i zdecyduj.',
    });
    expect(validateModelCopy(raw, allowed).ok).toBe(true);
  });

  it('ODRZUCA każdą cyfrę', () => {
    // Sedno własności W2. Model, który napisał liczbę, napisał ją z głowy —
    // bo wartości w ogóle nie widział.
    const raw = JSON.stringify({
      title: 'Nowak — 4300 zł po terminie',
      body: 'Faktura {{numer}} czeka.',
    });
    const result = validateModelCopy(raw, allowed);
    expect(result).toMatchObject({ ok: false, reason: 'contains_digits' });
  });

  it('odrzuca placeholder spoza białej listy', () => {
    // „{{pesel}}” albo „{{numerKonta}}” — model nie ma prawa prosić o dane,
    // których mu nie daliśmy.
    const raw = JSON.stringify({
      title: '{{kontrahent}}',
      body: 'Konto {{numerKonta}} czeka na wpłatę.',
    });
    expect(validateModelCopy(raw, allowed)).toMatchObject({
      ok: false,
      reason: 'unknown_placeholder',
    });
  });

  it('odrzuca odpowiedź, która nie jest JSON-em', () => {
    expect(validateModelCopy('Jasne, oto propozycja!', allowed)).toMatchObject({
      ok: false,
      reason: 'not_json',
    });
  });

  it('wyłuskuje JSON z rozmownej odpowiedzi', () => {
    const raw = `Proszę bardzo:\n{"title":"{{kontrahent}}","body":"Faktura {{numer}}."}\nDaj znać!`;
    expect(validateModelCopy(raw, allowed).ok).toBe(true);
  });

  it('odrzuca zbyt długie zdania', () => {
    const raw = JSON.stringify({
      title: 'a'.repeat(200),
      body: 'Faktura {{numer}}.',
    });
    expect(validateModelCopy(raw, allowed)).toMatchObject({
      ok: false,
      reason: 'too_long',
    });
  });
});

describe('generowanie treści', () => {
  it('podstawia wartości do zdania od modelu', async () => {
    const db = createFakeDb();
    const result = await generateCopy(
      { kind: 'payment.chase', tenantId: 'ten-1', values: VALUES },
      NOW,
      db.client,
      async () => ({
        text: JSON.stringify({
          title: '{{kontrahent}} zwleka z {{kwota}}',
          body: 'Faktura {{numer}} czeka {{dni}}. Zdecyduj, czy pisać.',
        }),
        usage: { inputTokens: 500, outputTokens: 80 },
      }),
    );

    expect(result.source).toBe('model');
    expect(result.copy.title).toBe('Nowak Sp. z o.o. zwleka z 4 300,00 zł');
    expect(result.copy.body).toContain('5/2026');
    expect(result.copy.body).toContain('8 dni');
  });

  it('brak sieci to szablon, nie awaria', async () => {
    // Wymóg z planu. Propozycja ma powstać niezależnie od tego, czy dostawca
    // modelu akurat żyje.
    const db = createFakeDb();
    const result = await generateCopy(
      { kind: 'payment.chase', tenantId: 'ten-1', values: VALUES },
      NOW,
      db.client,
      async () => {
        throw new Error('ECONNREFUSED api.anthropic.com');
      },
    );

    expect(result.source).toBe('template');
    expect(result.fallbackReason).toBe('error');
    expect(result.copy.title).toContain('Nowak Sp. z o.o.');
    expect(result.copy.title).toContain('4 300,00 zł');
  });

  it('daje modelowi drugą szansę z informacją, co było źle', async () => {
    const db = createFakeDb();
    const prompts: string[] = [];
    let attempt = 0;

    const result = await generateCopy(
      { kind: 'payment.chase', tenantId: 'ten-1', values: VALUES },
      NOW,
      db.client,
      async (req) => {
        prompts.push(req.user);
        attempt++;
        return {
          text:
            attempt === 1
              ? JSON.stringify({ title: 'Nowak zwleka z 4300 zł', body: 'Faktura {{numer}}.' })
              : JSON.stringify({ title: '{{kontrahent}} zwleka', body: 'Faktura {{numer}}.' }),
          usage: { inputTokens: 500, outputTokens: 80 },
        };
      },
    );

    expect(attempt).toBe(2);
    expect(prompts[1]).toContain('POPRAW');
    expect(result.source).toBe('model');
  });

  it('po dwóch nieudanych próbach schodzi na szablon', async () => {
    const db = createFakeDb();
    let calls = 0;
    const result = await generateCopy(
      { kind: 'payment.chase', tenantId: 'ten-1', values: VALUES },
      NOW,
      db.client,
      async () => {
        calls++;
        return {
          text: 'kompletnie nie to, o co prosiłem',
          usage: { inputTokens: 500, outputTokens: 80 },
        };
      },
    );

    expect(calls).toBe(2);
    expect(result.source).toBe('template');
    expect(result.fallbackReason).toBe('invalid_output');
  });

  it('zapisuje zużycie także dla odrzuconych odpowiedzi', async () => {
    // Odrzucone wyjście też kosztowało. Gdybyśmy go nie liczyli, pętla
    // ponowień byłaby niewidoczna w rachunku — czyli dokładnie tam, gdzie
    // najbardziej boli.
    const db = createFakeDb();
    await generateCopy(
      { kind: 'payment.chase', tenantId: 'ten-1', values: VALUES },
      NOW,
      db.client,
      async () => ({
        text: 'bez sensu',
        usage: { inputTokens: 500, outputTokens: 80 },
      }),
    );

    expect(db.tables.flo_usage[0]).toMatchObject({ tenant_id: 'ten-1', calls: 2 });
  });
});

describe('bezpiecznik kosztowy', () => {
  it('liczy koszt według cennika', () => {
    // Haiku: 1 USD za milion wejścia, 5 za milion wyjścia.
    const cost = estimateCostUsd('claude-haiku-4-5', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(6, 6);
  });

  it('odczyt z pamięci podręcznej jest dziesięć razy tańszy', () => {
    const normal = estimateCostUsd('claude-haiku-4-5', {
      inputTokens: 1_000_000,
      outputTokens: 0,
    });
    const cached = estimateCostUsd('claude-haiku-4-5', {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 1_000_000,
    });
    expect(cached).toBeCloseTo(normal / 10, 6);
  });

  it('przepuszcza typowe zużycie', () => {
    const verdict = evaluateBudget({ todayUsd: 0.01, monthUsd: 0.2 });
    expect(verdict.allowed).toBe(true);
  });

  it('zapala alarm przed twardym limitem, nie po', () => {
    // Konto do obejrzenia przez operatora, ale wciąż działające.
    const spent = (MONTHLY_TARGET_PLN * 2 + 0.01) / USD_PLN;
    const verdict = evaluateBudget({ todayUsd: 0, monthUsd: spent });
    expect(verdict).toMatchObject({ allowed: true, alert: true });
  });

  it('zatrzymuje po przekroczeniu limitu miesięcznego', () => {
    const verdict = evaluateBudget({
      todayUsd: 0,
      monthUsd: MONTHLY_HARD_LIMIT_PLN / USD_PLN,
    });
    expect(verdict).toMatchObject({ allowed: false, reason: 'monthly' });
  });

  it('zatrzymuje po przekroczeniu limitu dobowego', () => {
    // Pętla ponowień nie ma prawa wypalić miesiąca w jedno popołudnie.
    const verdict = evaluateBudget({
      todayUsd: DAILY_HARD_LIMIT_PLN / USD_PLN,
      monthUsd: DAILY_HARD_LIMIT_PLN / USD_PLN,
    });
    expect(verdict).toMatchObject({ allowed: false, reason: 'daily' });
  });

  it('sumuje zużycie w bazie', async () => {
    const db = createFakeDb();
    await recordUsage('ten-1', 'claude-haiku-4-5', { inputTokens: 1000, outputTokens: 200 }, NOW, db.client);
    await recordUsage('ten-1', 'claude-haiku-4-5', { inputTokens: 2000, outputTokens: 300 }, NOW, db.client);

    expect(db.tables.flo_usage).toHaveLength(1);
    expect(db.tables.flo_usage[0]).toMatchObject({
      input_tokens: 3000,
      output_tokens: 500,
      calls: 2,
    });
  });

  it('nie miesza kont', async () => {
    const db = createFakeDb();
    await recordUsage('ten-1', 'claude-haiku-4-5', { inputTokens: 1_000_000, outputTokens: 1_000_000 }, NOW, db.client);

    const other = await assertBudget('ten-2', NOW, db.client);
    expect(other.allowed).toBe(true);
  });

  it('po przekroczeniu limitu NIE wywołuje modelu, ale propozycja powstaje', async () => {
    // To jest cała idea bezpiecznika: klient traci elokwencję, nie funkcje.
    const db = createFakeDb({
      flo_usage: [
        {
          tenant_id: 'ten-1',
          day: '2026-08-26',
          input_tokens: 0,
          output_tokens: 0,
          // ponad twardy limit miesięczny
          cost_usd: MONTHLY_HARD_LIMIT_PLN / USD_PLN + 0.01,
          calls: 1,
        },
      ],
    });

    let calls = 0;
    const result = await generateCopy(
      { kind: 'payment.chase', tenantId: 'ten-1', values: VALUES },
      NOW,
      db.client,
      async () => {
        calls++;
        return { text: '{}', usage: { inputTokens: 1, outputTokens: 1 } };
      },
    );

    expect(calls).toBe(0);
    expect(result.source).toBe('template');
    expect(result.fallbackReason).toBe('budget');
    // Treść jest pełnoprawna — z liczbami, po polsku, gotowa do pokazania.
    expect(result.copy.title).toContain('4 300,00 zł');
    expect(result.copy.body).toContain('5/2026');
  });
});
