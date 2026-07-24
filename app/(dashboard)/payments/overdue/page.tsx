import { redirect } from 'next/navigation';

import {
  OverdueDashboard,
  type OverdueInvoice,
} from '@/components/reminders/overdue-dashboard';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';

export const dynamic = 'force-dynamic';

type OverdueViewRow = Database['public']['Views']['invoices_overdue']['Row'];

function toOverdueInvoice(row: OverdueViewRow): OverdueInvoice | null {
  if (!row.id) return null;
  return {
    id: row.id,
    internal_number: row.internal_number ?? '',
    payment_due_date: row.payment_due_date ?? '',
    gross_total: Number(row.gross_total ?? 0),
    amount_due: Number(row.amount_due ?? 0),
    days_overdue: Number(row.days_overdue ?? 0),
    buyer_name: row.buyer_name ?? '',
    buyer_nip: row.buyer_nip,
    buyer_email: row.buyer_email,
    reminders_paused: Boolean(row.reminders_paused),
    reminders_sent_count: Number(row.reminders_sent_count ?? 0),
  };
}

export default async function OverduePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: overdueRows, error } = await supabase
    .from('invoices_overdue')
    .select('*')
    .order('days_overdue', { ascending: false })
    .limit(100);

  if (error) {
    return (
      <div className="pb-10 text-[var(--ff-on-surface)]">
        <div className="mb-10">
          <h1 className="mb-1 text-[30px] font-bold leading-tight tracking-[-0.02em] text-[var(--ff-text-strong)]">
            Przeterminowane płatności
          </h1>
          <p className="text-sm text-[var(--ff-text-muted)]">
            Faktury po terminie płatności
          </p>
        </div>
        <div
          className="ff-glass-pane rounded-[var(--ff-radius-lg)] border border-red-500/25 p-6 text-[15px] text-red-300"
          role="alert"
        >
          Nie udało się pobrać listy: {error.message}
        </div>
      </div>
    );
  }

  const overdueInvoices = (overdueRows ?? []).flatMap((row) => {
    const inv = toOverdueInvoice(row);
    return inv ? [inv] : [];
  });

  const totalAmountDue = overdueInvoices.reduce((sum, inv) => sum + inv.amount_due, 0);

  const avgDaysOverdue = overdueInvoices.length
    ? Math.round(
        overdueInvoices.reduce((sum, inv) => sum + inv.days_overdue, 0) /
          overdueInvoices.length,
      )
    : 0;

  return (
    <OverdueDashboard
      overdueInvoices={overdueInvoices}
      stats={{
        totalCount: overdueInvoices.length,
        totalAmount: totalAmountDue,
        avgDaysOverdue,
      }}
    />
  );
}
