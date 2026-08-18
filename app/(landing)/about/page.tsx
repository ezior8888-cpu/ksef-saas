import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { asset } from '../_assets';
import { Closing } from '../_components/closing';
import { IconSprite } from '../_components/icon-sprite';
import { SiteNav } from '../_components/site-nav';
import { Container, SectionHeading } from '../_components/ui';
import { Metrics } from './_components/metrics';
import { Reveal } from './_components/reveal';

export const metadata: Metadata = {
  title: 'O nas | FaktFlow',
  description:
    'Zespół, wartości i liczby stojące za FaktFlow — aplikacją do faktur KSeF dla mikrofirm.',
};

const VALUES = [
  {
    title: 'Jasne zasady',
    body: 'Mówimy wprost, ile co kosztuje i co dzieje się z danymi. Bez gwiazdek i drobnego druku.',
  },
  {
    title: 'Niezawodność',
    body: 'Faktura musi wyjść wtedy, kiedy jej potrzebujesz. Dlatego pilnujemy wysyłki nawet, gdy KSeF ma gorszy dzień.',
  },
  {
    title: 'Prostota',
    body: 'Zamieniamy urzędowe formularze w kilka pól do wypełnienia. Resztę robimy w tle.',
  },
  {
    title: 'Blisko użytkownika',
    body: 'Czytamy każdą wiadomość i poprawiamy to, co realnie przeszkadza w pracy.',
  },
];

const TEAM = [
  { name: 'Bartosz Gierszewski', role: 'Założyciel' },
  { name: 'Anna Wiśniewska', role: 'Produkt' },
  { name: 'Paweł Nowak', role: 'Wsparcie klienta' },
  { name: 'Katarzyna Lis', role: 'Księgowość' },
];

export default function AboutPage() {
  return (
    <>
      <IconSprite />
      <SiteNav />

      {/* ── nagłówek + galeria + liczby ─────────────────────────────── */}
      <header className="relative flex flex-col gap-16 pb-20 pt-[160px]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-5 top-5 h-[860px] rounded-[20px]"
          style={{
            background:
              'linear-gradient(180deg, #fff 0%, #fff 46%, #eff5fe 80%, #dbe8fb 100%)',
          }}
        />

        <Container className="relative flex flex-col items-center gap-10 text-center">
          <Reveal>
            <h1 className="z-h1 max-w-[820px]">
              Robimy program do faktur, którego sami chcieliśmy używać
            </h1>
          </Reveal>
          <Reveal delay={0.1}>
            <video
              src={asset.about.hero}
              width={400}
              height={254}
              autoPlay
              loop
              muted
              playsInline
              className="h-auto w-[400px] max-w-full"
            />
          </Reveal>
        </Container>

        <Container className="relative">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {asset.about.gallery.map((src, i) => (
              <Reveal key={src} delay={i * 0.06}>
                <div className="overflow-hidden rounded-[16px]">
                  <Image
                    src={src}
                    alt="Zespół przy pracy"
                    width={400}
                    height={400}
                    className="h-auto w-full transition-transform duration-500 hover:scale-[1.04]"
                  />
                </div>
              </Reveal>
            ))}
          </div>
        </Container>

        <div className="relative pt-6">
          <Metrics />
        </div>
      </header>

      {/* ── wartości ────────────────────────────────────────────────── */}
      <section className="bg-[var(--z-50)] py-20 lg:py-[80px]">
        <Container className="flex flex-col gap-16">
          <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-16">
            <div className="lg:w-[376px] lg:shrink-0">
              <h2 className="z-h2">W co wierzymy</h2>
            </div>
            <div className="flex flex-col gap-8 lg:max-w-[661px]">
              <p className="z-h4">
                Faktury to obowiązek, nie zajęcie. Chcemy, żeby zajmowały
                kilka minut dziennie, a nie cały wieczór na koniec miesiąca.
              </p>
              <div className="flex items-center gap-4">
                <Image
                  src={asset.about.founder}
                  alt="Bartosz Gierszewski"
                  width={56}
                  height={56}
                  className="size-14 rounded-full object-cover"
                />
                <div className="flex flex-col">
                  <span className="z-lead font-medium">Bartosz Gierszewski</span>
                  <span className="z-body text-[var(--z-muted)]">
                    Założyciel FaktFlow
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {VALUES.map((v, i) => (
              <Reveal key={v.title} delay={i * 0.06}>
                <div className="flex h-full flex-col gap-3 rounded-[20px] bg-white p-6 transition-shadow duration-300 hover:shadow-[0_16px_40px_-16px_rgba(16,32,64,0.22)]">
                  <h3 className="z-h4">{v.title}</h3>
                  <p className="z-body text-[var(--z-muted)]">{v.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* ── zespół ──────────────────────────────────────────────────── */}
      <section className="py-20 lg:py-[80px]">
        <Container className="flex flex-col gap-16">
          <SectionHeading
            title="Ludzie za FaktFlow"
            lead="Mały zespół, który zna KSeF od podszewki i sam prowadzi firmę."
            max={620}
          />
          <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
            {TEAM.map((m, i) => (
              <Reveal key={m.name} delay={i * 0.06}>
                <div className="flex flex-col gap-4">
                  <div className="overflow-hidden rounded-[16px] bg-[var(--z-50)]">
                    <Image
                      src={asset.about.team[i]}
                      alt={m.name}
                      width={271}
                      height={316}
                      className="h-auto w-full transition-transform duration-500 hover:scale-[1.04]"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="z-lead font-medium">{m.name}</span>
                    <span className="z-body text-[var(--z-muted)]">
                      {m.role}
                    </span>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* ── rekrutacja ──────────────────────────────────────────────── */}
      <section className="pb-20">
        <Container>
          <Reveal>
            <div className="flex flex-col items-center gap-8 rounded-[24px] bg-[var(--z-50)] px-6 py-16 text-center">
              <video
                src={asset.about.career}
                width={250}
                height={150}
                autoPlay
                loop
                muted
                playsInline
                className="h-auto w-[250px] max-w-full"
              />
              <div className="flex max-w-[620px] flex-col gap-4">
                <h2 className="z-h2">Dołącz do nas</h2>
                <p className="z-lead text-[var(--z-muted)]">
                  Szukamy ludzi, którzy lubią upraszczać skomplikowane rzeczy.
                  Napisz, nawet jeśli nie widzisz pasującego ogłoszenia.
                </p>
              </div>
              <Link
                href="https://www.linkedin.com"
                target="_blank"
                rel="noopener noreferrer"
                className="z-body inline-flex items-center rounded-[12px] bg-[var(--z-black)] px-5 py-3.5 font-medium text-white transition-transform hover:scale-[1.02]"
              >
                Zobacz oferty na LinkedIn
              </Link>
            </div>
          </Reveal>
        </Container>
      </section>

      <Closing />
    </>
  );
}
