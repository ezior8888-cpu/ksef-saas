import type { Metadata } from 'next';

import { PRICE_PER_MONTH, TRIAL_DAYS } from '@/lib/billing/pricing';

import { FloSection } from './_components/flo-section';
import { Hero } from './_components/hero';
import { CallToAction, Faq, Features, Pricing } from './_components/sections';
import { SiteFooter } from './_components/site-footer';
import { SiteHeader } from './_components/site-header';

export const metadata: Metadata = {
  title: 'FaktWay: faktury w KSeF bez stresu',
  description: `Wystawiasz fakturę, a FaktWay wysyła ją do KSeF, pilnuje potwierdzenia i płatności. Do tego FLO, agent AI, który przygotowuje robotę za Ciebie. ${TRIAL_DAYS} dni za darmo, potem ${PRICE_PER_MONTH}.`,
};

/**
 * Strona główna od 23.10.2026: prosty układ w duchu szablonu Salient
 * (TaxPal), napisany od zera na tokenach aplikacji. Z Salient nie ma tu kodu,
 * grafik ani tekstów, tylko ogólny układ sekcji. Bez opinii klientów,
 * logotypów i liczb, bo nie mamy prawdziwych (tests/unit/strona-glowna).
 *
 * Strona jest o FaktWay, a agent FLO to dodatek. FLO jest opisany jako
 * dostępny, więc strona może wyjść dopiero razem z nim (decyzja Bartosza
 * z 23.10.2026). Wcześniej byłaby obietnicą bez pokrycia (art. 5 u.p.n.p.r.).
 *
 * Osobna grupa tras, bo `(landing)/layout.tsx` owija strony w motyw Zova,
 * a ta strona używa motywu aplikacji (jasny i ciemny).
 */
export default function HomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main>
        <Hero />
        <Features />
        <FloSection />
        <Pricing />
        <Faq />
        <CallToAction />
      </main>
      <SiteFooter />
    </div>
  );
}
