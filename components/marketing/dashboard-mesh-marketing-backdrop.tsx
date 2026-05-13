/**
 * To samo tło co w `(dashboard)/layout.tsx`: mesh + dwa orby.
 * Wymaga przodka z tokenami `--ff-primary` / `--ff-secondary` (np. `.ff-with-dashboard-mesh`).
 */
export function DashboardMeshMarketingBackdrop() {
  return (
    <>
      <div className="ff-mesh-gradient" aria-hidden />
      <div className="ff-orb-tr" aria-hidden />
      <div className="ff-orb-bl" aria-hidden />
    </>
  );
}
