import 'server-only';

import { cache } from 'react';

import { analyticsDataRange, monthRange } from '@/lib/analytics-finance/months';
import { getSalesInvoices } from '@/lib/analytics-finance/sales';
import { getDashboardActiveOrgVerified } from '@/lib/dashboard-shell-data';
import { getCosts } from '@/lib/dashboard/costs';
import { fetchProductLines } from '@/lib/dashboard/rankings';
import { getReceivables } from '@/lib/dashboard/receivables';
import type { PageContext } from '@/lib/supabase/page-context';

/**
 * Odczyty `/analizy/*` przez `cache()` — jedno zapytanie na żądanie, choć
 * korzysta z niego kilka kart; błąd i tak trafia osobno do każdej karty.
 * Klient z sesji (RLS, §2.4 pkt 9). Okno: `analyticsDataRange` (najstarszy
 * miesiąc wyboru − 1 albo 180 dni wstecz, do końca bieżącego miesiąca).
 */

type Supabase = PageContext['supabase'];

export const loadCostsWindow = cache((supabase: Supabase, tenantId: string, nowIso: string) =>
  getCosts(supabase, tenantId, analyticsDataRange(new Date(nowIso))));

export const loadSalesWindow = cache((supabase: Supabase, tenantId: string, nowIso: string) =>
  getSalesInvoices(supabase, tenantId, analyticsDataRange(new Date(nowIso))));

export const loadReceivables = cache((supabase: Supabase, tenantId: string, nowIso: string) =>
  getReceivables(supabase, tenantId, new Date(nowIso)));

export const loadProductLines = cache((supabase: Supabase, tenantId: string, month: string) =>
  fetchProductLines(supabase, tenantId, monthRange(month)));

export const loadKsefVerified = cache(() => getDashboardActiveOrgVerified());
