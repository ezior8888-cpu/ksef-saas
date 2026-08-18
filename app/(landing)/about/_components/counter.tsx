'use client';

import { useEffect, useRef, useState } from 'react';
import { useInView } from 'framer-motion';

/**
 * Licznik odliczający od zera po wejściu w kadr — to samo zachowanie co
 * w oryginale, gdzie w statycznym HTML widać „0M+”, a właściwa wartość
 * pojawia się dopiero po stronie przeglądarki.
 *
 * Krzywa `easeOutExpo`: szybki start, miękkie dobicie do wartości końcowej.
 */
export function Counter({
  to,
  suffix = '',
  decimals = 0,
  duration = 1800,
}: {
  to: number;
  suffix?: string;
  decimals?: number;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!inView) return;

    let frame = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setValue(to * eased);
      if (p < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, to, duration]);

  return (
    <span ref={ref} className="z-h1 tabular-nums">
      {value.toFixed(decimals)}
      {suffix}
    </span>
  );
}
