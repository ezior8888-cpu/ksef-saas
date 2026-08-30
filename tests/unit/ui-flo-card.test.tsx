import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { FloProposalCard } from '@/components/flo/proposal-card';
import { FLO_FIXTURES } from '@/lib/flo/fixtures';
import { FLO_CARD_VARIANTS } from '@/types/flo';

/**
 * Karta bazowa agenta (krok 3 toru B).
 *
 * Warunek z planu brzmi: karta renderuje się dla WSZYSTKICH atrap bez
 * błędów, łącznie z przypadkami brzegowymi. Renderujemy więc komplet
 * `FLO_FIXTURES` do napisu i sprawdzamy, co z tego wyszło.
 *
 * Czego ten test nie łapie: stanu po zamontowaniu (odliczanie, wygasła
 * karta). To wymaga przeglądarki i wejdzie testem e2e — `useNow` celowo
 * zwraca `null` przed montażem, żeby nie było rozjazdu hydratacji.
 */

function html(index: number): string {
  return renderToStaticMarkup(<FloProposalCard view={FLO_FIXTURES[index]!} />);
}

describe('FloProposalCard — karta bazowa', () => {
  it('renderuje każdą atrapę i pokazuje jej treść', () => {
    FLO_FIXTURES.forEach((fixture, index) => {
      const markup = html(index);

      expect(markup).toContain(fixture.title.slice(0, 40));
      expect(markup).toContain(fixture.body.slice(0, 40));
    });
  });

  it('obsługuje wszystkie sześć wariantów', () => {
    const covered = new Set(FLO_FIXTURES.map((f) => f.variant));
    expect([...covered].sort()).toEqual([...FLO_CARD_VARIANTS].sort());

    // Wszystkie sześć gałęzi musi coś zwrócić — brak `default` w switchu
    // znaczy, że siódmy wariant zatrzyma kompilację, a nie wywali ekran.
    FLO_FIXTURES.forEach((_, index) => {
      expect(html(index).length).toBeGreaterThan(0);
    });
  });

  it('pokazuje etykiety akcji przysłane przez serwer, bez własnych', () => {
    FLO_FIXTURES.forEach((fixture, index) => {
      const markup = html(index);

      expect(markup).toContain(fixture.primary.label);
      for (const action of fixture.secondary) {
        expect(markup).toContain(action.label);
      }
    });
  });

  it('bez wpiętej obsługi przyciski są nieczynne, a nie udają działających', () => {
    expect(html(0)).toMatch(/<button[^>]*disabled/);
  });

  it('akcja wymagająca podglądu jest zablokowana', () => {
    const index = FLO_FIXTURES.findIndex(
      (f) => f.primary.requiresPreview === true,
    );
    expect(index).toBeGreaterThanOrEqual(0);

    expect(html(index)).toContain('Najpierw otwórz podgląd');
  });

  it('przed zamontowaniem nie ma odliczania — inaczej byłby rozjazd hydratacji', () => {
    const markup = html(0);
    expect(markup).not.toMatch(/zostal|został|zostały|zostało|termin minął/);
  });

  it('nigdzie nie ma trybu ani poziomu samodzielności', () => {
    FLO_FIXTURES.forEach((_, index) => {
      expect(html(index)).not.toMatch(/TRYB|Tryb \d|poziom \d/i);
    });
  });

  it('radzi sobie z przypadkami brzegowymi z atrap', () => {
    const long = FLO_FIXTURES.find((f) => f.title.length >= 110);
    const noEvidence = FLO_FIXTURES.find((f) => f.evidence.length === 0);

    expect(long).toBeDefined();
    expect(noEvidence).toBeDefined();

    for (const fixture of [long!, noEvidence!]) {
      const markup = renderToStaticMarkup(<FloProposalCard view={fixture} />);
      expect(markup).toContain('break-words');
    }
  });
});
