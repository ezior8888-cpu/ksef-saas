import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Ścieżka paragonu z telefonu (krok 22 toru B).
 *
 * Klient udostępnia zdjęcie i ląduje w wątku agenta. Sprawdzamy, co zastaje
 * w każdym z czterech przypadków — bo to te kilkanaście sekund decyduje, czy
 * skorzysta z tej drogi drugi raz.
 */

let search = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => search,
}));

const { FloPhotoBanner } = await import(
  '@/app/(dashboard)/flo/_components/flo-photo-banner'
);

function render(params: string, latestExpenseAt: string | null = null) {
  search = new URLSearchParams(params);
  return renderToStaticMarkup(
    <FloPhotoBanner latestExpenseAt={latestExpenseAt} />,
  );
}

afterEach(() => {
  search = new URLSearchParams();
});

describe('FloPhotoBanner', () => {
  it('bez zdjęcia w adresie nie ma paska', () => {
    expect(render('')).toBe('');
  });

  it('po udostępnieniu zdjęcia mówi, że je ma i czyta', () => {
    const html = render('paragon=job-1');

    expect(html).toContain('Mam Twoje zdjęcie');
    expect(html).toContain('Czytam paragon');
  });

  it('gdy zdjęcie nie doszło, proponuje wyjście zamiast samego błędu', () => {
    const html = render('paragon=blad');

    expect(html).toContain('Nic nie zginęło');
    expect(html).toContain('Wydatkach');
  });

  it('pusty plik dostaje własne zdanie, nie ogólne „coś poszło nie tak”', () => {
    expect(render('paragon=brak-zdjecia')).toContain('Nie dostałem zdjęcia');
  });

  it('mówi spokojnym tonem, bez wykrzykników i bez słowa „błąd”', () => {
    for (const params of ['paragon=job-1', 'paragon=blad', 'paragon=brak-zdjecia']) {
      const html = render(params);
      expect(html).not.toContain('!');
      expect(html).not.toMatch(/błąd|awaria/i);
    }
  });
});
