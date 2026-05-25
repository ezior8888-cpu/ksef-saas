import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  authAlertErrorClass,
  authAlertSuccessClass,
  authPrimaryButtonClass,
  authSubtitleClass,
  authTitleClass,
} from '@/components/auth/auth-form-styles';
import { logAudit } from '@/lib/audit/log';
import { cancelGdprRequest } from '@/lib/gdpr/deletion';

export const dynamic = 'force-dynamic';

export default async function GdprCancelPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const cleanToken =
    typeof token === 'string' && /^[a-f0-9]{64}$/i.test(token) ? token : null;

  let outcome: 'ok' | 'invalid' | 'not_pending' = 'invalid';
  let userEmail: string | undefined;

  if (cleanToken) {
    const result = await cancelGdprRequest(cleanToken, 'user_clicked_link');
    if (result.ok) {
      outcome = 'ok';
      userEmail = result.userEmail;
      await logAudit({
        action: 'gdpr.deletion_canceled',
        tenantId: null,
        userId: null,
        metadata: { method: 'email_link', email: userEmail },
      });
    } else {
      outcome = 'not_pending';
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className={authTitleClass}>
          {outcome === 'ok' ? 'Cofnięto usunięcie konta' : 'Nieprawidłowy link'}
        </h2>
        {outcome === 'ok' && (
          <p className={authSubtitleClass}>
            Twoje konto pozostaje aktywne.
          </p>
        )}
      </div>

      {outcome === 'ok' && (
        <>
          <div className={authAlertSuccessClass}>
            <p>
              Świetnie! Żądanie usunięcia konta <strong>{userEmail}</strong>{' '}
              zostało <strong>anulowane</strong>. Twoje konto i dane pozostają
              nienaruszone.
            </p>
          </div>
          <p className={authSubtitleClass}>
            Jeśli to nie Ty kliknąłeś link, zalecamy zmianę hasła i włączenie
            2FA w panelu Bezpieczeństwo.
          </p>
        </>
      )}

      {outcome === 'invalid' && (
        <div className={authAlertErrorClass}>
          Link jest nieprawidłowy lub wygasł. Sprawdź, czy skopiowałeś pełen URL
          z maila.
        </div>
      )}

      {outcome === 'not_pending' && (
        <div className="rounded-[var(--ff-radius-lg)] border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Ten link został już wcześniej użyty lub żądanie zostało zakończone.
          Jeśli Twoje konto nadal działa — nic się nie zmienia. Jeśli zostało
          usunięte, skontaktuj się z pomocą:{' '}
          <a href="mailto:pomoc@faktflow.pl" className="underline">
            pomoc@faktflow.pl
          </a>
          .
        </div>
      )}

      <Button asChild size="lg" className={authPrimaryButtonClass}>
        <Link href="/login">Przejdź do logowania</Link>
      </Button>
    </div>
  );
}
