import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { FloProposalCard } from '@/components/flo/proposal-card';
import { countLabel, FLO_FORMS } from '@/components/flo/format';
import { FLO_FIXTURES } from '@/lib/flo/fixtures';
import type { FloProposalView } from '@/types/flo';

/**
 * Sześć wariantów karty (kroki 5–10 toru B).
 *
 * Renderujemy je do napisu w stanie początkowym — czyli dokładnie w tym,
 * w którym klient je zastaje. Zachowanie po kliknięciu (otwarcie podglądu,
 * zaznaczanie, potwierdzanie adresu) sprawdzają testy reguł w
 * `ui-flo-gating.test.ts` i e2e; tutaj chodzi o to, co widać na wejściu.
 */

function fixture(id: string): FloProposalView {
  const found = FLO_FIXTURES.find((f) => f.id === id);
  if (!found) throw new Error(`brak atrapy ${id}`);
  return found;
}

/**
 * Renderujemy Z WPIĘTĄ obsługą akcji. To nie jest szczegół: bez `onAction`
 * wszystkie przyciski są nieczynne z innego powodu, więc asercja „przycisk
 * wysyłki jest zablokowany” przechodziłaby nawet wtedy, gdyby blokada
 * podglądu w ogóle nie istniała. Sprawdzone przez tymczasowe wyłączenie
 * `primaryLock` — test wtedy padał, i o to chodzi.
 */
function render(id: string): string {
  return renderToStaticMarkup(
    <FloProposalCard view={fixture(id)} onAction={() => {}} />,
  );
}

/** Klasa tła przycisku głównego — po niej poznajemy „wezwanie do działania”. */
const CTA = 'bg-[var(--ff-cta-bg)]';

describe('wariant info (krok 5)', () => {
  const html = render('fx-info-ksef');

  it('nie ma przycisku w kolorze wezwania do działania', () => {
    expect(html).toContain('data-variant="info"');
    expect(html).not.toContain(CTA);
  });

  it('pokazuje obie akcje: podejrzenie źródła i ukrycie', () => {
    expect(html).toContain('Pokaż fakturę');
    expect(html).toContain('Ukryj');
  });
});

describe('wariant single (krok 6)', () => {
  const html = render('fx-single-expense');

  it('ma wyraźny przycisk główny i ciche akcje drugorzędne', () => {
    expect(html).toContain(CTA);
    expect(html).toContain('Zgadza się');
  });
});

describe('wariant preview (krok 7)', () => {
  const html = render('fx-preview-chase');

  it('przycisk wysyłki jest zablokowany do czasu otwarcia podglądu', () => {
    expect(html).toMatch(/Pokaż podgląd/);
    expect(html).toMatch(/<button[^>]*\sdisabled=""[^>]*>Wyślij wiadomość/);
  });

  it('mówi wprost, dlaczego jest zablokowany', () => {
    expect(html).toContain('Najpierw otwórz podgląd');
  });

  it('nie zmienia etykiety przysłanej przez serwer', () => {
    expect(html).toContain('Wyślij wiadomość');
  });
});

describe('wariant choice (krok 8)', () => {
  const html = render('fx-choice-payment');

  it('pokazuje wszystkie odpowiedzi, w tym tę z polem kwoty', () => {
    expect(html).toContain('Tak, zapłacił');
    expect(html).toContain('Jeszcze nie');
    expect(html).toContain('Częściowo');
  });

  it('pole kwoty jest zwinięte, dopóki klient nie wybierze tej odpowiedzi', () => {
    expect(html).not.toContain('Ile wpłynęło?');
  });
});

describe('wariant list (krok 9)', () => {
  const view = fixture('fx-list-batch');
  const items = view.items ?? [];
  const risky = items.filter((i) => i.needsPreview);
  const preselected = items.filter((i) => i.preselected);
  const html = render('fx-list-batch');

  it('atrapa jest tym, czym ma być: paczka z pozycjami odstającymi', () => {
    expect(items).toHaveLength(10);
    expect(risky).toHaveLength(3);
  });

  it('pozycje odstające mają wyłączone pole wyboru', () => {
    // `disabled=""` to atrybut; samo słowo „disabled” siedzi też w klasach
    // Tailwinda (`disabled:cursor-not-allowed`), więc szukamy atrybutu.
    const disabled = html.match(/type="checkbox"[^>]*\sdisabled=""/g) ?? [];
    expect(disabled).toHaveLength(risky.length);
  });

  it('pozycje zwykłe są zaznaczone od razu, odstające nie', () => {
    const checked = html.match(/type="checkbox"[^>]*\schecked=""/g) ?? [];
    expect(checked).toHaveLength(preselected.length);
  });

  it('licznik zaznaczonych startuje od tego, co przysłał serwer', () => {
    expect(html).toContain(
      `Zaznaczone: ${countLabel(preselected.length, FLO_FORMS.pozycja)} z ${items.length}`,
    );
  });

  it('przycisk główny łączy słowa serwera z naszą liczbą', () => {
    expect(html).toContain(
      `${view.primary.label} · ${countLabel(preselected.length, FLO_FORMS.pozycja)}`,
    );
  });

  it('nie liczy pieniędzy — kwoty tylko przepisuje', () => {
    for (const item of items) {
      expect(html).toContain(item.amount);
    }
  });
});

describe('wariant input (krok 10)', () => {
  const html = render('fx-input-accountant');

  it('pyta o dokładnie tę daną, o którą prosi serwer', () => {
    expect(html).toContain('Adres e-mail księgowej');
    expect(html).toContain('type="email"');
  });

  it('wysyłka jest zablokowana, dopóki nie ma adresu', () => {
    expect(html).toMatch(/<button[^>]*\sdisabled=""[^>]*>Wyślij paczkę/);
  });

  it('pozwala zajrzeć do paczki przed wysłaniem', () => {
    expect(html).toContain('Pokaż, co jest w środku');
  });
});
