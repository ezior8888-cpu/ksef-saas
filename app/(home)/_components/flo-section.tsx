'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { AnimatePresence, MotionConfig, motion, useInView, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

import { BandGlow, Container } from './ui';

type Example = {
  message: string;
  details: ReadonlyArray<readonly [label: string, value: string]>;
  primary: string;
  secondary: string;
  /** Linia pod przyciskami po „zatwierdzeniu”. */
  done: string;
};

/**
 * Trzy zadania FLO z katalogu agenta (`types/flo.ts`): `payment.chase`,
 * `ksef.fix`, `accountant.package`. Grupa podatkowa jest wyłączona
 * (`lib/flo/flags.ts`), więc tu jej nie pokazujemy. Firma i numery
 * w przykładach są zmyślone.
 */
const TASKS: ReadonlyArray<{ title: string; text: string; example: Example }> = [
  {
    title: 'Płatności',
    text: 'Zauważa fakturę po terminie i przygotowuje przypomnienie dla klienta.',
    example: {
      message:
        'Faktura FV/2026/10/014 dla Przykładowa Firma sp. z o.o. jest 7 dni po terminie. Przygotowałem uprzejme przypomnienie.',
      details: [
        ['Kwota', '1 230,00 zł'],
        ['Termin', '16.10.2026'],
      ],
      primary: 'Wyślij przypomnienie',
      secondary: 'Nie teraz',
      done: 'Przypomnienie poszło do klienta.',
    },
  },
  {
    title: 'Odrzucone faktury',
    text: 'Gdy KSeF odrzuci fakturę, wskazuje błąd i przygotowuje poprawkę.',
    example: {
      message:
        'KSeF odrzucił fakturę FV/2026/10/015, bo NIP nabywcy ma błąd. Przygotowałem poprawioną fakturę.',
      details: [
        ['Powód', 'Błędny NIP'],
        ['Stan', 'Czeka na Ciebie'],
      ],
      primary: 'Wyślij poprawioną',
      secondary: 'Pokaż zmiany',
      done: 'Poprawiona faktura poszła do KSeF.',
    },
  },
  {
    title: 'Paczka dla księgowej',
    text: 'Na koniec miesiąca zbiera dokumenty w jedną paczkę i pyta, czy wysłać.',
    example: {
      message: 'Paczka za październik jest gotowa. Wysłać ją do księgowej?',
      details: [
        ['Faktury', '18'],
        ['Koszty', '7'],
      ],
      primary: 'Wyślij paczkę',
      secondary: 'Sprawdzę najpierw',
      done: 'Paczka poszła do księgowej.',
    },
  },
];

/*
 * Przebieg jednej sceny (ms od zmiany zakładki, z czego pierwsze 300 ms to
 * wyjście poprzedniej karty): FLO pisze, pokazuje wiadomość, szczegóły
 * i przyciski, a na końcu przycisk zostaje „wciśnięty”. Dopóki nikt nie
 * kliknął zakładki, sceny zmieniają się same.
 */
const STEP_AT = [0, 1400, 2100, 2700, 4300] as const;
const STEP_DONE = 4;
const STEP_STATIC = 3;
const ROTATE_AFTER_MS = 8000;

const reveal = (visible: boolean) => ({ opacity: visible ? 1 : 0, y: visible ? 0 : 6 });

function TypingDots({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn('flex items-center gap-1', className)}>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full bg-muted-foreground/60"
          animate={{ y: [0, -3, 0] }}
          transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
        />
      ))}
    </span>
  );
}

function FloMessage({ example, step }: { example: Example; step: number }) {
  const done = step >= STEP_DONE;

  return (
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
          <p className="text-xs text-muted-foreground">{step === 0 ? 'pisze…' : 'przed chwilą'}</p>
        </div>
      </div>

      {/* Wszystkie części są w drzewie od początku i tylko się odsłaniają,
          więc karta nie zmienia wysokości w trakcie sceny. `initial={false}`:
          nowa karta startuje od stanu kroku, bez animacji z pełnej
          widoczności do ukrycia. */}
      <div className="relative mt-4">
        {step === 0 ? <TypingDots className="absolute top-2 left-0" /> : null}
        <motion.p
          className="text-[15px] leading-relaxed"
          initial={false}
          animate={reveal(step >= 1)}
          transition={{ duration: 0.35 }}
        >
          {example.message}
        </motion.p>
      </div>

      <motion.dl
        className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-muted p-4 text-sm"
        initial={false}
        animate={reveal(step >= 2)}
        transition={{ duration: 0.35 }}
      >
        {example.details.map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 font-mono font-medium">{value}</dd>
          </div>
        ))}
      </motion.dl>

      {/* Przyciski są częścią ilustracji, nie da się ich kliknąć. */}
      <motion.div
        aria-hidden
        className="mt-5 flex flex-wrap items-center gap-2"
        initial={false}
        animate={reveal(step >= 3)}
        transition={{ duration: 0.35 }}
      >
        <motion.span
          layout
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          initial={false}
          animate={done ? { scale: [1, 0.93, 1] } : { scale: 1 }}
          transition={{ duration: 0.35 }}
        >
          {done ? (
            <>
              <Check className="size-4" />
              Wysłano
            </>
          ) : (
            example.primary
          )}
        </motion.span>
        <motion.span
          layout
          className="rounded-full px-4 py-2 text-sm text-foreground ring-1 ring-border"
          initial={false}
          animate={{ opacity: done ? 0 : 1 }}
          transition={{ duration: 0.25 }}
        >
          {example.secondary}
        </motion.span>
      </motion.div>

      <motion.p
        className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground"
        initial={false}
        animate={reveal(done)}
        transition={{ duration: 0.35, delay: done ? 0.15 : 0 }}
      >
        <Check aria-hidden className="size-4 text-primary" />
        {example.done}
      </motion.p>
    </div>
  );
}

