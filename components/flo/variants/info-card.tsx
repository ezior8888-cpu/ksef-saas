'use client';

import {
  FloCardShell,
  FloQuietButton,
  FloSecondaryRow,
  type FloVariantProps,
} from '../card-chrome';

/**
 * Wariant `info` (krok 5) — sama informacja, nic do zatwierdzania.
 *
 * Używany przez X-01 (faktura przyjęta przez KSeF), X-04 (awaria po stronie
 * Ministerstwa), potwierdzenia doręczenia. To są karty, które klient CZYTA
 * i idzie dalej.
 *
 * Dlatego nie ma tu przycisku głównego w kolorze wezwania do działania:
 * „Pokaż fakturę” i „Ukryj” są równorzędne i ciche. Karta, która melduje
 * dobrą wiadomość, nie ma prawa krzyczeć tak samo jak ta, która czeka na
 * decyzję o wysłaniu pieniędzy w świat.
 */
export function FloInfoCard({
  view,
  onAction,
  showTime,
  className,
}: FloVariantProps) {
  const inert = onAction === undefined;

  return (
    <FloCardShell view={view} showTime={showTime} className={className}>
      <FloSecondaryRow view={view} onAction={onAction}>
        <FloQuietButton
          label={view.primary.label}
          disabled={inert}
          onClick={() => onAction?.(view.primary, view)}
        />
      </FloSecondaryRow>
    </FloCardShell>
  );
}
