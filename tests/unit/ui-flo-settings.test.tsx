import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

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
}));

const { FloSettingsForm } = await import(
  '@/app/(dashboard)/settings/flo/_components/flo-settings-form'
);

const PREFS: FloPrefs = {
  pushEnabled: true,
  emailEnabled: false,
  quietFrom: '21:00',
  quietTo: '07:30',
  mutedKinds: ['payment.chase', 'tax.relief'],
  taxProfile: null,
};

function render(prefs: FloPrefs = PREFS) {
  return renderToStaticMarkup(<FloSettingsForm prefs={prefs} />);
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
    expect(html).toContain('Ulgi i odliczenia');
    expect(html).not.toContain('payment.chase');
    expect(html).toContain('Przywróć');
  });

  it('brak wyciszeń tłumaczy, skąd się one biorą', () => {
    const html = render({ ...PREFS, mutedKinds: [] });

    expect(html).toContain('Nic nie jest wyciszone');
    expect(html).toContain('dwa razy odrzucisz');
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
