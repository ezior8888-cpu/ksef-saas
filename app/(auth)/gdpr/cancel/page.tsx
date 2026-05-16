import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { logAudit } from '@/lib/audit/log';
import { cancelGdprRequest } from '@/lib/gdpr/deletion';

export const dynamic = 'force-dynamic';

/**
 * Strona z linka w emailu GdprDeletionScheduled. Token w query — wykonujemy
 * cancel deterministycznie i pokazujemy wynik. User nie musi być zalogowany
 * (mógł stracić dostęp do hasła).
 *
 * Anti-CSRF (z guesswork tokena): token to 64 chars hex z `randomBytes(32)` —
 * brute force 2^256 niewykonalny.
 */
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
        <h2 className="text-2xl font-semibold tracking-tight text-white">
          {outcome === 'ok' ? 'Cofnięto usunięcie konta' : 'Nieprawidłowy link'}
        </h2>
      </div>

      {outcome === 'ok' && (
        <>
          <div className="rounded-2xl border border-green-500/20 bg-green-500/5 px-4 py-3 text-sm text-green-700 dark:text-green-400">
            <p>
              Świetnie! Żądanie usunięcia konta <strong>{userEmail}</strong>{' '}
              zostało <strong>anulowane</strong>. Twoje konto i dane pozostają
              nienaruszone.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Jeśli to nie Ty kliknąłeś link, zalecamy zmianę hasła i włączenie
            2FA w panelu Bezpieczeństwo.
          </p>
        </>
      )}

      {outcome === 'invalid' && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          Link jest nieprawidłowy lub wygasł. Sprawdź czy skopiowałeś pełen URL
          z maila.
        </div>
      )}

      {outcome === 'not_pending' && (
        <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-400">
          Ten link został już wcześniej użyty lub żądanie zostało zakończone.
          Jeśli Twoje konto nadal działa — nic się nie zmienia. Jeśli zostało
          usunięte, skontaktuj się z pomocą:{' '}
          <a href="mailto:pomoc@faktflow.pl" className="underline">
            pomoc@faktflow.pl
          </a>
          .
        </div>
      )}

      <Button asChild variant="glass-primary" size="lg" className="w-full">
        <Link href="/login">Przejdź do logowania</Link>
      </Button>
    </div>
  );
}
