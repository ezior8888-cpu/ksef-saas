'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

/**
 * Odsłonięcie tekstu spod krawędzi maski — sygnaturowa animacja Zovy.
 *
 * W oryginale nagłówek siedzi w kontenerze z `overflow: clip`, a warstwa
 * z tekstem startuje przesunięta w dół o własną wysokość i wjeżdża na
 * miejsce. Efekt jest wyraźnie lepszy niż zwykłe zanikanie, bo tekst
 * *wychodzi zza krawędzi*, zamiast materializować się w powietrzu.
 *
 * Zmierzone na oryginale: kontener maski jest o ~4 px wyższy od tekstu,
 * żeby wydłużenia liter (np. „y” w „Why”) nie były obcinane.
 */
export function MaskReveal({
  children,
  delay = 0,
  duration = 0.8,
  as = 'div',
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  duration?: number;
  as?: 'div' | 'span';
  className?: string;
}) {
  const Tag = as === 'span' ? motion.span : motion.div;
  return (
    <span
      className={`block overflow-clip pb-1 ${className}`}
      style={{ display: as === 'span' ? 'inline-block' : 'block' }}
    >
      <Tag
        initial={{ y: '110%' }}
        whileInView={{ y: '0%' }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration, delay, ease: [0.16, 1, 0.3, 1] }}
        style={{ display: 'block' }}
      >
        {children}
      </Tag>
    </span>
  );
}

/**
 * Ta sama maska, ale słowo po słowie z opóźnieniem — Framer rozbija tekst
 * na osobne `<span>`-y per wyraz i animuje każdy z przesunięciem.
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
      {words.map((w, i) => (
        <span
          key={`${w}-${i}`}
          className="inline-block overflow-clip pb-[0.12em] align-bottom"
        >
          <motion.span
            className="inline-block"
            initial={{ y: '110%' }}
            whileInView={{ y: '0%' }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{
              duration: 0.75,
              delay: delay + i * stagger,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            {w}
            {i < words.length - 1 ? ' ' : ''}
          </motion.span>
        </span>
      ))}
    </span>
  );
}
