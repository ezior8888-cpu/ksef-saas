import { createClient } from '@/lib/supabase/server';

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
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight">
          Historia aktywności
        </h1>
        <p className="mt-2 text-muted-foreground">
          Pełny audit trail Twojego konta — RODO zgodność
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-700 dark:text-red-400">
          Nie udało się wczytać historii: {error.message}
        </div>
      ) : (
        <div className="rounded-3xl border border-white/55 dark:border-white/14 bg-white/45 dark:bg-[rgba(15,10,30,0.45)] backdrop-blur-[24px] shadow-[0_8px_32px_0_rgba(31,38,135,0.08)] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-foreground/[0.03] border-b border-white/55 dark:border-white/14">
              <tr className="text-left">
                {['Data', 'Akcja', 'Zasób', 'IP'].map((h) => (
                  <th key={h} className="px-6 py-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(logs ?? []).length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                    Brak wpisów.
                  </td>
                </tr>
              ) : (
                (logs ?? []).map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-white/55 dark:border-white/[0.07] last:border-0 hover:bg-foreground/[0.02] transition-colors duration-150"
                  >
                    <td className="px-6 py-4 text-muted-foreground whitespace-nowrap tabular-nums">
                      {new Date(log.created_at as string).toLocaleString('pl-PL')}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-foreground/5 border border-white/55 dark:border-white/14 text-xs font-medium backdrop-blur-[12px]">
                        {ACTION_LABELS[log.action as string] ?? log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-muted-foreground">
                      {log.entity_type && log.entity_id
                        ? `${log.entity_type}:${String(log.entity_id).slice(0, 8)}…`
                        : '—'}
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-muted-foreground">
                      {log.ip_address != null ? String(log.ip_address) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
