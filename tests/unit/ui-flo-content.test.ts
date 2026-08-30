import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FLO_PROPOSAL_KINDS } from '@/types/flo';

/**
 * Treści agenta (kroki 25–31 toru B).
 *
 * Teksty w `content/flo/*.md` to nie notatki — to źródło brzmienia agenta.
 * Ten test pilnuje reguł z części II.5 planu mechanicznie, bo za pół roku
 * nikt nie będzie ich pamiętał, a jedno „musisz zapłacić” w tekście z grupy
 * podatkowej to problem prawny, nie literówka.
 */

const DIR = 'content/flo';

function read(kind: string): string {
  return readFileSync(join(DIR, `${kind}.md`), 'utf8');
}

/**
 * Zdania, które agent naprawdę wypowie — czyli wszystko przed sekcją
 * „## Przyciski”, bez nagłówków, wypunktowań i linijki opisowej z numerem
 * funkcji. Komentarz redakcyjny („## Zasady…”) świadomie pomijamy: tam wolno
 * pisać o cyfrach i cytować to, czego robić NIE wolno.
 */
function agentText(markdown: string): string {
  const cut = markdown.indexOf('## Przyciski');
  const head = cut === -1 ? markdown : markdown.slice(0, cut);

  return head
    .split('\n')
    .filter(
      (line) =>
        !line.startsWith('#') &&
        !line.startsWith('Grupa ') &&
        !line.startsWith('- ') &&
        !line.startsWith('|'),
    )
    .join('\n');
}

const BLOCKED = (markdown: string) => markdown.includes('STATUS: ZABLOKOWANE');

describe('pliki treści', () => {
  it('każdy rodzaj propozycji ma swój plik', () => {
    const files = readdirSync(DIR)
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace('.md', ''));

    for (const kind of FLO_PROPOSAL_KINDS) {
      expect(files, `brak treści dla ${kind}`).toContain(kind);
    }
  });

  it('każdy plik ma tytuł i treść albo jasno mówi, że jest zablokowany', () => {
    for (const kind of FLO_PROPOSAL_KINDS) {
      const markdown = read(kind);
      if (BLOCKED(markdown)) continue;

      expect(markdown, `${kind}: brak tytułu`).toContain('## Tytuł');
      expect(markdown, `${kind}: brak treści`).toContain('## Treść');
      expect(markdown, `${kind}: brak przycisków`).toContain('## Przyciski');
    }
  });

  it('głos agenta i lista dla prawnika istnieją', () => {
    expect(readFileSync(join(DIR, 'GLOS.md'), 'utf8').length).toBeGreaterThan(
      1000,
    );
    expect(
      readFileSync(join(DIR, 'DO-AKCEPTACJI-PRAWNIKA.md'), 'utf8'),
    ).toContain('tax.simulate');
  });
});

describe('ton — reguły z części II.5 planu', () => {
  it('ani jednej cyfry w tekście agenta — liczby wchodzą przez placeholdery', () => {
    for (const kind of FLO_PROPOSAL_KINDS) {
      const text = agentText(read(kind));
      const digits = text.match(/\d/g) ?? [];

      expect(digits, `${kind}: cyfra w tekście agenta`).toEqual([]);
    }
  });

  it('żadnych wykrzykników', () => {
    for (const kind of FLO_PROPOSAL_KINDS) {
      expect(agentText(read(kind)), `${kind}: wykrzyknik`).not.toContain('!');
    }
  });

  it('placeholdery mają jedyną dozwoloną postać', () => {
    for (const kind of FLO_PROPOSAL_KINDS) {
      const text = agentText(read(kind));
      // Wycinamy poprawne `{{nazwa}}` i patrzymy, czy została jakaś klamra.
      // Pojedyncza klamra albo spacja w środku nie przejdzie przez
      // `renderTemplate` w silniku — lepiej złapać to tutaj niż u klienta.
      const bad = text.replace(/\{\{\w+\}\}/g, '').match(/[{}]/g) ?? [];
      expect(bad, `${kind}: zły placeholder`).toEqual([]);
    }
  });
});

describe('zdania obowiązkowe', () => {
  it('każdy ton ponaglenia ratuje kontrahenta, który właśnie zapłacił', () => {
    const chase = read('payment.chase');
    const tones = chase.split('### ').slice(1);

    expect(tones.length).toBeGreaterThanOrEqual(3);
    for (const tone of tones) {
      expect(
        tone.toLowerCase(),
        'ton ponaglenia bez zdania o nieaktualności',
      ).toContain('jeśli płatność już wyszła');
    }
  });

  it('grupa podatkowa nie wydaje poleceń', () => {
    const taxKinds = FLO_PROPOSAL_KINDS.filter((k) => k.startsWith('tax.'));
    expect(taxKinds.length).toBeGreaterThan(0);

    for (const kind of taxKinds) {
      const text = agentText(read(kind)).toLowerCase();

      expect(text, `${kind}: rozkaz zamiast informacji`).not.toMatch(
        /\bmusisz\b|\bpowinieneś\b|\bzapłać\b/,
      );
    }
  });

  it('termin podatkowy mówi wprost, że to nie jest deklaracja', () => {
    expect(read('tax.deadline')).toContain('to nie jest deklaracja podatkowa');
  });

  it('szkic faktury nigdy nie zarzuca zapomnienia', () => {
    expect(agentText(read('invoice.draft')).toLowerCase()).not.toContain(
      'zapomnia',
    );
  });

  it('podwyżka stawki ma etykietę „pokaż treść”, nie „wyślij”', () => {
    const raise = read('invoice.raise');
    expect(raise).toContain('główny: Pokaż treść');
  });

  it('paczka do księgowej obiecuje, że sama nie wyjdzie', () => {
    expect(read('accountant.package')).toContain('sam tego nie wyślę');
  });

  it('symulacja podatkowa pozostaje zablokowana do opinii prawnej', () => {
    expect(read('tax.simulate')).toContain('STATUS: ZABLOKOWANE');
  });
});
