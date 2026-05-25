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

      <div className="relative z-[1] w-full max-w-[420px]">
        <div className="ff-glass-pane overflow-hidden rounded-[var(--ff-radius-lg)]">
          <div className="px-8 py-10 sm:px-10 sm:py-11">{children}</div>
        </div>

        <p className="mt-6 text-center text-xs text-[color-mix(in_srgb,var(--ff-on-surface-variant)_50%,transparent)]">
          Akceptując kontynuujesz{' '}
          <a
            href="/legal/regulamin"
            className="underline decoration-white/20 underline-offset-2 transition-colors hover:text-[var(--ff-on-surface)]"
          >
            Regulamin
          </a>{' '}
          i{' '}
          <a
            href="/legal/polityka-prywatnosci"
            className="underline decoration-white/20 underline-offset-2 transition-colors hover:text-[var(--ff-on-surface)]"
          >
            Politykę Prywatności
          </a>
        </p>
      </div>
    </div>
  );
}
