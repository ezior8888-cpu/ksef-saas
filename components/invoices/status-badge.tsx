import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { ffStatusPill, ffStatusTone, type FfStatusTone } from '@/lib/dashboard/ff-surface-classes';

/**
 * „Pigułki" statusów z prototypu: tło = przyciemniony odcień roli, tekst =
 * kolor roli, bez obramowania. Kropka po lewej niesie status niezależnie od
 * samego koloru — dla osób nierozróżniających barw etykieta i kropka
 * wystarczają, a spinner zastępuje kropkę tam, gdzie coś trwa.
 */
const STATUS_MAP: Record<string, { label: string; tone: FfStatusTone }> = {
  draft: { label: 'Szkic', tone: 'neutral' },
  pending: { label: 'W kolejce', tone: 'warning' },
  queued: { label: 'W kolejce', tone: 'warning' },
  sending: { label: 'Wysyłanie', tone: 'info' },
  offline_queued: { label: 'Offline (oczekuje KSeF)', tone: 'warning' },
  accepted: { label: 'Zaakceptowana', tone: 'success' },
  rejected: { label: 'Odrzucona', tone: 'danger' },
  failed: { label: 'Błąd', tone: 'danger' },
  received: { label: 'Odebrana', tone: 'violet' },
};

const FALLBACK: { label: string; tone: FfStatusTone } = {
  label: 'Nieznany',
  tone: 'neutral',
};

interface StatusBadgeProps {
  status: string;
  isLoading?: boolean;
}

export function StatusBadge({ status, isLoading }: StatusBadgeProps) {
  const meta = STATUS_MAP[status] ?? FALLBACK;
  const showSpinner =
    isLoading === true ||
    status === 'queued' ||
    status === 'pending' ||
    status === 'offline_queued' ||
    status === 'sending';

  return (
    <span className={cn(ffStatusPill, ffStatusTone[meta.tone])}>
      {showSpinner ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <span
          className="size-1.5 shrink-0 rounded-full bg-current"
          aria-hidden
        />
      )}
      {meta.label}
    </span>
  );
}
