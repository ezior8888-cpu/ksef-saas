import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { FloMilestoneShare } from '@/components/flo/wrapped/milestone-share';
import {
  buildShareSvg,
  SHARE_HEIGHT,
  SHARE_WIDTH,
} from '@/components/flo/wrapped/share-image';
import { FloWrappedDeck } from '@/components/flo/wrapped/wrapped-deck';
import type { WrappedResult } from '@/lib/flo/wrapped';

/**
 * Podsumowanie roku i progi pieniężne (kroki 37–38 toru B).
 *
 * Najważniejsze w tych testach nie jest to, czy ekran ładnie wygląda, tylko
 * czy nie da się zapisać do galerii czegoś, czego klient nie widział — bo
 * ten obraz ląduje w mediach społecznościowych razem z nazwami jego klientów.
 */

const MASKED: WrappedResult = {
  year: 2026,
  variant: 'growth',
  namesRevealed: false,
  screens: [
    {
      key: 'total_invoiced',
      label: 'Zafakturowane',
      value: '482 300,00 zł',
      caption: 'Tyle wystawiłeś w tym roku.',
    },
    {
      key: 'biggest_client',
      label: 'Największy klient',
      value: 'Twój największy klient',
      caption: 'U niego zafakturowałeś najwięcej.',
    },
  ],
};

const REVEALED: WrappedResult = {
  ...MASKED,
  namesRevealed: true,
  screens: [
    MASKED.screens[0]!,
    { ...MASKED.screens[1]!, value: 'ACME Sp. z o.o.' },
  ],
};

describe('obraz do zapisania', () => {
  it('ma format pionowy 9:16', () => {
    expect(SHARE_WIDTH / SHARE_HEIGHT).toBeCloseTo(9 / 16, 3);
  });

  it('niesie dokładnie to, co dostał', () => {
    const svg = buildShareSvg({
      label: 'Zafakturowane',
      value: '482 300,00 zł',
      caption: 'Tyle wystawiłeś w tym roku.',
      footer: 'FaktFlow · 2026',
    });

    expect(svg).toContain('482 300,00 zł');
    expect(svg).toContain('Tyle wystawiłeś w tym roku.');
    expect(svg).toContain('FaktFlow · 2026');
    expect(svg).toContain('ZAFAKTUROWANE');
  });

  it('bez nagłówka po prostu go nie rysuje', () => {
    const svg = buildShareSvg({
      value: 'Przekroczyłeś sto opłaconych faktur',
      caption: 'Od założenia konta.',
      footer: 'FaktFlow',
    });

    expect(svg).not.toContain('letter-spacing="6"');
  });

  it('długie zdanie łamie na dwa wiersze zamiast zmniejszać do nieczytelności', () => {
    const svg = buildShareSvg({
      value: 'Przekroczyłeś sto opłaconych faktur',
      caption: 'Od założenia konta.',
      footer: 'FaktFlow',
    });

    const lines = svg.match(/font-weight="700"/g) ?? [];
    expect(lines).toHaveLength(2);
  });

  it('znaki specjalne nie rozwalają obrazu', () => {
    const svg = buildShareSvg({
      value: 'Kowalski & Synowie',
      caption: '<script>alert(1)</script>',
      footer: 'FaktFlow',
    });

    expect(svg).toContain('Kowalski &amp; Synowie');
    expect(svg).not.toContain('<script>');
  });
});

describe('FloWrappedDeck', () => {
  const html = renderToStaticMarkup(
    <FloWrappedDeck masked={MASKED} revealed={REVEALED} />,
  );

  it('wyjście jest widoczne od pierwszego ekranu', () => {
    expect(html).toContain('Nie chcę tego oglądać');
  });

  it('startuje od pierwszego ekranu z zasłoniętymi nazwami', () => {
    expect(html).toContain('482 300,00 zł');
    expect(html).not.toContain('ACME Sp. z o.o.');
  });

  it('zapis jest zablokowany, dopóki klient nie zobaczy podglądu', () => {
    expect(html).toMatch(/<button[^>]*\sdisabled=""[^>]*>Zapisz obraz/);
    expect(html).toContain('Pokaż, co się zapisze');
  });

  it('mówi, dlaczego nazwy są domyślnie zasłonięte', () => {
    expect(html).toContain('nie zgadzał się');
  });

  it('pozwala ukryć kwoty przed zapisaniem', () => {
    expect(html).toContain('Pokaż kwoty');
  });
});

describe('FloMilestoneShare', () => {
  const html = renderToStaticMarkup(
    <FloMilestoneShare
      title="Przekroczyłeś sto opłaconych faktur"
      body="Od założenia konta wpłynęło do Ciebie sto dwadzieścia tysięcy złotych."
    />,
  );

  it('zapis czeka na podgląd', () => {
    expect(html).toMatch(/<button[^>]*\sdisabled=""[^>]*>Zapisz obraz/);
  });

  it('bez fanfar — ani jednego wykrzyknika', () => {
    expect(html).not.toContain('!');
  });
});
