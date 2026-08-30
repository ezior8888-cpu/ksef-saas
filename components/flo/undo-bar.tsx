'use client';

import { useEffect, useState } from 'react';

import { timeLeft } from './format';

/**
 * Pasek cofnięcia (krok 18 toru B).
 *
 * Pokazuje się, gdy agent zrobił coś SAM — czyli rzecz odwracalną
 * i mieszczącą się w koncie klienta: przypisał kategorię kosztu, oznaczył
 * fakturę jako opłaconą, poprawił dane kontrahenta z GUS. Taka czynność nie
 * wymaga zgody z góry, ale wymaga drogi powrotnej, i to widocznej gołym okiem
 * przez dziesięć minut.
 *
 * PO UPŁYWIE CZASU PASEK ZNIKA, ALE KARTA ZOSTAJE. Wpis o tym, co agent
 * zrobił, jest trwały — znika tylko przycisk. Inaczej klient nie miałby jak
 * się dowiedzieć, kto zmienił mu księgowanie sprzed kwadransa.
 */
export function FloUndoBar({
  until,
  onUndo,
  disabled,
}: {
  /** ISO 8601 — moment, do którego cofnięcie jest możliwe */
  until: string;
  onUndo?: () => void;
  disabled?: boolean;
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // Sekundowy zegar: przy oknie dziesięciominutowym napis „zostały 4 minuty”
    // musi się zmieniać na oczach klienta, bo to on decyduje, czy zdąży.
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Przed zamontowaniem nic nie rysujemy — serwer i przeglądarka policzyłyby
  // pozostały czas w dwóch różnych sekundach (rozjazd hydratacji).
  if (!now) return null;

  const left = timeLeft(until, now);
  if (left.expired) return null;

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--ff-border)] bg-[var(--ff-surface-inset)] px-2.5 py-1.5">
      <span
        aria-hidden
        className="material-symbols-outlined text-[16px] leading-none text-[var(--ff-text-muted)]"
      >
        history
      </span>

      <p className="min-w-0 flex-1 text-[11px] text-[var(--ff-text-muted)]">
        Zrobiłem to za Ciebie. Możesz cofnąć — {left.label}.
      </p>

      <button
        type="button"
        disabled={disabled}
        onClick={onUndo}
        className="rounded-md border border-[var(--ff-border)] px-2 py-1 text-[11px] text-[var(--ff-text-soft)] transition-colors hover:border-[var(--ff-border-strong)] hover:text-[var(--ff-text)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        Cofnij
      </button>
    </div>
  );
}
