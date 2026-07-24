import Link from 'next/link';

import { getDashboardActiveOrgVerified } from '@/lib/dashboard-shell-data';

export default async function DashboardVerificationBanner() {
  const isVerified = await getDashboardActiveOrgVerified();
  if (isVerified) return null;

  return (
    <div
      className="mb-6 mt-7 flex flex-col gap-4 rounded-xl border border-[var(--ff-warn-border)] bg-[var(--ff-warn-tint)] px-[22px] py-4 sm:flex-row sm:items-center"
      role="status"
    >
      <span
        className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--ff-warn)] sm:mt-0"
        aria-hidden
      />
      <p className="min-w-0 flex-1 text-[13.5px] leading-[1.5] text-[var(--ff-warn-text)]">
        <span className="font-semibold text-[var(--ff-warn)]">
          Organizacja niezweryfikowana.
        </span>{' '}
        Możesz tworzyć szkice faktur, ale wysyłka do KSeF oraz generowanie
        PDF-ów wymaga weryfikacji certyfikatu.
      </p>
      <Link
        href="/settings/ksef"
        className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[13.5px] font-semibold text-[var(--ff-warn)] transition-colors hover:text-[#fbbf24]"
      >
        Zweryfikuj teraz
        <span className="material-symbols-outlined text-[15px] leading-none">
          arrow_forward
        </span>
      </Link>
    </div>
  );
}
