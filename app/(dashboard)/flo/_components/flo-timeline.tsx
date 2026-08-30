import type { FloDayGroup } from '@/components/flo/timeline';

import { FloCardSlot } from './flo-card-slot';

/**
 * Oś zdarzeń: nagłówek dnia, pod nim karty tego dnia.
 *
 * Kolejność jest chronologiczna, najnowsze na dole — ekran ma się czytać
 * jak zapis tego, co się działo, a klient wraca do niego kilka razy dziennie
 * i szuka miejsca, w którym skończył. Uzasadnienie w
 * `components/flo/timeline.ts`.
 */
export function FloTimeline({ groups }: { groups: FloDayGroup[] }) {
  if (groups.length === 0) {
    return (
      <section
        aria-label="Oś zdarzeń"
        className="flex flex-1 items-center justify-center rounded-2xl border border-[var(--ff-border)] bg-[var(--ff-surface)] p-8 text-center"
      >
        <p className="max-w-sm text-sm text-[var(--ff-text-muted)]">
          Cicho. Nic nie wymaga Twojej decyzji — jak coś się wydarzy w Twoich
          fakturach, kosztach albo w KSeF, znajdziesz to tutaj.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label="Oś zdarzeń"
      className="min-h-0 flex-1 space-y-6 overflow-y-auto rounded-2xl border border-[var(--ff-border)] bg-[var(--ff-surface)] p-4 md:p-5"
    >
      {groups.map((group) => (
        <div key={group.key} className="space-y-3">
          <h2 className="text-[11px] font-semibold tracking-[0.14em] text-[var(--ff-text-dim)]">
            {group.label}
          </h2>

          {group.items.map((proposal) => (
            <FloCardSlot key={proposal.id} proposal={proposal} />
          ))}
        </div>
      ))}
    </section>
  );
}
