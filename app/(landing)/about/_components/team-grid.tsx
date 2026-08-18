'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';

import { asset } from '../../_assets';

const TEAM = [
  { name: 'Bartosz Gierszewski', role: 'Założyciel' },
  { name: 'Anna Wiśniewska', role: 'Produkt' },
  { name: 'Paweł Nowak', role: 'Wsparcie klienta' },
  { name: 'Katarzyna Lis', role: 'Księgowość' },
];

/**
 * Siatka 1140 z czterema kartami 276×402.
 *
 * Wejście odczytane z oryginału: `opacity: 0` + `scale(0.5)`. To jedyne
 * miejsce na obu stronach, gdzie elementy narastają ze skali, więc warto
 * było je wychwycić zamiast wstawiać domyślne podniesienie.
 */
export function TeamGrid() {
  return (
    <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
      {TEAM.map((m, i) => (
        <motion.div
          key={m.name}
          initial={{ opacity: 0, scale: 0.5 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{
            duration: 0.7,
            delay: i * 0.09,
            ease: [0.16, 1, 0.3, 1],
          }}
          className="flex flex-col gap-4"
        >
          <div className="overflow-hidden rounded-[16px] bg-[var(--z-50)]">
            <Image
              src={asset.about.team[i]}
              alt={m.name}
              width={276}
              height={316}
              className="h-auto w-full transition-transform duration-500 hover:scale-[1.04]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="z-lead font-medium">{m.name}</span>
            <span className="z-body text-[var(--z-muted)]">{m.role}</span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
