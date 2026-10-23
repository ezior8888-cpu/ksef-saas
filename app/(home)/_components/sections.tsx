import Link from 'next/link';
import {
  BellRing,
  Check,
  CloudOff,
  FileCheck2,
  FileInput,
  Receipt,
  Users,
} from 'lucide-react';

import { PRICE_GROSS, TRIAL_DAYS } from '@/lib/billing/pricing';

import { BandGlow, ButtonLink, Container, SectionHeading } from './ui';

/*
 * Opisy funkcji pochodzą z poprzedniej strony głównej, cennika i pytań,
 * sprawdzonych w przeglądzie prawnym 15.10.2026 (tests/unit/marketing-bez-fikcji).
 * Nowych obietnic o produkcie tu nie dopisujemy.
 */

const FEATURES = [
  {
    icon: FileCheck2,
    title: 'Wysyłka do KSeF',
    text: 'Wystawiasz fakturę, my wysyłamy ją do KSeF i pobieramy UPO.',
  },
  {
    icon: CloudOff,
    title: 'Kolejka, gdy KSeF nie działa',
    text: 'Faktura czeka w kolejce i wychodzi sama, gdy system wróci. Dostajesz wtedy powiadomienie.',
  },
  {
    icon: BellRing,
    title: 'Płatności pod kontrolą',
    text: 'Faktury po terminie masz w jednym miejscu, a FLO przygotowuje przypomnienia dla klientów.',
  },
  {
    icon: Receipt,
    title: 'Paragony do KPiR',
    text: 'Zdjęcie paragonu trafia prosto do KPiR.',
  },
  {
    icon: Users,
    title: 'Dostęp dla księgowej',
    text: 'Zapraszasz ją na konto, a ona sama pobiera komplet dokumentów za wybrany okres.',
  },
  {
    icon: FileInput,
    title: 'Import z innego programu',
    text: 'Wgrywasz plik z Fakturowni albo inFaktu, resztę robimy my.',
  },
] as const;

export function Features() {
  return (
    <section id="funkcje" aria-labelledby="funkcje-title" className="py-20 sm:py-28">
      <Container>
        <SectionHeading
          id="funkcje-title"
          title="Od faktury do księgowej, bez przepisywania"
          lead="FaktWay prowadzi fakturę przez KSeF aż do Twojej księgowej. Ty wystawiasz, my pilnujemy reszty."
        />
        <ul className="mx-auto mt-16 grid max-w-5xl gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title}>
              <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <Icon aria-hidden className="size-5" />
              </span>
              <h3 className="mt-5 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-pretty text-muted-foreground">{text}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

// Jeden plan dla wszystkich (decyzja z 1 października 2026), cena
// z lib/billing/pricing.ts.
const PLAN_FEATURES = [
  'Faktury bez limitu',
  'Wysyłka do KSeF i pobieranie UPO',
  'Zdjęcie paragonu do KPiR',
  'Paczka dla księgowej',
  'Import z Fakturowni i inFaktu',
  `${TRIAL_DAYS} dni za darmo`,
];

export function Pricing() {
  return (
    <section id="pricing" aria-labelledby="pricing-title" className="py-20 sm:py-28">
      <Container>
        <SectionHeading
          id="pricing-title"
          title="Jeden plan, jedna cena"
          lead="Wszystkie funkcje od pierwszego dnia. Płacisz co miesiąc, bez umowy na rok."
        />
        <div className="mx-auto mt-14 max-w-md rounded-3xl bg-primary p-8 text-primary-foreground shadow-xl shadow-primary/20 sm:p-10">
          <h3 className="text-lg font-semibold">FaktWay</h3>
          <p className="mt-1 text-sm text-primary-foreground/80">Dla firm i księgowych.</p>
          <p className="mt-6 flex items-baseline gap-2">
            <span className="text-5xl font-semibold tracking-tight">{PRICE_GROSS}</span>
            <span className="text-sm text-primary-foreground/80">/mies. z VAT</span>
          </p>
          <ButtonLink href="/register" variant="inverse" className="mt-8 w-full">
            Wypróbuj za darmo
          </ButtonLink>
          <ul className="mt-8 space-y-3 text-sm">
            {PLAN_FEATURES.map((feature) => (
              <li key={feature} className="flex gap-3">
                <Check aria-hidden className="size-5 shrink-0" />
                {feature}
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}

const QUESTIONS = [
  [
    {
      q: 'Co dokładnie robi FLO?',
      a: 'Zauważa sprawy, które czekają na ruch: fakturę po terminie, fakturę odrzuconą przez KSeF, koniec miesiąca dla księgowej. Przygotowuje rozwiązanie, a Ty je zatwierdzasz.',
    },
    {
      q: 'Czy muszę mieć podpis elektroniczny?',
      a: 'Nie. Wystarczy token z KSeF albo profil zaufany. Przeprowadzimy Cię przez to przy zakładaniu konta.',
    },
  ],
  [
    {
      q: 'Co się dzieje, gdy KSeF nie odpowiada?',
      a: 'Faktura czeka w kolejce, a my wysyłamy ją automatycznie, gdy system wróci. Dostajesz wtedy powiadomienie.',
    },
    {
      q: 'Przeniesiecie moje dane z innego programu?',
      a: 'Tak. Wgrywasz plik z Fakturowni albo inFaktu, resztę robimy my.',
    },
  ],
  [
    {
      q: 'Gdzie trzymacie moje dane?',
      a: 'Na serwerach w Niemczech. Połączenia są szyfrowane, a tokeny KSeF zapisujemy zaszyfrowane. Dokumenty trzymamy przez cały czas korzystania z FaktWay i w każdej chwili możesz je wyeksportować. Faktury wysłane do KSeF przechowuje też Ministerstwo Finansów.',
    },
    {
      q: 'Czy mogę zrezygnować w każdej chwili?',
      a: 'Tak. Nie ma umowy na czas określony ani opłaty za wyjście.',
    },
  ],
] as const;

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="bg-muted/50 py-20 sm:py-28">
      <Container>
        <div className="max-w-2xl">
          <h2 id="faq-title" className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Pytania i odpowiedzi
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Nie ma tu Twojego pytania?{' '}
            <Link href="/kontakt" className="font-medium text-primary underline-offset-4 hover:underline">
              Napisz do nas
            </Link>
            .
          </p>
        </div>
        <div className="mt-14 grid gap-10 lg:grid-cols-3 lg:gap-8">
          {QUESTIONS.map((column, i) => (
            <dl key={i} className="flex flex-col gap-10">
              {column.map(({ q, a }) => (
                <div key={q}>
                  <dt className="text-lg font-semibold">{q}</dt>
                  <dd className="mt-3 text-pretty text-muted-foreground">{a}</dd>
                </div>
              ))}
            </dl>
          ))}
        </div>
      </Container>
    </section>
  );
}

export function CallToAction() {
  return (
    <section
      aria-labelledby="start-title"
      className="relative overflow-hidden bg-primary py-20 text-primary-foreground sm:py-28"
    >
      <BandGlow className="rotate-180" />
      <Container className="relative">
        <div className="mx-auto max-w-xl text-center">
          <h2 id="start-title" className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Wystaw pierwszą fakturę jeszcze dziś
          </h2>
          <p className="mt-4 text-lg text-pretty text-primary-foreground/80">
            {TRIAL_DAYS} dni za darmo. Rezygnujesz, kiedy chcesz.
          </p>
          <ButtonLink href="/register" variant="inverse" className="mt-10">
            Wypróbuj za darmo
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}
