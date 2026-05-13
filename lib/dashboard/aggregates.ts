/**
 * Dashboard KPI z materialized views (`00044_phase21_performance.sql`).
 *
 * `mv_tenant_dashboard_summary` — jeden wiersz na tenant (bez kolumny `direction`).
 * `mv_tenant_monthly_stats` — per (tenant_id, year_month, direction) z wartościami
 * `outgoing` / `incoming`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { cached, cacheKeys, TTL_SECONDS } from '@/lib/cache';
import type { Database } from '@/types/database';

export interface DashboardSummary {
  currentMonthCount: number;
  currentMonthAccepted: number;
  currentMonthNet: number;
  currentMonthVat: number;
  currentMonthGross: number;
  prevMonthCount: number;
  unpaidCount: number;
  unpaidAmount: number;
  fromCache: boolean;
}

export interface MonthlyStat {
  yearMonth: string;
  direction: string;
  invoiceCount: number;
  totalGross: number;
  totalNet: number;
  totalVat: number;
}

interface MvDashboardRow {
  tenant_id: string;
  current_month_count: number | null;
  current_month_accepted: number | null;
  current_month_net: number | string | null;
  current_month_vat: number | string | null;
  current_month_gross: number | string | null;
  prev_month_count: number | null;
  unpaid_count: number | null;
  unpaid_amount: number | string | null;
  refreshed_at: string;
}

interface MvMonthlyRow {
  tenant_id: string;
  year_month: string;
  direction: string;
  invoice_count: number | null;
  total_gross: number | string | null;
  total_net: number | string | null;
  total_vat: number | string | null;
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export async function getDashboardSummary(
  supabase: SupabaseClient<Database>,
  tenantId: string,
): Promise<DashboardSummary> {
  const cachedResult = await cached<DashboardSummary>(
    cacheKeys.dashboardSummary(tenantId),
    TTL_SECONDS.dashboardSummary,
    () => fetchDashboardSummaryFromMv(supabase, tenantId),
  );
  if (cachedResult) return cachedResult;
  return fallbackLiveSummary(supabase, tenantId);
}

async function fetchDashboardSummaryFromMv(
  supabase: SupabaseClient<Database>,
  tenantId: string,
): Promise<DashboardSummary | null> {
  const result = (await (supabase as unknown as {
    from: (name: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => Promise<{
          data: MvDashboardRow[] | null;
          error: { message: string } | null;
        }>;
      };
    };
  })
    .from('mv_tenant_dashboard_summary')
    .select(
      'tenant_id, current_month_count, current_month_accepted, current_month_net, current_month_vat, current_month_gross, prev_month_count, unpaid_count, unpaid_amount, refreshed_at',
    )
    .eq('tenant_id', tenantId));

  if (result.error || !result.data || result.data.length === 0) {
    return null;
  }

  const row = result.data[0]!;
  return {
    currentMonthCount: row.current_month_count ?? 0,
    currentMonthAccepted: row.current_month_accepted ?? 0,
    currentMonthNet: toNumber(row.current_month_net),
    currentMonthVat: toNumber(row.current_month_vat),
    currentMonthGross: toNumber(row.current_month_gross),
    prevMonthCount: row.prev_month_count ?? 0,
    unpaidCount: row.unpaid_count ?? 0,
    unpaidAmount: toNumber(row.unpaid_amount),
    fromCache: true,
  };
}

export async function getMonthlyStats(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  options: { monthsBack?: number; direction?: 'outgoing' | 'incoming' } = {},
): Promise<MonthlyStat[]> {
  const monthsBack = options.monthsBack ?? 6;
  const direction = options.direction ?? 'outgoing';

  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 1);
  const cutoffYm = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}`;

  const result = (await (supabase as unknown as {
    from: (name: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => {
            gte: (col: string, val: string) => {
              order: (col: string, opts: { ascending: boolean }) => Promise<{
                data: MvMonthlyRow[] | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
    };
  })
    .from('mv_tenant_monthly_stats')
    .select(
      'tenant_id, year_month, direction, invoice_count, total_gross, total_net, total_vat',
    )
    .eq('tenant_id', tenantId)
    .eq('direction', direction)
    .gte('year_month', cutoffYm)
    .order('year_month', { ascending: true }));

  if (result.error || !result.data) {
    return [];
  }

  return result.data.map((row) => ({
    yearMonth: row.year_month,
    direction: row.direction,
    invoiceCount: row.invoice_count ?? 0,
    totalGross: toNumber(row.total_gross),
    totalNet: toNumber(row.total_net),
    totalVat: toNumber(row.total_vat),
  }));
}

async function fallbackLiveSummary(
  supabase: SupabaseClient<Database>,
  tenantId: string,
): Promise<DashboardSummary> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const startIso = startOfMonth.toISOString().slice(0, 10);
  const prevStartIso = prevMonthStart.toISOString().slice(0, 10);

  const [currentRes, prevRes, unpaidRes] = await Promise.all([
    supabase
      .from('invoices')
      .select('gross_total, net_total, vat_total, ksef_status')
      .eq('tenant_id', tenantId)
      .eq('direction', 'outgoing')
      .gte('issue_date', startIso),
    supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('direction', 'outgoing')
      .gte('issue_date', prevStartIso)
      .lt('issue_date', startIso),
    supabase
      .from('invoices')
      .select('gross_total, paid_amount')
      .eq('tenant_id', tenantId)
      .eq('direction', 'outgoing')
      .in('payment_status', ['unpaid', 'partial', 'overdue']),
  ]);

  const current = currentRes.data ?? [];
  const unpaid = unpaidRes.data ?? [];

  return {
    currentMonthCount: current.length,
    currentMonthAccepted: current.filter((i) => i.ksef_status === 'accepted').length,
    currentMonthNet: current.reduce((s, i) => s + Number(i.net_total ?? 0), 0),
    currentMonthVat: current.reduce((s, i) => s + Number(i.vat_total ?? 0), 0),
    currentMonthGross: current.reduce((s, i) => s + Number(i.gross_total ?? 0), 0),
    prevMonthCount: prevRes.count ?? 0,
    unpaidCount: unpaid.length,
    unpaidAmount: unpaid.reduce(
      (s, i) => s + (Number(i.gross_total ?? 0) - Number(i.paid_amount ?? 0)),
      0,
    ),
    fromCache: false,
  };
}
