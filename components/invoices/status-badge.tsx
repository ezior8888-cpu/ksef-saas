import { Loader2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';

/**
 * Odwzorowanie `ksef_status` z DB na etykietę UI.
 * Zgodnie z 00001 + 00003 możliwe wartości w DB:
 *   draft, queued, sending, accepted, rejected, received, failed.
 * `received` to status dla faktur z inboxu (direction='incoming') -
 * tu w liście wystawionych się nie pojawia, ale mapę trzymamy kompletną.
 */
const STATUS_MAP: Record<string, { label: string; className: string }> = {
  draft: { label: 'Szkic', className: 'bg-gray-100 text-gray-700 border-gray-200' },
  queued: {
    label: 'Oczekuje na wysyłkę',
    className: 'bg-yellow-100 text-yellow-900 border-yellow-200',
  },
  sending: {
    label: 'Wysyłanie',
    className: 'bg-blue-100 text-blue-900 border-blue-200',
  },
  accepted: {
    label: 'Zaakceptowana',
    className: 'bg-green-100 text-green-900 border-green-200',
  },
  rejected: {
    label: 'Odrzucona',
    className: 'bg-red-100 text-red-900 border-red-200',
  },
  failed: {
    label: 'Błąd wysyłki',
    className: 'bg-red-100 text-red-900 border-red-200',
  },
  received: {
    label: 'Odebrana',
    className: 'bg-purple-100 text-purple-900 border-purple-200',
  },
};

export function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_MAP[status] ?? {
    label: status,
    className: 'bg-gray-100 text-gray-700 border-gray-200',
  };
  const isInFlight = status === 'queued' || status === 'sending';

  return (
    <Badge
      variant="outline"
      className={`${meta.className} gap-1 font-normal`}
    >
      {isInFlight && <Loader2 className="h-3 w-3 animate-spin" />}
      {meta.label}
    </Badge>
  );
}
