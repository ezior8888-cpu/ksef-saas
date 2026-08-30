'use client';

import type { FloVariantProps } from './card-chrome';
import { FloChoiceCard } from './variants/choice-card';
import { FloInfoCard } from './variants/info-card';
import { FloInputCard } from './variants/input-card';
import { FloListCard } from './variants/list-card';
import { FloPreviewCard } from './variants/preview-card';
import { FloSingleCard } from './variants/single-card';

export type { FloActionHandler, FloVariantProps } from './card-chrome';

/**
 * Karta agenta — jedyne wejście do interfejsu FLO (kroki 3 i 5–10 toru B).
 *
 * TO JEST CAŁY INTERFEJS AGENTA. 33 funkcje z katalogu renderują się przez
 * sześć wariantów, więc nowa funkcja po stronie silnika pojawia się
 * w gotowym ekranie sama — bez ani jednej linijki tutaj. Karta nie wie i nie
 * ma prawa wiedzieć, która funkcja ją wyprodukowała.
 *
 * Rozgałęzienie jest jawne, bez `default`. Siódmy wariant ma zatrzymać
 * kompilację i kazać komuś napisać jego kartę, zamiast po cichu wylądować
 * jako „coś w rodzaju info” na ekranie klienta.
 *
 * CZEGO TU JESZCZE NIE MA (i w którym kroku dochodzi):
 * - sekcja „dlaczego to widzę” z `evidence` — krok 17
 * - pasek cofnięcia dla `undoableUntil` — krok 18
 * - wpięcie akcji serwerowych i obsługa odpowiedzi `stale` — kroki 16 i 19
 */
export function FloProposalCard(props: FloVariantProps) {
  switch (props.view.variant) {
    case 'info':
      return <FloInfoCard {...props} />;
    case 'single':
      return <FloSingleCard {...props} />;
    case 'preview':
      return <FloPreviewCard {...props} />;
    case 'choice':
      return <FloChoiceCard {...props} />;
    case 'list':
      return <FloListCard {...props} />;
    case 'input':
      return <FloInputCard {...props} />;
  }
}
