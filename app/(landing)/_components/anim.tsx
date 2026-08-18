'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

/**
 * Słownik animacji odczytany ze stanów początkowych oryginału.
 *
 * Framer zostawia je w atrybucie `style`, więc w karcie, w której animacje
 * nie startują, widać dokładnie, od czego każdy element zaczyna:
 *
 *   translateY(30px)                       podstawowe wejście sekcji
 *   translateX(±30px)                      kolumny wjeżdżające z boków
 *   translateY(10px)                       drobne elementy list, ze schodkiem
 *   perspective(1200px) rotateX(15deg)     przechył pulpitu w hero
 *   scale(0)                               ikony wyskakujące w kontakcie
 *
 * Krzywa i czasy wspólne z maskami nagłówków, żeby całość miała jeden rytm.
 */
const EASE = [0.16, 1, 0.3, 1] as const;

const VIEWPORT = { once: true, amount: 0.15 } as const;

type Props = {
  children: ReactNode;
  delay?: number;
  className?: string;
};

/** Wejście od dołu o 30 px — najczęstszy wzorzec w oryginale. */
export function Rise({ children, delay = 0, className }: Props) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT}
      transition={{ duration: 0.75, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** Drobny podskok o 10 px — pozycje list, logotypy, wiersze cennika. */
export function Nudge({ children, delay = 0, className }: Props) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT}
      transition={{ duration: 0.55, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** Wjazd z boku o 30 px. Kolumny lewa i prawa dostają przeciwne znaki. */
export function SlideX({
  children,
  delay = 0,
  className,
  from = 'left',
}: Props & { from?: 'left' | 'right' }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, x: from === 'left' ? -30 : 30 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={VIEWPORT}
      transition={{ duration: 0.75, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Przechył pulpitu: obraz startuje odchylony o 15° w perspektywie 1200 px
 * i prostuje się przy wejściu w kadr. To najbardziej charakterystyczny ruch
 * na całej stronie i jedyne miejsce, gdzie oryginał sięga po trzeci wymiar.
 */
export function Tilt({ children, delay = 0, className }: Props) {
  return (
    <motion.div
      className={className}
      style={{ perspective: 1200 }}
      initial={{ opacity: 0, rotateX: 15, y: 40 }}
      whileInView={{ opacity: 1, rotateX: 0, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 1.1, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** Wyskok ze skali zero — ikony w sekcji kontaktowej. */
export function Pop({ children, delay = 0, className }: Props) {
  return (
    <motion.div
      className={className}
      initial={{ scale: 0 }}
      whileInView={{ scale: 1 }}
      viewport={VIEWPORT}
      transition={{ duration: 0.5, delay, ease: [0.34, 1.56, 0.64, 1] }}
    >
      {children}
    </motion.div>
  );
}
