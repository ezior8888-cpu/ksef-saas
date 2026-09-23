import {
  OverdueDashboard,
  type OverdueInvoice,
} from '@/components/reminders/overdue-dashboard';
import { createClient } from '@/lib/supabase/server';
import { getDashboardOrgSwitcherProps } from '@/lib/dashboard-shell-data';
import type { Database } from '@/types/database';

export const dynamic = 'force-dynamic';

type OverdueViewRow = Database['public']['Views']['invoices_overdue']['Row'];
type OverdueInvoiceBase = Omit<OverdueInvoice, 'reminder_status'>;
const PENDING_REVIEW_AFTER_MS = 30 * 60_000;

function reminderReviewBefore(): number {
  // Server-only page: evaluate the clock once per request, after the read.
  return Date.now() - PENDING_REVIEW_AFTER_MS;
}

function toOverdueInvoice(row: OverdueViewRow): OverdueInvoiceBase | null {
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
  // The dashboard layout already validates membership. Reuse its cached,
  // validated active organization instead of trusting a cookie alone.
  const { activeOrgId: tenantId } = await getDashboardOrgSwitcherProps();
  const supabase = await createClient();

  const { data: overdueRows, error } = await supabase
    .from('invoices_overdue')
    .select('*')
    .eq('tenant_id', tenantId)
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

  const baseInvoices = (overdueRows ?? []).flatMap((row) => {
    const inv = toOverdueInvoice(row);
    return inv ? [inv] : [];
  });

  // Query only pending rows for the invoices actually shown. The session
  // client enforces RLS, while both explicit filters protect this page if a
  // view or policy is changed later. A read failure must not look like "none".
  const pendingByInvoice = new Map<string, 'pending' | 'review'>();
  let pendingReadFailed = false;
  if (baseInvoices.length > 0) {
    const visibleIds = baseInvoices.map((invoice) => invoice.id);
    // Four stages per invoice in the current enum. If the schema or PostgREST
    // returns fewer rows than its exact count, the status is unknown.
    const maximumRows = visibleIds.length * 4;
    try {
      const { data: pending, count, error: pendingError } = await supabase
        .from('payment_reminders')
        .select('invoice_id, scheduled_for', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .in('invoice_id', visibleIds)
        .eq('status', 'pending')
        .limit(maximumRows);
      if (pendingError || !pending || typeof count !== 'number' ||
          count > maximumRows || count !== pending.length) {
        pendingReadFailed = true;
      } else {
        const reviewBefore = reminderReviewBefore();
        for (const row of pending) {
          if (!visibleIds.includes(row.invoice_id)) {
            pendingReadFailed = true;
            break;
          }
          const scheduled = Date.parse(row.scheduled_for);
          const state = !Number.isFinite(scheduled) || scheduled < reviewBefore
            ? 'review' : 'pending';
          if (state === 'review' || !pendingByInvoice.has(row.invoice_id)) {
            pendingByInvoice.set(row.invoice_id, state);
          }
        }
      }
    } catch {
      pendingReadFailed = true;
    }
  }
  const overdueInvoices: OverdueInvoice[] = baseInvoices.map((invoice) => ({
    ...invoice,
    reminder_status: pendingReadFailed ? 'unavailable'
      : pendingByInvoice.get(invoice.id) ?? 'none',
  }));

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
