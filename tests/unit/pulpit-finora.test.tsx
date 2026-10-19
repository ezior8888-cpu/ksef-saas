import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import DashboardHomePage from '@/app/(dashboard)/dashboard/page';

/**
 * Pulpit = strona Finance Finory 1:1 po polsku, dane przykładowe, bez FLO
 * (decyzja Bartosza 19.10.2026).
 */
describe('Pulpit — strona Finance Finory', () => {
  const html = renderToStaticMarkup(<DashboardHomePage />);

  it('ma karty Finory po polsku', () => {
    for (const text of [
      'Finanse', 'Przegląd roczny', 'Raport', 'Zobacz raport', 'Zamówienia', 'Zysk łącznie',
      'Przychód łącznie', 'Wyświetlenia', 'Odwiedzający', 'Szczegóły',
      'Najlepiej sprzedające się', 'Najczęściej kupowane', 'Użytkownik', 'Następna',
    ]) {
      expect(html).toContain(text);
    }
  });

  it('bez angielskich podpisów szablonu i bez dolarów', () => {
    for (const text of ['Total Orders', 'View Report', 'Top Products', 'Total visitors', 'Showing', 'No results']) {
      expect(html).not.toContain(text);
    }
    expect(html).not.toMatch(/\$\d/);
  });

  it('siatka Finory: grid-cols-6, karta Finance 4/6 od xl', () => {
    expect(html).toContain('grid grid-cols-6 gap-6');
    expect(html).toContain('col-span-full xl:col-span-4');
  });

  it('bez FLO i bez zdjęć z szablonu', () => {
    const src = readFileSync(join(process.cwd(), 'app/(dashboard)/dashboard/page.tsx'), 'utf8');
    expect(src).not.toMatch(/components\/flo\/|ff-flo-legacy|listProposals/);
    expect(html).not.toContain('/images/avatars');
  });
});
