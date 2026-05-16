import { createAdminClient } from '@/lib/supabase/server';

/**
 * Zbiera wszystkie dane usera z systemu dla GDPR data export.
 *
 * NIE wyciąga R2 PDF-ów (faktur) — to mogłoby być dużo i zabija czas
 * response. User dostaje listę invoice ID + ksef_number i może każdą
 * pobrać osobno z dashboardu. W przyszłości można dodać "pełny ZIP z
 * PDF-ami" jako Inngest job + R2 storage + email z linkiem.
 *
 * Admin client — czytamy cross-tenant (memberships w wielu org).
 */

type QueryResult = Promise<{
  data: unknown[] | null;
  error: { message: string } | null;
}>;

interface SelectChain extends QueryResult {
  eq: (k: string, v: string) => SelectChain;
  order: (k: string, opts?: { ascending: boolean }) => SelectChain;
  limit: (n: number) => SelectChain;
}

interface SupabaseAdminQuery {
  from: (n: string) => {
    select: (c: string) => SelectChain;
  };
  auth: {
    admin: {
      getUserById: (
        id: string,
      ) => Promise<{ data: { user: unknown } | null; error: unknown }>;
    };
  };
}

export interface UserDataExport {
  exported_at: string;
  user: {
    id: string;
    email: string | null;
    created_at: string | null;
    last_sign_in_at: string | null;
    metadata: Record<string, unknown> | null;
  };
  memberships: Array<Record<string, unknown>>;
  audit_logs: Array<Record<string, unknown>>;
  invoices_count: number;
  /** Lista identyfikatorów — szczegóły można pobrać osobno przez dashboard. */
  invoices_summary: Array<{
    id: string;
    invoice_number: string | null;
    issued_at: string | null;
    ksef_number: string | null;
    status: string | null;
  }>;
  organizations_owned: Array<Record<string, unknown>>;
  notes: string;
}

export async function collectUserData(userId: string): Promise<UserDataExport> {
  const supabase = createAdminClient() as unknown as SupabaseAdminQuery;

  const authResult = await supabase.auth.admin.getUserById(userId);
  const authUser = authResult.data?.user as
    | {
        id: string;
        email: string | null;
        created_at: string | null;
        last_sign_in_at: string | null;
        user_metadata: Record<string, unknown> | null;
      }
    | undefined;

  const [memberships, audit, invoices, ownedOrgs] = await Promise.all([
    supabase.from('memberships').select('*').eq('user_id', userId),
    supabase
      .from('audit_logs')
      .select('id, action, entity_type, entity_id, metadata, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1000),
    supabase
      .from('invoices')
      .select('id, invoice_number, issued_at, ksef_number, status')
      .eq('issued_by_user_id', userId)
      .limit(10000),
    supabase
      .from('memberships')
      .select('organization_id, role')
      .eq('user_id', userId)
      .eq('role', 'owner'),
  ]);

  const invoicesData = (invoices.data ?? []) as Array<{
    id: string;
    invoice_number: string | null;
    issued_at: string | null;
    ksef_number: string | null;
    status: string | null;
  }>;

  return {
    exported_at: new Date().toISOString(),
    user: {
      id: authUser?.id ?? userId,
      email: authUser?.email ?? null,
      created_at: authUser?.created_at ?? null,
      last_sign_in_at: authUser?.last_sign_in_at ?? null,
      metadata: authUser?.user_metadata ?? null,
    },
    memberships: (memberships.data ?? []) as Array<Record<string, unknown>>,
    audit_logs: (audit.data ?? []) as Array<Record<string, unknown>>,
    invoices_count: invoicesData.length,
    invoices_summary: invoicesData,
    organizations_owned: (ownedOrgs.data ?? []) as Array<Record<string, unknown>>,
    notes:
      'Pełne dane faktur dostępne w panelu /invoices. Faktury podlegają 10-letniej retencji ' +
      'prawnej (RODO art. 17 ust. 3 lit. b) — nawet po usunięciu konta zostają zaszyfrowane ' +
      'w bazie organizacji, na której zostały wystawione.',
  };
}
