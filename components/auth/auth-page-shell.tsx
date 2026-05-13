import { AuthBrandMark } from '@/components/auth/auth-brand-mark';

export type AuthPageShellVariant = 'legacy' | 'dashboard';

/**
 * Wspólna „ramka” auth (logo + karta + stopka prawna).
 * `legacy` — dotychczasowy mesh + blur (register / forgot-password).
 * `dashboard` — ta sama skóra co shell `(dashboard)` (ff-dashboard, mesh, orby, ff-glass-pane).
 */
export function AuthPageShell({
  variant,
  children,
}: {
  variant: AuthPageShellVariant;
  children: React.ReactNode;
}) {
  const branding = (
    <div className="mb-8 flex justify-center">
      <AuthBrandMark />
    </div>
  );

  const footer = (
    <p className="mt-6 text-center text-xs text-muted-foreground">
      Akceptując kontynuujesz Regulamin i Politykę Prywatności
    </p>
  );

  if (variant === 'legacy') {
    return (
      <div className="dark min-h-screen bg-mesh-dark flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="rounded-3xl border border-white/14 bg-[rgba(15,10,30,0.62)] backdrop-blur-glass-lg shadow-glass-lg p-8 lg:p-10">
            {branding}
            {children}
          </div>
          {footer}
        </div>
      </div>
    );
  }

  return (
    <div className="dark ff-dashboard relative flex min-h-screen w-full items-center justify-center overflow-hidden p-4 text-[var(--ff-on-surface)]">
      <div className="ff-mesh-gradient" aria-hidden />
      <div className="ff-orb-tr" aria-hidden />
      <div className="ff-orb-bl" aria-hidden />

      <div className="relative z-[1] w-full max-w-md">
        <div className="ff-glass-pane rounded-3xl p-8 lg:p-10">
          {branding}
          {children}
        </div>
        {footer}
      </div>
    </div>
  );
}
