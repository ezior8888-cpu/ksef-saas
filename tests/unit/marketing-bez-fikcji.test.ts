import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

import sitemap from '@/app/sitemap';
import ComparisonLayout from '@/app/(marketing)/vs/layout';
import { COMPARISON_PAGES_PUBLISHED } from '@/lib/marketing/comparisons';

/**
 * Przegląd prawny 15.10.2026: strona i maile pokazywały treści z szablonu
 * jako fakty o FaktFlow — fikcyjne logotypy „klientów”, ocenę 4,8, opinię
 * nieistniejącej osoby, zmyślone statystyki („1,2 mln faktur”), fikcyjny
 * zespół, zmyślony telefon i adres firmy, integracje, których nie ma
 * („bank, poczta, sklep”). Fałszywe opinie i oceny są zakazane w każdych
 * okolicznościach (art. 7 pkt 23b–23c u.p.n.p.r.); reszta to wprowadzanie
 * w błąd (art. 5 u.p.n.p.r., art. 16 u.z.n.k.). Strażnik pilnuje, żeby nie
 * wróciły przy kolejnej podmianie szablonu.
 */

/**
 * Treść pliku bez komentarzy — komentarze celowo cytują usunięte frazy
 * („do 15.10.2026 był tu telefon …”), a sprawdzamy to, co widzi klient.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
}

const read = (p: string) => stripComments(readFileSync(p, 'utf8'));

const FORBIDDEN: Array<[file: string, phrases: string[]]> = [
  ['app/(landing)/_components/hero.tsx', ['Ocena 4,8', 'clientLogos', 'Logo klienta']],
  ['app/(landing)/page.tsx', ['<Testimonial />']],
  ['app/(landing)/about/page.tsx', ['<Metrics />', '<TeamGrid />', 'linkedin.com']],
  ['app/(landing)/_components/contact.tsx', ['+48 22 123 45 67', 'Piękna 15', 'Bez botów', 'onSubmit={(e) => e.preventDefault()}']],
  ['app/(landing)/_components/integrations.tsx', ['z banku, poczty i sklepu', 'Logo integracji']],
  ['lib/jobs/runners/email-sequence.ts', ['Bez karty kredytowej', '[screenshot OCR]', 'beta-test', 'Fakturownią', 'KSeF SaaS', 'Już teraz się zwróciła']],
  ['content/help/okres-probny-trial.mdx', ['Bez karty na starcie', 'stan ograniczony']],
  ['components/marketing/landing-calculator-emerald.tsx', ['pomiarów beta-testerów']],
  ['components/marketing/savings-calculator-preview.tsx', ['pomiarów beta-testerów']],
];

describe('marketing bez fikcyjnych dowodów i obietnic', () => {
  it('wycinanie komentarzy nie zjada kodu (znany przypadek)', () => {
    const sample = "// '+48 22 123 45 67'\nconst a = 'Ocena 4,8';\n{/* Piękna 15 */}";
    expect(stripComments(sample)).toContain('Ocena 4,8');
    expect(stripComments(sample)).not.toContain('+48 22');
    expect(stripComments(sample)).not.toContain('Piękna');
  });

  it.each(FORBIDDEN)('%s', (file, phrases) => {
    const source = read(file);
    for (const phrase of phrases) expect(source, phrase).not.toContain(phrase);
  });

  it('formularz kontaktowy przekazuje wiadomość dalej, a nie ją gubi', () => {
    expect(read('app/(landing)/_components/contact.tsx')).toContain('window.location.href = composeMail(');
  });
});

describe('strony porównawcze /vs/*', () => {
  it('są wyłączone, dopóki treść nie przejdzie weryfikacji', () => {
    expect(COMPARISON_PAGES_PUBLISHED).toBe(false);
    expect(() => ComparisonLayout({ children: null })).toThrow('NEXT_NOT_FOUND');
  });

  it('nie ma ich w mapie strony', () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls.some((u) => u.includes('/vs/'))).toBe(false);
  });
});
