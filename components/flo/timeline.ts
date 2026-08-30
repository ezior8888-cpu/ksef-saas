/**
 * Układanie propozycji na osi zdarzeń (krok 2 toru B).
 *
 * Czysta logika, bez Reacta — dzięki temu da się ją przetestować bez
 * renderowania czegokolwiek, a ekran zostaje głupi i przewidywalny.
 *
 * PODZIAŁ RÓL: dni idą chronologicznie („WCZORAJ”, potem „DZIŚ”), bo ekran
 * ma się czytać jak zapis tego, co się działo, a klient wraca do niego kilka
 * razy dziennie i szuka miejsca, w którym skończył. Wewnątrz dnia decyduje
 * priorytet, a dopiero po nim czas — dzień jest na tyle wąską ramką, że
 * pilna sprawa nie ucieknie pod inne karty, a godzina przy każdej karcie
 * i tak mówi, kiedy co się wydarzyło.
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

/**
 * Kolejność WEWNĄTRZ dnia: najpierw priorytet, potem czas (nowsze wyżej).
 * Tak każe plan i tak jest sensownie — dzień to na tyle wąska ramka, że
 * pilna sprawa nie ucieka pod inne karty, a klient nadal wie, kiedy co się
 * wydarzyło, bo przy każdej karcie stoi godzina.
 */
function byPriorityThenTime(a: FloProposalView, b: FloProposalView): number {
  return (
    a.priority - b.priority || Date.parse(b.createdAt) - Date.parse(a.createdAt)
  );
}

/** Do podziału na dni: najstarsze pierwsze, żeby grupy szły chronologicznie. */
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
    items: [...items].sort(byPriorityThenTime),
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
