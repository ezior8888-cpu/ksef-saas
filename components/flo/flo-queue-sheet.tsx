'use client';

import { useState } from 'react';

import { countLabel, FLO_FORMS } from '@/components/flo/format';
import { FloHistoryPanel } from '@/components/flo/flo-history-panel';
import { FloScheduledPanel } from '@/components/flo/scheduled-panel';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import type { FloScheduledView } from '@/types/flo';

/**
 * Kolejka i historia agenta na telefonie — chip nad wątkiem plus arkusz z dołu.
 *
 * PO CO OSOBNE WEJŚCIE. Na komputerze „Zatwierdzone — czeka na wykonanie”
 * i „Co Flo zrobił” stoją w prawej szynie. Na telefonie szyny nie ma: ekran
 * agenta ma zablokowaną wysokość, więc szyna schodząca pod wątek ląduje poza
 * ekranem i nie da się do niej doscrollować. Schowanie jej bez zastępnika
 * byłoby najgorszym z możliwych wyjść — panel zatwierdzonych to JEDYNE
 * miejsce, w którym klient widzi ślad własnej zgody z godziną
 * (`approvedAtLabel`). Przy pierwszej reklamacji „ja tego nie wysyłałem” to
 * jest cały dowód, jakim dysponuje.
 *
 * Chip pokazuje liczbę, więc kolejka niepusta widać bez otwierania. Gdy jest
 * pusto, chip zostaje — mówi wtedy „nic nie czeka”, bo znikający element
 * interfejsu czyta się jak awarię, nie jak spokój.
 */
export function FloQueueSheet({
  scheduled,
  className,
}: {
  scheduled: readonly FloScheduledView[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ile = scheduled.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className}
        aria-haspopup="dialog"
      >
        <span
          aria-hidden
          className="material-symbols-outlined text-[14px] leading-none text-[var(--ff-accent)]"
        >
          schedule
        </span>
        <span className="min-w-0 truncate">
          {/* „w kolejce”, a nie „czeka”: czasownik odmieniałby się razem
              z liczebnikiem („1 sprawa czeka”, ale „2 sprawy czekają”),
              a `countLabel` odmienia sam rzeczownik. Wyrażenie przyimkowe
              pasuje do każdej liczby i nie wymaga drugiej tablicy form. */}
          {ile === 0 ? 'pusta kolejka' : `${countLabel(ile, FLO_FORMS.sprawa)} w kolejce`}
        </span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="ff-dashboard max-h-[85dvh] overflow-y-auto rounded-t-2xl border-[var(--ff-border)] pb-[calc(1rem+var(--ff-safe-b))] text-[var(--ff-on-surface)]"
        >
          <SheetTitle className="text-left text-base font-semibold text-[var(--ff-text-strong)]">
            Kolejka Flo
          </SheetTitle>

          {/* `min-w-0`: `SheetContent` jest siatką, a jej dzieci nie kurczą się
              poniżej szerokości treści — długie etykiety spraw rozpychałyby
              arkusz poza ekran. */}
          <div className="min-w-0 space-y-4">
            <FloScheduledPanel
              scheduled={scheduled}
              className="rounded-2xl border border-[var(--ff-border)] bg-[var(--ff-surface-container-low)] p-4"
            />
            <FloHistoryPanel />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
