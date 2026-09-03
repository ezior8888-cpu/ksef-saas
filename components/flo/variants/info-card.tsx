'use client';

import {
  FloCardShell,
  FloQuietButton,
  FloSecondaryRow,
  type FloVariantProps,
} from '../card-chrome';
import { FloMilestoneShare } from '../wrapped/milestone-share';

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
  notice,
  pending,
  onUndo,
}: FloVariantProps) {
  const inert = onAction === undefined || pending === true;

  return (
    <FloCardShell
      view={view}
      showTime={showTime}
      className={className}
      notice={notice}
      pending={pending}
      onUndo={onUndo}
    >
      <FloSecondaryRow view={view} onAction={onAction} disabled={inert}>
        <FloQuietButton
          label={view.primary.label}
          disabled={inert}
          onClick={() => onAction?.(view.primary, view)}
        />
      </FloSecondaryRow>

      {/* Próg pieniężny (S-04, krok 38) to jedyna karta, z której coś się
          zapisuje na telefon. Rozgałęzienie po rodzaju jest tu świadomym
          wyjątkiem od zasady „karta nie wie, która funkcja ją zrobiła” —
          alternatywą byłoby pole w kontrakcie, którego nikt poza tą jedną
          funkcją by nie użył. */}
      {view.kind === 'milestone.money' ? (
        <FloMilestoneShare title={view.title} body={view.body} />
      ) : null}
    </FloCardShell>
  );
}
