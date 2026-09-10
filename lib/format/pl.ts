/**
 * Formatowanie liczb po polsku — jedno miejsce dla całego panelu.
 *
 * DLACZEGO OSOBNY MODUŁ. `formatPlMoney` mieszkał w
 * `lib/dashboard/monthly-figures.ts`, obok zapytań do Supabase. Komponent
 * kliencki, który by go zaimportował, wciągnąłby do paczki przeglądarki cały
 * moduł serwerowy — więc każdy z nich zamiast tego dopisywał sobie WŁASNĄ
 * kopię tych czterech linijek. Do września 2026 uzbierały się cztery
 * (`expenses-list`, `cash-flow-dashboard`, `kpir-view`, `overdue-dashboard`)
 * i piąta była w drodze razem z podsumowaniem faktury.
 *
 * Ten plik nie importuje niczego, więc nadaje się i na serwer, i do klienta.
 *
 * O GRUPOWANIU TYSIĘCY: polski CLDR ma `minimumGroupingDigits: 2`, więc
 * `4140` zostaje bez spacji, a `18000` dostaje ją („18 000”). To jest
 * zachowanie poprawne i takie samo, jakie panel pokazuje od zawsze — jeśli
 * kiedyś zdecydujemy inaczej, zmiana jest tutaj, w jednym miejscu.
 */

/** Kwota z dwoma miejscami po przecinku, bez symbolu waluty. */
export function formatPlMoney(n: number): string {
  return n.toLocaleString('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Liczba całkowita — sztuki, dni, liczniki. */
export function formatPlInt(n: number): string {
  return n.toLocaleString('pl-PL', { maximumFractionDigits: 0 });
}
