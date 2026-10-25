import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import HomePage, { metadata } from '@/app/(home)/page';
import { PRICE_GROSS, TRIAL_DAYS } from '@/lib/billing/pricing';

/**
 * Strona główna od 23.10.2026: prosty układ w duchu Salient/TaxPal, pisany
 * od zera na naszych tokenach. Zasady od Bartosza:
 *  - strona jest o FaktWay (fakturowanie z automatyzacją), agent FLO to
 *    dodatek i powód, żeby zostać;
 *  - FLO opisany jako dostępny, bo strona wychodzi razem z nim
 *    (PR scalany dopiero w dniu udostępnienia FLO klientom);
 *  - bez opinii klientów (nie mamy prawdziwych, art. 7 pkt 23b-23c u.p.n.p.r.);
 *  - bez plakietek nad nagłówkami i bez długich myślników w tekstach.
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

  it('nagłówek mówi o fakturach, FLO dopiero dalej', () => {
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '';
    expect(h1).toContain('KSeF');
    expect(h1).not.toContain('FLO');
    expect(html.indexOf('id="funkcje"')).toBeLessThan(html.indexOf('id="flo"'));
    expect(text).toContain('agent AI');
  });

  it('bez plakietki nad nagłówkiem strony', () => {
    const beforeH1 = html.slice(0, html.indexOf('<h1'));
    expect(beforeH1).not.toMatch(/rounded-full[^"]*bg-accent/);
  });

  it('cena i okres próbny z lib/billing/pricing', () => {
    expect(text).toContain(PRICE_GROSS);
    expect(text).toContain(`${TRIAL_DAYS} dni za darmo`);
  });

  it('kotwice, do których prowadzą nawigacja, O nas, Blog i stopka', () => {
    for (const id of ['funkcje', 'flo', 'pricing', 'faq']) expect(html).toContain(`id="${id}"`);
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
