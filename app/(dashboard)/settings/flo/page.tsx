import { getPrefs } from '@/app/actions/flo';

import { FloSettingsForm } from './_components/flo-settings-form';

/**
 * Ustawienia agenta (krok 21 toru B).
 *
 * CZTERY RZECZY I ANI JEDNEJ WIĘCEJ: powiadomienia push, powiadomienia
 * mailowe, godziny ciszy nocnej, lista wyciszonych rodzajów spraw.
 *
 * CZEGO TU NIE MA I NIE BĘDZIE: poziomu autonomii, trybu, suwaka „jak bardzo
 * samodzielny”, przełącznika „wysyłaj automatycznie” czegokolwiek. Zachowanie
 * agenta jest identyczne u każdego klienta (część II.3 planu). Gdyby ktoś
 * kiedyś poprosił o taki przełącznik — odpowiedź brzmi nie, bo to jest
 * dokładnie ten przełącznik, o którym ktoś zapomni, że go włączył, i dowie
 * się o nim od wkurzonego kontrahenta.
 */
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Ustawienia Flo',
};

export default async function FloSettingsPage() {
  const prefs = await getPrefs();

  return (
    <div className="max-w-3xl">
      <FloSettingsForm prefs={prefs} />
    </div>
  );
}
