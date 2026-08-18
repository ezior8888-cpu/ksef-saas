'use client';

import { motion } from 'framer-motion';

import { Counter } from './counter';

/**
 * UWAGA: wartości docelowe są przybliżone. Oryginał renderuje w HTML same
 * zera i podstawia liczby dopiero skryptem, więc nie dało się ich odczytać
 * ze źródła — format (M+, %, K+, jedno miejsce po przecinku) jest wierny.
 */
const METRICS = [
  { to: 1.2, suffix: ' mln', decimals: 1, label: 'Faktur w KSeF', body: 'Tyle dokumentów przeszło przez FaktFlow.' },
  { to: 92, suffix: '%', decimals: 0, label: 'Mniej klikania', body: 'Tyle czasu oszczędzają nasi użytkownicy.' },
  { to: 8, suffix: ' tys.', decimals: 0, label: 'Firm miesięcznie', body: 'Mikrofirmy i biura rachunkowe.' },
  { to: 99.9, suffix: '%', decimals: 1, label: 'Dostępność', body: 'Bo faktura nie może poczekać do jutra.' },
];

export function Metrics() {
  // Oryginał trzyma liczby w BIAŁEJ karcie 1140×204: promień 16, padding 24,
  // przerwy 40 w pionie i 24 w poziomie. Wcześniej wisiały luzem na tle.
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-10 rounded-[16px] bg-white p-6 shadow-[0_16px_40px_-28px_rgba(16,32,64,0.3)] sm:grid-cols-2 lg:grid-cols-4">
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
  );
}
