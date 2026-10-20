import { DeleteAccountForm } from '@/components/settings/delete-account-form';
import { FieldDescription, FieldGroup, FieldLabel } from '@/components/settings/finora/field';
import { Separator } from '@/components/ui/separator';
import { getPageContext } from '@/lib/supabase/page-context';
import { getActiveGdprRequest } from '@/lib/gdpr/deletion';
import { GdprSection } from './_components/gdpr-section';

export const dynamic = 'force-dynamic';

/**
 * Zakładka „Konto i dane (RODO)” = Privacy & Data z Finory
 * (`views/settings/privacy`): eksport danych (art. 15), usunięcie konta
 * (art. 17) i — jedyne miejsce w aplikacji — usunięcie firmy.
 */
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
    <FieldGroup>
      <div>
        <FieldLabel>Twoje dane (RODO)</FieldLabel>
        <FieldDescription>
          Prawo dostępu (art. 15) i prawo do bycia zapomnianym (art. 17).
        </FieldDescription>
      </div>

      <GdprSection initialRequest={gdprRequest ? {
        status: gdprRequest.status,
        scheduledFor: new Date(gdprRequest.scheduled_for).toLocaleDateString('pl-PL', {
          year: 'numeric', month: 'long', day: 'numeric',
        }),
      } : null} />

      <Separator />

      <div>
        <FieldLabel className="text-destructive">Usuń organizację (firmę)</FieldLabel>
        <FieldDescription>
          Operacja jest <strong>nieodwracalna po 30 dniach</strong> (zgodnie z
          harmonogramem retencji): firma zostanie oznaczona do usunięcia, a Ty
          zostaniesz wylogowany. W tym czasie możesz skontaktować się z
          pomocą, jeśli to pomyłka. To NIE jest usunięcie Twojego konta — żeby
          to zrobić użyj sekcji &laquo;Twoje dane (RODO)&raquo; powyżej.
        </FieldDescription>
      </div>
      {!isOwner ? (
        <FieldDescription>
          Tylko właściciel konta może zlecić usunięcie firmy.
        </FieldDescription>
      ) : (
        <DeleteAccountForm tenantNipHint={nip} />
      )}
    </FieldGroup>
  );
}
