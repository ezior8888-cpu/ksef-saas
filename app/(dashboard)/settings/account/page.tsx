import { DeleteAccountForm } from '@/components/settings/delete-account-form';
import { Card } from '@/components/ui/card';
import { getPageContext } from '@/lib/supabase/page-context';

export const dynamic = 'force-dynamic';

export default async function AccountSettingsPage() {
  const { supabase, tenantId, role } = await getPageContext();

  const { data: tenant } = await supabase
    .from('tenants')
    .select('nip')
    .eq('id', tenantId)
    .maybeSingle();

  const nip = String(tenant?.nip ?? '');
  const isOwner = role === 'owner';

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-2">Konto i firma</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Zarządzanie usunięciem organizacji z systemu.
      </p>

      <Card className="p-6 border-destructive/30">
        <h2 className="text-lg font-semibold text-destructive mb-2">
          Usuń konto firmy
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Operacja jest <strong>nieodwracalna po 30 dniach</strong> (zgodnie z
          harmonogramem retencji): firma zostanie oznaczona do usunięcia, a Ty
          zostaniesz wylogowany. W tym czasie możesz skontaktować się z
          pomocą, jeśli to pomyłka.
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
