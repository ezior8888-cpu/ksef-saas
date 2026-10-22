import { ImportCenter, ImportHeader } from '@/components/import-danych/import-center';
import { IMPORT_HISTORY_COLUMNS, IMPORT_HISTORY_LIMIT } from '@/components/import-danych/import-model';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getPageContext } from '@/lib/supabase/page-context';

export const dynamic = 'force-dynamic';

/**
 * Import danych — centrum importu w stylu Accounts Finory (poprawka Bartosza
 * 22.10.2026: import danych w stylu Finory). Kafle z liczbami z historii,
 * karty źródeł (Magiczny import z KSeF i pięć źródeł z pliku) i historia
 * importów w karcie do stopki.
 *
 * Tylko odczyty, bez zmian w logice: `tenants` (sama flaga
 * `has_ksef_credentials`, nigdy zaszyfrowany blob — AUD-103) oraz ostatnie
 * `import_jobs` przez klienta użytkownika (RLS `import_jobs_tenant_isolation`).
 * Start importów, postęp i blokada bez certyfikatu idą istniejącymi
 * ścieżkami: `/onboarding/magic-import?tenantId=…`, `FileImportDialog`,
 * `/onboarding/progress/[id]`, `/settings/ksef`.
 */
export default async function ImportDanychPage() {
  const { supabase, tenantId } = await getPageContext();

  if (!tenantId) {
    return (
      <div className="ff-page-fill flex flex-col gap-6">
        <ImportHeader />
        <Alert>
          <AlertDescription>
            Import uruchomisz po założeniu organizacji i konfiguracji certyfikatu KSeF.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const [{ data: tenant }, history] = await Promise.all([
    supabase.from('tenants').select('name, nip, has_ksef_credentials').eq('id', tenantId).single(),
    supabase
      .from('import_jobs')
      .select(IMPORT_HISTORY_COLUMNS)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(IMPORT_HISTORY_LIMIT),
  ]);

  if (history.error) console.error('[import-danych] historia importów:', history.error.message);

  return (
    <ImportCenter
      tenantId={tenantId}
      tenantName={tenant?.name}
      nip={tenant?.nip}
      hasCertificate={!!tenant?.has_ksef_credentials}
      jobs={history.error ? null : (history.data ?? [])}
    />
  );
}
