'use client';

import { motion } from 'framer-motion';

import { Container } from '../../_components/ui';
import { Counter } from './counter';

/**
 * UWAGA: wartości docelowe są przybliżone. Oryginał renderuje w HTML same
 * zera i podstawia liczby dopiero skryptem, więc nie dało się ich odczytać
 * ze źródła — format (M+, %, K+, jedno miejsce po przecinku) jest wierny.
 */
const METRICS = [
  { to: 240, suffix: 'M+', decimals: 0, label: 'Tracked Annually', body: 'Supporting financial activity with accuracy.' },
  { to: 70, suffix: '%', decimals: 0, label: 'Less Manual Work', body: 'Automating repetitive tasks for workflows.' },
  { to: 15, suffix: 'K+', decimals: 0, label: 'Monthly Audits', body: 'Ensuring accurate books at scale for teams.' },
  { to: 99.9, suffix: '%', decimals: 1, label: 'Uptime', body: 'Reliable performance for your operations.' },
];

export function Metrics() {
  return (
    <Container>
      <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
        {METRICS.map((m, i) => (
          <motion.div
            key={m.label}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6, delay: i * 0.06, ease: [0.44, 0, 0.56, 1] }}
            className="flex flex-col gap-3"
          >
            <Counter to={m.to} suffix={m.suffix} decimals={m.decimals} />
            <span className="z-lead font-medium">{m.label}</span>
            <p className="z-body text-[var(--z-muted)]">{m.body}</p>
          </motion.div>
        ))}
      </div>
    </Container>
  );
}
