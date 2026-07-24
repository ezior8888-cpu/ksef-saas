import { createClient } from '@/lib/supabase/server';
import { FfDataTableCard, ffTable } from '@/components/dashboard/ff-data-table';

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
  'tenant.ksef_verified': 'Weryfikacja KSeF (claim NIP)',
  'tenant.ksef_nip_ownership_claimed': 'Przypisanie NIP do organizacji (KSeF)',
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

  const rows = logs ?? [];

  return (
    <div className="max-w-4xl space-y-8 pb-10 text-[var(--ff-on-surface)]">
      <div>
        <h1 className="mb-1 text-[30px] font-bold leading-tight tracking-[-0.02em] text-[var(--ff-text-strong)]">
          Historia aktywności
        </h1>
        <p className="text-sm text-[var(--ff-text-muted)]">
          Pełny audit trail Twojego konta — RODO zgodność
        </p>
      </div>

      {error ? (
        <div className="rounded-[var(--ff-radius-lg)] border border-[var(--ff-danger)]/25 bg-[var(--ff-danger-tint)] px-5 py-4 text-sm text-[var(--ff-danger)]">
          Nie udało się wczytać historii: {error.message}
        </div>
      ) : (
        <FfDataTableCard
          title="Log zdarzeń"
          subtitle={`${rows.length} wpisów (max. 200) • sortowanie od najnowszych`}
          minWidth={720}
        >
          <thead>
            <tr className={ffTable.headRow}>
              <th className={ffTable.th}>Data</th>
              <th className={ffTable.th}>Akcja</th>
              <th className={ffTable.th}>Zasób</th>
              <th className={ffTable.th}>IP</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className={`${ffTable.td} py-12 text-center text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)]`}
                >
                  Brak wpisów.
                </td>
              </tr>
            ) : (
              rows.map((log) => (
                <tr key={log.id} className={ffTable.row}>
                  <td className={`${ffTable.tdMuted} whitespace-nowrap`}>
                    {new Date(log.created_at as string).toLocaleString('pl-PL')}
                  </td>
                  <td className={ffTable.td}>
                    <span className={ffTable.badge}>
                      {ACTION_LABELS[log.action as string] ?? log.action}
                    </span>
                  </td>
                  <td className={ffTable.tdMono}>
                    {log.entity_type && log.entity_id
                      ? `${log.entity_type}:${String(log.entity_id).slice(0, 8)}…`
                      : '—'}
                  </td>
                  <td className={ffTable.tdMono}>
                    {log.ip_address != null ? String(log.ip_address) : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </FfDataTableCard>
      )}
    </div>
  );
}
