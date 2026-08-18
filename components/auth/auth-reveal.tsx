'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Wejście kolumny z formularzem — ta sama krzywa i te same czasy co na
 * landingu, żeby przejście ze strony głównej na logowanie nie zmieniało
 * rytmu animacji.
 *
 * `animate`, nie `whileInView`: formularz jest nad zgięciem od pierwszej
 * klatki, więc czekanie na wejście w kadr tylko opóźniałoby start.
 */
export function AuthReveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** Wjazd z prawej dla warstwy tekstowej przy siatce kropek. */
export function AuthRevealRight({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.8, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}
