/**
 * Daty kalendarzowe faktur (RRRR-MM-DD) liczone po polsku — moduł bez
 * importów, działa i na serwerze, i w przeglądarce.
 *
 * DLACZEGO. Formularze faktur brały „dziś” jako `new Date().toISOString()`,
 * czyli datę w UTC: między północą a 1:00/2:00 czasu polskiego domyślna data
 * wystawienia była wczorajsza (na przełomie miesiąca — poprzedni okres VAT).
 * Przyciski terminu płatności tworzyły lokalną północ i brały z niej datę UTC,
 * więc „14 dni” dawało w Polsce termin 13 dni po dacie wystawienia (F-013
 * w raporcie audytu bloku 1). Tutaj „dziś” to dzień w Europe/Warsaw,
 * a dodawanie dni działa na samej dacie, bez strefy czasowej.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Dzisiejsza data w Polsce (Europe/Warsaw) jako RRRR-MM-DD. */
export function todayInWarsaw(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: 'year' | 'month' | 'day') => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Data kalendarzowa przesunięta o `days` dni. `null` dla wartości, która nie
 * jest poprawną datą RRRR-MM-DD (np. puste pole formularza).
 */
export function addDaysToIsoDate(isoDate: string, days: number): string | null {
  const m = ISO_DATE.exec(isoDate);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) {
    return null;
  }
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Termin płatności: `days` dni od daty bazowej, a bez niej — od dziś w Polsce. */
export function dueDateFrom(baseIsoDate: string | null | undefined, days: number, now: Date = new Date()): string {
  const base = baseIsoDate && addDaysToIsoDate(baseIsoDate, 0) ? baseIsoDate : todayInWarsaw(now);
  return addDaysToIsoDate(base, days) ?? base;
}
