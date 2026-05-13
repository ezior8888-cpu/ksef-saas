'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CloudOff, X } from 'lucide-react';

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
  const Icon = isDown ? CloudOff : AlertTriangle;

  const title = isDown
    ? snapshot.isMfOutage
      ? 'Ministerstwo Finansów zgłasza awarię KSeF'
      : 'KSeF jest niedostępny'
    : 'KSeF działa wolno';

  const description = isDown
    ? 'Twoje faktury zostaną automatycznie wysłane gdy API wstanie. W międzyczasie tryb Offline24 jest aktywny — nic nie zginie.'
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
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'rounded-2xl border px-4 py-3 backdrop-blur-xl flex items-start gap-3',
        isDown
          ? 'border-red-500/30 bg-red-500/8'
          : 'border-amber-500/30 bg-amber-500/8',
      )}
    >
      <Icon
        className={cn(
          'h-5 w-5 shrink-0 mt-0.5',
          isDown
            ? 'text-red-600 dark:text-red-400'
            : 'text-amber-600 dark:text-amber-400',
        )}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            'text-sm font-semibold',
            isDown
              ? 'text-red-700 dark:text-red-300'
              : 'text-amber-700 dark:text-amber-300',
          )}
        >
          {title}
        </p>
        <p className="text-sm text-foreground/80 mt-0.5 leading-relaxed">{description}</p>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Schowaj baner"
        className="shrink-0 rounded-lg p-1 transition-colors hover:bg-foreground/10"
      >
        <X className="h-4 w-4 text-muted-foreground" aria-hidden />
      </button>
    </div>
  );
}
