/**
 * Formatowanie kwot po stronie serwera (krok 14 planu agenta FLO).
 *
 * DLACZEGO TU, A NIE W INTERFEJSIE: kontrakt `FloProposalView` niesie kwoty
 * jako GOTOWE NAPISY. Interfejs ich nie przelicza i nie formatuje — ta sama
 * zasada, która nie pozwala modelowi językowemu dotykać liczb, nie pozwala
 * też dwóm torom pracy formatować ich na dwa sposoby.
 *
 * DLACZEGO WŁASNA FUNKCJA, SKORO JEST `lib/reminders/templates.ts`: tamta
 * zwraca wynik `Intl` jeden do jednego, razem z twardą spacją (U+00A0)
 * i wąską spacją, które wstawiają różne wersje Node'a i przeglądarek.
 * W ponagleniu to nie przeszkadza, ale tutaj kwota trafia do porównań
 * w testach, do plików eksportu i do treści budowanych z placeholderów —
 * a niewidzialny znak, który raz jest, a raz go nie ma, to godziny zgadywania.
 * Normalizujemy więc separator do JEDNEGO, świadomie wybranego znaku.
 */

/**
 * Twarda spacja jako separator tysięcy. Wybór celowy: „22 140,00 zł” nie ma
 * prawa złamać się na końcu linii w mailu ani w PDF, a „22” w jednym wierszu
 * i „140,00 zł” w następnym to nie jest kwota, tylko zagadka.
 */
const NBSP = ' ';

/** Wszystkie odmiany spacji, jakie potrafi wstawić `Intl` w różnych wersjach. */
const ANY_SPACE = /[\s   ]/g;

/**
 * Kwota w polskim formacie: „1 234 567,89 zł”.
 *
 * Separator tysięcy i odstęp przed „zł” to twarda spacja. Jeżeli piszesz test
 * porównujący napis, użyj `formatPln()` po obu stronach zamiast wklejać
 * wynik ręcznie — inaczej porównasz spację ze spacją twardą i stracisz
 * kwadrans.
 */
export function formatPln(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;

  const digits = new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    // Zawsze grupujemy tysiące. Domyślne zachowanie `Intl` dla polskiego
    // pomija separator przy czterech cyfrach („4300,00”), przez co dwie
    // kwoty obok siebie wyglądają jak z dwóch różnych programów:
    // „4300,00 zł” i „12 400,00 zł”. Na dokumencie finansowym to zgrzyt,
    // a przy szybkim czytaniu — źródło pomyłki o rząd wielkości.
    useGrouping: 'always',
  })
    .format(safe)
    .replace(ANY_SPACE, NBSP);

  return `${digits}${NBSP}zł`;
}

/**
 * Wersja bez twardych spacji — do plików, które czyta maszyna, a nie człowiek
 * (CSV dla księgowej, nazwy pól). Twarda spacja w arkuszu potrafi zamienić
 * liczbę w tekst i zepsuć import po drugiej stronie.
 */
export function formatPlnPlain(amount: number): string {
  return formatPln(amount).replace(ANY_SPACE, ' ');
}

/**
 * Liczba dni w poprawnej odmianie: „1 dzień”, „3 dni”, „5 dni”.
 *
 * Po polsku dzień ma tylko dwie formy, więc pełna reguła przez liczebnik nie
 * jest tu potrzebna — inaczej niż przy „zadanie/zadania/zadań”, którym
 * zajmuje się tor interfejsu.
 */
export function formatDays(days: number): string {
  const n = Math.max(0, Math.round(days));
  return n === 1 ? `${n} dzień` : `${n} dni`;
}
