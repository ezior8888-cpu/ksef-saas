'use client';

import type { LucideIcon } from 'lucide-react';
import { CheckCircle2, HelpCircle, Loader2, XCircle } from 'lucide-react';

import { cn } from '@/lib/utils';

type VatStatus = 'active' | 'exempt' | 'inactive' | 'unknown' | 'pending';

interface Props {
  status: VatStatus;
  source?: 'whitelist' | 'vies' | null;
  fromCache?: boolean;
  warning?: string | null;
  size?: 'sm' | 'md';
}

const STATUS_CONFIG: Record<
  VatStatus,
  { label: string; icon: LucideIcon; className: string }
> = {
  active: {
    label: 'Czynny VAT',
    icon: CheckCircle2,
    // Kolory statusów Finory (`INVOICE_STATUS_STYLES`, plakietka „Paid”).
    className:
      'bg-green-600/10 text-green-600 dark:bg-green-400/10 dark:text-green-400',
  },
  exempt: {
    label: 'Zwolniony VAT',
    icon: CheckCircle2,
    className: 'bg-primary/10 text-primary',
  },
  inactive: {
    label: 'Wykreślony',
    icon: XCircle,
    className: 'bg-destructive/10 text-destructive',
  },
  unknown: {
    label: 'Niezweryfikowany',
    icon: HelpCircle,
    className: 'bg-muted text-muted-foreground',
  },
  pending: {
    label: 'Sprawdzanie...',
    icon: Loader2,
    className: 'bg-muted text-muted-foreground',
  },
};

function sourceTooltipLabel(source: 'whitelist' | 'vies' | null): string {
  switch (source) {
    case 'whitelist':
      return 'Biała Lista';
    case 'vies':
      return 'VIES';
    default:
      return 'nieznane';
  }
}

export function VatStatusBadge({
  status,
  source = null,
  fromCache = false,
  warning,
  size = 'sm',
}: Props) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  const isPending = status === 'pending';
  const isWarning = Boolean(warning) && status === 'active';

  const finalClassName = isWarning
    ? 'bg-amber-600/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-400'
    : config.className;

  const sizeClass =
    size === 'sm'
      ? 'px-2 py-0.5 text-xs gap-1'
      : 'px-3 py-1.5 text-sm gap-2';

  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';

  const title =
    warning ??
    `Źródło: ${sourceTooltipLabel(source)}${fromCache ? ' (cache)' : ''}`;

  return (
    <span
      className={cn(
        'inline-flex w-fit shrink-0 items-center rounded-none font-medium whitespace-nowrap',
        finalClassName,
        sizeClass,
      )}
      title={title}
    >
      <Icon
        className={cn(iconSize, isPending && 'animate-spin', 'shrink-0')}
      />
      <span>{isWarning ? 'Wymaga uwagi' : config.label}</span>
    </span>
  );
}
