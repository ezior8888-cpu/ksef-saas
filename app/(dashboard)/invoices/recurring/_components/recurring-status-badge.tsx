import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { RECURRING_STATUS_LABELS, type RecurringStatus } from '@/types/recurring-invoice';

/**
 * Plakietka statusu faktury cyklicznej. Finora (`RECURRING_INVOICE_STATUS_STYLES`)
 * pokazuje sam awatar z ikoną; plan P6 chce słów: Aktywna / Wstrzymana /
 * Do wystawienia, więc plakietka z tekstem (jak status w „Wszystkich
 * operacjach” na Przepływach).
 *
 * Kolory Finory: aktywna = zielony, wstrzymana = bursztynowy. „Do wystawienia”
 * to stan wymagający ruchu klienta, którego Finora nie ma — dostaje kolor
 * główny (niebieski), żeby nie udawał ani sukcesu, ani awarii. Tekst w jasnym
 * motywie `*-800` (nie `*-600` z szablonu): kontrast WCAG AA na przyciemnionym
 * tle plakietki; w ciemnym `*-400` jak w Finorze.
 */
export const RECURRING_STATUS_STYLES: Record<RecurringStatus, string> = {
  active:
    'bg-green-700/10 text-green-800 focus-visible:ring-green-600/20 dark:bg-green-400/10 dark:text-green-400 dark:focus-visible:ring-green-400/40',
  paused:
    'bg-amber-600/10 text-amber-800 focus-visible:ring-amber-600/20 dark:bg-amber-400/10 dark:text-amber-400 dark:focus-visible:ring-amber-400/40',
  due: 'bg-primary/10 text-primary focus-visible:ring-primary/20 dark:focus-visible:ring-primary/40',
};

export function RecurringStatusBadge({ status }: { status: RecurringStatus }) {
  return (
    <Badge className={cn('h-auto border-none focus-visible:outline-none', RECURRING_STATUS_STYLES[status])}>
      {RECURRING_STATUS_LABELS[status]}
    </Badge>
  );
}
