/**
 * Kursy NBP dla funkcji P-09 (krok 45 planu).
 *
 * REGUŁA, KTÓRA RZĄDZI TYM PLIKIEM: do przeliczenia faktury walutowej bierze
 * się średni kurs z tabeli ogłoszonej w OSTATNIM DNIU ROBOCZYM POPRZEDZAJĄCYM
 * datę zdarzenia. Nie z dnia zdarzenia, nie z najbliższego dostępnego, nie
 * z najświeższego, jaki mamy. Poprzedzającym.
 *
 * Ta jedna litera („przed”, nie „w dniu”) jest całą różnicą przy kontroli:
 * kurs z tabeli opublikowanej TEGO SAMEGO DNIA daje inną kwotę VAT-u niż
 * kurs z dnia poprzedniego, a urząd liczy według drugiego.
 *
 * BRAK KURSU NIE JEST PROBLEMEM DO OBEJŚCIA. Jeżeli w lokalnym zapasie nie
 * ma tabeli spełniającej regułę, funkcja mówi o tym wprost i nie podstawia
 * niczego „w przybliżeniu”. Kurs bliski prawdzie na fakturze wygląda tak samo
 * jak kurs prawdziwy, a różni się od niego przy każdej kolejnej korekcie.
 */

const DAY_MS = 86_400_000;

/**
 * Ile ostatnich tabel trzymamy lokalnie.
 *
 * Trzydzieści tabel to około sześciu tygodni dni roboczych — z zapasem na
 * najdłuższą realną przerwę w publikacji (przełom roku) i na kilka dni
 * niedostępności API NBP.
 */
export const LOCAL_TABLE_BUFFER = 30;

/**
 * Największa przerwa w publikacji, jaką uznajemy za normalną.
 *
 * NBP publikuje w dni robocze, więc realna luka to weekend plus święta:
 * przy Bożym Narodzeniu i Nowym Roku bywa cztery, wyjątkowo pięć dni.
 * Dziura większa niż ta oznacza, że NASZ ZAPAS JEST NIEAKTUALNY, a nie że
 * NBP nie publikował — i wtedy nie wolno podstawiać tego, co mamy.
 */
export const MAX_PUBLICATION_GAP_DAYS = 7;

export interface NbpRate {
  /** Kod waluty, np. „EUR”. */
  currency: string;
  /** Kurs średni. */
  mid: number;
  /** Numer tabeli, np. „170/A/NBP/2026” — bez niego kurs jest nie do obrony. */
  tableNo: string;
  /** Data publikacji tabeli, ISO YYYY-MM-DD. */
  effectiveDate: string;
}

export type RateLookupFailure =
  /** Nie mamy żadnej tabeli wcześniejszej niż szukana data. */
  | 'no_table_before'
  /** Mamy tabelę, ale dziura do szukanej daty jest podejrzanie duża. */
  | 'stale_buffer'
  /** Waluty nie ma w zapasie. */
  | 'unknown_currency';

export type RateLookup =
  | { found: true; rate: NbpRate; gapDays: number }
  | { found: false; reason: RateLookupFailure };

/**
 * Kurs z ostatniej tabeli opublikowanej PRZED podaną datą — funkcja czysta.
 *
 * Tabela z tego samego dnia jest odrzucana świadomie: reguła mówi
 * „poprzedzającym”, a nie „nie późniejszym”.
 */
export function rateBefore(
  tables: readonly NbpRate[],
  currency: string,
  date: string,
): RateLookup {
  const wanted = currency.trim().toUpperCase();
  const forCurrency = tables.filter(
    (table) => table.currency.trim().toUpperCase() === wanted,
  );

  if (forCurrency.length === 0) return { found: false, reason: 'unknown_currency' };

  const target = Date.parse(`${date}T00:00:00.000Z`);
  if (Number.isNaN(target)) return { found: false, reason: 'no_table_before' };

  const earlier = forCurrency
    .filter((table) => Date.parse(`${table.effectiveDate}T00:00:00.000Z`) < target)
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));

  const latest = earlier[earlier.length - 1];
  if (!latest) return { found: false, reason: 'no_table_before' };

  const gapDays = Math.round(
    (target - Date.parse(`${latest.effectiveDate}T00:00:00.000Z`)) / DAY_MS,
  );

  // Dziura większa niż długi weekend ze świętami znaczy, że zapas jest
  // nieaktualny. Podstawienie kursu sprzed dwóch tygodni byłoby zgadywaniem
  // z pozorami dokładności.
  if (gapDays > MAX_PUBLICATION_GAP_DAYS) {
    return { found: false, reason: 'stale_buffer' };
  }

  return { found: true, rate: latest, gapDays };
}

/**
 * Zapas do przechowania po odświeżeniu — najnowsze `LOCAL_TABLE_BUFFER` tabel.
 *
 * Przycinamy PER WALUTA, nie globalnie: przy trzech walutach globalny limit
 * trzydziestu wpisów zostawiłby dziesięć dni historii na każdą z nich.
 */
export function trimBuffer(
  tables: readonly NbpRate[],
  limit = LOCAL_TABLE_BUFFER,
): NbpRate[] {
  const byCurrency = new Map<string, NbpRate[]>();

  for (const table of tables) {
    const key = table.currency.trim().toUpperCase();
    const bucket = byCurrency.get(key);
    if (bucket) bucket.push(table);
    else byCurrency.set(key, [table]);
  }

  const kept: NbpRate[] = [];
  for (const bucket of byCurrency.values()) {
    const sorted = [...bucket].sort((a, b) =>
      a.effectiveDate.localeCompare(b.effectiveDate),
    );
    kept.push(...sorted.slice(-limit));
  }

  return kept.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
}

/**
 * Ślad kursu do zapisania przy fakturze.
 *
 * Numer tabeli i data są częścią zapisu, nie ozdobą: przy kontroli trzeba
 * pokazać, z której konkretnie tabeli wzięła się kwota. Sam kurs bez numeru
 * jest liczbą, której nie da się obronić.
 */
export interface RateStamp {
  currency: string;
  mid: number;
  tableNo: string;
  effectiveDate: string;
  /** Data, dla której kurs został wybrany. */
  appliedFor: string;
}

export function stampRate(rate: NbpRate, appliedFor: string): RateStamp {
  return {
    currency: rate.currency.trim().toUpperCase(),
    mid: rate.mid,
    tableNo: rate.tableNo,
    effectiveDate: rate.effectiveDate,
    appliedFor,
  };
}

/** Zdanie dla człowieka, gdy kursu nie ma. Nigdy nie kończy się liczbą. */
export function describeMissingRate(
  reason: RateLookupFailure,
  currency: string,
  date: string,
): string {
  const when = formatFullDate(date);

  switch (reason) {
    case 'unknown_currency':
      return `Nie mam kursu ${currency.toUpperCase()} — tej waluty nie pobieram z NBP. Wpisz kurs ręcznie i zapisz numer tabeli.`;
    case 'no_table_before':
      return `Nie mam tabeli NBP sprzed ${when}. Nie podstawię kursu „mniej więcej” — wpisz go ręcznie razem z numerem tabeli.`;
    case 'stale_buffer':
      return `Ostatnia tabela NBP, którą mam, jest za stara dla daty ${when}. Odświeżam kursy w tle; do tego czasu wpisz kurs ręcznie.`;
  }
}

function formatFullDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${Number(day)}.${month}.${year}`;
}
