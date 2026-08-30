/**
 * Polska odmiana przez liczebnik — jedno miejsce dla całej aplikacji.
 *
 * Powód istnienia: na sierpniowej makiecie widniało „1 zadania dziś”. Taki
 * napis powstaje zawsze tam, gdzie ktoś skleja liczbę z rzeczownikiem
 * w miejscu użycia. Dlatego reguła mieszka tutaj i nigdzie indziej.
 *
 * Ten plik należy do toru interfejsu (mapa własności, część IV.2 planu).
 */

/**
 * Trzy formy rzeczownika: dla 1, dla 2–4, dla 5 i więcej (oraz dla 0).
 * Kolejność jak w zdaniach: „1 zadanie, 2 zadania, 5 zadań”.
 */
export type PluralForms = readonly [one: string, few: string, many: string];

/**
 * Wybiera formę rzeczownika dla liczby.
 *
 * Reguła: 1 → forma pierwsza; końcówka 2–4 poza nastolatkami 12–14 → forma
 * druga; reszta, łącznie z zerem → forma trzecia.
 *
 *     plural(1, ['zadanie', 'zadania', 'zadań'])  // 'zadanie'
 *     plural(3, ['zadanie', 'zadania', 'zadań'])  // 'zadania'
 *     plural(13, ['zadanie', 'zadania', 'zadań']) // 'zadań'  ← nastolatek
 *     plural(0, ['zadanie', 'zadania', 'zadań'])  // 'zadań'
 */
export function plural(count: number, forms: PluralForms): string {
  const n = Math.abs(Math.trunc(count));

  if (n === 1) return forms[0];

  const lastTwo = n % 100;
  const last = n % 10;

  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) {
    return forms[1];
  }

  return forms[2];
}

/**
 * Liczba razem z odmienionym rzeczownikiem: „1 zadanie”, „22 faktury”,
 * „0 zadań”.
 */
export function countLabel(count: number, forms: PluralForms): string {
  return `${Math.trunc(count)} ${plural(count, forms)}`;
}
