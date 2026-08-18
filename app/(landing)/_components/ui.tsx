import type { ReactNode } from 'react';

import { MaskReveal, MaskRevealWords } from './mask-reveal';

/**
 * Ikona z sprite'u Zovy. Framer odwołuje się do nich przez `<use href="#id">`,
 * więc trzymamy ten sam mechanizm — patrz `icon-sprite.tsx`.
 */
export function Icon({
  id,
  size = 24,
  className,
}: {
  id: string;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role="presentation"
      className={className}
      style={{ flexShrink: 0 }}
    >
      <use href={`#${id}`} />
    </svg>
  );
}

/** Kontener 1300 z marginesem 80 — w środku zostaje 1140 treści. */
export function Container({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="mx-auto w-full max-w-[var(--z-container)] px-5 md:px-[var(--z-gutter)]">
      <div className={`mx-auto w-full max-w-[var(--z-content)] ${className}`}>
        {children}
      </div>
    </div>
  );
}

/** Nagłówek sekcji: tytuł 44/600 + akapit 18/400 w szarości. */
export function SectionHeading({
  title,
  lead,
  align = 'center',
  max = 550,
  nowrap = false,
}: {
  title: ReactNode;
  lead?: ReactNode;
  align?: 'center' | 'left';
  max?: number;
  /** Wymusza jedną linię od `lg` — gdy oryginał mieści nagłówek w 550 px. */
  nowrap?: boolean;
}) {
  // W oryginale KAŻDY nagłówek sekcji to blok o stałej szerokości 550 px.
  // Różni się tylko wyrównanie: Process, Integrations, Contact i sekcja
  // domykająca są wyśrodkowane (x445), a Pricing, FAQ i Blog dosunięte do
  // lewej krawędzi treści (x150).
  const centered = align === 'center';
  return (
    <div
      className={`flex w-full flex-col gap-4 ${centered ? 'items-center text-center' : ''}`}
      style={centered ? { maxWidth: max, marginInline: 'auto' } : { maxWidth: max }}
    >
      <h2 className={`z-h2 w-full ${nowrap ? 'lg:whitespace-nowrap' : ''}`}>
        {typeof title === 'string' ? <MaskRevealWords text={title} /> : title}
      </h2>
      {lead ? (
        <MaskReveal delay={0.18}>
          <p className="z-lead text-[var(--z-muted)]">{lead}</p>
        </MaskReveal>
      ) : null}
    </div>
  );
}
