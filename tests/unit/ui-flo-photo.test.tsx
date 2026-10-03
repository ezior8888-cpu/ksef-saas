import { JSDOM } from 'jsdom';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Ścieżka paragonu z telefonu (krok 22 toru B).
 *
 * Klient udostępnia zdjęcie i ląduje w wątku agenta. Sprawdzamy, co zastaje
 * w każdym z czterech przypadków — bo to te kilkanaście sekund decyduje, czy
 * skorzysta z tej drogi drugi raz.
 */

let search = new URLSearchParams();

// Jeden obiekt routera na cały test, jak w Next: nowy obiekt w każdym
// renderze restartowałby odpytywanie i test mierzyłby atrapę, nie pasek.
const router = vi.hoisted(() => ({
  refresh: vi.fn(),
  push: () => {},
  replace: () => {},
}));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => search,
}));

const { FloPhotoBanner, photoBannerMessage, photoBannerResult } = await import(
  '@/components/flo/flo-photo-banner'
);

const FAILED_SENTENCE = 'Nie odczytałem tego paragonu';

function render(
  params: string,
  latestExpenseAt: string | null = null,
  failedOcrJobIds?: string[],
) {
  search = new URLSearchParams(params);
  return renderToStaticMarkup(
    <FloPhotoBanner
      latestExpenseAt={latestExpenseAt}
      failedOcrJobIds={failedOcrJobIds}
    />,
  );
}

afterEach(() => {
  search = new URLSearchParams();
  router.refresh.mockClear();
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

  it('porażkę odczytu mówi wprost i nie twierdzi, że paragon odczytano', () => {
    const html = render('paragon=job-1', null, ['job-1']);

    expect(html).toContain(FAILED_SENTENCE);
    // Zdjęcie jest bezpieczne, a droga wyjścia czeka w karcie silnika.
    expect(html).toContain('Zdjęcie zostało w archiwum, nic nie przepadło');
    expect(html).toContain('w karcie poniżej');
    expect(html).not.toContain('odczytany');
    expect(html).not.toContain('Mam Twoje zdjęcie');
  });

  it('porażka innego zdjęcia nie dotyczy paragonu z adresu', () => {
    const html = render('paragon=job-1', null, ['job-2']);

    expect(html).toContain('Mam Twoje zdjęcie');
    expect(html).not.toContain(FAILED_SENTENCE);
  });

  it('mówi spokojnym tonem, bez wykrzykników i bez słowa „błąd”', () => {
    const cases: Array<[string, string[]]> = [
      ['paragon=job-1', []],
      ['paragon=blad', []],
      ['paragon=brak-zdjecia', []],
      ['paragon=job-1', ['job-1']],
    ];
    for (const [params, failed] of cases) {
      const html = render(params, null, failed);
      expect(html).not.toContain('!');
      expect(html).not.toMatch(/błąd|awaria/i);
    }

    // Zdania, które pojawiają się dopiero po zamontowaniu (czas), też.
    for (const result of ['failed', 'read', null] as const) {
      for (const slow of [false, true]) {
        const message = photoBannerMessage({ paragon: 'job-1', result, slow });
        expect(message).not.toContain('!');
        expect(message).not.toMatch(/błąd|awaria/i);
      }
    }
  });
});

describe('FloPhotoBanner — wybór zdania', () => {
  const STARTED = Date.parse('2026-08-26T12:00:00.000Z');

  it('porażka nie zależy od czasu — ten sam wynik na serwerze i w przeglądarce', () => {
    for (const startedAt of [null, STARTED]) {
      expect(
        photoBannerResult({
          paragon: 'job-1',
          failedOcrJobIds: ['job-1'],
          latestExpenseAt: null,
          startedAt,
        }),
      ).toBe('failed');
    }
  });

  it('porażka wygrywa z kosztem, który doszedł w tym samym czasie', () => {
    expect(
      photoBannerResult({
        paragon: 'job-1',
        failedOcrJobIds: ['job-1'],
        latestExpenseAt: '2026-08-26T12:00:10.000Z',
        startedAt: STARTED,
      }),
    ).toBe('failed');
  });

  it('koszt młodszy niż wejście na ekran to odczyt udany', () => {
    expect(
      photoBannerResult({
        paragon: 'job-1',
        failedOcrJobIds: ['job-2'],
        latestExpenseAt: '2026-08-26T12:00:10.000Z',
        startedAt: STARTED,
      }),
    ).toBe('read');
  });

  it('stary koszt z wątku nie udaje odczytu nowego paragonu', () => {
    expect(
      photoBannerResult({
        paragon: 'job-1',
        failedOcrJobIds: [],
        latestExpenseAt: '2026-08-26T11:00:00.000Z',
        startedAt: STARTED,
      }),
    ).toBeNull();
  });

  it('porażka ma pierwszeństwo przed „dłużej niż zwykle”', () => {
    const message = photoBannerMessage({
      paragon: 'job-1',
      result: 'failed',
      slow: true,
    });

    expect(message).toContain(FAILED_SENTENCE);
    expect(message).not.toContain('dłużej niż zwykle');
  });

  it('odczyt udany ma pierwszeństwo przed „dłużej niż zwykle”', () => {
    expect(
      photoBannerMessage({ paragon: 'job-1', result: 'read', slow: true }),
    ).toContain('Paragon odczytany');
  });

  it('bez wyniku po trzech minutach mówi, że trwa to dłużej', () => {
    expect(
      photoBannerMessage({ paragon: 'job-1', result: null, slow: true }),
    ).toContain('dłużej niż zwykle');
  });
});

describe('FloPhotoBanner — odpytywanie w przeglądarce', () => {
  // Prawdziwe renderowanie z efektami: odpytywanie żyje w `useEffect`, więc
  // render serwerowy go nie widzi.
  let dom: JSDOM;
  let root: Root;
  let container: HTMLDivElement;

  function mount(props: {
    latestExpenseAt?: string | null;
    failedOcrJobIds?: string[];
  }) {
    act(() =>
      root.render(
        <FloPhotoBanner
          latestExpenseAt={props.latestExpenseAt ?? null}
          failedOcrJobIds={props.failedOcrJobIds}
        />,
      ),
    );
  }

  function advance(ms: number) {
    act(() => vi.advanceTimersByTime(ms));
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-26T12:00:00.000Z'));
    dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://app.example.test/flo?paragon=job-1',
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    search = new URLSearchParams('paragon=job-1');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('bez wyniku odświeża wątek co 15 s', () => {
    mount({});
    advance(15_000);
    expect(router.refresh).toHaveBeenCalledTimes(1);
    advance(15_000);
    expect(router.refresh).toHaveBeenCalledTimes(2);
  });

  it('po porażce nie odświeża i mówi o niej wprost', () => {
    mount({ failedOcrJobIds: ['job-1'] });
    advance(60_000);

    expect(router.refresh).not.toHaveBeenCalled();
    expect(container.textContent).toContain(FAILED_SENTENCE);
  });

  it('po odczycie nie odświeża', () => {
    mount({ latestExpenseAt: '2026-08-26T12:00:05.000Z' });
    advance(60_000);

    expect(router.refresh).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Paragon odczytany');
  });

  it('gdy karta porażki dojdzie w trakcie, odświeżanie staje', () => {
    mount({});
    advance(15_000);
    expect(router.refresh).toHaveBeenCalledTimes(1);

    mount({ failedOcrJobIds: ['job-1'] });
    advance(60_000);

    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(container.textContent).toContain(FAILED_SENTENCE);
  });
});
