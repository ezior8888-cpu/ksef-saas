'use client';

import { useEffect, useState } from 'react';
import { RiAlertLine, RiCloseLine, RiCloudOffLine } from '@remixicon/react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import type { KsefHealthSnapshot } from '@/lib/ksef/health-status';

const POLL_INTERVAL_MS = 30_000;

interface Props {
  initial: KsefHealthSnapshot | null;
}

/**
 * Banner gdy KSeF jest `degraded` lub `down`. Polluje `/api/ksef/health`
 * co 30s — odpada koszt WebSocket setup'u (Supabase Realtime, dedykowany
 * pub/sub) dla zdarzenia, które realnie zmienia się max kilka razy w tygodniu.
 *
 * Dismiss: użytkownik może schować banner — flaga w `sessionStorage`, więc
 * po odświeżeniu lub eskalacji do `down` banner wraca.
 */
export function KsefHealthBannerClient({ initial }: Props) {
  const [snapshot, setSnapshot] = useState<KsefHealthSnapshot | null>(initial);
  // Lazy init: czytamy sessionStorage raz w pierwszym renderze (SSR-safe
  // przez `typeof window` guard), zamiast useEffect+setState — ESLint
  // `react-hooks/set-state-in-effect` flaguje cascading renders inaczej.
  const [dismissedLevel, setDismissedLevel] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      return window.sessionStorage.getItem('ff:ksef-banner-dismissed');
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const tick = async () => {
      try {
        const res = await fetch('/api/ksef/health', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as KsefHealthSnapshot & { stale?: boolean };
        if (data.stale) return;
        setSnapshot(data);
      } catch {
        // Sieć padła? UI nie ma jak wiedzieć — zostawmy ostatni stan.
      }
    };

    const id = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  if (!snapshot || snapshot.level === 'operational') return null;
  if (dismissedLevel === snapshot.level) return null;

  const isDown = snapshot.level === 'down';
  const Icon = isDown ? RiCloudOffLine : RiAlertLine;

  const title = isDown
    ? snapshot.isMfOutage
      ? 'Ministerstwo Finansów zgłasza awarię KSeF'
      : 'KSeF jest niedostępny'
    : 'KSeF działa wolno';

  const description = isDown
    ? 'Nowe faktury pozostaną szkicami. Automatyczny Offline24 jest wstrzymany; po przywróceniu KSeF sprawdź stan dokumentu przed wysyłką.'
    : `Pingi do KSeF trwają ${snapshot.responseTimeMs ?? '?'}ms. Wysyłka faktur może być wolniejsza, ale działa.`;

  const handleDismiss = () => {
    setDismissedLevel(snapshot.level);
    try {
      window.sessionStorage.setItem('ff:ksef-banner-dismissed', snapshot.level);
    } catch {
      // Nawet bez storage user nie zobaczy banera do refresh — OK.
    }
  };

  return (
    <Alert
      role="status"
      aria-live="polite"
      variant={isDown ? 'destructive' : 'default'}
      className={cn(
        'pr-10',
        !isDown &&
          'border-[var(--ff-warn-border)] bg-[var(--ff-warn-tint)] text-[var(--ff-warn-text)]',
      )}
    >
      <Icon aria-hidden />
      <AlertTitle className="font-semibold">{title}</AlertTitle>
      <AlertDescription className={cn(!isDown && 'text-[var(--ff-warn-text)]')}>
        {description}
      </AlertDescription>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Schowaj baner"
        className="hover:bg-foreground/10 absolute top-1.5 right-1.5 shrink-0 p-1 transition-colors"
      >
        <RiCloseLine className="text-muted-foreground size-4" aria-hidden />
      </button>
    </Alert>
  );
}
