import type { Metadata } from 'next';
import Link from 'next/link';

import '@/styles/zova.css';

export const metadata: Metadata = {
  title: 'Przerwa techniczna — FaktFlow',
  robots: { index: false, follow: false },
};

/**
 * Tu proxy kieruje panel, gdy operator włączy `maintenanceMode` (AUD-63).
 * Strona jest statyczna i publiczna — nie czyta flagi, więc po końcu
 * przerwy „Spróbuj ponownie” po prostu wraca do panelu.
 */
export default function MaintenancePage() {
  return (
    <div className="zova flex min-h-screen flex-col items-center justify-center px-5 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-5 top-5 h-[520px] rounded-[20px]"
        style={{
          background:
            'linear-gradient(180deg, #fff 0%, #eff5fe 70%, #dbe8fb 100%)',
        }}
      />

      <div className="relative flex max-w-[550px] flex-col items-center gap-6">
        <span className="z-tiny inline-flex items-center gap-2 rounded-full border border-[var(--z-300)] bg-white/70 px-3 py-1.5">
          <span className="size-1.5 rounded-full bg-[var(--z-blue)]" />
          Przerwa techniczna
        </span>

        <h1 className="z-h2">Panel jest chwilowo niedostępny</h1>

        <p className="z-lead text-[var(--z-muted)]">
          Trwają prace techniczne. Twoje faktury i dane są bezpieczne.
          Spróbuj ponownie za kilka minut.
        </p>

        <Link
          href="/dashboard"
          prefetch={false}
          className="z-body inline-flex items-center rounded-[12px] bg-[var(--z-black)] px-5 py-3.5 font-medium text-white transition-transform hover:scale-[1.02]"
        >
          Spróbuj ponownie
        </Link>
      </div>
    </div>
  );
}
