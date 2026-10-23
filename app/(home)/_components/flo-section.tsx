'use client';

import { useId, useState, type KeyboardEvent } from 'react';

import { cn } from '@/lib/utils';

import { BandGlow, Container } from './ui';

type Example = {
  message: string;
  details: ReadonlyArray<readonly [label: string, value: string]>;
  primary: string;
  secondary: string;
};

/**
 * Trzy zadania FLO z katalogu agenta (`types/flo.ts`): `payment.chase`,
 * `ksef.fix`, `accountant.package`. Grupa podatkowa jest wyłączona
 * (`lib/flo/flags.ts`), więc tu jej nie pokazujemy. Dane w przykładach są
 * zmyślone i tak podpisane.
 */
const TASKS: ReadonlyArray<{ title: string; text: string; example: Example }> = [
  {
    title: 'Płatności',
    text: 'Zauważy fakturę po terminie i przygotuje przypomnienie dla klienta.',
    example: {
      message:
        'Faktura FV/2026/10/014 dla Przykładowa Firma sp. z o.o. jest 7 dni po terminie. Przygotowałem uprzejme przypomnienie.',
      details: [
        ['Kwota', '1 230,00 zł'],
        ['Termin', '16.10.2026'],
      ],
      primary: 'Wyślij przypomnienie',
      secondary: 'Nie teraz',
    },
  },
  {
    title: 'Odrzucone faktury',
    text: 'Gdy KSeF odrzuci fakturę, wskaże błąd i przygotuje poprawkę.',
    example: {
      message:
        'KSeF odrzucił fakturę FV/2026/10/015, bo NIP nabywcy ma błąd. Przygotowałem poprawioną fakturę.',
      details: [
        ['Powód', 'Błędny NIP'],
        ['Stan', 'Czeka na Ciebie'],
      ],
      primary: 'Wyślij poprawioną',
      secondary: 'Pokaż zmiany',
    },
  },
  {
    title: 'Paczka dla księgowej',
    text: 'Na koniec miesiąca zbierze dokumenty w jedną paczkę i zapyta, czy wysłać.',
    example: {
      message: 'Paczka za październik jest gotowa. Wysłać ją do księgowej?',
      details: [
        ['Faktury', '18'],
        ['Koszty', '7'],
      ],
      primary: 'Wyślij paczkę',
      secondary: 'Sprawdzę najpierw',
    },
  },
];

function FloMessage({ example }: { example: Example }) {
  return (
    <figure className="mx-auto w-full max-w-lg">
      <div className="rounded-2xl bg-card p-5 text-left text-card-foreground shadow-2xl shadow-black/25 sm:p-6">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex size-9 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
          >
            FLO
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold">FLO</p>
            <p className="text-xs text-muted-foreground">przed chwilą</p>
          </div>
        </div>

        <p className="mt-4 text-[15px] leading-relaxed">{example.message}</p>

        <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-muted p-4 text-sm">
          {example.details.map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 font-mono font-medium">{value}</dd>
            </div>
          ))}
        </dl>

        {/* Przyciski są częścią ilustracji, nie da się ich kliknąć. */}
        <div aria-hidden className="mt-5 flex flex-wrap gap-2">
          <span className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            {example.primary}
          </span>
          <span className="rounded-full px-4 py-2 text-sm text-foreground ring-1 ring-border">
            {example.secondary}
          </span>
        </div>
      </div>
      <figcaption className="mt-4 text-center text-sm text-primary-foreground/75">
        Przykład z wymyślonymi danymi. FLO jest w przygotowaniu.
      </figcaption>
    </figure>
  );
}

export function FloSection() {
  const [active, setActive] = useState(0);
  const baseId = useId();
  const tabId = (i: number) => `${baseId}-tab-${i}`;
  const panelId = `${baseId}-panel`;

  // Strzałki przesuwają wybór jak w zwykłych zakładkach (WAI-ARIA Tabs).
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = (active + step + TASKS.length) % TASKS.length;
    setActive(next);
    document.getElementById(tabId(next))?.focus();
  };

  const task = TASKS[active];

  return (
    <section
      id="flo"
      aria-labelledby="flo-title"
      className="relative overflow-hidden bg-primary py-20 text-primary-foreground sm:py-28"
    >
      <BandGlow />
      <Container className="relative">
        <div className="mx-auto max-w-3xl text-center">
          <p className="inline-flex rounded-full bg-primary-foreground/15 px-3 py-1 text-sm font-medium">
            Wkrótce
          </p>
          <h2 id="flo-title" className="mt-4 text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
            Poznaj FLO, <span className="whitespace-nowrap">agenta AI</span> w FaktWay
          </h2>
          <p className="mt-5 text-lg text-pretty text-primary-foreground/80">
            Sam zauważy, co trzeba zrobić przy fakturach, i przygotuje to za Ciebie. Ty tylko
            zatwierdzasz.
          </p>
        </div>

        <div className="mt-14 grid items-center gap-8 lg:mt-20 lg:grid-cols-12 lg:gap-12">
          <div
            role="tablist"
            aria-label="Co zrobi FLO"
            aria-orientation="vertical"
            onKeyDown={onKeyDown}
            className="flex flex-wrap justify-center gap-2 lg:col-span-5 lg:flex-col lg:flex-nowrap"
          >
            {TASKS.map((item, i) => {
              const selected = i === active;
              return (
                <button
                  key={item.title}
                  id={tabId(i)}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={panelId}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActive(i)}
                  className={cn(
                    'shrink-0 rounded-full px-4 py-2 text-left transition-colors lg:rounded-2xl lg:p-5',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-foreground',
                    selected
                      ? 'bg-primary-foreground text-primary'
                      : 'text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground',
                  )}
                >
                  <span className="font-semibold lg:text-lg">{item.title}</span>
                  <span
                    className={cn(
                      'mt-1 hidden text-sm lg:block',
                      selected ? 'text-primary/80' : 'text-primary-foreground/70',
                    )}
                  >
                    {item.text}
                  </span>
                </button>
              );
            })}
          </div>

          <div id={panelId} role="tabpanel" aria-labelledby={tabId(active)} className="lg:col-span-7">
            <p className="mb-6 text-center text-primary-foreground/90 lg:hidden">{task.text}</p>
            <FloMessage example={task.example} />
          </div>
        </div>
      </Container>
    </section>
  );
}
