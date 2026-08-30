import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

/**
 * Ekran agenta w całości (kroki 4, 15–20 toru B).
 *
 * Ekran woła teraz prawdziwe akcje serwerowe, więc w teście podstawiamy dwie
 * rzeczy: router Next (poza aplikacją nie istnieje) i moduł akcji (jest
 * `'use server'` i ciągnie za sobą pół backendu). Podstawiamy JE, a nie
 * komponenty — sprawdzamy prawdziwy ekran, nie jego atrapę.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

vi.mock('@/app/actions/flo', () => ({
  approveProposal: async () => ({ ok: true }),
  dismissProposal: async () => {},
  undoAction: async () => ({ ok: true }),
  cancelScheduled: async () => {},
}));

const { FloScreen } = await import(
  '@/app/(dashboard)/flo/_components/flo-screen'
);
const { FLO_FIXTURES, FLO_SCHEDULED_FIXTURES } = await import(
  '@/lib/flo/fixtures'
);

function render() {
  return renderToStaticMarkup(
    <FloScreen
      proposals={[...FLO_FIXTURES]}
      scheduled={[...FLO_SCHEDULED_FIXTURES]}
      usingFixtures
    />,
  );
}

describe('FloScreen — ekran agenta', () => {
  it('rysuje wszystkie propozycje', () => {
    const html = render();

    for (const proposal of FLO_FIXTURES) {
      expect(html).toContain(proposal.title.slice(0, 40));
    }
  });

  it('panel zatwierdzonych nazywa się tym, czym jest, i pokazuje ślad zgody', () => {
    const html = render();

    expect(html).toContain('ZATWIERDZONE — CZEKA NA WYKONANIE');
    for (const item of FLO_SCHEDULED_FIXTURES) {
      expect(html).toContain(item.label);
      // Bez tego przy reklamacji „ja tego nie wysyłałem” nie ma czego pokazać.
      expect(html).toContain(item.approvedAtLabel);
    }
  });

  it('odznaka zadań jest odmieniona przez liczebnik', () => {
    expect(render()).toMatch(/\d+ (zadanie|zadania|zadań) dziś/);
  });

  it('nigdzie nie ma trybu ani poziomu samodzielności agenta', () => {
    expect(render()).not.toMatch(/TRYB|Tryb \d|poziom \d/i);
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
  });

  it('każda karta ma rozwijane „dlaczego to widzę”, gdy są dowody', () => {
    const html = render();
    const withEvidence = FLO_FIXTURES.filter((f) => f.evidence.length > 0);

    const found = html.match(/Dlaczego to widzę/g) ?? [];
    expect(found).toHaveLength(withEvidence.length);
  });

  it('karta z czynnością zrobioną samodzielnie zapowiada cofnięcie', () => {
    // Pasek cofnięcia liczy czas, więc rysuje się dopiero po zamontowaniu —
    // w renderze serwerowym ma go NIE być. Inaczej byłby rozjazd hydratacji.
    const undoable = FLO_FIXTURES.filter((f) => f.undoableUntil);
    expect(undoable.length).toBeGreaterThan(0);
    expect(render()).not.toContain('Zrobiłem to za Ciebie');
  });
});
