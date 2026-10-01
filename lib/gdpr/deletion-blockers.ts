import type { createAdminClient } from '@/lib/supabase/server';

/**
 * Usunięcie konta (RODO art. 17) kasuje użytkownika, ale firma zostaje —
 * faktury mają 10 lat retencji. Subskrypcja jest przypięta do FIRMY
 * (`subscriptions.tenant_id`), nie do konta. Gdy znika jedyna osoba, która
 * może nią zarządzać (właściciel albo administrator — `canManageBilling`
 * w ustawieniach płatności), Stripe dalej pobiera opłaty z karty, a nikt nie
 * może się zalogować i ich zatrzymać. Do 01.10.2026 usuwanie konta tego nie
 * sprawdzało.
 *
 * Nie anulujemy subskrypcji sami: to decyzja klienta, a anulowanie da się
 * zrobić w aplikacji w każdej chwili. Usunięcie konta czeka, aż subskrypcja
 * nie będzie już pobierać opłat albo w firmie zostanie ktoś, kto nią zarządza.
 */

const BILLING_MANAGER_ROLES = ['owner', 'admin'];

/** Statusy, w których Stripe nie pobierze już kolejnej opłaty. */
const NON_BILLING_STATUSES = new Set(['canceled', 'incomplete_expired', 'paused']);

export class GdprDeletionBlockedError extends Error {
  constructor(public readonly organizations: string[]) {
    super('gdpr_deletion_blocked_by_subscription');
    this.name = 'GdprDeletionBlockedError';
  }
}

type AdminClient = ReturnType<typeof createAdminClient>;
type Row = Record<string, unknown>;

function rowsOrThrow(result: { data: unknown; error: unknown }): Row[] {
  if (result.error) throw new Error('gdpr_blocker_lookup_failed');
  return (result.data ?? []) as Row[];
}

/**
 * Nazwy firm, w których `userId` jest JEDYNĄ aktywną osobą z prawem do
 * płatności, a subskrypcja dalej pobiera opłaty. Pusta lista = można usuwać.
 * Błąd odczytu rzuca — bez pewności nie planujemy ani nie wykonujemy usunięcia.
 */
export async function findOrganizationsBlockingDeletion(
  admin: AdminClient,
  userId: string,
): Promise<string[]> {
  const managed = rowsOrThrow(
    await admin
      .from('memberships')
      .select('organization_id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .in('role', BILLING_MANAGER_ROLES),
  );
  const orgIds = [...new Set(managed.map((m) => String(m.organization_id)))];
  if (orgIds.length === 0) return [];

  const others = rowsOrThrow(
    await admin
      .from('memberships')
      .select('organization_id')
      .in('organization_id', orgIds)
      .eq('status', 'active')
      .in('role', BILLING_MANAGER_ROLES)
      .neq('user_id', userId),
  );
  const covered = new Set(others.map((m) => String(m.organization_id)));
  const soleIds = orgIds.filter((id) => !covered.has(id));
  if (soleIds.length === 0) return [];

  const subscriptions = rowsOrThrow(
    await admin
      .from('subscriptions')
      .select('tenant_id, status, cancel_at_period_end')
      .in('tenant_id', soleIds),
  );
  const billing = [
    ...new Set(
      subscriptions
        .filter((s) => !NON_BILLING_STATUSES.has(String(s.status)) && s.cancel_at_period_end !== true)
        .map((s) => String(s.tenant_id)),
    ),
  ];
  if (billing.length === 0) return [];

  const tenants = rowsOrThrow(await admin.from('tenants').select('id, name').in('id', billing));
  const names = new Map(tenants.map((t) => [String(t.id), String(t.name ?? '').trim()]));
  return billing.map((id) => names.get(id) || 'firma bez nazwy');
}
