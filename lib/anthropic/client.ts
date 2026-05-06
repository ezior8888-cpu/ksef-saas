import Anthropic from '@anthropic-ai/sdk';

export const OCR_MODEL = process.env.ANTHROPIC_OCR_MODEL ?? 'claude-sonnet-4-6';

let cachedClient: Anthropic | null = null;

/**
 * Lazy init — bez tego `next build` padałby przy imporcie łańcucha
 * (np. route → server action → categorization → ai-classifier), nawet gdy
 * build nie woła OCR. Na Vercel trzeba ustawić ANTHROPIC_API_KEY w env
 * projektu; błąd dopiero przy pierwszym wywołaniu API.
 */
export function getAnthropic(): Anthropic {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY missing');
  }
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}
