import 'server-only';

import { requireAdmin } from '@/lib/auth/admin-guard';
import { collectPlatformOverviewMetrics, type PlatformOverviewMetrics } from '@/lib/analytics/platform-metrics';

export type AdminOverviewMetrics = PlatformOverviewMetrics;

/** Odczyt dla panelu admina: autoryzacja przed dostępem do metryk wszystkich firm. */
export async function getAdminOverviewMetrics(): Promise<AdminOverviewMetrics> {
  await requireAdmin();
  return collectPlatformOverviewMetrics();
}
