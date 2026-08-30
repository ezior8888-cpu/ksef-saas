import Link from 'next/link';

import { getDashboardActiveOrgVerified } from '@/lib/dashboard-shell-data';

/**
 * WŁAŚCICIEL: Bartosz (tor silnika) — rama panelu, nie interfejs agenta.
 *
 * ODSTĘPSTWO OD PROTOTYPU, ŚWIADOME: na makiecie z sierpnia 2026 ten baner
 * siedzi w prawej szynie dashboardu. Zostaje w layoucie, nad obiema kolumnami,
 * bo pilnuje WSZYSTKICH stron panelu — po przeniesieniu do szyny zniknąłby
 * z faktur, wydatków i skrzynki, czyli z miejsc, w których człowiek dowiaduje
 * się o braku certyfikatu najpóźniej i najboleśniej.
 */
export default async function DashboardVerificationBanner() {
  const isVerified = await getDashboardActiveOrgVerified();
  if (isVerified) return null;

  return (
    <div
      className="mb-6 mt-7 flex flex-col gap-3 rounded-xl border border-[var(--ff-warn-border)] bg-[var(--ff-warn-tint)] px-[22px] py-4 sm:flex-row sm:items-center sm:gap-4"
      role="status"
    >
      <span
        className="material-symbols-outlined shrink-0 text-[20px] leading-none text-[var(--ff-warn)]"
        aria-hidden
      >
        error
      </span>
      <p className="min-w-0 flex-1 text-[13.5px] leading-[1.5] text-[var(--ff-warn-text)]">
        <span className="font-semibold text-[var(--ff-warn)]">
          Organizacja niezweryfikowana.
        </span>{' '}
        Możesz tworzyć szkice faktur, ale wysyłka do KSeF oraz generowanie
        PDF-ów wymaga weryfikacji certyfikatu.
      </p>
      <Link
        href="/settings/ksef"
        className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[13.5px] font-semibold text-[var(--ff-warn)] underline-offset-4 transition-colors hover:text-[var(--ff-warn-text)] hover:underline"
      >
        Zweryfikuj teraz
        <span className="material-symbols-outlined text-[15px] leading-none">
          arrow_forward
        </span>
      </Link>
    </div>
  );
}
