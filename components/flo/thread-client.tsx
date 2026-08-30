'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';

import {
  approveProposal,
  dismissProposal,
  undoAction,
} from '@/app/actions/flo';
import type { FloAction, FloApproveInput, FloProposalView } from '@/types/flo';

import { FloThread } from './thread';

/**
 * Wątek z wpiętymi akcjami (kroki 16–20 toru B).
 *
 * TO JEST MIEJSCE, W KTÓRYM KLIKNIĘCIE ZAMIENIA SIĘ W DECYZJĘ. Wszystko, co
 * karta wie o świecie, przechodzi przez ten komponent: on woła akcje
 * serwerowe, on trzyma stan „trwa wykonywanie” i on pokazuje odpowiedź.
 * Karty zostają głupie i dają się testować bez serwera.
 *
 * TRZY ZASADY, KTÓRYCH TU PILNUJĘ:
 *
 * 1. ODMOWA NIE JEST AWARIĄ. `stale`, `expired` i `blocked` to normalne
 *    odpowiedzi: dane zmieniły się między propozycją a kliknięciem, termin
 *    minął, warunek techniczny niespełniony. Pokazujemy zdanie z serwera
 *    spokojnym tonem i odświeżamy listę. Nigdy czerwonego komunikatu.
 *
 * 2. CISZA JEST STANEM ZABRONIONYM (własność W5). Gdy akcja się wywali —
 *    bo zerwało sieć albo serwer zwrócił błąd — klient dostaje zdanie
 *    o tym, że nic się nie stało i może spróbować ponownie. Nigdy przycisku,
 *    który po prostu nic nie robi.
 *
 * 3. JEDNO KLIKNIĘCIE, JEDNA AKCJA. Karta w trakcie wykonywania ma wszystkie
 *    przyciski wyłączone. Podwójne kliknięcie i tak nie przepuści dwóch
 *    wysyłek (żeton zgody po stronie silnika jest jednorazowy), ale klient
 *    nie ma powodu tego testować.
 */
export function FloThreadClient({
  proposals,
  className,
}: {
  proposals: FloProposalView[];
  className?: string;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notices, setNotices] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  const setNotice = useCallback((id: string, message: string) => {
    setNotices((current) => ({ ...current, [id]: message }));
  }, []);

  const refresh = useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  const handleAction = useCallback(
    async (
      action: FloAction,
      view: FloProposalView,
      input?: FloApproveInput,
    ) => {
      // „Pokaż fakturę” nie jest decyzją — to skok do rekordu, z którego
      // powstała propozycja. Adresu nie ma w samej akcji, więc bierzemy
      // pierwszy dowód; on właśnie po to jest.
      if (action.intent === 'open') {
        const href = view.evidence[0]?.href;
        if (href) router.push(href);
        return;
      }

      setPendingId(view.id);
      setNotices((current) => {
        const next = { ...current };
        delete next[view.id];
        return next;
      });

      try {
        if (action.intent === 'dismiss' || action.intent === 'snooze') {
          await dismissProposal(view.id, 'not_now');
        } else if (action.intent === 'mute') {
          await dismissProposal(view.id, 'never');
        } else {
          const result = await approveProposal(view.id, input);

          if (!result.ok) {
            // Bezpiecznik zadziałał. To dobra wiadomość i tak ma zabrzmieć.
            setNotice(view.id, result.message);
          }
        }

        refresh();
      } catch {
        // Nie znamy powodu i nie udajemy, że znamy. Klient ma wiedzieć
        // dwie rzeczy: nic się nie wydarzyło i może spróbować jeszcze raz.
        setNotice(
          view.id,
          'Nie udało mi się tego teraz zrobić — nic nie poszło dalej. Spróbuj za chwilę.',
        );
      } finally {
        setPendingId(null);
      }
    },
    [refresh, router, setNotice],
  );

  const handleUndo = useCallback(
    async (view: FloProposalView) => {
      setPendingId(view.id);

      try {
        const result = await undoAction(view.id);

        if (!result.ok) {
          setNotice(
            view.id,
            result.message ?? 'Tej zmiany nie da się już cofnąć.',
          );
        }

        refresh();
      } catch {
        setNotice(
          view.id,
          'Nie udało mi się cofnąć tej zmiany. Spróbuj za chwilę.',
        );
      } finally {
        setPendingId(null);
      }
    },
    [refresh, setNotice],
  );
  return (
    <FloThread
      proposals={proposals}
      className={className}
      cardProps={(proposal) => ({
        notice: notices[proposal.id],
        pending: pendingId === proposal.id,
        onAction: (action, view, input) => {
          void handleAction(action, view, input);
        },
        onUndo: () => {
          void handleUndo(proposal);
        },
      })}
    />
  );
}
