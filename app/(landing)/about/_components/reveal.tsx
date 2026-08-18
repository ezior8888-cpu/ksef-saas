'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

/** Wejście przy przewijaniu — te same czasy i krzywa co na stronie głównej. */
export function Reveal({
  children,
  delay = 0,
}: {
  children: ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.65, delay, ease: [0.44, 0, 0.56, 1] }}
      className="h-full"
    >
      {children}
    </motion.div>
  );
}
