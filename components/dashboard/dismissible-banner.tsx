'use client';

import { useCallback, useSyncExternalStore, type ReactNode } from 'react';

const KLUCZ_PREFIKS = 'ff.banner.dismissed.';
const DOBA_MS = 24 * 60 * 60 * 1000;
const ZDARZENIE = 'ff-banner-dismissed';

/**
 * Baner, który da się zamknąć na dobę — WYŁĄCZNIE na telefonie.
 *
 * DLACZEGO NIE NA STAŁE. Baner braku certyfikatu mówi, że wysyłka do KSeF
 * nie zadziała. Trwałe zamknięcie zamieniłoby ostrzeżenie w coś, co klient
 * odklika raz i zapomni, aż do pierwszej nieudanej wysyłki. Doba jest
 * kompromisem: nie wraca co nawigację, ale wraca.
 *
 * DLACZEGO TYLKO PONIŻEJ `lg`. Na telefonie baner zajmuje jedną piątą ekranu
 * i stoi nad wątkiem agenta przy KAŻDYM wejściu. Na komputerze to jeden pas
 * nad treścią i nie zabiera niczego, więc tam zostaje bez zmian — stąd
 * `hidden lg:block` zamiast pełnego ukrycia po zamknięciu.
 *
 * `useSyncExternalStore`, nie `useState` + `useEffect`: React użyje migawki
 * serwerowej przy hydracji, a zaraz potem prawdziwej — bez rozjazdu znaczników
 * i bez klatki, w której zamknięty baner mruga na ekranie.
 */
export function DismissibleBanner({
  id,
  children,
}: {
  /** Odróżnia banery od siebie w pamięci przeglądarki. */
  id: string;
  children: ReactNode;
}) {
  const klucz = KLUCZ_PREFIKS + id;

  const subscribe = useCallback((onChange: () => void) => {
    if (typeof window === 'undefined') return () => {};
    window.addEventListener(ZDARZENIE, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(ZDARZENIE, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined') return false;
    try {
      const zapis = window.localStorage.getItem(klucz);
      if (!zapis) return false;
      return Date.now() - Number(zapis) < DOBA_MS;
    } catch {
      // Prywatne okno albo zablokowane dane witryny — wtedy baner po prostu
      // zostaje. Ostrzeżenie widoczne zawsze jest bezpieczniejsze niż ukryte.
      return false;
    }
  }, [klucz]);

  const zamkniety = useSyncExternalStore(subscribe, getSnapshot, () => false);

  const zamknij = useCallback(() => {
    try {
      window.localStorage.setItem(klucz, String(Date.now()));
    } catch {
      // Nie da się zapamiętać — baner wróci przy odświeżeniu i trudno.
    }
    window.dispatchEvent(new Event(ZDARZENIE));
  }, [klucz]);

  return (
    <div className={zamkniety ? 'hidden lg:block' : undefined}>
      <div className="relative">
        {children}
        <button
          type="button"
          onClick={zamknij}
          aria-label="Ukryj na dziś"
          className="absolute right-2 top-2 flex size-9 items-center justify-center rounded-lg text-[var(--ff-warn)] transition-colors hover:bg-[var(--ff-warn-border)] lg:hidden"
        >
          <span aria-hidden className="material-symbols-outlined text-[18px] leading-none">
            close
          </span>
        </button>
      </div>
    </div>
  );
}
