/**
 * Układanie propozycji na osi zdarzeń (krok 2 toru B).
 *
 * Czysta logika, bez Reacta — dzięki temu da się ją przetestować bez
 * renderowania czegokolwiek, a ekran zostaje głupi i przewidywalny.
 *
 * DLACZEGO OŚ, A NIE LISTA POSORTOWANA PO WAŻNOŚCI: ekran agenta ma czytać
 * się jak zapis tego, co się działo — „wczoraj o 14:31 przyjęta faktura,
 * dziś o 08:34 zaksięgowane koszty”. Klient wraca do niego kilka razy
 * dziennie i szuka wzrokiem miejsca, w którym ostatnio skończył. Kolejność
 * po ważności przestawiałaby mu karty pod ręką przy każdym odświeżeniu.
 *
 * Pole `priority` z kontraktu NIE ZNIKA — służy do wyboru, co pokazać
 * w powiadomieniu i co ma trafić na górę, gdy kart jest więcej niż mieści
 * ekran. Na osi decyduje czas.
 */

import type { FloProposalView } from '@/types/flo';

import { dayGroupLabel, timeLeft } from './format';

/** Jeden dzień na osi: nagłówek plus karty tego dnia. */
export interface FloDayGroup {
  /** klucz do Reacta — pierwszy znacznik czasu w grupie */
  key: string;
  /** „DZIŚ”, „WCZORAJ”, „ŚRODA”, „12 SIERPNIA” */
  label: string;
  items: FloProposalView[];
}

/** Najstarsze na górze — jak w zapisie rozmowy. */
function byTimeAsc(a: FloProposalView, b: FloProposalView): number {
  return Date.parse(a.createdAt) - Date.parse(b.createdAt);
}

/**
 * Kolejność „najpilniejsze pierwsze” — do powiadomień i do skrótów, nie na oś.
 * `priority` 0 = najpilniejsze; przy remisie wygrywa nowsze.
 */
export function sortByUrgency(
  list: readonly FloProposalView[],
): FloProposalView[] {
  return [...list].sort(
    (a, b) =>
      a.priority - b.priority || Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}

/**
 * Grupuje propozycje po dniu kalendarzowym klienta (strefa Europe/Warsaw —
 * patrz `format.ts`). Grupy idą od najstarszej do najnowszej, karty w grupie
 * tak samo, więc najświeższa sprawa jest na dole, tuż nad polem rozmowy.
 */
export function groupByDay(
  list: readonly FloProposalView[],
  now: Date = new Date(),
): FloDayGroup[] {
  const groups = new Map<string, FloProposalView[]>();

  for (const item of [...list].sort(byTimeAsc)) {
    const label = dayGroupLabel(item.createdAt, now);
    // Zły znacznik czasu z serwera nie ma prawa wywrócić całej osi —
    // taka karta po prostu nie dostaje miejsca w żadnej grupie.
    if (!label) continue;

    const bucket = groups.get(label);
    if (bucket) bucket.push(item);
    else groups.set(label, [item]);
  }

  return [...groups.entries()].map(([label, items]) => ({
    key: items[0]!.createdAt,
    label,
    items,
  }));
}

/**
 * Ile spraw z dzisiaj czeka na decyzję człowieka — liczba do odznaki
 * „1 zadanie dziś” w nagłówku.
 *
 * Nie liczymy tu niczego z dziedziny (kwot, terminów) — to zliczenie kart
 * widocznych na ekranie, więc siłą rzeczy robota interfejsu. Warianty `info`
 * odpadają, bo nie ma w nich czego zatwierdzać, a wygasłe odpadają, bo
 * decyzja już się nie liczy.
 */
export function countTodayTasks(
  list: readonly FloProposalView[],
  now: Date = new Date(),
): number {
  return list.filter(
    (item) =>
      item.variant !== 'info' &&
      !timeLeft(item.expiresAt, now).expired &&
      dayGroupLabel(item.createdAt, now) === 'DZIŚ',
  ).length;
}
