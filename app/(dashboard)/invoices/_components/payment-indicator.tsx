import { RiCheckboxCircleLine, RiErrorWarningLine, RiTimeLine } from '@remixicon/react';

import { PAYMENT_STATE_LABELS } from '@/components/invoices/invoice-row-types';
import type { InvoicePaymentState } from '@/lib/invoices/list-row-facts';
import { cn } from '@/lib/utils';

const ICONS = {
  paid: { Icon: RiCheckboxCircleLine, tone: 'text-emerald-600 dark:text-emerald-400' },
  overdue: { Icon: RiErrorWarningLine, tone: 'text-destructive' },
  unpaid: { Icon: RiTimeLine, tone: 'text-amber-600 dark:text-amber-400' },
} as const satisfies Record<InvoicePaymentState, { Icon: typeof RiTimeLine; tone: string }>;

/**
 * Ikona płatności (Finora: kolumna „Status”). Etykieta tylko dla czytników
 * ekranu i w `title` — kolor sam niczego nie niesie. `null` = „—”: faktura
 * spoza należności (szkic, import, korekta, waluta obca).
 */
export function PaymentIndicator({
  state,
  className,
  showLabel = false,
}: {
  state: InvoicePaymentState | null;
  className?: string;
  /** Etykieta widoczna obok ikony (karty telefonu); domyślnie tylko dla czytników. */
  showLabel?: boolean;
}) {
  if (state === null) {
    return (
      <span className={cn('text-muted-foreground', className)} title="Brak płatności do rozliczenia">
        —
      </span>
    );
  }
  const { Icon, tone } = ICONS[state];
  return (
    <span className={cn('inline-flex items-center gap-1', tone, className)} title={PAYMENT_STATE_LABELS[state]}>
      <Icon className={showLabel ? 'size-4' : 'size-5'} aria-hidden />
      <span className={showLabel ? 'text-xs font-medium' : 'sr-only'}>{PAYMENT_STATE_LABELS[state]}</span>
    </span>
  );
}
