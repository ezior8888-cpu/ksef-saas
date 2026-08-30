'use client';

import {
  FloCardShell,
  FloPrimaryButton,
  FloSecondaryRow,
  type FloVariantProps,
} from '../card-chrome';

/**
 * Wariant `single` (krok 6) — jedna akcja, bez podglądu.
 *
 * Używany przez W-01 (koszt zaksięgowany, potwierdź), O-03 (podpowiedź
 * funkcji), X-03 (certyfikat KSeF). Wspólny mianownik: skutek zostaje
 * wewnątrz konta klienta i da się go cofnąć, więc podgląd byłby ceremonią
 * bez treści.
 *
 * Układ mówi, co jest czym: przycisk główny wyraźny, „nie teraz” i „nigdy
 * więcej takich” dyskretne obok. Odmowa ma być łatwa do znalezienia, ale nie
 * ma konkurować wzrokowo ze zgodą.
 */
export function FloSingleCard({
  view,
  onAction,
  showTime,
  className,
}: FloVariantProps) {
  const inert = onAction === undefined;

  return (
    <FloCardShell view={view} showTime={showTime} className={className}>
      <FloSecondaryRow view={view} onAction={onAction}>
        <FloPrimaryButton
          label={view.primary.label}
          disabled={inert}
          onClick={() => onAction?.(view.primary, view)}
        />
      </FloSecondaryRow>
    </FloCardShell>
  );
}
