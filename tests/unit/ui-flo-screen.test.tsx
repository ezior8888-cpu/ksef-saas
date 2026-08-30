import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { FloScreen } from '@/app/(dashboard)/flo/_components/flo-screen';
import { FLO_FIXTURES, FLO_SCHEDULED_FIXTURES } from '@/lib/flo/fixtures';

/**
 * Dymny test szkieletu ekranu agenta (krok 2 toru B).
 *
 * Ekran jest w całości komponentem serwerowym bez stanu i bez pobierania
 * danych, więc da się go wyrenderować do napisu i sprawdzić bez przeglądarki.
 * Test pilnuje trzech rzeczy, na których taki ekran zwykle pada: że komplet
 * atrap w ogóle się rysuje, że odznaka odmienia się przez liczebnik i że
 * nie wróciło „TRYB”.
 */

function render() {
  return renderToStaticMarkup(
    <FloScreen
      proposals={FLO_FIXTURES}
      scheduled={FLO_SCHEDULED_FIXTURES}
      usingFixtures
    />,
  );
}

describe('FloScreen — szkielet ekranu agenta', () => {
  it('rysuje wszystkie atrapy propozycji', () => {
    const html = render();

    for (const proposal of FLO_FIXTURES) {
      expect(html).toContain(proposal.title.slice(0, 40));
    }
  });

  it('pokazuje kolejkę zatwierdzonych razem ze śladem zgody', () => {
    const html = render();

    for (const item of FLO_SCHEDULED_FIXTURES) {
      expect(html).toContain(item.label);
      // Ślad zgody jest obowiązkowy — bez niego panel łamie swój inwariant.
      expect(html).toContain(item.approvedAtLabel);
    }
  });

  it('odznaka zadań jest odmieniona przez liczebnik', () => {
    const html = render();
    expect(html).toMatch(/\d+ (zadanie|zadania|zadań) dziś/);
  });

  it('nigdzie nie ma trybu ani poziomu samodzielności agenta', () => {
    const html = render();
    expect(html).not.toMatch(/TRYB|Tryb \d|poziom \d/i);
  });

  it('pole rozmowy jest wyłączone, a nie udaje działającego', () => {
    const html = render();
    expect(html).toContain('id="flo-composer"');
    expect(html).toMatch(/id="flo-composer"[^>]*disabled/);
  });

  it('pas rozmowy ma mikrofon i aparat z makiety — oba nieczynne', () => {
    const html = render();

    expect(html).toContain('Nagraj wiadomość (jeszcze nieczynne)');
    expect(html).toContain('Zrób zdjęcie paragonu (jeszcze nieczynne)');
    // Żaden z nich nie może być klikalny, dopóki nic za nim nie stoi.
    expect(html.match(/<button[^>]*disabled/g)?.length ?? 0).toBeGreaterThan(1);
  });
});
