import Link from 'next/link';
import { redirect } from 'next/navigation';
import { authAlertErrorClass, authLinkClass, authSubtitleClass, authTitleClass } from '@/components/auth/auth-form-styles';
import { getVerifiedPasswordRecoveryState } from '@/lib/auth/password-recovery';
import { createClient } from '@/lib/supabase/server';
import { ResetPasswordForm } from './reset-password-form';

export const dynamic = 'force-dynamic';

export default async function ResetPasswordPage() {
  const supabase = await createClient().catch(() => null);
  const state = supabase ? await getVerifiedPasswordRecoveryState(supabase) : null;
  if (state?.status === 'challenge_required' && state.user.factors?.some(
    (factor) => factor.factor_type === 'totp' && factor.status === 'verified',
  )) redirect('/login/two-factor?redirect=%2Freset-password');

  return (
    <div className="space-y-6">
      <div>
        <h2 className={authTitleClass}>Ustaw nowe hasło</h2>
        <p className={authSubtitleClass}>Wybierz hasło, którego nie używasz w innym serwisie.</p>
      </div>
      {state?.status === 'verified' ? <ResetPasswordForm /> : (
        <div role="alert" className={authAlertErrorClass}>
          {state?.status === 'challenge_required'
            ? 'To konto wymaga drugiego składnika, którego nie możemy tu obsłużyć. Skontaktuj się z pomocą.'
            : 'Link jest nieważny, wygasł lub został otwarty w innej przeglądarce. Poproś o nowy i otwórz go w tej samej przeglądarce, w której wysłano prośbę.'}
        </div>
      )}
      <p><Link href="/forgot-password" className={authLinkClass}>Poproś o nowy link</Link></p>
    </div>
  );
}
