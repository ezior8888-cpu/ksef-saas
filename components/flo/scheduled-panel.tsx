'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { cancelScheduled } from '@/app/actions/flo';
import { countLabel, FLO_FORMS } from '@/components/flo/format';
import type { FloScheduledView } from '@/types/flo';

/**
 * Panel „Zatwierdzone — czeka na wykonanie” (krok 16 toru B).
 *
 * NAZWA JEST INNA NIŻ NA MAKIECIE I TO JEST CELOWE. „Co Flo zrobi dalej”
 * brzmi jak zapowiedź planów agenta; „Zatwierdzone — czeka na wykonanie”
 * mówi prawdę: nic tu nie trafia bez wcześniejszego kliknięcia człowieka.
 *
 * DLATEGO KAŻDA POZYCJA POKAZUJE `approvedAtLabel`. Przy pierwszej
 * reklamacji „ja tego nie wysyłałem” klient musi zobaczyć w interfejsie ślad
 * własnej zgody, z godziną. Pozycja bez tego pola oznacza błąd silnika —
 * wtedy zamiast daty piszemy to wprost, zamiast udawać, że wszystko gra.
 *
 * „Wstrzymaj” jest HAMULCEM na coś, na co klient już się zgodził, nigdy
 * mechanizmem zgody. Wstrzymana sprawa wraca do wątku jako otwarta — nie
 * znika, bo skasowanie jej byłoby podjęciem za klienta drugiej decyzji,
 * o którą nie prosił.
 */
export function FloScheduledPanel({
  scheduled,
  className,
}: {
  scheduled: readonly FloScheduledView[];
  className?: string;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const cancel = useCallback(
    async (id: string) => {
      setPendingId(id);
      setNotice(null);

      try {
        await cancelScheduled(id);
        router.refresh();
      } catch {
        setNotice(
          'Nie udało mi się tego wstrzymać. Sprawa nadal czeka — spróbuj za chwilę.',
        );
      } finally {
        setPendingId(null);
      }
    },
    [router],
  );

  return (
    <section
      aria-label="Zatwierdzone, czeka na wykonanie"
      className={className}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-semibold tracking-[0.14em] text-[var(--ff-text-dim)]">
          ZATWIERDZONE — CZEKA NA WYKONANIE
        </h2>
        <span className="text-[11px] text-[var(--ff-text-muted)]">
          {countLabel(scheduled.length, FLO_FORMS.sprawa)}
        </span>
      </div>

      {scheduled.length === 0 ? (
        <p className="mt-3 text-xs text-[var(--ff-text-muted)]">
          Nic nie czeka w kolejce. Pojawi się tu wszystko, co zatwierdzisz.
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {scheduled.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-2 rounded-xl border border-[var(--ff-border)] bg-[var(--ff-surface-container-low)] p-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium break-words text-[var(--ff-text)]">
                  {item.label}
                </p>
                <p className="text-[11px] text-[var(--ff-text-muted)]">
                  {item.whenLabel}
                </p>
                <p className="text-[11px] text-[var(--ff-text-muted)]">
                  {item.approvedAtLabel ||
                    'brak śladu zatwierdzenia — zgłoś to nam'}
                </p>
              </div>

              <button
                type="button"
                disabled={pendingId === item.id}
                onClick={() => void cancel(item.id)}
                className="shrink-0 rounded-lg border border-[var(--ff-border)] px-2 py-1 text-[11px] text-[var(--ff-text-muted)] transition-colors hover:border-[var(--ff-border-strong)] hover:text-[var(--ff-text)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {item.cancelLabel}
              </button>
            </li>
          ))}
        </ul>
      )}

      {notice ? (
        <p role="status" className="mt-3 text-[11px] text-[var(--ff-text-soft)]">
          {notice}
        </p>
      ) : null}

      <p className="mt-3 text-[11px] text-[var(--ff-text-muted)]">
        Wszystko z tej listy już zatwierdziłeś. Dopóki nie ruszy, możesz to
        wstrzymać — wróci wtedy do wątku.
      </p>
    </section>
  );
}
