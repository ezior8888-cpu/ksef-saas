/**
 * Klasyfikator tematów podatkowych (krok 47 planu). ⚠️ ZA FLAGĄ.
 *
 * ZASADA, KTÓREJ NIE WOLNO ZŁAMAĆ: model nie ma prawa formułować własnej
 * wykładni przepisu. Nie dlatego, że pomyli się częściej niż człowiek —
 * dlatego, że odpowiedź brzmiąca autorytatywnie, na której klient oprze
 * rozliczenie, jest doradztwem podatkowym, a tego nie robimy ani prawnie,
 * ani moralnie.
 *
 * CO WOLNO: oddać treść z BAZY WIEDZY (artykuł napisany i zatwierdzony przez
 * człowieka) i dołożyć zdanie o księgowej.
 * CZEGO NIE WOLNO: odpowiedzieć własnymi słowami na pytanie „czy mogę
 * odliczyć…”, „jaką stawkę mam wybrać”, „czy to jest koszt”.
 *
 * FLAGA: dopóki `TAX_TOPIC_APPROVED` jest `false`, KAŻDE pytanie podatkowe
 * dostaje samo odesłanie do księgowej — bez treści z bazy wiedzy. Bo nawet
 * dobrany artykuł jest wyborem, a wybór artykułu pod pytanie klienta to już
 * krok w stronę wykładni.
 */

/** Przestaw dopiero po pisemnej akceptacji treści przez prawnika. */
export const TAX_TOPIC_APPROVED = false;

export type ChatTopic =
  | 'invoice'
  | 'payment'
  | 'expense'
  | 'tax'
  | 'app'
  | 'other';

/**
 * Wzorce tematu podatkowego.
 *
 * Lista jest CELOWO SZEROKA. Fałszywe zaklasyfikowanie zwykłego pytania jako
 * podatkowego kończy się jednym zdaniem o księgowej za dużo. Przeoczenie
 * pytania podatkowego kończy się modelem, który samodzielnie interpretuje
 * przepis — a to jest jedyny błąd, którego w tej funkcji nie wolno popełnić.
 */
const TAX_PATTERNS: readonly RegExp[] = [
  /\bvat\b/i,
  /podat(ek|ku|kow|kiem)/i,
  /\bpit\b/i,
  /\bzus\b/i,
  /ryczał/i,
  /skal[aęi]\s+podatkow/i,
  /liniow/i,
  /odlicz/i,
  /koszt[a-ząćęłńóśźż]*\s+uzyskania/i,
  /czy\s+(mog[ęe]|wolno|trzeba|musz[ęe])\s+.*(wrzuci|odlicz|zalicz|rozlicz)/i,
  /amortyzac/i,
  /ulg[aęi]/i,
  /zwolnien/i,
  /jpk/i,
  /interpretacj/i,
  /urz[ąa]d\s+skarbow/i,
  /kwot[aęy]\s+woln/i,
  /skład(ka|ki|kę|kową)\s+zdrowotn/i,
];

const INVOICE_PATTERNS: readonly RegExp[] = [
  /faktur/i,
  /wystaw/i,
  /szkic/i,
  /korekt/i,
  /nabywc/i,
  /kontrahent/i,
];

const PAYMENT_PATTERNS: readonly RegExp[] = [
  /zapłac/i,
  /płatnoś/i,
  /przelew/i,
  /ponagl/i,
  /niezapłacon/i,
  /wpłat/i,
];

const EXPENSE_PATTERNS: readonly RegExp[] = [/wydat/i, /paragon/i, /zakup/i];

const APP_PATTERNS: readonly RegExp[] = [
  /jak\s+(włącz|wyłącz|zmieni|ustawi)/i,
  /ustawien/i,
  /hasł/i,
  /konto/i,
  /certyfikat/i,
];

/**
 * Temat pytania — funkcja czysta.
 *
 * PODATKI SPRAWDZAMY PIERWSZE i wygrywają z każdym innym tematem. „Czy mogę
 * wystawić fakturę bez VAT-u?” to pytanie podatkowe przebrane za pytanie
 * o faktury — i gdyby kolejność była inna, dostałoby odpowiedź od modelu.
 */
export function classifyTopic(question: string): ChatTopic {
  if (TAX_PATTERNS.some((pattern) => pattern.test(question))) return 'tax';
  if (INVOICE_PATTERNS.some((pattern) => pattern.test(question))) return 'invoice';
  if (PAYMENT_PATTERNS.some((pattern) => pattern.test(question))) return 'payment';
  if (EXPENSE_PATTERNS.some((pattern) => pattern.test(question))) return 'expense';
  if (APP_PATTERNS.some((pattern) => pattern.test(question))) return 'app';
  return 'other';
}

// ═══════════════════════════════════════════════════════════════
// Odpowiedź na pytanie podatkowe
// ═══════════════════════════════════════════════════════════════

/** Artykuł z bazy wiedzy — napisany i zatwierdzony przez człowieka. */
export interface KnowledgeArticle {
  slug: string;
  title: string;
  /** Fragment do zacytowania. Treść ludzka, nie wygenerowana. */
  excerpt: string;
}

/** Zdanie, które kończy KAŻDĄ odpowiedź podatkową. Bez wyjątków. */
export const ACCOUNTANT_SENTENCE =
  'To zależy od Twojej sytuacji — potwierdź to z księgową, zanim podejmiesz decyzję.';

export interface TaxAnswer {
  /** Gotowy tekst dla klienta. */
  text: string;
  /** Czy model w ogóle dostaje to pytanie. */
  modelMayAnswer: false;
  /** Artykuł, z którego pochodzi treść; `null` = sama odsyłka. */
  article: KnowledgeArticle | null;
}

/**
 * Odpowiedź na pytanie podatkowe — składana z gotowych klocków.
 *
 * `modelMayAnswer` jest typowane na `false`, nie na `boolean`. To nie jest
 * ustawienie do przełączenia, tylko gwarancja na poziomie typów: żeby model
 * mógł kiedykolwiek odpowiedzieć na pytanie podatkowe własnymi słowami,
 * trzeba by zmienić ten typ, a to jest zmiana widoczna w przeglądzie kodu.
 */
export function buildTaxAnswer(article: KnowledgeArticle | null): TaxAnswer {
  // Dopóki treści nie zaakceptował prawnik, nie oddajemy nawet artykułu:
  // sam dobór artykułu pod pytanie klienta jest już krokiem w stronę
  // wykładni.
  if (!TAX_TOPIC_APPROVED || !article) {
    return {
      text: `Nie odpowiadam na pytania podatkowe własnymi słowami. ${ACCOUNTANT_SENTENCE}`,
      modelMayAnswer: false,
      article: null,
    };
  }

  return {
    text: `${article.excerpt}\n\n(Źródło: „${article.title}”.) ${ACCOUNTANT_SENTENCE}`,
    modelMayAnswer: false,
    article,
  };
}

/**
 * Czy model może w ogóle dostać to pytanie do odpowiedzi.
 *
 * Pytania podatkowe nie idą do modelu w ogóle — nie chodzi o to, żeby model
 * odpowiedział ostrożnie, tylko żeby nie odpowiadał.
 */
export function modelMayAnswer(topic: ChatTopic): boolean {
  return topic !== 'tax';
}
