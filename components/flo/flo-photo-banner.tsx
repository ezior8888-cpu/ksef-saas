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

/** Wynik odczytu paragonu z adresu; `null` = jeszcze nie wiemy. */
export type PhotoBannerResult = 'failed' | 'read' | null;

/**
 * Czy paragon z adresu (`?paragon=<ocrJobId>`) ma już wynik.
 *
 * PORAŻKA NIE ZALEŻY OD CZASU: karta „nie odczytałem” niesie numer zadania,
 * więc rozpoznajemy ją po nim — tak samo na serwerze i w przeglądarce, bez
 * migania przy hydratacji. Sukces poznajemy po koszcie odczytanym ze zdjęcia,
 * młodszym niż wejście na ekran (z zapasem jednego cyklu odpytywania).
 */
export function photoBannerResult({
  paragon,
  failedOcrJobIds,
  latestExpenseAt,
  startedAt,
}: {
  paragon: string;
  failedOcrJobIds: readonly string[];
  latestExpenseAt: string | null;
  startedAt: number | null;
}): PhotoBannerResult {
  if (failedOcrJobIds.includes(paragon)) return 'failed';
  if (
    latestExpenseAt !== null &&
    startedAt !== null &&
    Date.parse(latestExpenseAt) > startedAt - POLL_MS
  ) {
    return 'read';
  }
  return null;
}

/**
 * Mocniejszy z dwóch wyników: porażka > odczyt > brak. Pasek pamięta
 * najmocniejszy wynik, jaki widział dla danego paragonu — karta, z której
 * go poznał, może zniknąć z wątku (klient ją zamknął albo potwierdził),
 * a wtedy pasek wracałby do „Czytam paragon” i odpytywania od nowa.
 */
export function strongerPhotoBannerResult(
  a: PhotoBannerResult,
  b: PhotoBannerResult,
): PhotoBannerResult {
  if (a === 'failed' || b === 'failed') return 'failed';
  if (a === 'read' || b === 'read') return 'read';
  return null;
}

/**
 * Zdanie paska. Porażka ma pierwszeństwo przed „odczytany” i „dłużej niż
 * zwykle”: pasek obiecuje „jeśli się nie uda, powiem o tym wprost”, więc nie
 * wolno mu przeczyć karcie „Nie odczytałem tego zdjęcia” tuż pod nim.
 * Zdanie porażki powtarza treść tej karty (`expense.review:failed`
 * w `lib/flo/copy.ts`), a drogę wyjścia zostawia karcie.
 */
export function photoBannerMessage({
  paragon,
  result,
  slow,
}: {
  paragon: string;
  result: PhotoBannerResult;
  slow: boolean;
}): string {
  if (paragon === 'brak-zdjecia') {
    return 'Nie dostałem zdjęcia — spróbuj udostępnić je jeszcze raz.';
  }
  if (paragon === 'blad') {
    return 'Nie udało mi się przyjąć tego zdjęcia. Nic nie zginęło — spróbuj ponownie albo dodaj paragon w Wydatkach.';
  }
  if (result === 'failed') {
    return 'Nie odczytałem tego paragonu. Zdjęcie zostało w archiwum, nic nie przepadło — co dalej, piszę w karcie poniżej.';
  }
  if (result === 'read') {
    return 'Paragon odczytany — koszt jest w wątku poniżej.';
  }
  if (slow) {
    return 'Czytam ten paragon dłużej niż zwykle. Zdjęcie jest bezpieczne w archiwum — wrócę z wynikiem, a jeśli się nie uda, powiem o tym wprost.';
  }
  return 'Mam Twoje zdjęcie. Czytam paragon — wynik pojawi się tutaj.';
}

export function FloPhotoBanner({
  /** najświeższy koszt odczytany ze zdjęcia — po nim poznajemy, że odczyt gotowy */
  latestExpenseAt,
  /** zadania OCR z kartą porażki w wątku — po nich poznajemy, że odczyt nie wyszedł */
  failedOcrJobIds = [],
}: {
  latestExpenseAt: string | null;
  failedOcrJobIds?: readonly string[];
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

  const current = paragon
    ? photoBannerResult({ paragon, failedOcrJobIds, latestExpenseAt, startedAt })
    : null;

  // Zapamiętany wynik dla TEGO paragonu (wzorzec „stan z poprzedniego
  // renderu” z dokumentacji Reacta — bez efektu, więc bez klatki ze starym
  // zdaniem). Inny paragon w adresie zaczyna od zera.
  const [latched, setLatched] = useState<{
    paragon: string | null;
    result: PhotoBannerResult;
  }>({ paragon, result: null });
  const remembered = latched.paragon === paragon ? latched.result : null;
  const result = strongerPhotoBannerResult(remembered, current);
  if (latched.paragon !== paragon || latched.result !== result) {
    setLatched({ paragon, result });
  }

  // Na pewno wiemy tylko o porażce: karta „nie odczytałem” niesie numer
  // TEGO zadania. „Odczytany” to wniosek z czasu najświeższego kosztu —
  // mógł przyjść z innego zdjęcia — więc pytamy dalej (do trzech minut),
  // żeby karta porażki tego paragonu mogła go jeszcze poprawić.
  const settled = result === 'failed';

  useEffect(() => {
    if (startedAt === null || settled) return;
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
  }, [paragon, router, settled, startedAt]);

  if (!paragon || hidden) return null;

  const message = photoBannerMessage({ paragon, result, slow });

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
