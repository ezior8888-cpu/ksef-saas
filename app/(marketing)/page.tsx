import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  Camera,
  Shield,
  Zap,
  TrendingUp,
  CheckCircle2,
  Smartphone,
  FileText,
  AlertCircle,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { SavingsCalculatorPreview } from '@/components/marketing/savings-calculator-preview';
import { FeatureCard } from '@/components/marketing/feature-card';
import { TestimonialCard } from '@/components/marketing/testimonial-card';
import { FaqSection } from '@/components/marketing/faq-section';

export const metadata: Metadata = {
  title: 'FaktFlow — faktury KSeF 2026 dla mikrofirm | Zdjęcie paragonu = wpis do KPiR',
  description:
    'Wystawiaj faktury i wysyłaj do KSeF jednym kliknięciem. Zdjęcie paragonu trafia automatycznie do KPiR. 30 dni za darmo, 60 dni gwarancji zwrotu.',
};

export default function LandingPage() {
  return (
    <>
      <section className="relative pb-24 pt-16 lg:pb-32 lg:pt-24">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <div
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-700 dark:text-orange-400"
          >
            <AlertCircle className="h-3 w-3 shrink-0" aria-hidden />
            KSeF obowiązkowy od lutego 2026 — przygotuj się dziś
          </div>

          <h1
            className="mx-auto max-w-4xl font-display text-5xl font-semibold leading-[1.05] tracking-tighter-display md:text-7xl"
          >
            Faktury, KSeF i KPiR.{' '}
            <span className="text-muted-foreground">
              Automatyzacja, której nie ma u konkurencji.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-xl leading-relaxed text-muted-foreground">
            Wystawisz fakturę z parkingu klienta. Zdjęcie paragonu wpadnie do KPiR.
            Wkurzacz Dłużników dopilnuje płatności. Jeden klik do KSeF.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Button variant="glass-primary" size="lg" className="text-base" asChild>
              <Link href="/register" className="inline-flex items-center gap-2">
                Wypróbuj 30 dni za darmo
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
            <Button variant="glass" size="lg" className="text-base" asChild>
              <Link href="/kalkulator-oszczednosci">Sprawdź ile zaoszczędzisz</Link>
            </Button>
          </div>

          <p className="mt-6 text-xs text-muted-foreground">
            Bez karty. 60 dni money-back. Migracja z konkurencji jednym klikiem.
          </p>

          <div
            className="mx-auto mt-16 max-w-5xl overflow-hidden rounded-3xl border border-glass-border bg-glass-white shadow-glass-lg backdrop-blur-glass"
          >
            <div className="relative aspect-video w-full bg-linear-to-br from-foreground/5 via-foreground/2 to-purple-500/10">
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center">
                <Image
                  src="/brand/faktflow-logo.png"
                  alt="FaktFlow"
                  width={64}
                  height={64}
                  className="h-16 w-16 rounded-2xl object-contain opacity-90"
                />
                <p className="max-w-sm text-sm text-muted-foreground">
                  Zrzut ekranu aplikacji pojawi się tutaj (np.{' '}
                  <code className="rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-xs">
                    /marketing/dashboard-preview.png
                  </code>
                  ).
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-glass-border py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Konkurencja zostaje w tyle
            </p>
            <h2 className="font-display text-4xl font-semibold tracking-tighter-display md:text-5xl">
              Stare apki to formularze.{' '}
              <span className="text-muted-foreground">Nasza apka to asystent.</span>
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <ProblemCard
              title="W Fakturownia / inFakt / wFirma"
              issues={[
                'Wpisujesz każdą pozycję ręcznie',
                'KSeF authorization czasem zawiesza się na 24h (Fakturownia)',
                'Faktura znika w KSeF, ale apka pokazuje „wysłana” (inFakt)',
                'Brak mobile app albo tylko podgląd (wFirma)',
                'Korekta wymaga 8 kroków i kalkulatora w drugiej karcie',
              ]}
            />
            <SolutionCard
              title="W FaktFlow"
              features={[
                'Zdjęcie paragonu → automatycznie KPiR + kategoryzacja',
                'Pre-send walidacja FA(3) — wiesz przed wysyłką że przejdzie',
                'Post-send monitoring — 5 min po wysyłce sprawdzamy real status',
                'Pełnoprawna PWA z aparatem, push notif, swipe gestures',
                'Korekta jednym klikiem z auto-wyliczeniem różnic',
              ]}
            />
          </div>
        </div>
      </section>

      <section className="border-t border-glass-border py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Co Ci to da
            </p>
            <h2 className="font-display text-4xl font-semibold tracking-tighter-display md:text-5xl">
              5 funkcji, które oszczędzą Ci 12–42 godziny rocznie
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={Camera}
              title="OCR + Auto-KPiR"
              description="Robisz zdjęcie paragonu. AI rozpoznaje sprzedawcę, kwotę, VAT i automatycznie wpisuje do właściwej kolumny KPiR. Apka uczy się Twoich preferencji."
              proof="80% mniej czasu na wpisywanie kosztów"
            />
            <FeatureCard
              icon={Shield}
              title="KSeF 2.0 Compliance"
              description="UPO automatycznie pobierane i archiwizowane. Tryb Offline24 dla awarii MF. Pre-send walidacja FA(3) — wiesz przed wysyłką że przejdzie."
              proof="Zero rozmów z urzędem skarbowym"
            />
            <FeatureCard
              icon={TrendingUp}
              title="Wkurzacz Dłużników"
              description="Apka sama wysyła przypomnienia o płatnościach (3, 7, 14 dni). Generuje wezwania do zapłaty z art. 187 KPC. Automatycznie zatrzymuje gdy klient zapłaci."
              proof="Średni DSO spadł z 24 do 11 dni u beta testerów"
            />
            <FeatureCard
              icon={Zap}
              title="Magiczny Import"
              description="Migracja z Fakturownia / inFakt / wFirma / iFirma w 5 minut. Pobieramy historię z KSeF + Twoje pliki CSV. Zero ręcznego przepisywania."
            />
            <FeatureCard
              icon={FileText}
              title="Co-Pilot Księgowego"
              description="Co miesiąc apka sama wysyła Twojej księgowej kompletny pakiet: JPK_FA, KPiR Excel, formaty Comarch / Symfonia / Insert. Nie pytasz, dostaje."
              proof="Twoja księgowa pokocha Cię na nowo"
            />
            <FeatureCard
              icon={Smartphone}
              title="Mobile-First PWA"
              description="Pełnoprawna aplikacja na telefonie. Aparat, push notif, swipe gestures, offline mode. Zainstalujesz jak natywną apkę z home screen."
              proof="60% akcji robisz z telefonu"
            />
          </div>
        </div>
      </section>

      <section className="border-t border-glass-border py-24">
        <div className="mx-auto max-w-4xl px-6">
          <div className="mb-12 text-center">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Sprawdź sam
            </p>
            <h2 className="font-display text-4xl font-semibold tracking-tighter-display md:text-5xl">
              Ile zaoszczędzisz w ciągu roku?
            </h2>
          </div>
          <SavingsCalculatorPreview />
        </div>
      </section>

      <section className="border-t border-glass-border py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Beta testerzy mówią
            </p>
            <h2 className="font-display text-4xl font-semibold tracking-tighter-display md:text-5xl">
              „Nie wracam do Fakturownia”
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <TestimonialCard
              quote="Zdjęcie paragonu z Orlenu → wpis do KPiR za 4 sekundy. Tego mi brakowało przez 5 lat w innych apkach."
              author="Marcin K."
              role="Freelance developer · Warszawa"
              rating={5}
            />
            <TestimonialCard
              quote="Wkurzacz Dłużników to game changer. Klient który nigdy nie płacił na czas, zapłacił w dniu otrzymania pierwszej wiadomości."
              author="Anna W."
              role="Studio graficzne · Kraków"
              rating={5}
            />
            <TestimonialCard
              quote="Migracja z inFakt zajęła 7 minut. Łącznie z importem 600 faktur z 2 lat. Nie wierzyłam dopóki nie zobaczyłam."
              author="Piotr S."
              role="Konsulting IT · Poznań"
              rating={5}
            />
          </div>
        </div>
      </section>

      <section className="border-t border-glass-border py-24">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Cennik
          </p>
          <h2 className="mb-6 font-display text-4xl font-semibold tracking-tighter-display md:text-5xl">
            Jeden plan. Wszystkie funkcje.
          </h2>
          <p className="mx-auto mb-12 max-w-2xl text-xl text-muted-foreground">
            Bez ukrytych dodatków. Bez „premium-only” toggle do OCR. Wszystko od pierwszego dnia.
          </p>

          <div
            className="inline-block rounded-3xl border border-foreground/20 bg-foreground/5 p-10 shadow-glass-lg backdrop-blur-glass"
          >
            <p className="text-sm text-muted-foreground">Plan podstawowy</p>
            <p className="mb-1 mt-2 font-display text-6xl font-bold tracking-tighter-display">
              49 zł
              <span className="ml-2 text-lg font-normal text-muted-foreground">/ mc</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Płatne rocznie · 588 zł / rok · faktura VAT 23%
            </p>

            <div className="mt-8 space-y-2 text-left">
              {[
                'Faktury sprzedaż + zakupy bez limitu',
                'OCR z auto-kategoryzacją KPiR',
                'KSeF 2.0 + UPO + walidacja',
                'Wkurzacz Dłużników (przypomnienia + wezwania)',
                'Magiczny import z konkurencji',
                'Co-Pilot Księgowego (JPK_FA, KPiR Excel, Comarch, Symfonia)',
                'PWA mobilna z OCR',
                'Push notifications',
                'Bank Frankfurt (UE)',
                'Wsparcie po polsku',
              ].map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm">
                  <CheckCircle2
                    className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400"
                    aria-hidden
                  />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <Button variant="glass-primary" size="lg" className="mt-8 w-full" asChild>
              <Link href="/register">Wypróbuj 30 dni za darmo</Link>
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">+ 60-day money-back guarantee</p>
          </div>
        </div>
      </section>

      <FaqSection />

      <section className="border-t border-glass-border py-24">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <h2 className="mb-6 font-display text-4xl font-semibold tracking-tighter-display md:text-5xl">
            KSeF jest obowiązkowy za 9 miesięcy.
          </h2>
          <p className="mx-auto mb-10 max-w-2xl text-xl text-muted-foreground">
            Lepiej przyzwyczaj się dziś niż w panice w styczniu 2026.
          </p>
          <Button variant="glass-primary" size="lg" className="text-base" asChild>
            <Link href="/register" className="inline-flex items-center gap-2">
              Zacznij 30 dni za darmo
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
          <p className="mt-4 text-xs text-muted-foreground">Bez karty kredytowej. Anuluj kiedy chcesz.</p>
        </div>
      </section>
    </>
  );
}

function ProblemCard({ title, issues }: { title: string; issues: string[] }) {
  return (
    <div className="rounded-3xl border border-red-500/20 bg-red-500/5 p-7 backdrop-blur-glass">
      <h3 className="mb-4 font-display text-lg font-semibold tracking-tighter-text text-red-700 dark:text-red-400">
        {title}
      </h3>
      <ul className="space-y-3">
        {issues.map((issue) => (
          <li key={issue} className="flex items-start gap-2 text-sm">
            <X className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
            <span className="text-muted-foreground">{issue}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SolutionCard({ title, features }: { title: string; features: string[] }) {
  return (
    <div className="rounded-3xl border border-green-500/20 bg-green-500/5 p-7 backdrop-blur-glass">
      <h3 className="mb-4 font-display text-lg font-semibold tracking-tighter-text text-green-700 dark:text-green-400">
        {title}
      </h3>
      <ul className="space-y-3">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm">
            <CheckCircle2
              className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-400"
              aria-hidden
            />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
