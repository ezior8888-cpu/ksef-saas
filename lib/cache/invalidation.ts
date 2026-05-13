/**
 * Cache invalidation helpers — wołane z server actions po krytycznych
 * mutacjach (insert/update/delete). Bez tego user widziałby stary dashboard
 * przez 5min TTL po wystawieniu nowej faktury — UX killer.
 *
 * Strategia:
 *   - Jawne klucze zamiast `KEYS pattern` (KEYS jest O(N), źle skaluje się
 *     przy 10k+ tenantów).
 *   - Każda krytyczna mutacja → jedno wywołanie `invalidateTenantDashboard(id)`.
 *   - Operacje są fail-soft (z `cacheDel` w `lib/cache/index.ts`) — nawet jeśli
 *     Redis padł, server action nie zwraca błędu.
 */

import { cacheDel, cacheKeys } from './index';

/**
 * Czyści wszystkie klucze Redisa związane z dashboardem danego tenanta.
 * Wywołuj po:
 *   - INSERT/UPDATE/DELETE w `invoices` (`direction = 'issued'` lub `'received'`)
 *   - UPDATE `invoices.payment_status` (z paid → unpaid lub odwrotnie)
 *   - INSERT/UPDATE/DELETE w `expenses`
 *
 * Nie wywołuj dla read-only akcji (klik na listę, otwarcie szczegółu) —
 * Redis sam wygasi po TTL.
 */
export async function invalidateTenantDashboard(
  tenantId: string,
): Promise<void> {
  await cacheDel(
    cacheKeys.dashboardSummary(tenantId),
    cacheKeys.monthlyStats(tenantId, 'issued'),
    cacheKeys.monthlyStats(tenantId, 'received'),
    // Chart 6mc i 12mc — różne klucze dla różnych długości.
    cacheKeys.monthlyStats(tenantId, 'issued', 6),
    cacheKeys.monthlyStats(tenantId, 'issued', 12),
  );
}

/**
 * Cache lista kontrahentów per tenant — invalidacja po add/edit/delete
 * w `contractors` table.
 */
export async function invalidateContractorsList(
  tenantId: string,
): Promise<void> {
  await cacheDel(cacheKeys.contractorsList(tenantId));
}

/**
 * Invalidacja cache walidacji NIP — wywołuj gdy `validation_cache` row
 * został oznaczony jako stale (cron `nightly-validation-recheck`).
 */
export async function invalidateNipValidation(
  nip: string,
  countryCode = 'PL',
): Promise<void> {
  await cacheDel(cacheKeys.nipValidation(nip, countryCode.toUpperCase()));
}

/**
 * Account deletion / org switch — wyczyść wszystko co możemy adresować
 * jawnymi kluczami. Per-tenant scope, więc nie ruszamy globalnych (NIP).
 */
export async function invalidateAllTenantCaches(
  tenantId: string,
): Promise<void> {
  await Promise.all([
    invalidateTenantDashboard(tenantId),
    invalidateContractorsList(tenantId),
    cacheDel(cacheKeys.featureFlags(tenantId)),
  ]);
}
