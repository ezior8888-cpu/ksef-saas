import { createClient } from '@/lib/supabase/server';
import { Badge } from '@/components/ui/badge';

const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Zalogowanie',
  'auth.logout': 'Wylogowanie',
  'auth.signup': 'Rejestracja',
  'auth.password_reset_requested': 'Prośba o reset hasła',
  'invoice.draft_created': 'Utworzono szkic faktury',
  'invoice.draft_updated': 'Zaktualizowano szkic faktury',
  'invoice.draft_deleted': 'Usunięto szkic faktury',
  'invoice.submit_requested': 'Wysłano fakturę do KSeF',
  'invoice.submit_succeeded': 'Faktura zaakceptowana przez KSeF',
  'invoice.submit_failed': 'Faktura odrzucona przez KSeF',
  'invoice.xml_downloaded': 'Pobrano XML faktury',
  'invoice.resubmit_requested': 'Ponowna wysyłka faktury',
  'ksef.credentials_uploaded': 'Wgrano certyfikat KSeF',
  'ksef.credentials_removed': 'Usunięto certyfikat KSeF',
  'ksef.environment_changed': 'Zmiana środowiska KSeF',
  'accountant.token_created': 'Dostęp dla księgowej utworzony',
  'accountant.token_revoked': 'Dostęp dla księgowej cofnięty',
  'accountant.access_used': 'Księgowa pobrała dane',
  'tenant.created': 'Utworzenie firmy w systemie',
  'tenant.updated': 'Aktualizacja firmy',
  'tenant.user_role_changed': 'Zmiana roli użytkownika',
  'retention.deletion_requested': 'Żądanie usunięcia danych',
  'retention.deletion_executed': 'Wykonano usunięcie danych',
};

export default async function AuditPage() {
  const supabase = await createClient();
  const { data: logs, error } = await supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold mb-2">Historia aktywności</h1>
      <p className="text-sm text-gray-500 mb-6">
        Log wszystkich operacji w Twoim koncie — zgodnie z zasadą rozliczalności
        RODO.
      </p>

      {error ? (
        <p className="text-sm text-red-600">
          Nie udało się wczytać historii: {error.message}
        </p>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr className="text-left">
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Akcja</th>
                <th className="px-4 py-3">Zasób</th>
                <th className="px-4 py-3">IP</th>
              </tr>
            </thead>
            <tbody>
              {(logs ?? []).map((log) => (
                <tr key={log.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {new Date(log.created_at as string).toLocaleString('pl-PL')}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">
                      {ACTION_LABELS[log.action as string] ?? log.action}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-500">
                    {log.entity_type && log.entity_id
                      ? `${log.entity_type}:${String(log.entity_id).slice(0, 8)}…`
                      : '-'}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-500">
                    {log.ip_address != null ? String(log.ip_address) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(!logs || logs.length === 0) && (
            <div className="p-8 text-center text-gray-500">Brak wpisów.</div>
          )}
        </div>
      )}
    </div>
  );
}
