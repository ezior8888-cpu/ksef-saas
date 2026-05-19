/**
 * Parsowanie linii [META] z odpowiedzi AI support chatu.
 *
 * Wydzielone z `chat.ts` do osobnego pliku, bo `chat.ts` importuje
 * server-only `getAnthropic()`. Ten plik jest czysty (bez zależności
 * server-side) — może go importować zarówno API route, jak i client
 * component widgetu.
 */

/** Marker uncertainty — AI zaczyna od tej frazy, gdy nie zna odpowiedzi. */
export const UNCERTAIN_PREFIX = 'Nie mam pewności';

/** AI kończy odpowiedź jedną linią `[META] uncertain=… articles=… category=…`. */
export const META_LINE_PREFIX = '[META]';

/** Wartości zgodne z enumem `support_category` (migracja 00054). */
export const SUPPORT_CATEGORIES = [
  'onboarding',
  'ksef',
  'invoicing',
  'ocr_kpir',
  'billing',
  'team',
  'security',
  'other',
] as const;

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export interface ParsedMeta {
  /** Odpowiedź bez linii [META]. */
  cleanText: string;
  uncertain: boolean;
  articles: string[];
  /** Kategoria pytania — null gdy AI nie podał / podał nieznaną. */
  category: SupportCategory | null;
}

/**
 * Wyciąga linię [META] z pełnej odpowiedzi AI. Zwraca tekst bez niej +
 * sparsowane metadane. Odporne na brak linii (AI czasem zapomni).
 */
export function parseMeta(fullText: string): ParsedMeta {
  const lines = fullText.split('\n');
  const metaIdx = lines.findIndex((l) =>
    l.trimStart().startsWith(META_LINE_PREFIX),
  );

  if (metaIdx === -1) {
    return {
      cleanText: fullText.trim(),
      uncertain: fullText.trimStart().startsWith(UNCERTAIN_PREFIX),
      articles: [],
      category: null,
    };
  }

  const metaLine = lines[metaIdx] ?? '';
  const cleanText = lines.slice(0, metaIdx).join('\n').trim();

  const uncertain =
    /uncertain=true/i.test(metaLine) ||
    cleanText.trimStart().startsWith(UNCERTAIN_PREFIX);

  const articlesMatch = metaLine.match(/articles=([^\s]*)/i);
  const articles = articlesMatch?.[1]
    ? articlesMatch[1]
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : [];

  const categoryMatch = metaLine.match(/category=([a-z_]+)/i);
  const rawCategory = categoryMatch?.[1]?.toLowerCase();
  const category =
    rawCategory &&
    (SUPPORT_CATEGORIES as readonly string[]).includes(rawCategory)
      ? (rawCategory as SupportCategory)
      : null;

  return { cleanText, uncertain, articles, category };
}

/**
 * Lekka wersja do streamingu — ucina tekst od linii [META] w górę, żeby
 * podczas pisania odpowiedzi metadane nie mignęły użytkownikowi.
 */
export function stripMetaLine(partialText: string): string {
  const idx = partialText.indexOf(`\n${META_LINE_PREFIX}`);
  if (idx === -1) return partialText;
  return partialText.slice(0, idx).trimEnd();
}
