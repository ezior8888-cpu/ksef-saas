import { DeleteAccountForm } from '@/components/settings/delete-account-form';
import { Card } from '@/components/ui/card';
import { getPageContext } from '@/lib/supabase/page-context';
import { getActiveGdprRequest } from '@/lib/gdpr/deletion';
import { SUPPORT_EMAIL } from '@/lib/site';
import { GdprSection } from './_components/gdpr-section';

export const dynamic = 'force-dynamic';

export default async function AccountSettingsPage() {
  const { supabase, tenantId, role, user } = await getPageContext();
  const gdprRequest = await getActiveGdprRequest(supabase, user.id);

  const { data: tenant } = await supabase
    .from('tenants')
    .select('nip')
    .eq('id', tenantId)
    .maybeSingle();

  const nip = String(tenant?.nip ?? '');
  const isOwner = role === 'owner';

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Konto i firma</h1>
        <p className="text-sm text-muted-foreground">
          Zarządzanie kontem użytkownika (RODO) i organizacją (admin).
        </p>
      </div>

      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-2">Twoje dane (RODO)</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Prawo dostępu (art. 15) i prawo do bycia zapomnianym (art. 17).
        </p>
        <GdprSection initialRequest={gdprRequest ? {
          status: gdprRequest.status,
          scheduledFor: new Date(gdprRequest.scheduled_for).toLocaleDateString('pl-PL', {
            year: 'numeric', month: 'long', day: 'numeric',
          }),
        } : null} />
      </Card>

      <Card className="p-6 border-destructive/30">
        <h2 className="text-lg font-semibold text-destructive mb-2">
          Usuń organizację (firmę)
        </h2>
        {/* Opis zgodny z regulaminem (§ 14 ust. 2 i 6) i umową powierzenia
            (§ 9). Usunięcie firmy idzie przez pomoc techniczną: aplikacja
            nie umie firmy wyłączyć ani usunąć (flag tenants.deleted_at /
            is_active nic nie sprawdza). Do 15.10.2026 opis obiecywał „od
            razu wyłączona” i usunięcie danych w 30 + 30 dni. */}
        <p className="text-sm text-muted-foreground mb-4">
          Usunięcie firmy rozwiązuje umowę. Zlecasz je przez pomoc techniczną:
          napisz na {SUPPORT_EMAIL} z adresu właściciela i podaj NIP firmy. Do
          czasu wykonania zlecenia firma i abonament działają bez zmian.{' '}
          <strong>Najpierw pobierz kopię danych</strong> (Księgowość →
          Eksport). Faktury wysłane do KSeF przechowuje też Ministerstwo
          Finansów. To nie jest usunięcie Twojego konta — do tego służy sekcja
          &laquo;Twoje dane (RODO)&raquo; powyżej.
        </p>
        {!isOwner ? (
          <p className="text-sm text-muted-foreground">
            Tylko właściciel konta może zlecić usunięcie firmy.
          </p>
        ) : (
          <DeleteAccountForm tenantNipHint={nip} />
        )}
      </Card>
    </div>
  );
}
