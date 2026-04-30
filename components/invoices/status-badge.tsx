import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

/** W kolejce (UI) — w DB jako `queued`. */
const IN_QUEUE_CLASSES =
  'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20';

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  draft: {
    label: 'Szkic',
    className:
      'bg-foreground/5 text-muted-foreground border-white/55 dark:border-white/14',
  },
  pending: {
    label: 'W kolejce',
    className: IN_QUEUE_CLASSES,
  },
  queued: {
    label: 'W kolejce',
    className: IN_QUEUE_CLASSES,
  },
  sending: {
    label: 'Wysyłanie',
    className: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
  },
  accepted: {
    label: 'Zaakceptowana',
    className: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20',
  },
  rejected: {
    label: 'Odrzucona',
    className: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
  },
  failed: {
    label: 'Błąd',
    className: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
  },
  received: {
    label: 'Odebrana',
    className:
      'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20',
  },
};

const FALLBACK = {
  label: 'Nieznany',
  className:
    'bg-foreground/5 text-muted-foreground border-white/55 dark:border-white/14',
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
    status === 'sending';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium backdrop-blur-[12px]',
        meta.className
      )}
    >
      {showSpinner && <Loader2 className="h-3 w-3 animate-spin" />}
      {meta.label}
    </span>
  );
}
