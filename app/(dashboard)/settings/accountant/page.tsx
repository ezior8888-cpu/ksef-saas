import {
  AccountantAccessList,
  type AccountantAccessPublicRow,
} from '@/components/settings/accountant-list';
import { CoPilotSettingsForm } from '@/components/exports/co-pilot-settings-form';
import { getPageContextWithRole } from '@/lib/supabase/page-context';

export const dynamic = 'force-dynamic';

function toPublicAccesses(
  rows: Record<string, unknown>[] | null,
): AccountantAccessPublicRow[] {
  return (rows ?? []).map((r) => ({
    id: String(r.id),
    accountant_name: String(r.accountant_name ?? ''),
    accountant_email: String(r.accountant_email ?? ''),
    access_level: String(r.access_level ?? ''),
    expires_at: String(r.expires_at ?? ''),
    use_count: Number(r.use_count ?? 0),
    created_at: String(r.created_at ?? ''),
    revoked_at: r.revoked_at != null ? String(r.revoked_at) : null,
    last_used_at: r.last_used_at != null ? String(r.last_used_at) : null,
  }));
}

export default async function AccountantAccessPage() {
  const { supabase, tenantId } = await getPageContextWithRole(
    'owner',
    '/settings',
  );

  const [{ data: settings }, { data: recentJobs }, { data: raw }] =
    await Promise.all([
      supabase
        .from('accountant_settings')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle(),
      supabase
        .from('export_jobs')
        .select(
          'id, format, status, period_start, period_end, created_at, invoices_count, emailed_at',
        )
        .eq('tenant_id', tenantId)
        .eq('trigger_source', 'co_pilot_monthly')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('accountant_access')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', {
          ascending: false,
        }),
    ]);

  const accesses = toPublicAccesses(raw ?? []);

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight">
          Dostęp dla księgowej
        </h1>
        <p className="mt-2 text-muted-foreground">
          Generuj ograniczone czasowo linki do udostępnienia faktur biuru
          rachunkowemu i — jako właściciel — skonfiguruj automatyczny Co-Pilot
          miesięczny.
        </p>
      </div>

      <div className="max-w-3xl rounded-3xl border border-white/55 dark:border-white/14 bg-white/45 dark:bg-[rgba(15,10,30,0.45)] backdrop-blur-xl shadow-[0_8px_32px_0_rgba(31,38,135,0.08)] p-6 lg:p-8">
        <CoPilotSettingsForm
          key={settings?.updated_at ?? 'defaults'}
          initialSettings={settings ?? null}
          recentJobs={recentJobs ?? []}
        />
      </div>

      <div className="rounded-3xl border border-white/55 dark:border-white/14 bg-white/45 dark:bg-[rgba(15,10,30,0.45)] backdrop-blur-xl shadow-[0_8px_32px_0_rgba(31,38,135,0.08)] p-6 lg:p-8">
        <AccountantAccessList accesses={accesses} />
      </div>
    </div>
  );
}
