import Link from 'next/link';
import { RiRepeatLine } from '@remixicon/react';

import { PulpitEmptyState } from '@/components/dashboard/pulpit/card-states';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { RecurringItem } from '@/lib/analytics-finance/recurring';
import { formatPlMoney } from '@/lib/format/pl';
import { setAsRecurringHref } from '@/lib/invoices/recurring/visibility';

import type { EmptyStateProps } from './empty';

/**
 * Port Finory `monthly-analytics/subscriptions-card.tsx` („Subscriptions”) →
 * „Stałe koszty” (P10) i „Stali klienci” (P11), dane z N3. Finora pokazuje
 * logo serwisu i „Renews <data>”; u nas ikona powtarzalności i „zwykle około
 * N. dnia miesiąca”, po prawej średnia kwota i „średnio / mies.” (Finora:
 * cykl rozliczeń). Logo kontrahentów nie mamy (dane przykładowe Finory nie
 * wchodzą do produkcji).
 */
type SubscriptionsCardProps = {
  title: string;
  description: string;
  items: RecurringItem[];
  empty: EmptyStateProps;
  className?: string;
};

const SubscriptionsCard = ({ title, description, items, empty, className }: SubscriptionsCardProps) => {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.length === 0 ? (
          <PulpitEmptyState {...empty} />
        ) : (
          items.map((item) => (
            <div key={item.key} className="flex items-center gap-4">
              <div className="bg-muted flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full">
                <RiRepeatLine className="text-foreground size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={item.name}>
                  {item.name}
                </p>
                <p className="text-muted-foreground text-xs">{`zwykle około ${item.typicalDay}. dnia miesiąca`}</p>
                {item.templateInvoiceId ? (
                  <Link
                    href={setAsRecurringHref(item.templateInvoiceId)}
                    className="text-primary inline-flex min-h-6 items-center text-xs font-medium underline-offset-4 hover:underline"
                    aria-label={`Zrób fakturę cykliczną dla: ${item.name}`}
                  >
                    Zrób fakturę cykliczną
                  </Link>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-medium tabular-nums">{`${formatPlMoney(item.averageAmount)} zł`}</p>
                <p className="text-muted-foreground text-xs">średnio / mies.</p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};

export default SubscriptionsCard;
