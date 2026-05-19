import {
  getAllHelpArticles,
  HELP_CATEGORIES,
} from '@/lib/help/articles';

/**
 * Knowledge base jako kontekst dla AI support chatu (Faza 30 Krok 4).
 *
 * Strategia: cała KB (~26 artykułów × ~350 słów ≈ 9k słów ≈ 13-15k tokenów)
 * mieści się spokojnie w oknie kontekstu Haiku. Wklejamy WSZYSTKO do system
 * prompt — model sam wybiera relevantne fragmenty. Brak osobnego retrievala
 * (embeddingi) bo przy tej skali to over-engineering.
 *
 * Koszt: KB jest stałe między requestami → w `lib/support/chat.ts` (Krok 5)
 * oznaczamy blok jako `cache_control: ephemeral`, więc Anthropic prompt
 * caching nalicza pełną cenę tylko raz na ~5 min, potem ~10% ceny.
 */

export interface KnowledgeBaseContext {
  /** Sformatowany tekst wszystkich artykułów — do system prompt. */
  text: string;
  /** Slugi artykułów — do walidacji cytowań zwróconych przez AI. */
  slugs: string[];
  count: number;
}

let cached: KnowledgeBaseContext | null = null;

export function buildKnowledgeBaseContext(): KnowledgeBaseContext {
  // Cache tylko w produkcji — w dev chcemy widzieć zmiany w MDX bez restartu.
  if (cached && process.env.NODE_ENV === 'production') return cached;

  const articles = getAllHelpArticles();
  const categoryLabel = new Map(
    HELP_CATEGORIES.map((c) => [c.id, c.label] as const),
  );

  const sections = articles.map((a) => {
    return [
      `## ${a.title}`,
      `slug: ${a.slug}`,
      `kategoria: ${categoryLabel.get(a.category) ?? a.category}`,
      `streszczenie: ${a.summary}`,
      '',
      a.content,
    ].join('\n');
  });

  const result: KnowledgeBaseContext = {
    text: sections.join('\n\n———\n\n'),
    slugs: articles.map((a) => a.slug),
    count: articles.length,
  };

  cached = result;
  return result;
}

/**
 * Odfiltrowuje z listy cytowań tylko te, które realnie istnieją w KB.
 * AI może w odpowiedzi „wymyślić" slug — pokazujemy userowi link tylko
 * gdy artykuł faktycznie istnieje.
 */
export function filterValidCitations(slugs: string[]): string[] {
  const { slugs: valid } = buildKnowledgeBaseContext();
  const validSet = new Set(valid);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of slugs) {
    const clean = s.trim();
    if (validSet.has(clean) && !seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
    }
  }
  return out;
}
