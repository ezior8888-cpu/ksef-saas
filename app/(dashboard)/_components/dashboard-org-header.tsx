import { getDashboardOrgSwitcherProps } from '@/lib/dashboard-shell-data';
import { OrgSwitcher } from '@/components/dashboard/org-switcher';

/** Szkielet przycisku org w nagłówku — ten sam rozmiar co `OrgSwitcher`. */
export function OrgSwitcherHeaderSkeleton() {
  return (
    <div
      className="h-9 w-[min(100%,160px)] max-w-full animate-pulse rounded-full border border-[var(--ff-border)] bg-[var(--ff-surface)] lg:h-[50px] lg:w-[min(100%,280px)] lg:rounded-[10px]"
      aria-hidden
    />
  );
}

export default async function DashboardOrgHeader() {
  const props = await getDashboardOrgSwitcherProps();
  return <OrgSwitcher {...props} />;
}
