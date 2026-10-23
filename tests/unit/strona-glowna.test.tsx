import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import HomePage, { metadata } from '@/app/(home)/page';
import { PRICE_GROSS, TRIAL_DAYS } from '@/lib/billing/pricing';

/**
 * Strona główna od 23.10.2026: prosty układ w duchu Salient/TaxPal, pisany
 * od zera na naszych tokenach. Zasady od Bartosza:
 *  - bez opinii klientów (nie mamy prawdziwych, art. 7 pkt 23b-23c u.p.n.p.r.),
 *  - mało o produkcie, główny temat to agent FLO,
 *  - bez długich myślników w tekstach.
 * Agent FLO nie jest jeszcze dostępny dla klientów, więc strona musi to
 * mówić wprost (art. 5 u.p.n.p.r.).
 */

const html = renderToStaticMarkup(<HomePage />);
const text = html.replace(/<[^>]+>/g, ' ');

describe('strona główna', () => {
  it('bez długich myślników w tekstach i w tytule', () => {
    expect(text).not.toMatch(/[—–]/);
    expect(String(metadata.title)).not.toMatch(/[—–]/);
    expect(String(metadata.description)).not.toMatch(/[—–]/);
  });

  it('bez opinii, ocen i logotypów „klientów”', () => {
    expect(text).not.toMatch(/opini|ocen[ay]|zaufali|★/i);
  });

  it('FLO jako główny temat, ale wprost oznaczony jako niedostępny', () => {
    expect(text).toMatch(/agent AI/);
    expect(text).toContain('Wkrótce');
    expect(text).toContain('FLO jest w przygotowaniu');
    // Przykładowa wiadomość FLO podpisana jako przykład.
    expect(html).toMatch(/<figcaption[^>]*>[^<]*Przykład/);
  });

  it('cena i okres próbny z lib/billing/pricing', () => {
    expect(text).toContain(PRICE_GROSS);
    expect(text).toContain(`${TRIAL_DAYS} dni za darmo`);
  });

  it('kotwice, do których prowadzą O nas, Blog i stopka', () => {
    for (const id of ['flo', 'pricing', 'faq']) expect(html).toContain(`id="${id}"`);
    expect(html).toContain('href="/register"');
    expect(html).toContain('href="/login"');
  });

  it('nie korzysta z grafik szablonu Zova ani starego znaku marki', () => {
    const dir = join(process.cwd(), 'app/(home)');
    const sources = readdirSync(dir, { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('\n');
    expect(sources).not.toMatch(/\/landing\/|_assets|zova|faktflow-mark/);
  });
});
