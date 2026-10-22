import { redirect } from 'next/navigation';
import { FieldGroup } from '@/components/ui/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { createClient } from '@/lib/supabase/server';
import { PasswordChangeCard } from './_components/password-change-card';
import { TwoFactorCard } from './_components/two-factor-card';

export const dynamic = 'force-dynamic';

/**
 * Zakładka „Bezpieczeństwo” = Security z Finory (`views/settings/security`):
 * hasło i weryfikacja dwuetapowa. Blokady aplikacji (PIN), listy sesji
 * i historii logowań z Finory nie mamy, więc ich tu nie ma.
 */
export default async function SecuritySettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { notice } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: factorsRes } = await supabase.auth.mfa.listFactors();
  const verifiedTotp = factorsRes?.totp?.find((f) => f.status === 'verified');
  const isTotpEnabled = Boolean(verifiedTotp);

  return (
    <FieldGroup>
      {notice === 'admin_mfa_required' && (
        <Alert role="status">
          <AlertDescription>
            Panel administratora wymaga weryfikacji dwuetapowej. Włącz 2FA poniżej,
            potwierdź kod z aplikacji TOTP i wróć do panelu administratora.
          </AlertDescription>
        </Alert>
      )}

      <PasswordChangeCard />

      <Separator />

      <TwoFactorCard isEnabled={isTotpEnabled} />
    </FieldGroup>
  );
}
