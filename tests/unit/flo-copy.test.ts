import { describe, expect, it } from 'vitest';

import {
  FLO_TEMPLATES,
  FloCopyError,
  placeholdersOf,
  renderCopy,
  renderTemplate,
} from '@/lib/flo/copy';
import { formatDays, formatPln, formatPlnPlain } from '@/lib/flo/money';

/**
 * Szablony i kwoty (krok 14 planu).
 *
 * Sedno: żadna liczba widziana przez klienta nie ma prawa pochodzić od
 * modelu językowego ani z tekstu wpisanego na sztywno w szablon.
 */

describe('kwoty', () => {
  it('formatuje po polsku', () => {
    expect(formatPlnPlain(1234567.89)).toBe('1 234 567,89 zł');
    expect(formatPlnPlain(0)).toBe('0,00 zł');
    expect(formatPlnPlain(4300)).toBe('4 300,00 zł');
  });

  it('zawsze ma dwie cyfry po przecinku', () => {
    expect(formatPlnPlain(10)).toBe('10,00 zł');
    expect(formatPlnPlain(10.5)).toBe('10,50 zł');
  });

  it('używa twardej spacji, żeby kwota nie łamała się w mailu', () => {
    // „22” w jednym wierszu i „140,00 zł” w następnym to nie jest kwota,
    // tylko zagadka. Test pilnuje konkretnego znaku, bo jest niewidoczny.
    expect(formatPln(22140)).toContain(' ');
    expect(formatPln(22140)).not.toContain(' ');
  });

  it('wersja dla plików maszynowych nie ma twardych spacji', () => {
    // Twarda spacja w arkuszu potrafi zamienić liczbę w tekst i zepsuć
    // import po stronie księgowej.
    expect(formatPlnPlain(22140)).not.toContain(' ');
  });

  it('nie wywala się na wartości bez sensu', () => {
    expect(formatPlnPlain(Number.NaN)).toBe('0,00 zł');
  });

  it('odmienia dni', () => {
    expect(formatDays(1)).toBe('1 dzień');
    expect(formatDays(3)).toBe('3 dni');
    expect(formatDays(8)).toBe('8 dni');
  });
});

describe('szablony', () => {
  it('ŻADEN szablon nie zawiera cyfry', () => {
    // Najważniejsza asercja w tym pliku. Cyfra wpisana na sztywno w szablon
    // („14 dni”, „23% VAT”) sprawia, że agent zaczyna kłamać klientom,
    // u których liczba jest inna — i nikt tego nie zauważy, bo tekst
    // wygląda poprawnie.
    for (const [kind, template] of Object.entries(FLO_TEMPLATES)) {
      expect(template!.title, `tytuł ${kind}`).not.toMatch(/\d/);
      expect(template!.body, `treść ${kind}`).not.toMatch(/\d/);
    }
  });

  it('podstawia wartości', () => {
    const copy = renderCopy('payment.chase', {
      kontrahent: 'Nowak Sp. z o.o.',
      kwota: formatPlnPlain(4300),
      dni: formatDays(8),
      numer: '5/2026',
    });
    expect(copy.title).toBe('Nowak Sp. z o.o. — 4 300,00 zł, 8 dni po terminie');
    expect(copy.body).toContain('Faktura 5/2026 na 4 300,00 zł');
  });

  it('brak wartości to wyjątek, nie puste miejsce', () => {
    // „Faktura  na  minęła termin  temu” jest gorsze niż brak propozycji.
    expect(() =>
      renderCopy('payment.chase', { kontrahent: 'Nowak' }),
    ).toThrowError(FloCopyError);
  });

  it('pusty napis też jest brakiem wartości', () => {
    expect(() => renderTemplate('Kwota: {{kwota}}', { kwota: '' })).toThrowError(
      FloCopyError,
    );
  });

  it('nieznany rodzaj propozycji to wyjątek', () => {
    // @ts-expect-error — celowo rodzaj spoza kontraktu
    expect(() => renderCopy('cos.wymyslonego', {})).toThrowError(FloCopyError);
  });

  it('nadmiarowe wartości są ignorowane', () => {
    const text = renderTemplate('Cześć {{imie}}', { imie: 'Kamil', wiek: '30' });
    expect(text).toBe('Cześć Kamil');
  });
});

describe('własność: w tekście nie ma liczb spoza danych', () => {
  it('dla losowych wartości każda cyfra pochodzi z podstawionych danych', () => {
    // Test właściwościowy z planu. Gdyby ktoś dopisał liczbę do szablonu albo
    // gdyby model kiedyś dostał możliwość pisania kwot, ten test to złapie.
    const kinds = Object.keys(FLO_TEMPLATES) as Array<
      keyof typeof FLO_TEMPLATES
    >;

    for (let i = 0; i < 500; i++) {
      const kind = kinds[i % kinds.length]!;
      const template = FLO_TEMPLATES[kind]!;
      const names = new Set([
        ...placeholdersOf(template.title),
        ...placeholdersOf(template.body),
      ]);

      const values: Record<string, string> = {};
      for (const name of names) {
        // Losowe wartości: kwoty, dni, numery, nazwy — wszystko, co realnie
        // trafia do tych pól.
        const roll = Math.floor(Math.random() * 1_000_000) / 100;
        values[name] =
          i % 3 === 0
            ? formatPlnPlain(roll)
            : i % 3 === 1
              ? formatDays(Math.floor(roll) % 90)
              : `${Math.floor(roll)}/2026`;
      }

      const copy = renderCopy(kind, values);
      const rendered = `${copy.title} ${copy.body}`;

      const digitsInOutput = rendered.match(/\d+/g) ?? [];
      const digitsAllowed = new Set(
        Object.values(values).flatMap((v) => v.match(/\d+/g) ?? []),
      );

      for (const chunk of digitsInOutput) {
        expect(
          digitsAllowed.has(chunk),
          `liczba „${chunk}" w tekście ${kind} nie pochodzi z danych: ${rendered}`,
        ).toBe(true);
      }
    }
  });
});
