'use client';

import { usePathname } from 'next/navigation';
import { useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';

/**
 * Rysunki kreską z szablonu, po jednym na ekran. To te same pliki, które
 * chodzą na landingu — filmy, nie obrazki, stąd ich delikatny ruch.
 */
const ILUSTRACJE: Record<string, { src: string; w: number; h: number }> = {
  '/login': {
    src: '/landing/video/txJ5fZhOzNG9U4PHx7M8fWUdhmk.mp4',
    w: 365,
    h: 274,
  },
  '/register': {
    src: '/landing/video/XsbctVRtvLemldF50MdIUZxBXCc.mp4',
    w: 400,
    h: 254,
  },
  '/forgot-password': {
    src: '/landing/video/Fkym4xUSeFPyCLvy4nYh2QRALcU.mp4',
    w: 400,
    h: 325,
  },
};

const DOMYSLNA = ILUSTRACJE['/login'];

/**
 * Ilustracja przechylająca się za kursorem.
 *
 * Pozycję myszy sprowadzamy do zakresu -0,5…0,5 względem środka panelu
 * i mapujemy na obrót w dwóch osiach. Sprężyna wygładza ruch, żeby rysunek
 * nie skakał za kursorem klatka w klatkę.
 *
 * `perspective` siedzi na rodzicu, nie na obracanym elemencie — inaczej
 * przeglądarka liczy skrót perspektywiczny osobno dla każdej warstwy.
 *
 * Rysunki mają BIAŁE tło, więc idą w trybie `multiply`: biel znika,
 * zostaje sama kreska na gradiencie. Bez tego widać byłoby prostokąt.
 */
export function AuthTiltPanel() {
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const ilu = ILUSTRACJE[pathname ?? ''] ?? DOMYSLNA;

  const px = useMotionValue(0);
  const py = useMotionValue(0);

  const spring = { stiffness: 150, damping: 18, mass: 0.6 };
  const sx = useSpring(px, spring);
  const sy = useSpring(py, spring);

  const rotateY = useTransform(sx, [-0.5, 0.5], ['-16deg', '16deg']);
  const rotateX = useTransform(sy, [-0.5, 0.5], ['14deg', '-14deg']);
  // Rysunek dryfuje lekko w stronę kursora, co pogłębia wrażenie głębi.
  const shiftX = useTransform(sx, [-0.5, 0.5], [-14, 14]);
  const shiftY = useTransform(sy, [-0.5, 0.5], [-10, 10]);
  // Cień pod spodem ucieka w przeciwną stronę, jakby padało na niego światło.
  const cienX = useTransform(sx, [-0.5, 0.5], [16, -16]);
  const cienSkala = useTransform(sy, [-0.5, 0.5], [1.08, 0.92]);

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
      className="flex w-full items-center justify-center py-10"
      style={{ perspective: 1100 }}
    >
      <motion.div
        style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
        initial={{ opacity: 0, y: 30, rotateX: 16 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="relative"
      >
        <motion.video
          src={ilu.src}
          width={ilu.w}
          height={ilu.h}
          autoPlay
          loop
          muted
          playsInline
          style={{
            x: shiftX,
            y: shiftY,
            mixBlendMode: 'multiply',
            backfaceVisibility: 'hidden',
          }}
          className="h-auto w-[400px] max-w-full"
        />

        <motion.span
          aria-hidden
          className="absolute inset-x-10 -bottom-2 h-8 rounded-full bg-[rgba(16,32,64,0.16)] blur-2xl"
          style={{ x: cienX, scaleX: cienSkala, translateZ: -80 }}
        />
      </motion.div>
    </div>
  );
}
