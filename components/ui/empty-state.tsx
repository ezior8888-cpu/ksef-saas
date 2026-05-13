import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type EmptyStateAction =
  | { type: 'link'; label: string; href: string; icon?: LucideIcon }
  | { type: 'button'; label: string; onClick: () => void; icon?: LucideIcon };

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  primaryAction?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  className?: string;
}

/**
 * Generyczny empty state dla list/tabel/widoków bez danych. Zastępuje
 * ad-hoc `<div>Brak X</div>` rozproszone po stronach.
 *
 * Server-component-safe — pod warunkiem że actions to `link` (button
 * wymaga `onClick`, więc trzeba opakować w client component).
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'rounded-3xl border border-glass-border bg-foreground/3 px-6 py-16 text-center backdrop-blur-glass',
        className,
      )}
    >
      <div className="mx-auto mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-foreground/5">
        <Icon className="h-7 w-7 text-muted-foreground" aria-hidden />
      </div>
      <h3 className="mb-2 text-xl font-semibold tracking-tight">{title}</h3>
      {description ? (
        <p className="mx-auto max-w-md text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>
      ) : null}

      {(primaryAction || secondaryAction) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {primaryAction ? renderAction(primaryAction, 'glass-primary') : null}
          {secondaryAction ? renderAction(secondaryAction, 'glass') : null}
        </div>
      )}
    </div>
  );
}

function renderAction(
  action: EmptyStateAction,
  variant: 'glass-primary' | 'glass',
) {
  const Icon = action.icon;
  const inner = (
    <>
      {Icon ? <Icon className="mr-2 h-4 w-4" aria-hidden /> : null}
      {action.label}
    </>
  );

  if (action.type === 'link') {
    return (
      <Button asChild variant={variant} size="lg" key={action.label}>
        <Link href={action.href}>{inner}</Link>
      </Button>
    );
  }

  return (
    <Button
      variant={variant}
      size="lg"
      onClick={action.onClick}
      key={action.label}
    >
      {inner}
    </Button>
  );
}
