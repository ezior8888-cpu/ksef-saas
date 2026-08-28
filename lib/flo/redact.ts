/**
 * Minimalizacja danych przed wysłaniem do modelu (krok 17 planu).
 *
 * ZADANIE Z BRAMKI PRAWNEJ. Dostawca modelu jest podprzetwarzającym dane
 * naszych klientów — a właściwie dane KONTRAHENTÓW naszych klientów, którzy
 * nam niczego nie powierzali i o naszym istnieniu nie wiedzą. Im mniej ich
 * danych opuszcza naszą infrastrukturę, tym mniej mamy do wytłumaczenia.
 *
 * ZASADA: model dostaje tyle, ile potrzebuje do napisania zdania — czyli
 * nazwy pól i ewentualnie nazwę firmy. Nigdy numeru konta, adresu, PESEL-u
 * ani telefonu. Te dane nie są mu do niczego potrzebne, a każde z nich
 * w prompcie to osobna pozycja w rejestrze czynności przetwarzania.
 *
 * DLACZEGO ZAMIANA, A NIE USUNIĘCIE: zdanie „wyślij na [konto]" jest dla
 * modelu zrozumiałe i bezpieczne, a puste miejsce prowokuje go do
 * uzupełnienia luki zmyśloną wartością.
 */

/** Co zostaje w tekście zamiast danych. Czytelne dla modelu i dla nas w logach. */
const MASK = {
  account: '[konto]',
  pesel: '[pesel]',
  nip: '[nip]',
  email: '[email]',
  phone: '[telefon]',
  address: '[adres]',
  postal: '[kod]',
  digits: '[liczba]',
} as const;

/**
 * Wzorce w kolejności od najbardziej szczegółowego do najogólniejszego.
 *
 * Kolejność ma znaczenie: numer konta zawiera w sobie ciąg cyfr, więc gdyby
 * ogólny wzorzec na długie liczby szedł pierwszy, IBAN zostałby zamaskowany
 * jako „liczba" i stracilibyśmy informację, czym naprawdę był.
 */
const PATTERNS: Array<{ name: keyof typeof MASK; re: RegExp }> = [
  // IBAN z prefiksem kraju — polski ma 26 cyfr po „PL”, ale bierzemy szeroko,
  // bo kontrahent zagraniczny ma inną długość.
  { name: 'account', re: /\b[A-Z]{2}\s?\d{2}(?:[\s-]?\d{2,4}){4,8}\b/g },
  // Numer rachunku bez prefiksu: 26 cyfr, zwykle w grupach po cztery.
  { name: 'account', re: /\b\d{2}(?:[\s-]?\d{4}){6}\b/g },
  { name: 'email', re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g },
  // PESEL: dokładnie 11 cyfr ciągiem.
  { name: 'pesel', re: /\b\d{11}\b/g },
  // Telefon: +48 i dziewięć cyfr w dowolnym grupowaniu.
  { name: 'phone', re: /(?:\+48[\s-]?)?\b\d{3}[\s-]?\d{3}[\s-]?\d{3}\b/g },
  // Kod pocztowy.
  { name: 'postal', re: /\b\d{2}-\d{3}\b/g },
  // Adres: skrót ulicy plus to, co po nim, aż do przecinka albo końca zdania.
  {
    name: 'address',
    re: /\b(?:ul\.|al\.|os\.|pl\.|ulica|aleja|osiedle)\s*[^,.;]{2,60}/gi,
  },
  // Wszystko, co zostało, a ma dziewięć cyfr lub więcej. NIP wpada tu
  // z premedytacją: jeśli nie został jawnie dopuszczony, nie ma czego szukać
  // w prompcie o treści karty.
  { name: 'digits', re: /\b\d{9,}\b/g },
];

export interface RedactOptions {
  /**
   * Czy NIP jest do tego zadania niezbędny. Domyślnie NIE — treść karty da
   * się napisać bez niego. Jawne włączenie jest decyzją, którą widać
   * w miejscu wywołania.
   */
  allowNip?: boolean;
}

export function redactText(text: string, opts: RedactOptions = {}): string {
  let out = text;

  for (const { name, re } of PATTERNS) {
    // NIP ma dziesięć cyfr i wpadłby w ogólny wzorzec na długie liczby.
    // Gdy jest dopuszczony, pomijamy ten wzorzec dla ciągów 10-cyfrowych.
    if (name === 'digits' && opts.allowNip) {
      out = out.replace(/\b\d{9,}\b/g, (match) =>
        match.length === 10 ? match : MASK.digits,
      );
      continue;
    }
    out = out.replace(re, MASK[name]);
  }

  return out.replace(/\s{2,}/g, ' ').trim();
}

/**
 * Czyści dowolną strukturę idącą do modelu. Klucze zostają — to one niosą
 * znaczenie — czyszczone są wartości.
 */
export function redactForModel<T>(value: T, opts: RedactOptions = {}): T {
  if (typeof value === 'string') {
    return redactText(value, opts) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactForModel(item, opts)) as unknown as T;
  }
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = redactForModel(item, opts);
    }
    return out as unknown as T;
  }
  return value;
}

/**
 * Czy tekst nadal zawiera coś, czego nie powinien.
 *
 * Używane w testach i jako ostatnie sprawdzenie przed wysłaniem: lepiej
 * wysłać zdanie z dziurą niż numer konta kontrahenta.
 */
export function containsSensitive(text: string): boolean {
  const patterns = [
    /\b[A-Z]{2}\s?\d{2}(?:[\s-]?\d{2,4}){4,8}\b/,
    /\b\d{2}(?:[\s-]?\d{4}){6}\b/,
    /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/,
    /\b\d{11}\b/,
    /\b\d{2}-\d{3}\b/,
    /\b(?:ul\.|al\.|os\.|pl\.)\s*\w/i,
  ];
  return patterns.some((re) => re.test(text));
}
