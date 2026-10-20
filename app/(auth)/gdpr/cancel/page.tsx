import Link from 'next/link';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { authAlertErrorClass, authPrimaryButtonClass, authTitleClass } from '@/components/auth/auth-form-styles';
import { GdprCancelForm } from './cancel-form';

export const dynamic = 'force-dynamic';

export default async function GdprCancelPage({ searchParams }: {
  searchParams: Promise<{ token?: string; outcome?: string }>;
}) {
  const { token } = await searchParams;
  const cleanToken = typeof token === 'string' && /^[a-f0-9]{64}$/.test(token) ? token : null;
  // GET jest wyłącznie formularzem. Parametry query nie mogą deklarować sukcesu.
  return (
    <div className="space-y-6">
      <h2 className={authTitleClass}>Anulowanie usunięcia konta</h2>
      {cleanToken ? <GdprCancelForm token={cleanToken} /> : (
        <div className={authAlertErrorClass}>Otwórz pełny link z maila albo zaloguj się i anuluj żądanie w ustawieniach konta.</div>
      )}
      <Link href="/login" className={cn(buttonVariants({ size: 'lg' }), authPrimaryButtonClass)}>Przejdź do logowania</Link>
    </div>
  );
}
