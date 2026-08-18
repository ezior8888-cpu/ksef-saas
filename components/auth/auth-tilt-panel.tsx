'use client';

import Image from 'next/image';
import { useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';

/**
 * Panel 3D reagujący na kursor.
 *
 * Pozycję myszy sprowadzamy do zakresu -0,5…0,5 względem środka panelu
 * i mapujemy na obrót w dwóch osiach. Sprężyna wygładza ruch, żeby obraz
 * nie skakał za kursorem klatka w klatkę.
 *
 * `perspective` siedzi na rodzicu, nie na obracanym elemencie — inaczej
 * przeglądarka liczy skrót perspektywiczny osobno dla każdej warstwy
 * i cień odkleja się od kartki.
 */
export function AuthTiltPanel({ src }: { src: string }) {
  const ref = useRef<HTMLDivElement>(null);

  const px = useMotionValue(0);
  const py = useMotionValue(0);

  const spring = { stiffness: 150, damping: 18, mass: 0.6 };
  const sx = useSpring(px, spring);
  const sy = useSpring(py, spring);

  const rotateY = useTransform(sx, [-0.5, 0.5], ['-14deg', '14deg']);
  const rotateX = useTransform(sy, [-0.5, 0.5], ['12deg', '-12deg']);
  // Odblask przesuwa się przeciwnie do przechyłu, jak światło na szkle.
  const glareX = useTransform(sx, [-0.5, 0.5], ['80%', '20%']);
  const glareY = useTransform(sy, [-0.5, 0.5], ['80%', '20%']);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width - 0.5);
    py.set((e.clientY - r.top) / r.height - 0.5);
  };

  const onLeave = () => {
    px.set(0);
    py.set(0);
  };

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className="flex w-full items-center justify-center"
      style={{ perspective: 1200 }}
    >
      <motion.div
        style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
        initial={{ opacity: 0, y: 40, rotateX: 18 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-[520px]"
      >
        <div className="relative overflow-hidden rounded-[20px] bg-white shadow-[0_40px_80px_-30px_rgba(16,32,64,0.45)]">
          <div className="relative aspect-[969/579] w-full">
            <Image
              src={src}
              alt=""
              fill
              sizes="520px"
              priority
              className="object-cover object-top"
            />
          </div>

          {/* odblask wędrujący za kursorem */}
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(340px circle at ${glareX.get()} ${glareY.get()}, rgba(255,255,255,0.35), transparent 65%)`,
              backgroundPositionX: glareX,
              backgroundPositionY: glareY,
            }}
          />
        </div>

        {/* miękki cień pod kartką, unoszący się razem z nią */}
        <div
          aria-hidden
          className="absolute inset-x-8 -bottom-6 h-12 rounded-full bg-[rgba(16,32,64,0.18)] blur-2xl"
          style={{ transform: 'translateZ(-60px)' }}
        />
      </motion.div>
    </div>
  );
}
