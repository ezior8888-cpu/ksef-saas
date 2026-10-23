import 'server-only';

import { cache } from 'react';

import { analyticsDataRange, monthRange } from '@/lib/analytics-finance/months';
import { getSalesInvoices } from '@/lib/analytics-finance/sales';
import { getCostsWithKsefPurchases } from '@/lib/dashboard/costs';
import { getInflows } from '@/lib/dashboard/inflows';
import { fetchProductLines } from '@/lib/dashboard/rankings';
import { todayInWarsaw } from '@/lib/format/warsaw-date';
import type { PageContext } from '@/lib/supabase/page-context';

/**
 * Odczyty `/analizy/*` przez `cache()` — jedno zapytanie na żądanie, choć
 * korzysta z niego kilka kart; błąd i tak trafia osobno do każdej karty.
 * Klient z sesji (RLS, §2.4 pkt 9). Okno: `analyticsDataRange` (najstarszy
 * miesiąc wyboru − 1 albo 180 dni wstecz, do końca bieżącego miesiąca).
 * Koszty: faktury zakupu z KSeF + wydatki spoza KSeF (E10, D-K) — ta sama
 * definicja co Pulpit i Przepływy. Należności: wpływy od dziś według
 * terminów płatności (E11, D-W) — ta sama definicja co karta Pulpitu.
 */

type Supabase = PageContext['supabase'];

export const loadCostsWindow = cache((supabase: Supabase, tenantId: string, nowIso: string) =>
  getCostsWithKsefPurchases(supabase, tenantId, analyticsDataRange(new Date(nowIso))));

export const loadSalesWindow = cache((supabase: Supabase, tenantId: string, nowIso: string) =>
  getSalesInvoices(supabase, tenantId, analyticsDataRange(new Date(nowIso))));

/** Wpływy z dniem od dziś (przyszłe terminy) — karta „Należności”. */
export const loadUpcomingInflows = cache((supabase: Supabase, tenantId: string, nowIso: string) =>
  getInflows(supabase, tenantId, { from: todayInWarsaw(new Date(nowIso)) }));

export const loadProductLines = cache((supabase: Supabase, tenantId: string, month: string) =>
  fetchProductLines(supabase, tenantId, monthRange(month)));
