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
 * jako fakty o FaktWay (wtedy FaktFlow) — fikcyjne logotypy „klientów”, ocenę 4,8, opinię
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
  ['app/(landing)/about/page.tsx', ['<Metrics />', '<TeamGrid />', 'linkedin.com']],
  // Strona główna od 23.10.2026 (app/(home)): te same zakazy, co na
  // poprzedniej (Zova). Treść pilnuje też tests/unit/strona-glowna.test.tsx.
  ['app/(home)/page.tsx', ['Testimonial', 'clientLogos']],
  ['app/(home)/_components/hero.tsx', ['Ocena 4,8', 'Logo klienta', 'asset.']],
  ['app/(home)/_components/sections.tsx', ['dziesięć lat', 'i księgujemy', 'z banku, poczty i sklepu', 'bez podawania karty', '+48 22 123 45 67']],
  ['app/(home)/_components/flo-section.tsx', ['sam pilnuje terminów i przepisów']],
  ['lib/jobs/runners/email-sequence.ts', ['Bez karty kredytowej', '[screenshot OCR]', 'beta-test', 'Fakturownią', 'KSeF SaaS', 'Już teraz się zwróciła']],
  ['content/help/okres-probny-trial.mdx', ['Bez karty na starcie', 'stan ograniczony']],
  ['components/marketing/landing-calculator-emerald.tsx', ['pomiarów beta-testerów']],
  ['components/marketing/savings-calculator-preview.tsx', ['pomiarów beta-testerów']],
  // Rewizja 15.10.2026: „zrzuty produktu” z szablonu (panel inwestycyjny
  // „Zova AI” z Apple/Google/Meta), znak Zova AI jako nasze logo, zdjęcia
  // obcych osób jako nasz zespół i założyciel, obietnice „10 lat”.
  ['app/(landing)/about/page.tsx', ['asset.about.gallery', 'asset.about.founder', 'asset.hero.dashboard', 'bez podawania karty']],
  ['app/(landing)/_assets.ts', ['licencja darmowa', 'logo: `${IMG}/oKmGzYlWFu13ruJRasum68wrh5Y.png`']],
  // Ekrany logowania od planu Finora (E10b): auth-page-shell usunięty, znak
  // marki rysuje components/auth/finora/auth-logo.tsx.
  ['components/auth/finora/auth-logo.tsx', ['oKmGzYlWFu13ruJRasum68wrh5Y']],
  ['app/(dashboard)/settings/billing/_components/plan-cards.tsx', ['PWA mobilna']],
  ['app/layout.tsx', ["title: 'KSeF SaaS'", "applicationName: 'KSeF SaaS'"]],
  ['content/blog/ile-mikrofirma-traci-na-recznym-fakturowaniu.mdx', ['ankiety wśród', 'przeprowadziliśmy']],
  // „art. 187 KPC” to przepis o treści pozwu, nie podstawa wezwania (#268).
  ['content/blog/wkurzacz-dluznikow-jak-walczyc-z-zaleglymi.mdx', ['beta-test', 'z ~24 do ~11', 'art. 187 KPC']],
  ['content/blog/migracja-z-fakturownia-do-ksef-saas-w-5-min.mdx', ['beta testerzy']],
];

/**
 * Cennik i pomoc nie mogą sprzedawać wyłączonych eksportów jako dostępnych
 * (lib/exports/suspended-formats.ts). Nazwa wolno, tylko z „w przygotowaniu”.
 */
const SUSPENDED_PRODUCT_NAMES = ['Comarch Optima', 'Insert Subiekt', 'Wapro Mag', 'Symfonia'];
const PRICE_LIST_FORBIDDEN = [
  'Bez limitu paragonów', 'Retencja 10 lat', 'GDPR-compliant', 'Live chat', 'Bank EU',
  'PWA installable', "'JPK_V7M'",
  ...SUSPENDED_PRODUCT_NAMES.map((n) => `'${n}'`),
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

  it('cennik: tylko funkcje, które działają dziś', () => {
    const source = read('app/(marketing)/pricing/page.tsx');
    for (const phrase of PRICE_LIST_FORBIDDEN) expect(source, phrase).not.toContain(phrase);
    expect(source).toContain('W przygotowaniu (jeszcze niedostępne)');
  });

  it.each(['content/help/eksport-kpir-dla-ksiegowego.mdx', 'content/help/portal-ksiegowego.mdx'])(
    'pomoc %s nie obiecuje wyłączonych eksportów',
    (file) => {
      const source = read(file);
      expect(source).not.toMatch(/Comarch Optima, Symfonia/);
      expect(source).not.toMatch(/formatach: Comarch Optima/);
      expect(source).toContain('przygotowaniu');
    },
  );

  // Formularz kontaktowy ze strony głównej Zova (composeMail) zniknął razem
  // z nią 23.10.2026; kontakt prowadzi na /kontakt (adres e-mail, bez formularza).
  it('stopki i nawigacja prowadzą do kontaktu na /kontakt', () => {
    expect(read('app/(home)/_components/site-footer.tsx')).toContain("href: '/kontakt'");
    expect(read('app/(landing)/_components/closing.tsx')).toContain("href: '/kontakt'");
    expect(read('app/(landing)/_components/site-nav.tsx')).toContain("href: '/kontakt'");
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
