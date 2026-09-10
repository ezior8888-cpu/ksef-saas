import { DeleteAccountForm } from '@/components/settings/delete-account-form';
import { Card } from '@/components/ui/card';
import { getPageContext } from '@/lib/supabase/page-context';
import { getActiveGdprRequest } from '@/lib/gdpr/deletion';
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
        <p className="text-sm text-muted-foreground mb-4">
          Operacja jest <strong>nieodwracalna po 30 dniach</strong> (zgodnie z
          harmonogramem retencji): firma zostanie oznaczona do usunięcia, a Ty
          zostaniesz wylogowany. W tym czasie możesz skontaktować się z
          pomocą, jeśli to pomyłka. To NIE jest usunięcie Twojego konta — żeby
          to zrobić użyj sekcji &laquo;Twoje dane (RODO)&raquo; powyżej.
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
