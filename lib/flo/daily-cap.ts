/**
 * Dzienny limit nowych kart na konto (plan FLO 2, K1.4).
 *
 * PO CO TO JEST. Każda reguła pulsu pilnuje się dziś sama: K-01 pyta o jedną
 * fakturę, W-04 stawia jedną kartę na miesiąc, P-03 jedną na kontrahenta,
 * O-01 jedną na konto. Nikt nie pilnuje SUMY. Po odsłonięciu kilku funkcji
 * naraz klient może zobaczyć czterech kart jednego ranka — a lawina kart to
 * najczęstszy powód, dla którego ludzie wyłączają takiego agenta. Wtedy tracimy
 * nie jedną kartę, tylko wszystkie.
 *
 * CO LIMITUJEMY, A CZEGO NIE. Wyłącznie karty z PULSU, czyli te, o które
 * klient nie prosił. Karty będące odpowiedzią na jego działanie — status
 * wysyłki do KSeF, wynik odczytu paragonu, awaria Ministerstwa — nie
 * przechodzą przez ten limit i nie mogą: cisza w odpowiedzi na kliknięcie
 * jest gorsza niż nadmiar kart.
 *
 * LIMIT JEST DZIENNY, NIE NA PRZEBIEG. Liczymy karty utworzone dziś, a nie
 * w tym przebiegu — inaczej dwa uruchomienia pulsu (np. po ponowieniu
 * zadania) dawałyby podwójną porcję.
 *
 * CZEGO NIE ROBI: nie odkłada spraw na jutro w żadnym rejestrze. Reguła,
 * która dziś się nie zmieściła, po prostu spróbuje jutro — jej warunki i tak
 * liczą się od nowa przy każdym przebiegu. Kolejka „zaległych kart" byłaby
 * drugim źródłem prawdy o tym, o co agent chce zapytać.
 */

import { floDb, type FloDbClient } from '@/lib/flo/db-types';
import { warsawIsoDate } from '@/lib/flo/fingerprint';

/**
 * Ile NOWYCH kart dziennie może dostać jedno konto z pulsu.
 *
 * Pięć to sufit, nie cel: przy dzisiejszych regułach normalny dzień to zero
 * albo jedna karta. Liczba ma znaczenie dopiero w dniu, w którym kilka reguł
 * trafi na ten sam poranek — i wtedy ma zatrzymać lawinę, a nie normalną pracę.
 */
export const FLO_DAILY_NEW_CARDS_CAP = 5;

export interface DailyCap {
  /** Czy konto ma jeszcze miejsce na nową kartę. */
  canAsk: (tenantId: string) => boolean;
  /** Zgłoszenie, że karta powstała. */
  spend: (tenantId: string) => void;
  /** Ile kart limit zatrzymał — do wyniku pulsu. */
  readonly withheld: number;
}

/**
 * Limit na podstawie tego, ile kart konto dostało DZIŚ — funkcja czysta.
 *
 * `counts` to liczby z bazy; `spend` dolicza to, co powstaje w tym przebiegu.
 */
export function createDailyCap(
  counts: ReadonlyMap<string, number>,
  cap: number = FLO_DAILY_NEW_CARDS_CAP,
): DailyCap {
  const used = new Map(counts);
  let withheld = 0;

  return {
    canAsk: (tenantId) => {
      const allowed = (used.get(tenantId) ?? 0) < cap;
      if (!allowed) withheld++;
      return allowed;
    },
    spend: (tenantId) => {
      used.set(tenantId, (used.get(tenantId) ?? 0) + 1);
    },
    get withheld() {
      return withheld;
    },
  };
}

/** Limit bez limitu — do testów i do ścieżek, których nie ograniczamy. */
export function unlimitedCap(): DailyCap {
  return { canAsk: () => true, spend: () => {}, withheld: 0 };
}

/**
 * Ile kart konta powstało dzisiaj.
 *
 * Dzień liczony w strefie klienta: karta z 23:30 czasu polskiego należy do
 * tego dnia, który klient ma na zegarze, a nie do doby serwera w UTC.
 */
/**
 * Chwila UTC, w której w Polsce zaczął się dzisiejszy dzień.
 *
 * Porównanie z „północą UTC" przesunęłoby dobę o godzinę albo dwie: karta
 * wystawiona o 00:30 czasu polskiego liczyłaby się do wczoraj i konto
 * dostałoby tego dnia o jedną kartę za dużo. Przesunięcia strefy nie
 * wpisujemy na sztywno, bo zmienia się dwa razy w roku — sprawdzamy obie
 * możliwości i bierzemy wcześniejszą, która wciąż wypada dzisiaj.
 */
export function warsawDayStart(now: Date): Date {
  const today = warsawIsoDate(now);

  for (const offsetHours of [2, 1]) {
    const candidate = new Date(`${today}T00:00:00.000Z`);
    candidate.setUTCHours(candidate.getUTCHours() - offsetHours);
    if (warsawIsoDate(candidate) === today) return candidate;
  }

  return new Date(`${today}T00:00:00.000Z`);
}

/** Rozmiar strony przy czytaniu dzisiejszych kart. */
const CARD_PAGE = 1000;

export async function readTodayCardCounts(
  tenantIds: readonly string[],
  now: Date = new Date(),
  db: FloDbClient = floDb(),
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (tenantIds.length === 0) return counts;

  const since = warsawDayStart(now).toISOString();
  const watched = new Set(tenantIds);

  // Czytane stronami do końca. Ucięta odpowiedź znaczyłaby limit policzony
  // z niepełnych danych — czyli konto dostałoby tego dnia drugą porcję kart
  // i nikt by nie zauważył, bo zapytanie wygląda na udane.
  for (let from = 0; ; from += CARD_PAGE) {
    const { data, error } = await db
      .from('flo_proposals')
      .select('tenant_id')
      .gte('created_at', since)
      .order('id')
      .range(from, from + CARD_PAGE - 1);

    if (error) throw new Error(error.message);

    const page = data ?? [];
    for (const row of page) {
      if (!watched.has(row.tenant_id)) continue;
      counts.set(row.tenant_id, (counts.get(row.tenant_id) ?? 0) + 1);
    }

    if (page.length < CARD_PAGE) return counts;
  }
}
