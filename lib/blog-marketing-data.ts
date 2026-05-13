/** Obrazy z makietu (Google CDN) — zgodne z `next.config` remotePatterns. */

export const BLOG_HERO_IMAGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCLTACRh6CrZBioZJVW00SNsj1B9piO7MZZ5eA20mZwfiWt78I6zr33gS8oewnA48FLXfKQNJwdmT5W2YADJg6bSaGqbbuYzh20mnDYgALzoeEsMwfS4Cl3nDtAvIINeOnSCjNQgfcFcYv1l-aClL7ke77LBQ3d7B8zev3p7l1GEu8QNBwEOjF2ngp1T2MX0RUYKiapmbGcrkjAcCD63aNNEJibH5g7kxpy_ftdk7vJFwDbTXgRWtcARmUbA_hKv7Y8Z-MCbQvk9TY';

const BLOG_CARD_IMAGES = [
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCqu_adQiEh4QIbbdzcJ9XWEJg0PVuxMEJCIho9hbmtwy-DnTtiKOTiHiwKjN8Yo9QEn_kcbKnWyFU8a4QZK1s35qud6uOnmmRHIeAaGVJjSDWAGq7Wil28ZhZVnD71ICOn9YLhVAFzHecP7RpjSHjwoEu4JBiEgGqUHyVDd_eVT4zsylL7VAqaJUHvGg_vKgp2zsOjmb2WXRyR7_GhtT6gDdnU_LpE_2mNYI2OpISSSfX3P9U-z0yzBcxPCq4bjz6sgpUJW8LNw3o',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuD3Bt8nQiojyT-RjjWvFtdFHmDyMLtjjMUmJtFpRTxGHrs4Jk6NBjxtu6meRMMKqwd8dWK2Gt5icPDmMtd3Gqr4fWhucNbDbYmkNmjPvuRKHUy7HUNE9uNQkqmbqLHXE1if9SvthLLx9bYq1q8Dzb7WzRwXR8ZdKgpf08ea_HSPmKVeRw5SmSi0c1fGw62pp9gBSxKL_pLCAxp8m9x2uBQnoNg_On6PDckC0M6ga9_GBt79oOWCApTB_exb4LfxUHIKUyO34JVJ_1E',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuC6JUpR-OQdtq9CtKe2CH0OgLsOQ8UcR_SRsWoz6vAPq-2BopMTo0Zx5d5R_i4U_qoC9TSxWv6fpk2KHUjiQcv_uDfuB1S9gz5jQEnRFVU0NTuEj5x1qljW7p9bdfIx3Iyq-QFGQVFBYtsRWDGw_Sa1VCGCJuxjHrRI2AsD9zzk8z_K2UT1JXuKez9WaG-kuLkmlmNdC465M1spffzJ1genYYq6CM2RVoZiwBVjxUjHrMyUuk30ZJFq9ThXEjpe_rX9sjtvCN02-Vc',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDubmq-VnQar5qJIjmzM8XkV026jHaPSkuOfxk9-F1Ryf1LaBm5YdW3v_WuqeQqAcsfaywvBBvlMluj4Zit9pkz9hqDxl3n2OEJRQ0lvTlunASCK4uXSDXNFHJJKEl83gKvMVTMcvirpoKAT38a8zI0kmwt4LFOym1pF0X_SP-HLHCUsM_VdUmRGkbN6RJzK1GlvMIlGcp4PVZsqsawbHc7Di3yo8EKaBJKna_DxQ7ONG9jhRsn8xPcY5Zbs6cLCpoFS5QjYfqX3KA',
] as const;

const SLUG_CARD_IMAGE: Record<string, (typeof BLOG_CARD_IMAGES)[number]> = {
  'jak-zoptymalizowac-kpir-paragon-z-ocr': BLOG_CARD_IMAGES[0],
  'migracja-z-fakturownia-do-ksef-saas-w-5-min': BLOG_CARD_IMAGES[1],
  'ile-mikrofirma-traci-na-recznym-fakturowaniu': BLOG_CARD_IMAGES[2],
  'wkurzacz-dluznikow-jak-walczyc-z-zaleglymi': BLOG_CARD_IMAGES[3],
  'ksef-2-co-warto-wiedziec': BLOG_CARD_IMAGES[0],
};

export type BlogSidebarCategory = 'ksef-prawo' | 'automatyzacja' | 'podatki';

export type BlogCardTone = 'automatyzacja' | 'podatki' | 'porady' | 'ksef';

export interface BlogPostEnriched {
  slug: string;
  title: string;
  description: string;
  date: string;
  readTime: number;
  tags: string[];
  sidebarCategory: BlogSidebarCategory;
  cardTone: BlogCardTone;
  cardLabel: string;
  coverSrc: string;
}

function sidebarCategoryFromSlug(slug: string): BlogSidebarCategory {
  if (slug === 'ksef-2026-co-musi-wiedziec-mikrofirma' || slug === 'ksef-2-co-warto-wiedziec') {
    return 'ksef-prawo';
  }
  if (slug === 'ile-mikrofirma-traci-na-recznym-fakturowaniu') {
    return 'podatki';
  }
  return 'automatyzacja';
}

function cardPresentationFromSlug(slug: string): { cardTone: BlogCardTone; cardLabel: string } {
  if (slug === 'ksef-2026-co-musi-wiedziec-mikrofirma' || slug === 'ksef-2-co-warto-wiedziec') {
    return { cardTone: 'ksef', cardLabel: 'KSeF' };
  }
  if (slug === 'jak-zoptymalizowac-kpir-paragon-z-ocr' || slug === 'migracja-z-fakturownia-do-ksef-saas-w-5-min') {
    return { cardTone: 'automatyzacja', cardLabel: 'Automatyzacja' };
  }
  if (slug === 'ile-mikrofirma-traci-na-recznym-fakturowaniu') {
    return { cardTone: 'podatki', cardLabel: 'Podatki' };
  }
  return { cardTone: 'porady', cardLabel: 'Porady' };
}

function coverForSlug(slug: string, indexFallback: number): string {
  const mapped = SLUG_CARD_IMAGE[slug];
  if (mapped) return mapped;
  return BLOG_CARD_IMAGES[indexFallback % BLOG_CARD_IMAGES.length];
}

export const FEATURED_POST_SLUG = 'ksef-2026-co-musi-wiedziec-mikrofirma';

export function enrichBlogPost(
  post: { slug: string; title: string; description: string; date: string; readTime: number; tags: string[] },
  index: number,
): BlogPostEnriched {
  const { cardTone, cardLabel } = cardPresentationFromSlug(post.slug);
  return {
    ...post,
    sidebarCategory: sidebarCategoryFromSlug(post.slug),
    cardTone,
    cardLabel,
    coverSrc: coverForSlug(post.slug, index),
  };
}

export function countBySidebarCategory(posts: BlogPostEnriched[]): Record<BlogSidebarCategory, number> {
  return posts.reduce(
    (acc, p) => {
      acc[p.sidebarCategory] += 1;
      return acc;
    },
    { 'ksef-prawo': 0, automatyzacja: 0, podatki: 0 } satisfies Record<BlogSidebarCategory, number>,
  );
}

export const BLOG_SIDEBAR_LINKS: { id: 'all' | BlogSidebarCategory; label: string }[] = [
  { id: 'all', label: 'Wszystkie wpisy' },
  { id: 'ksef-prawo', label: 'KSeF & Prawo' },
  { id: 'automatyzacja', label: 'Automatyzacja' },
  { id: 'podatki', label: 'Podatki' },
];
