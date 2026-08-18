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
  title: 'O nas — FaktFlow',
  description:
    'Zespół, wartości i liczby stojące za FaktFlow — aplikacją do faktur KSeF dla mikrofirm.',
};

const VALUES = [
  {
    title: 'Transparency',
    body: 'We communicate clearly, operate openly, and ensure users always understand how their financial data is handled.',
  },
  {
    title: 'Reliability',
    body: 'We design every feature with precision and care, delivering consistent performance that users can trust every day.',
  },
  {
    title: 'Simplicity',
    body: 'We turn complex financial tasks into intuitive workflows so teams can focus on growth rather than manual processes.',
  },
  {
    title: 'Customer Focus',
    body: 'We listen closely, iterate quickly, and prioritize solutions that genuinely improve our customers’ financial operations.',
  },
];

const TEAM = [
  { name: 'Evan Mercer', role: 'Chief Executive Officer' },
  { name: 'Amy Park', role: 'Head of Product' },
  { name: 'Daniel Cho', role: 'Customer Success Manager' },
  { name: 'Sofia Ramirez', role: 'Lead Financial Analyst' },
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
              Zova unites teams around smarter financial decisions
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
              <h2 className="z-h2">Our values</h2>
            </div>
            <div className="flex flex-col gap-8 lg:max-w-[661px]">
              <p className="z-h4">
                At Zova, we believe teams make their best decisions when money
                is no longer a mystery. Our goal is simple: give every business
                the absolute clarity and insight they deserve.
              </p>
              <div className="flex items-center gap-4">
                <Image
                  src={asset.about.founder}
                  alt="Evan Mercer"
                  width={56}
                  height={56}
                  className="size-14 rounded-full object-cover"
                />
                <div className="flex flex-col">
                  <span className="z-lead font-medium">Evan Mercer</span>
                  <span className="z-body text-[var(--z-muted)]">
                    CEO, Zova Tech
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
            title="Our leadership and experts"
            lead="A dedicated team of analysts, engineers, and expert advisors helping you build a stronger financial foundation."
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
                <h2 className="z-h2">Grow your career at Zova</h2>
                <p className="z-lead text-[var(--z-muted)]">
                  Work with a trusted team that simplifies complex financial
                  workflows and brings clarity to every business we support.
                </p>
              </div>
              <Link
                href="https://www.linkedin.com"
                target="_blank"
                rel="noopener noreferrer"
                className="z-body inline-flex items-center rounded-[12px] bg-[var(--z-black)] px-5 py-3.5 font-medium text-white transition-transform hover:scale-[1.02]"
              >
                See openings on LinkedIn
              </Link>
            </div>
          </Reveal>
        </Container>
      </section>

      <Closing />
    </>
  );
}
