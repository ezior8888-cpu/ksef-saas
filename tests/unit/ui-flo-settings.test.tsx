import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { SilencedEntry } from '@/lib/flo/silenced';
import type { FloPrefs } from '@/types/flo';

/**
 * Ustawienia agenta (krok 21 toru B).
 *
 * Ten ekran ma pilnować JEDNEJ rzeczy ponad wygląd: że nie da się tu ustawić
 * niczego, co zmieniałoby zachowanie agenta. Żadnego poziomu samodzielności,
 * żadnego „wysyłaj automatycznie”. Test stoi na straży tej granicy, bo za pół
 * roku nikt nie będzie pamiętał, dlaczego jej nie ma.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/app/actions/flo', () => ({
  savePrefs: async () => {},
  restoreSilenced: async () => {},
}));

const { FloSettingsForm } = await import(
  '@/app/(dashboard)/settings/flo/_components/flo-settings-form'
);

const PREFS: FloPrefs = {
  pushEnabled: true,
  emailEnabled: false,
  quietFrom: '21:00',
  quietTo: '07:30',
  mutedKinds: [],
  taxProfile: null,
};

/**
 * Wyciszenia idą z pamięci decyzji, nie z ustawień — dwa poziomy: cały
 * rodzaj i pojedyncza sprawa, podpisana tytułem ostatniej karty.
 */
const SILENCED: SilencedEntry[] = [
  {
    key: 'payment.chase',
    kind: 'payment.chase',
    wholeKind: true,
    label: 'Ponaglenia o płatność',
    kindLabel: 'Ponaglenia o płatność',
    mutedUntil: '2026-12-21T10:00:00.000Z',
  },
  {
    key: 'payment.confirm:inv-5',
    kind: 'payment.confirm',
    wholeKind: false,
    label: 'Nowak zapłacił za fakturę 5/2026?',
    kindLabel: 'Pytania „czy zapłacił?”',
    mutedUntil: '2026-12-21T10:00:00.000Z',
  },
];

function render(prefs: FloPrefs = PREFS, silenced: SilencedEntry[] = SILENCED) {
  return renderToStaticMarkup(
    <FloSettingsForm prefs={prefs} silenced={silenced} />,
  );
}

describe('FloSettingsForm', () => {
  it('ma cztery rzeczy: push, mail, ciszę nocną, wyciszone sprawy', () => {
    const html = render();

    expect(html).toContain('Powiadomienia w telefonie');
    expect(html).toContain('Powiadomienia mailem');
    expect(html).toContain('Cisza nocna');
    expect(html).toContain('Wyciszone sprawy');
  });

  it('pokazuje stan przysłany z serwera', () => {
    const html = render();

    expect(html).toMatch(/id="flo-push"[^>]*checked=""/);
    expect(html).not.toMatch(/id="flo-email"[^>]*checked=""/);
    expect(html).toContain('value="21:00"');
    expect(html).toContain('value="07:30"');
  });

  it('wyciszone sprawy są opisane po ludzku, nie kluczem z bazy', () => {
    const html = render();

    expect(html).toContain('Ponaglenia o płatność');
    // Pojedyncza sprawa: tytuł ostatniej karty, nie „payment.confirm:inv-5".
    expect(html).toContain('Nowak zapłacił za fakturę 5/2026?');
    expect(html).not.toContain('payment.chase');
    expect(html).not.toContain('inv-5');
    expect(html).toContain('Przywróć');
  });

  it('widać, czy cisza dotyczy jednej sprawy, czy całego rodzaju — i do kiedy', () => {
    // Bez tego „Nowak zapłacił za fakturę 5/2026?" na liście niczego nie
    // tłumaczy, a cisza wygląda na wieczną.
    const html = render();

    expect(html).toContain('Cały rodzaj —');
    expect(html).toContain('Pytania „czy zapłacił?”');
    expect(html).toContain('21 grudnia');
  });

  it('brak wyciszeń tłumaczy, skąd się one biorą', () => {
    const html = render(PREFS, []);

    expect(html).toContain('Nic nie jest wyciszone');
    expect(html).toContain('w tej samej sprawie');
    expect(html).toContain('Nigdy więcej takich');
  });

  it('NIE MA poziomu samodzielności ani wysyłki automatycznej', () => {
    const html = render();

    expect(html).not.toMatch(/tryb|poziom|autonomi|suwak/i);
    expect(html).not.toMatch(/automatyczn/i);
  });

  it('mówi wprost, że pytanie przed wysyłką nie jest opcją', () => {
    expect(render()).toContain('tego nie da się wyłączyć');
  });
});
