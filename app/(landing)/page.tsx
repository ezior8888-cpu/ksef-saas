import { Blog } from './_components/blog';
import { Closing, SiteFooter } from './_components/closing';
import { Contact } from './_components/contact';
import { Faq } from './_components/faq';
import { FeaturesStrip } from './_components/features-strip';
import { Hero } from './_components/hero';
import { IconSprite } from './_components/icon-sprite';
import { Integrations } from './_components/integrations';
import { Pricing } from './_components/pricing';
import { Process } from './_components/process';
import { SiteNav } from './_components/site-nav';
import { WhyUs } from './_components/why-us';

/**
 * Strona główna — wierna kopia szablonu Zova (Lunis Design, licencja darmowa).
 * Kolejność sekcji zgodna z oryginałem.
 *
 * Bez sekcji `Testimonial` od 15.10.2026: opinia „Marcina Zawadzkiego” ze
 * zdjęciem pochodziła z szablonu, nie od klienta. Fałszywa opinia konsumenta
 * to praktyka zakazana w każdych okolicznościach (art. 7 pkt 23b–23c
 * u.p.n.p.r.). Komponent zostaje — wraca z prawdziwą opinią i zgodą autora.
 */
export default function LandingPage() {
  return (
    <>
      <IconSprite />
      <SiteNav />
      <Hero />
      <FeaturesStrip />
      <WhyUs />
      <Process />
      <Integrations />
      <Pricing />
      <Faq />
      <Blog />
      <Contact />
      <Closing />
      <SiteFooter />
    </>
  );
}
