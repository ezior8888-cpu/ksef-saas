'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * Stan „mam Twoje zdjęcie” (krok 22 toru B).
 *
 * Klient udostępnia paragon z telefonu i ląduje w wątku agenta. Między
 * zdjęciem a gotowym kosztem mija kilkanaście sekund — i to właśnie te
 * kilkanaście sekund decyduje, czy zaufa temu przepływowi następnym razem.
 * Dlatego mówimy trzy rzeczy: mam, czytam, zaraz pokażę.
 *
 * PO TRZECH MINUTACH przestajemy odpytywać i mówimy wprost, że trwa to
 * dłużej niż zwykle, ZE ZDANIEM O TYM, ŻE ZDJĘCIE JEST BEZPIECZNE. Klient,
 * który usłyszy samo „coś nie wyszło”, wyrzuca paragon do kosza i po miesiącu
 * nie ma czego odtwarzać. Kartę z prawdziwą diagnozą i tak przyśle silnik
 * (`findStuckOcrJobs`) — to tutaj jest tylko stan przejściowy.
 */
const POLL_MS = 15_000;
const GIVE_UP_MS = 3 * 60 * 1000;

export function FloPhotoBanner({
  /** najświeższa propozycja kosztowa — po niej poznajemy, że odczyt gotowy */
  latestExpenseAt,
}: {
  latestExpenseAt: string | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const paragon = params.get('paragon');

  // Moment wejścia na ekran ustawiamy po zamontowaniu, a nie w renderze:
  // `Date.now()` w trakcie renderu daje inny wynik na serwerze i w
  // przeglądarce, więc pasek migałby przy hydratacji.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [slow, setSlow] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    // To jest dokładnie ten przypadek, w którym stan MA powstać dopiero po
    // zamontowaniu: znacznik czasu policzony w renderze różniłby się między
    // serwerem a przeglądarką i pasek migałby przy hydratacji.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStartedAt(Date.now());
  }, []);

  useEffect(() => {
    if (startedAt === null) return;
    if (!paragon || paragon === 'blad' || paragon === 'brak-zdjecia') return;

    const poll = setInterval(() => {
      if (Date.now() - startedAt > GIVE_UP_MS) {
        setSlow(true);
        clearInterval(poll);
        return;
      }
      router.refresh();
    }, POLL_MS);

    return () => clearInterval(poll);
  }, [paragon, router, startedAt]);

  if (!paragon || hidden) return null;

  // Odczyt się udał: nowy koszt jest młodszy niż moment wejścia na ekran.
  const arrived =
    latestExpenseAt !== null &&
    startedAt !== null &&
    Date.parse(latestExpenseAt) > startedAt - POLL_MS;

  const message = (() => {
    if (paragon === 'brak-zdjecia') {
      return 'Nie dostałem zdjęcia — spróbuj udostępnić je jeszcze raz.';
    }
    if (paragon === 'blad') {
      return 'Nie udało mi się przyjąć tego zdjęcia. Nic nie zginęło — spróbuj ponownie albo dodaj paragon w Wydatkach.';
    }
    if (arrived) {
      return 'Paragon odczytany — koszt jest w wątku poniżej.';
    }
    if (slow) {
      return 'Czytam ten paragon dłużej niż zwykle. Zdjęcie jest bezpieczne w archiwum — wrócę z wynikiem, a jeśli się nie uda, powiem o tym wprost.';
    }
    return 'Mam Twoje zdjęcie. Czytam paragon — wynik pojawi się tutaj.';
  })();

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--ff-border)] bg-[var(--ff-surface-container-low)] px-3 py-2.5"
    >
      <span
        aria-hidden
        className="material-symbols-outlined text-[18px] leading-none text-[var(--ff-text-muted)]"
      >
        photo_camera
      </span>

      <p className="min-w-0 flex-1 text-xs text-[var(--ff-text-soft)]">
        {message}
      </p>

      <button
        type="button"
        onClick={() => setHidden(true)}
        className="min-h-9 shrink-0 rounded-lg border border-[var(--ff-border)] px-2.5 py-1 text-[11px] text-[var(--ff-text-muted)] transition-colors hover:border-[var(--ff-border-strong)] hover:text-[var(--ff-text)]"
      >
        Ukryj
      </button>
    </div>
  );
}
