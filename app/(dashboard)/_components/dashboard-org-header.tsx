import { getDashboardOrgSwitcherProps } from '@/lib/dashboard-shell-data';
import { OrgSwitcher } from '@/components/dashboard/org-switcher';

/** Szkielet przycisku org w nagłówku — ten sam rozmiar co `OrgSwitcher`. */
export function OrgSwitcherHeaderSkeleton() {
  return (
    <div
      className="ff-glass-pane h-[52px] w-[min(100%,280px)] max-w-full animate-pulse rounded-lg border border-white/5"
      aria-hidden
    />
  );
}

export default async function DashboardOrgHeader() {
  const props = await getDashboardOrgSwitcherProps();
  return <OrgSwitcher {...props} />;
}
