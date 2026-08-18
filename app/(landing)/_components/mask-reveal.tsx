'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Odsłonięcie tekstu spod krawędzi maski — sygnaturowa animacja Zovy.
 *
 * W oryginale nagłówek siedzi w kontenerze z `overflow: clip`, a warstwa
 * z tekstem startuje przesunięta w dół o własną wysokość i wjeżdża na
 * miejsce. Efekt jest wyraźnie lepszy niż zwykłe zanikanie, bo tekst
 * *wychodzi zza krawędzi*, zamiast materializować się w powietrzu.
 *
 * Opakowanie MUSI być blokowe. Wcześniej był tu `<span>`, co dawało
 * `<div>`/`<p>` wewnątrz elementu tekstowego — DOM po stronie klienta to
 * znosi, ale parser HTML przy pierwszym wejściu na stronę wyrzuca takie
 * dziecko poza rodzica i układ się rozjeżdża.
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
  return (
    <div className={`overflow-clip pb-[3px] -mb-[3px] ${className}`}>
      <motion.div
        initial={{ y: '110%' }}
        whileInView={{ y: '0%' }}
        viewport={{ once: true, amount: 0.1 }}
        transition={{ duration, delay, ease: EASE }}
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
 * Wszystko jest tu tekstowe (`span`), więc wolno tego użyć wewnątrz `h1`–`h4`.
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
  const words = text.split(' ');
  return (
    <span className={className}>
      {words.map((word, i) => (
        <span
          key={`${word}-${i}`}
          className="inline-block overflow-clip pb-[0.16em] -mb-[0.16em] align-bottom"
        >
          <motion.span
            className="inline-block"
            initial={{ y: '110%' }}
            whileInView={{ y: '0%' }}
            viewport={{ once: true, amount: 0.1 }}
            transition={{
              duration: 0.75,
              delay: delay + i * stagger,
              ease: EASE,
            }}
          >
            {word}
          </motion.span>
          {i < words.length - 1 ? ' ' : null}
        </span>
      ))}
    </span>
  );
}
