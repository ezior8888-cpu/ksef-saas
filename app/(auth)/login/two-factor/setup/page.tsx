import { redirect } from 'next/navigation';
import { isAdminEmail } from '@/lib/auth/admin-guard';
import { getVerifiedMfaState } from '@/lib/auth/verified-mfa';
import { createClient } from '@/lib/supabase/server';
import { TwoFactorCard } from '@/app/(dashboard)/settings/security/_components/two-factor-card';
import { authTitleClass, authSubtitleClass } from '@/components/auth/auth-form-styles';

export const dynamic = 'force-dynamic';

/** Operator enrollment is independent of tenant membership and dashboard layout. */
export default async function AdminMfaSetupPage() {
  const state = await getVerifiedMfaState(await createClient());
  if (state.status === 'unauthenticated') redirect('/login');
  const { user } = state;
  if (!user.email_confirmed_at || !isAdminEmail(user.email)) redirect('/dashboard');
  if (state.status === 'verified') redirect('/admin');
  if (state.status === 'challenge_required') redirect('/login/two-factor?redirect=%2Fadmin');

  return (
    <div className="space-y-6">
      <div>
        <h2 className={authTitleClass}>Zabezpiecz dostęp administratora</h2>
        <p className={authSubtitleClass}>
          Skonfiguruj aplikację uwierzytelniającą, aby wejść do panelu administracyjnego.
          Nie musisz w tym celu zakładać firmy.
        </p>
      </div>
      <TwoFactorCard isEnabled={false} />
    </div>
  );
}
