import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

type AuthPageShellProps = {
  children: React.ReactNode;
};

/**
 * Shell auth — to samo tło i karta co /inbox (ff-dashboard + ff-glass-pane).
 */
export function AuthPageShell({ children }: AuthPageShellProps) {
  return (
    <div className="ff-dashboard relative flex min-h-screen w-full items-center justify-center overflow-hidden p-4 text-[var(--ff-on-surface)] sm:p-6">
      <div className="ff-mesh-gradient" aria-hidden />
      <div className="ff-orb-tr" aria-hidden />
      <div className="ff-orb-bl" aria-hidden />

      {/* BUG-004: powrót na stronę główną bez dotykania linku w treści.
       * Widoczny też po wylogowaniu (auth shell renderuje się na /login). */}
      <Link
        href="/"
        className="absolute left-4 top-4 z-[2] inline-flex items-center gap-1.5 rounded-full border border-[var(--ff-glass-border)] bg-[color-mix(in_srgb,var(--ff-on-surface)_5%,transparent)] px-3 py-1.5 text-xs font-medium text-[color-mix(in_srgb,var(--ff-on-surface)_82%,transparent)] backdrop-blur-sm transition-colors hover:bg-[color-mix(in_srgb,var(--ff-on-surface)_10%,transparent)] hover:text-[var(--ff-on-surface)] sm:left-6 sm:top-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Strona główna
      </Link>

      <div className="relative z-[1] w-full max-w-[420px]">
        <div className="ff-glass-pane overflow-hidden rounded-[var(--ff-radius-lg)]">
          <div className="px-8 py-10 sm:px-10 sm:py-11">{children}</div>
        </div>

        <p className="mt-6 text-center text-xs text-[color-mix(in_srgb,var(--ff-on-surface-variant)_50%,transparent)]">
          Akceptując kontynuujesz{' '}
          <a
            href="/legal/regulamin"
            className="underline decoration-[color-mix(in_srgb,var(--ff-on-surface)_25%,transparent)] underline-offset-2 transition-colors hover:text-[var(--ff-on-surface)]"
          >
            Regulamin
          </a>{' '}
          i{' '}
          <a
            href="/legal/polityka-prywatnosci"
            className="underline decoration-[color-mix(in_srgb,var(--ff-on-surface)_25%,transparent)] underline-offset-2 transition-colors hover:text-[var(--ff-on-surface)]"
          >
            Politykę Prywatności
          </a>
        </p>
      </div>
    </div>
  );
}
