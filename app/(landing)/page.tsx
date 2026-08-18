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
import { Testimonial } from './_components/testimonial';
import { WhyUs } from './_components/why-us';

/**
 * Strona główna — wierna kopia szablonu Zova (Lunis Design, licencja darmowa).
 * Kolejność sekcji zgodna z oryginałem.
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
      <Testimonial />
      <Faq />
      <Blog />
      <Contact />
      <Closing />
      <SiteFooter />
    </>
  );
}
