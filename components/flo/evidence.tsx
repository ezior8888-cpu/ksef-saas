'use client';

import Link from 'next/link';
import { useState } from 'react';

import type { FloEvidence } from '@/types/flo';

/**
 * „Dlaczego to widzę” (krok 17 toru B) — rozwijana lista dowodów.
 *
 * DWA POWODY, DLA KTÓRYCH TO ISTNIEJE. Pierwszy jest produktowy: agent, który
 * mówi „Nowak nie zapłacił 4 300 zł”, musi umieć pokazać fakturę, z której to
 * wziął — inaczej jest wyrocznią, a wyroczni nikt nie powierza wysyłki
 * dokumentów. Drugi jest prawny: przy profilowaniu klient ma prawo dowiedzieć
 * się, na jakiej podstawie zapadła decyzja.
 *
 * ZWINIĘTA DOMYŚLNIE. Kto ufa, nie musi czytać; kto sprawdza, ma jedno
 * kliknięcie. Rozwinięta na starcie zamieniałaby każdą kartę w wykaz
 * odnośników i zabijała to, co w niej najważniejsze — jedno zdanie i jedną
 * decyzję.
 */
export function FloEvidenceDisclosure({
  evidence,
}: {
  evidence: readonly FloEvidence[];
}) {
  const [open, setOpen] = useState(false);

  // Propozycja bez dowodów po prostu nie ma tej sekcji. Pusty przycisk
  // „dlaczego to widzę”, który rozwija nic, byłby gorszy niż jego brak.
  if (evidence.length === 0) return null;

  return (
    <div className="mt-3 border-t border-[var(--ff-row-divider)] pt-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[11px] text-[var(--ff-text-dim)] transition-colors hover:text-[var(--ff-text-muted)]"
      >
        <span
          aria-hidden
          className="material-symbols-outlined text-[14px] leading-none"
        >
          {open ? 'expand_less' : 'expand_more'}
        </span>
        Dlaczego to widzę
      </button>

      {open ? (
        <ul className="mt-1.5 space-y-1">
          {evidence.map((item) => (
            <li key={`${item.href}:${item.label}`}>
              <Link
                href={item.href}
                className="text-[11px] text-[var(--ff-text-muted)] underline underline-offset-2 transition-colors hover:text-[var(--ff-text)]"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
