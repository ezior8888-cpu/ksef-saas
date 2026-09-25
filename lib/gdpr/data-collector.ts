import 'server-only';

import { createAdminClient } from '@/lib/supabase/server';

const ROW_LIMIT = 1000;

interface MembershipRecord {
  id: string;
  user_id: string;
  organization_id: string;
  role: string;
  status: string;
  joined_at: string;
  revoked_at: string | null;
}
interface AuditRecord {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}
interface CollectionCoverage {
  returned: number;
  total: number;
  truncated: boolean;
}

export interface UserDataExport {
  format_version: 2;
  exported_at: string;
  user: {
    id: string;
    email: string | null;
    created_at: string;
    last_sign_in_at: string | null;
    metadata: Record<string, unknown>;
  };
  memberships: MembershipRecord[];
  audit_logs: AuditRecord[];
  organizations_owned: Array<{ organization_id: string; role: string }>;
  coverage: {
    memberships: CollectionCoverage;
    audit_logs: CollectionCoverage;
  };
  organization_invoices: { included: false; reason: string };
  notes: string;
}

function coverage(returned: number, total: number | null): CollectionCoverage {
  // Unknown totals must not be presented as a complete export.
  if (total === null || total < returned) throw new Error('account_export_count_unavailable');
  return { returned, total, truncated: returned < total };
}

/**
 * Bounded snapshot of the verified account's profile, memberships and audit trail.
 * Caller must pass the user ID from getVerifiedUserContext(), never a request ID.
 * Invoice rows belong to organizations; the schema has no "issued_by_user_id".
 * Company invoices use the separately authorized organization export.
 */
export async function collectUserData(userId: string): Promise<UserDataExport> {
  const supabase = createAdminClient();
  const authResult = await supabase.auth.admin.getUserById(userId);
  const authUser = authResult.data?.user;
  if (authResult.error || !authUser || authUser.id !== userId) {
    throw new Error('account_export_user_unavailable');
  }

  const [memberships, audit] = await Promise.all([
    supabase.from('memberships')
      .select('id, user_id, organization_id, role, status, joined_at, revoked_at', { count: 'exact' })
      .eq('user_id', userId).order('id').limit(ROW_LIMIT).returns<MembershipRecord[]>(),
    supabase.from('audit_logs')
      .select('id, action, entity_type, entity_id, metadata, created_at', { count: 'exact' })
      .eq('user_id', userId).order('created_at', { ascending: false })
      .order('id').limit(ROW_LIMIT).returns<AuditRecord[]>(),
  ]);
  if (memberships.error || audit.error || !memberships.data || !audit.data) {
    throw new Error('account_export_data_unavailable');
  }

  return {
    format_version: 2,
    exported_at: new Date().toISOString(),
    user: {
      id: authUser.id,
      email: authUser.email ?? null,
      created_at: authUser.created_at,
      last_sign_in_at: authUser.last_sign_in_at ?? null,
      metadata: authUser.user_metadata,
    },
    memberships: memberships.data,
    audit_logs: audit.data,
    organizations_owned: memberships.data
      .filter((membership) => membership.status === 'active' && membership.role === 'owner')
      .map(({ organization_id, role }) => ({ organization_id, role })),
    coverage: {
      memberships: coverage(memberships.data.length, memberships.count),
      audit_logs: coverage(audit.data.length, audit.count),
    },
    organization_invoices: {
      included: false,
      reason: 'Faktury należą do organizacji. Pobierz je przez eksport w panelu wybranej firmy.',
    },
    notes: 'Zestawienie obejmuje profil konta, członkostwa i maksymalnie 1000 ostatnich wpisów audytu. ' +
      'Pola coverage podają liczbę zwróconych i dostępnych rekordów oraz informację o ograniczeniu wyników. ' +
      'Lista organizations_owned jest wyprowadzona z aktywnych członkostw zawartych w tym pliku. ' +
      'To zestawienie nie jest deklaracją kompletnej realizacji wniosku o dostęp do wszystkich danych osobowych.',
  };
}
