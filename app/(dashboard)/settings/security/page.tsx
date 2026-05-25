import { KeyRound, ShieldCheck } from 'lucide-react';
import { redirect } from 'next/navigation';
import { countRemainingRecoveryCodes } from '@/lib/auth/mfa-recovery';
import { createClient } from '@/lib/supabase/server';
import { PasswordChangeCard } from './_components/password-change-card';
import { TwoFactorCard } from './_components/two-factor-card';

export const dynamic = 'force-dynamic';

export default async function SecuritySettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: factorsRes } = await supabase.auth.mfa.listFactors();
  const verifiedTotp = factorsRes?.totp?.find((f) => f.status === 'verified');
  const isTotpEnabled = Boolean(verifiedTotp);
  const remainingRecovery = isTotpEnabled
    ? await countRemainingRecoveryCodes(user.id)
    : 0;

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-4xl font-display font-semibold tracking-tighter-display">
          Bezpieczeństwo
        </h1>
        <p className="mt-2 text-muted-foreground">
          Hasło, weryfikacja dwuetapowa i sesje
        </p>
      </div>

      <div className="ff-glass-pane rounded-[var(--ff-radius-lg)] p-7 lg:p-8 space-y-5">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-2xl bg-foreground/5 flex items-center justify-center shrink-0">
            <KeyRound className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="flex-1 space-y-4">
            <div>
              <h2 className="text-lg font-display font-semibold tracking-tighter-text">
                Hasło
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Zmień hasło — wymagamy minimum 12 znaków, mieszanki liter,
                cyfr i znaków specjalnych. Sprawdzamy też w bazie wycieków.
              </p>
            </div>
            <PasswordChangeCard />
          </div>
        </div>
      </div>

      <div className="ff-glass-pane rounded-[var(--ff-radius-lg)] p-7 lg:p-8 space-y-5">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-2xl bg-foreground/5 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="flex-1 space-y-4">
            <div>
              <h2 className="text-lg font-display font-semibold tracking-tighter-text">
                Weryfikacja dwuetapowa (2FA)
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Dodaj drugi czynnik logowania (aplikacja TOTP — Google Authenticator,
                1Password, Authy). Chroni konto nawet jeśli hasło wycieknie.
              </p>
            </div>
            <TwoFactorCard
              isEnabled={isTotpEnabled}
              remainingRecoveryCodes={remainingRecovery}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
