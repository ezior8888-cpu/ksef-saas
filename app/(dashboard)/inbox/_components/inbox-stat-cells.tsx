import { RiArrowRightUpLine, RiDownloadCloud2Line, RiFileEditLine, RiMailUnreadLine } from '@remixicon/react';

import { PULPIT_EMPTY } from '@/components/dashboard/pulpit/card-states';
import { loadStatCell, StatSlot } from '@/components/expenses/finora/stat-slot';
import { StatsCardsFrame } from '@/components/expenses/finora/stats-cards';
import { getDashboardActiveOrgVerified } from '@/lib/dashboard-shell-data';
import { countExpensesToReview, getInboxMonthCosts, getLastInboxFetchAt } from '@/lib/dashboard/expense-stats';
import { formatPlCompactMoney, formatPlInt, formatPlMoney } from '@/lib/format/pl';
import { formatWarsawDateTime } from '@/lib/format/warsaw-date';
import { plural } from '@/lib/i18n/plural';
import type { PageContext } from '@/lib/supabase/page-context';

/**
 * Kafle Skrzynki KSeF (P9 ← Finora `transaction-stats-cards.tsx`): Nowe
 * faktury / Faktury kosztowe w miesiącu / Do opisania / Ostatnie pobranie
 * z KSeF. Kwota z `getCosts` (§2.4 pkt 12) przez `getInboxMonthCosts`;
 * każdy kafel we własnej granicy błędu (§2.4 pkt 15).
 */

export interface InboxStatsProps {
  supabase: PageContext['supabase'];
  tenantId: string;
  now?: Date;
}

export async function InboxNewCell({ supabase, tenantId }: InboxStatsProps) {
  return loadStatCell('Nowe faktury', async () => {
    const count = await countExpensesToReview(supabase, tenantId, { source: 'ksef_inbox' });
    return {
      value: formatPlInt(count),
      note: count > 0 ? 'Faktury z KSeF jeszcze nieopisane' : 'Wszystkie faktury opisane',
      icon: RiMailUnreadLine,
    };
  });
}

export async function InboxMonthCostsCell({ supabase, tenantId, now }: InboxStatsProps) {
  return loadStatCell('Faktury kosztowe w miesiącu', async () => {
    const { gross, count } = await getInboxMonthCosts(supabase, tenantId, now);
    return {
      value: formatPlCompactMoney(gross),
      valueTitle: `${formatPlMoney(gross)} zł`,
      note: `Brutto · ${count} ${plural(count, ['faktura', 'faktury', 'faktur'])} w KPiR`,
      icon: RiArrowRightUpLine,
    };
  });
}

export async function InboxToReviewCell({ supabase, tenantId }: InboxStatsProps) {
  return loadStatCell('Do opisania', async () => {
    const count = await countExpensesToReview(supabase, tenantId);
    return {
      value: formatPlInt(count),
      note: 'Wszystkie wydatki, także paragony',
      icon: RiFileEditLine,
    };
  });
}

export async function InboxLastFetchCell({ supabase, tenantId }: InboxStatsProps) {
  return loadStatCell('Ostatnie pobranie z KSeF', async () => {
    const last = await getLastInboxFetchAt(supabase, tenantId);
    if (last) {
      return {
        value: formatWarsawDateTime(last),
        valueClassName: 'text-lg',
        note: 'Sprawdzamy KSeF co 15 minut',
        icon: RiDownloadCloud2Line,
      };
    }
    const verified = await getDashboardActiveOrgVerified();
    return {
      value: '—',
      note: verified ? 'Jeszcze nie pobraliśmy żadnej faktury' : PULPIT_EMPTY.connectKsef,
      icon: RiDownloadCloud2Line,
    };
  });
}

export function InboxStatsCards({ className, ...props }: InboxStatsProps & { className?: string }) {
  return (
    <StatsCardsFrame
      className={className}
      cells={[
        <StatSlot key="new" label="Nowe faktury">
          <InboxNewCell {...props} />
        </StatSlot>,
        <StatSlot key="month" label="Faktury kosztowe w miesiącu">
          <InboxMonthCostsCell {...props} />
        </StatSlot>,
        <StatSlot key="review" label="Do opisania">
          <InboxToReviewCell {...props} />
        </StatSlot>,
        <StatSlot key="last" label="Ostatnie pobranie z KSeF">
          <InboxLastFetchCell {...props} />
        </StatSlot>,
      ]}
    />
  );
}
