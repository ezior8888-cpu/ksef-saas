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
    className:
      'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20',
  },
  exempt: {
    label: 'Zwolniony VAT',
    icon: CheckCircle2,
    className:
      'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
  },
  inactive: {
    label: 'Wykreślony',
    icon: XCircle,
    className:
      'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
  },
  unknown: {
    label: 'Niezweryfikowany',
    icon: HelpCircle,
    className:
      'bg-foreground/5 text-muted-foreground border-glass-border',
  },
  pending: {
    label: 'Sprawdzanie...',
    icon: Loader2,
    className:
      'bg-foreground/5 text-muted-foreground border-glass-border',
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
    ? 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20'
    : config.className;

  const sizeClass =
    size === 'sm'
      ? 'px-2.5 py-1 text-xs gap-1.5'
      : 'px-3 py-1.5 text-sm gap-2';

  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';

  const title =
    warning ??
    `Źródło: ${sourceTooltipLabel(source)}${fromCache ? ' (cache)' : ''}`;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-medium backdrop-blur-glass-sm',
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
