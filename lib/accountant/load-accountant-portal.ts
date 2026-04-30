import { hashToken } from '@/lib/accountant/tokens';
import { logAuditSystem } from '@/lib/audit/log-system';
import { createAdminClient } from '@/lib/supabase/server';

export interface AccountantPortalData {
  access: {
    id: string;
    accountant_name: string;
    accountant_email: string;
    access_level: string;
    tenant_id: string;
    expires_at: string;
  };
  tenant: { name: string; nip: string };
  invoices: Array<{
    id: string;
    internal_number: string | null;
    issue_date: string;
    gross_total: number | null;
    ksef_status: string | null;
  }>;
}

/**
 * Weryfikuje token (hash) i zwraca dane do widoku portalu księgowej.
 * Używa service_role — wyłącznie po stronie serwera, bez sesji użytkownika.
 */
export async function loadAccountantPortal(
  rawToken: string
): Promise<AccountantPortalData | null> {
  const trimmed = rawToken.trim();
  if (!trimmed) return null;

  const hash = hashToken(trimmed);
  const admin = createAdminClient();

  const { data: access, error } = await admin
    .from('accountant_access')
    .select(
      'id, tenant_id, accountant_name, accountant_email, access_level, expires_at, revoked_at, use_count'
    )
    .eq('token_hash', hash)
    .maybeSingle();

  if (error || !access) return null;
  if (access.revoked_at != null) return null;
  if (new Date(access.expires_at as string) < new Date()) return null;

  const { data: tenant } = await admin
    .from('tenants')
    .select('name, nip')
    .eq('id', access.tenant_id as string)
    .maybeSingle();

  if (!tenant?.nip) return null;

  const { data: invoices } = await admin
    .from('invoices')
    .select('id, internal_number, issue_date, gross_total, ksef_status')
    .eq('tenant_id', access.tenant_id as string)
    .order('issue_date', { ascending: false })
    .limit(100);

  const nextCount = Number(access.use_count ?? 0) + 1;
  await admin
    .from('accountant_access')
    .update({
      last_used_at: new Date().toISOString(),
      use_count: nextCount,
    })
    .eq('id', access.id as string);

  await logAuditSystem({
    action: 'accountant.access_used',
    tenantId: access.tenant_id as string,
    entityType: 'accountant_access',
    entityId: access.id as string,
    metadata: {
      accountantEmail: access.accountant_email as string,
      via: 'accountant_portal',
    },
  });

  return {
    access: {
      id: access.id as string,
      accountant_name: access.accountant_name as string,
      accountant_email: access.accountant_email as string,
      access_level: access.access_level as string,
      tenant_id: access.tenant_id as string,
      expires_at: access.expires_at as string,
    },
    tenant: {
      name: tenant.name as string,
      nip: tenant.nip as string,
    },
    invoices: (invoices ?? []) as AccountantPortalData['invoices'],
  };
}
