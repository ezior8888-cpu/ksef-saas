'use client';

import type { ReactNode } from 'react';
import { Fragment, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Odsłonięcie tekstu spod krawędzi maski — sygnaturowa animacja Zovy.
 * Warstwa z tekstem startuje przesunięta w dół o własną wysokość i wjeżdża
 * na miejsce, zamiast zanikać. Tekst *wychodzi zza krawędzi*.
 *
 * UWAGA na pułapkę, która wcześniej ukryła całą treść: nie wolno użyć tu
 * `whileInView` na animowanej warstwie. Jest ona przesunięta o 110% w dół,
 * czyli POZA własny kontener z `overflow: clip`, a obserwator widoczności
 * liczy przecięcie już po przycięciu przez rodzica — element nigdy nie
 * zostaje uznany za widoczny, animacja nie startuje i napis znika na dobre.
 * Dlatego widoczność śledzimy na MASCE (jest w normalnym układzie), a ruch
 * odpalamy przez `animate`.
 */
export function MaskReveal({
  children,
  delay = 0,
  duration = 0.8,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.1 });
  const [done, setDone] = useState(false);

  // Po animacji przycinanie jest już niepotrzebne, a przy przewijaniu jego
  // krawędź łapie zaokrąglenie do pełnych pikseli i miga cienką kreską.
  return (
    <div
      ref={ref}
      className={`pb-[3px] -mb-[3px] ${done ? '' : 'overflow-clip'} ${className}`}
    >
      <motion.div
        initial={{ y: '110%' }}
        animate={inView ? { y: '0%' } : { y: '110%' }}
        transition={{ duration, delay, ease: EASE }}
        onAnimationComplete={() => inView && setDone(true)}
        style={{ willChange: done ? 'auto' : 'transform' }}
      >
        {children}
      </motion.div>
    </div>
  );
}

/**
 * Ta sama maska, ale słowo po słowie — Framer rozbija napis na osobne
 * `<span>`-y per wyraz (w DOM oryginału widać „Real”, „-”, „time”,
 * „intelligence” jako oddzielne elementy) i animuje każdy z opóźnieniem.
 *
 * Wszystko jest tekstowe, więc wolno tego użyć wewnątrz `h1`–`h4`.
 */
export function MaskRevealWords({
  text,
  delay = 0,
  stagger = 0.055,
  className = '',
}: {
  text: string;
  delay?: number;
  stagger?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.1 });
  const [done, setDone] = useState(false);
  const words = text.split(' ');

  return (
    <span ref={ref} className={className}>
      {words.map((word, i) => (
        <Fragment key={`${word}-${i}`}>
          <span
            className={`inline-block pb-[0.16em] -mb-[0.16em] align-bottom ${
              done ? '' : 'overflow-clip'
            }`}
          >
            <motion.span
              className="inline-block"
              initial={{ y: '110%' }}
              animate={inView ? { y: '0%' } : { y: '110%' }}
              transition={{
                duration: 0.75,
                delay: delay + i * stagger,
                ease: EASE,
              }}
              onAnimationComplete={() => {
                if (inView && i === words.length - 1) setDone(true);
              }}
              style={{ willChange: done ? 'auto' : 'transform' }}
            >
              {word}
            </motion.span>
          </span>
          {/* Spacja MUSI zostać poza elementem inline-block — w środku
              jest zwijana i słowa sklejają się w jeden ciąg. */}
          {i < words.length - 1 ? ' ' : null}
        </Fragment>
      ))}
    </span>
  );
}
