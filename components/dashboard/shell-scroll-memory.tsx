'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef } from 'react';

/** Pozycje przewinięcia panelu wg ścieżki w tej karcie przeglądarki. */
const positions = new Map<string, number>();
/**
 * Adres, na który przeniósł ostatni „Wstecz” / „Dalej”. Adres, nie flaga:
 * cofnięcie w obrębie tej samej ścieżki (np. `?page=2` → `/invoices`) nie
 * zmienia `pathname`, więc flaga przeżyłaby do następnego kliknięcia linku.
 */
let popKey: string | null = null;

/** Ile klatek czekamy, aż treść przywracanej strony urośnie do zapamiętanej pozycji. */
const RESTORE_FRAMES = 30;

function urlKey(): string {
  return `${window.location.pathname}${window.location.search}`;
}

function shellScroller(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.ff-shell-scroll');
}

/**
 * Przewijanie panelu przy zmianie trasy.
 *
 * Panel przewija `.ff-shell-scroll`, nie okno, więc przeglądarka nie robi tu
 * nic sama. Next po zmianie zakładki woła `scrollIntoView()` na nowej stronie,
 * czyli dociąga do krawędzi szablonu trasy — bez górnego odstępu i bez banera
 * KSeF nad nim — a przy „Wstecz” nie przywraca niczego. Stąd dwie reguły:
 *  - przejście linkiem: nowa strona zaczyna się od samej góry;
 *  - „Wstecz” / „Dalej” (gest cofania na iPhonie): wracamy tam, gdzie klient
 *    był, np. w to samo miejsce listy faktur po obejrzeniu jednej z nich.
 *
 * Zmiana samych parametrów (filtry, strona listy) nie przewija — tym zajmuje
 * się Next, a zaznaczenie na liście ma zostać na miejscu.
 */
export function ShellScrollMemory() {
  const pathname = usePathname();
  // Ścieżka, pod którą zapisujemy przewinięcie. Z Reacta, nie z `location`:
  // Next podmienia adres w zwykłym efekcie, już po naszym efekcie układu,
  // więc zdarzenie `scroll` z wyzerowania nowej strony trafiłoby pod adres
  // poprzedniej i „Wstecz” wracałby na górę listy.
  const keyRef = useRef<string | null>(null);

  useEffect(() => {
    const scroller = shellScroller();
    if (!scroller) return;
    const remember = () => {
      if (keyRef.current !== null) positions.set(keyRef.current, scroller.scrollTop);
    };
    // „Wstecz” zmienia adres przed podmianą treści, więc tu pozycja jest
    // jeszcze pozycją strony, z której wychodzimy.
    const onPop = () => {
      remember();
      popKey = urlKey();
    };
    // `scroll` to główne źródło, ale przeglądarka wysyła je dopiero przy
    // malowaniu klatki; kliknięcie linku zapisuje pozycję przed nawigacją.
    scroller.addEventListener('scroll', remember, { passive: true });
    document.addEventListener('click', remember, { capture: true });
    window.addEventListener('popstate', onPop);
    return () => {
      scroller.removeEventListener('scroll', remember);
      document.removeEventListener('click', remember, { capture: true });
      window.removeEventListener('popstate', onPop);
    };
  }, []);

  // Efekt układu, nie zwykły: pozycja ma stać przed pierwszym malowaniem
  // nowej strony, inaczej widać mignięcie starego miejsca. Komponent stoi
  // w szkielecie ZA treścią, więc jego efekt biegnie po przewinięciu Nexta.
  useLayoutEffect(() => {
    const scroller = shellScroller();
    if (!scroller) return;
    keyRef.current = pathname;

    const restoring = popKey === urlKey();
    popKey = null;
    if (!restoring) {
      scroller.scrollTop = 0;
      return;
    }

    const target = positions.get(pathname) ?? 0;
    let frame = 0;
    let handle = 0;
    // Strona z pamięci podręcznej Nexta ma treść od razu; strumieniowana
    // rośnie przez kilka klatek. Dotyk klienta przerywa przywracanie.
    const stop = () => cancelAnimationFrame(handle);
    const apply = () => {
      scroller.scrollTop = target;
      frame += 1;
      if (Math.abs(scroller.scrollTop - target) > 1 && frame < RESTORE_FRAMES) {
        handle = requestAnimationFrame(apply);
      }
    };
    apply();
    scroller.addEventListener('touchstart', stop, { once: true, passive: true });
    scroller.addEventListener('wheel', stop, { once: true, passive: true });
    return () => {
      stop();
      scroller.removeEventListener('touchstart', stop);
      scroller.removeEventListener('wheel', stop);
    };
  }, [pathname]);

  return null;
}
