import { cn } from '@/lib/utils';

/**
 * Skeleton loader — `<Skeleton className="h-4 w-32" />`. Server-friendly,
 * bez `use client` i bez animacji JS — `animate-pulse` to czyste Tailwind.
 *
 * Używaj zamiast spinnerów (`Loader2 animate-spin`) gdy ładujemy treść
 * o znanym kształcie (lista, tabela, karta), żeby user widział "co" tam
 * będzie zamiast "trwa ładowanie".
 */
function Skeleton({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        'animate-pulse rounded-2xl bg-foreground/8 dark:bg-white/8',
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