export function FloSection() {
  const [active, setActive] = useState(0);
  const [step, setStep] = useState(0);
  const [autoplay, setAutoplay] = useState(true);
  const sectionRef = useRef<HTMLElement>(null);
  const inView = useInView(sectionRef, { amount: 0.35 });
  const reducedMotion = useReducedMotion();
  const baseId = useId();
  const tabId = (i: number) => `${baseId}-tab-${i}`;
  const panelId = `${baseId}-panel`;

  // Sceny ruszają dopiero, gdy pas jest na ekranie. Kroki tylko rosną, więc
  // powrót do pasa w połowie sceny jej nie cofa.
  useEffect(() => {
    if (reducedMotion || !inView) return;
    const timers = STEP_AT.slice(1).map((ms, i) =>
      setTimeout(() => setStep((current) => Math.max(current, i + 1)), ms),
    );
    if (autoplay) {
      timers.push(
        setTimeout(() => {
          setActive((current) => (current + 1) % TASKS.length);
          setStep(0);
        }, ROTATE_AFTER_MS),
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [active, inView, autoplay, reducedMotion]);

  const select = (i: number) => {
    setAutoplay(false);
    setActive(i);
    setStep(0);
  };

  // Strzałki przesuwają wybór jak w zwykłych zakładkach (WAI-ARIA Tabs).
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const move = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
    if (!move) return;
    event.preventDefault();
    const next = (active + move + TASKS.length) % TASKS.length;
    select(next);
    document.getElementById(tabId(next))?.focus();
  };

  const task = TASKS[active];
  const shownStep = reducedMotion ? STEP_STATIC : step;
  const showProgress = autoplay && inView && !reducedMotion;

  return (
    <MotionConfig reducedMotion="user">
      <section
        ref={sectionRef}
        id="flo"
        aria-labelledby="flo-title"
        className="relative overflow-hidden bg-primary py-20 text-primary-foreground sm:py-28"
      >
        <BandGlow />
        <Container className="relative">
          <div className="mx-auto max-w-3xl text-center">
            <h2 id="flo-title" className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
              FLO pilnuje faktur za Ciebie
            </h2>
            <p className="mt-5 text-lg text-pretty text-primary-foreground/80">
              FLO to agent AI wbudowany w FaktWay. Sam zauważa, co trzeba zrobić przy fakturach,
              i przygotowuje to za Ciebie. Ty tylko zatwierdzasz.
            </p>
          </div>

          <div className="mt-14 grid items-center gap-8 lg:mt-20 lg:grid-cols-12 lg:gap-12">
            <div
              role="tablist"
              aria-label="Co robi FLO"
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
                    onClick={() => select(i)}
                    className={cn(
                      'relative shrink-0 overflow-hidden rounded-full px-4 py-2 text-left transition-colors lg:rounded-2xl lg:p-5',
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
                    {selected && showProgress ? (
                      // Pasek do następnej sceny; znika po pierwszym kliknięciu.
                      <motion.span
                        key={`${active}-${String(inView)}`}
                        aria-hidden
                        className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-primary/40"
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{ duration: ROTATE_AFTER_MS / 1000, ease: 'linear' }}
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div id={panelId} role="tabpanel" aria-labelledby={tabId(active)} className="lg:col-span-7">
              <p className="mb-6 text-center text-primary-foreground/90 lg:hidden">{task.text}</p>
              <div className="mx-auto w-full max-w-lg">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={active}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                  >
                    <FloMessage example={task.example} step={shownStep} />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </Container>
      </section>
    </MotionConfig>
  );
}
