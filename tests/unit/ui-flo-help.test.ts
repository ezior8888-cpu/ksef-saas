import { describe, expect, it } from 'vitest';
import { getAllHelpArticles, HELP_CATEGORIES } from '@/lib/help/articles';

describe('baza wiedzy o agencie (krok 36)', () => {
  const articles = getAllHelpArticles().filter((a) => a.slug.startsWith('flo-'));

  it('sześć artykułów o agencie jest wczytanych', () => {
    expect(articles).toHaveLength(6);
  });

  it('wszystkie siedzą w kategorii Agent Flo', () => {
    expect(HELP_CATEGORIES.some((c) => c.id === 'flo')).toBe(true);
    for (const a of articles) expect(a.category).toBe('flo');
  });

  it('każdy ma streszczenie dla czatu wsparcia', () => {
    for (const a of articles) {
      expect(a.summary.length).toBeGreaterThan(30);
      expect(a.content.length).toBeGreaterThan(400);
    }
  });

  it('opisują dokładnie te tematy, które każe plan', () => {
    const slugs = articles.map((a) => a.slug).sort();
    expect(slugs).toEqual([
      'flo-cisza',
      'flo-cofanie',
      'flo-czym-jest',
      'flo-dlaczego-pyta',
      'flo-dlaczego-to-widze',
      'flo-wyciszanie',
    ]);
  });
});
