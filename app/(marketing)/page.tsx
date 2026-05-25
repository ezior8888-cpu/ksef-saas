import type { Metadata } from 'next';

// Faza 22: edge caching dla landingu. 5min revalidate + on-demand purge
// dla deploy'ów. Stronę odwiedzają anonimowi goście — żadna personalizacja,
// safe na edge cache. Crawlerzy (Google, indeksery) dostają tę samą wersję.
export const revalidate = 300; // 5 minut
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { LandingHero } from '@/components/marketing/landing-hero';
import { SavingsCalculatorPreview } from '@/components/marketing/savings-calculator-preview';
import { FaqSection } from '@/components/marketing/faq-section';

export const metadata: Metadata = {
  title: 'FaktFlow — faktury KSeF 2026 dla mikrofirm | Zdjęcie paragonu = wpis do KPiR',
  description:
    'Wystawiaj faktury i wysyłaj do KSeF jednym kliknięciem. Zdjęcie paragonu trafia automatycznie do KPiR. 30 dni za darmo, 60 dni gwarancji zwrotu.',
};

export default function LandingPage() {
  return (
    <>
      <LandingHero />

      {/* SEKCJA 02 — Stare apki vs asystent (red X vs emerald check) */}
      <section className="bg-zinc-100 py-24 lg:py-32">
        <div className="mx-auto max-w-6xl px-6 lg:px-8">
          <div className="mx-auto mb-16 max-w-3xl text-center">
            <p className="marketing-section-label mb-3">
              Konkurencja zostaje w tyle
            </p>
            <h2 className="marketing-hero-title text-4xl md:text-5xl">
              Stare apki to formularze.{' '}
              <span className="text-zinc-500">Nasza apka to asystent.</span>
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <ProblemCard
              title="W Fakturownia / inFakt / wFirma"
              issues={[
                'Wpisujesz każdą pozycję ręcznie',
                'KSeF authorization czasem zawiesza się na 24h',
                'Faktura znika w KSeF, ale apka pokazuje „wysłana”',
                'Brak mobile app albo tylko podgląd',
                'Korekta wymaga 8 kroków i kalkulatora w drugiej karcie',
              ]}
            />
            <SolutionCard
              title="W FaktFlow"
              features={[
                'Zdjęcie paragonu → automatycznie KPiR + kategoryzacja',
                'Pre-send walidacja FA(3) — gwarancja poprawności',
                'Post-send monitoring — sprawdzamy realny status',
                'Pełnoprawna PWA z aparatem i push notif',
                'Korekta jednym klikiem z auto-wyliczeniem',
              ]}
            />
          </div>
        </div>
      </section>

      {/* SEKCJA 03 — Sześć funkcji w glass cards */}
      <section className="bg-white py-24 lg:py-32">
        <div className="mx-auto max-w-6xl px-6 lg:px-8">
          <div className="mx-auto mb-16 max-w-3xl text-center">
            <p className="marketing-section-label mb-3">Co Ci to da</p>
            <h2 className="marketing-hero-title text-4xl md:text-5xl">
              Oszczędzaj do{' '}
              <span className="font-editorial italic marketing-gradient-emerald">
                42 godzin
              </span>{' '}
              rocznie
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={<CameraIcon />}
              title="OCR + Auto-KPiR"
              description="Robisz zdjęcie paragonu. AI rozpoznaje sprzedawcę, kwotę i VAT. Automatycznie wpisuje do właściwej kolumny KPiR."
              proof="80% mniej czasu"
            />
            <FeatureCard
              icon={<ShieldIcon />}
              title="KSeF 2.0 Compliance"
              description="UPO automatycznie archiwizowane. Tryb Offline24 dla awarii MF. Pre-send walidacja FA(3) — bezstresowa wysyłka."
              proof="Zero stresu z US"
            />
            <FeatureCard
              icon={<TrendingIcon />}
              title="Wkurzacz Dłużników"
              description="Automatyczne przypomnienia i wezwania do zapłaty. System sam zatrzymuje się, gdy klient wpłaca."
              proof="Krótsze DSO o 50%"
            />
            <FeatureCard
              icon={<ZapIcon />}
              title="Magiczny Import"
              description="Migracja z inFakt / Fakturownia / wFirma w 5 minut. Zero ręcznego przepisywania historii."
            />
            <FeatureCard
              icon={<FileIcon />}
              title="Co-Pilot Księgowego"
              description="Co miesiąc apka sama wysyła księgowej kompletny pakiet: JPK_FA, KPiR Excel, Comarch, Symfonia, Insert."
              proof="Księgowa Cię pokocha"
            />
            <FeatureCard
              icon={<PhoneIcon />}
              title="Mobile-First PWA"
              description="Pełnoprawna aplikacja na telefonie. Aparat, push, swipe gestures, tryb offline. Instalujesz jak natywną apkę."
              proof="60% akcji z telefonu"
            />
          </div>
        </div>
      </section>

      {/* SEKCJA 04 — Kalkulator oszczędności */}
      <section className="bg-zinc-100 py-24 lg:py-32">
        <div className="mx-auto max-w-5xl px-6 lg:px-8">
          <div className="mx-auto mb-12 max-w-3xl text-center">
            <p className="marketing-section-label mb-3">Sprawdź sam</p>
            <h2 className="marketing-hero-title text-4xl md:text-5xl">
              Ile{' '}
              <span className="font-editorial italic marketing-gradient-emerald">
                zaoszczędzisz?
              </span>
            </h2>
          </div>
          <SavingsCalculatorPreview />
        </div>
      </section>

      {/* SEKCJA 05 — Testimoniale */}
      <section className="bg-white py-24 lg:py-32">
        <div className="mx-auto max-w-6xl px-6 lg:px-8">
          <div className="mx-auto mb-16 max-w-3xl text-center">
            <p className="marketing-section-label mb-3">Zaufali nam</p>
            <h2 className="marketing-hero-title text-4xl md:text-5xl">
              Głosy{' '}
              <span className="font-editorial italic marketing-gradient-emerald">
                przedsiębiorców
              </span>
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <TestimonialCard
              quote="Przesiadka z inFaktu zajęła 3 minuty. Funkcja skanowania paragonów to złoto — wreszcie nie mam sterty papierów w aucie."
              author="Marek Kowalski"
              role="Agencja SEO"
              initials="MK"
            />
            <TestimonialCard
              quote="Wkurzacz Dłużników uratował mój cashflow. Klienci płacą po pierwszym SMS-ie, a ja nie muszę się o to prosić osobiście."
              author="Anna Nowak"
              role="Studio graficzne"
              initials="AN"
            />
            <TestimonialCard
              quote="KSeF wydawał się przerażający, ale z FaktFlow to po prostu kolejny przycisk. Żadnych błędów, żadnych stresów."
              author="Piotr Wiśniewski"
              role="E-commerce"
              initials="PW"
            />
          </div>
        </div>
      </section>

      {/* SEKCJA 06 — Pricing — single plan z emerald glow */}
      <section className="bg-zinc-100 py-24 lg:py-32">
        <div className="mx-auto max-w-4xl px-6 text-center lg:px-8">
          <p className="marketing-section-label mb-3">Cennik</p>
          <h2 className="marketing-hero-title mb-6 text-4xl md:text-5xl">
            Jeden plan.{' '}
            <span className="font-editorial italic marketing-gradient-emerald">
              Wszystkie funkcje.
            </span>
          </h2>
          <p className="mx-auto mb-16 max-w-2xl text-lg text-zinc-600 md:text-xl">
            Bez ukrytych dodatków. Bez &bdquo;premium-only&rdquo; toggle do OCR.
            Wszystko od pierwszego dnia.
          </p>

          <div className="relative mx-auto inline-block w-full max-w-md">
            {/* Aura emerald wokół karty */}
            <div
              className="pointer-events-none absolute -inset-6 bg-gradient-to-br from-emerald-500/30 via-emerald-500/10 to-emerald-500/30 opacity-60 blur-2xl"
              aria-hidden
            />
            <div className="marketing-emerald-card relative rounded-3xl p-10">
              <p className="marketing-section-label">Plan podstawowy</p>
              <p className="mt-4 flex items-baseline justify-center gap-2 text-zinc-900">
                <span className="text-7xl font-bold tracking-tight">49 zł</span>
                <span className="text-lg text-zinc-600">/ mc</span>
              </p>
              <p className="mt-1 text-sm text-zinc-600">
                Płatne rocznie · 588 zł / rok · VAT 23%
              </p>

              <ul className="mt-8 space-y-2.5 text-left">
                {[
                  'Faktury sprzedaż + zakupy bez limitu',
                  'OCR z auto-kategoryzacją KPiR',
                  'KSeF 2.0 + UPO + walidacja',
                  'Wkurzacz Dłużników',
                  'Magiczny import z innych apek',
                  'Co-Pilot Księgowego',
                  'PWA mobilna z OCR + push',
                  'Bank Frankfurt (UE)',
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2.5 text-sm text-zinc-700"
                  >
                    <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/register"
                className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-500 px-6 py-3.5 text-sm font-semibold text-emerald-950 shadow-[0_0_24px_-4px_var(--ff-emerald-glow)] transition-all hover:bg-emerald-400 hover:shadow-[0_0_36px_0_var(--ff-emerald-glow)]"
              >
                Wypróbuj 30 dni za darmo
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                + 60 dni money-back guarantee
              </p>
            </div>
          </div>
        </div>
      </section>

      <FaqSection />

      {/* SEKCJA 08 — Final CTA — wielki emerald gradient banner */}
      <section className="py-16 lg:py-24">
        <div className="mx-auto max-w-6xl px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl">
            {/* Emerald gradient bg z glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-500" aria-hidden />
            <div className="absolute inset-0 opacity-30 mix-blend-overlay" style={{
              backgroundImage: 'radial-gradient(circle at 30% 20%, white 0%, transparent 50%), radial-gradient(circle at 70% 80%, white 0%, transparent 50%)',
            }} aria-hidden />

            <div className="relative px-8 py-20 text-center text-emerald-950 lg:px-16 lg:py-28">
              <h2 className="mx-auto max-w-3xl text-4xl font-bold leading-tight tracking-tight md:text-6xl">
                Odzyskaj swój czas.
                <br />
                <span className="font-editorial italic">Zacznij dzisiaj.</span>
              </h2>
              <p className="mx-auto mt-6 max-w-xl text-lg font-medium text-emerald-950/80 md:text-xl">
                Pierwsze 30 dni za darmo. Potem tylko 49 zł netto / mc.
                <br />
                Bez zobowiązań, bez karty.
              </p>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-emerald-700 shadow-lg transition-transform hover:scale-105"
                >
                  Wypróbuj 30 dni za darmo
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link
                  href="/pricing"
                  className="inline-flex items-center gap-2 rounded-full border-2 border-emerald-950/30 bg-transparent px-7 py-3 text-sm font-semibold text-emerald-950 transition-colors hover:border-emerald-950/60 hover:bg-emerald-950/5"
                >
                  Pełny cennik
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

/* ─── Dark/glow helpery dla landingu ─── */

function ProblemCard({ title, issues }: { title: string; issues: string[] }) {
  return (
    <div className="marketing-glass-card rounded-2xl p-7">
      <h3 className="mb-5 text-lg font-semibold text-rose-700">{title}</h3>
      <ul className="space-y-3">
        {issues.map((issue) => (
          <li key={issue} className="flex items-start gap-2.5 text-sm">
            <XIcon className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <span className="text-zinc-600">{issue}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SolutionCard({ title, features }: { title: string; features: string[] }) {
  return (
    <div className="marketing-emerald-card rounded-2xl p-7">
      <h3 className="mb-5 text-lg font-semibold text-emerald-800">{title}</h3>
      <ul className="space-y-3">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-sm">
            <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <span className="text-zinc-700">{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  proof,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  proof?: string;
}) {
  return (
    <article className="marketing-glass-card rounded-2xl p-7">
      <div className="marketing-icon-chip mb-5 h-11 w-11">
        {icon}
      </div>
      <h3 className="mb-2.5 text-lg font-semibold text-zinc-900">{title}</h3>
      <p className="text-sm leading-relaxed text-zinc-600">
        {description}
      </p>
      {proof && (
        <div className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--marketing-accent)_14%,transparent)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--marketing-accent)] ring-1 ring-[color-mix(in_srgb,var(--marketing-accent)_30%,transparent)]">
          <CheckIcon className="h-3 w-3" />
          {proof}
        </div>
      )}
    </article>
  );
}

function TestimonialCard({
  quote,
  author,
  role,
  initials,
}: {
  quote: string;
  author: string;
  role: string;
  initials: string;
}) {
  return (
    <article className="marketing-glass-card flex h-full flex-col rounded-2xl p-7">
      {/* 5 gwiazdek emerald */}
      <div className="mb-4 flex gap-0.5">
        {Array.from({ length: 5 }, (_, i) => (
          <StarIcon key={i} className="h-4 w-4 text-emerald-600" />
        ))}
      </div>
      <p className="mb-6 flex-1 text-sm leading-relaxed text-zinc-700">
        &bdquo;{quote}&rdquo;
      </p>
      <div className="flex items-center gap-3 border-t border-white/10 pt-5">
        <div className="marketing-icon-chip flex h-10 w-10 rounded-full text-sm font-semibold">
          {initials}
        </div>
        <div>
          <p className="text-sm font-semibold text-zinc-900">{author}</p>
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            {role}
          </p>
        </div>
      </div>
    </article>
  );
}

/* ─── Inline SVG icons (zamiast lucide — pełna kontrola wagi/koloru) ─── */

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
  );
}
function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
  );
}
function TrendingIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
  );
}
function ZapIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
  );
}
function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
  );
}
function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><rect x="5" y="2" width="14" height="20" rx="2.5"/><line x1="12" y1="18" x2="12" y2="18.01"/></svg>
  );
}
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className ?? 'h-4 w-4'}><polyline points="20 6 9 17 4 12"/></svg>
  );
}
function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className ?? 'h-4 w-4'}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
  );
}
function StarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className ?? 'h-4 w-4'}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
  );
}
