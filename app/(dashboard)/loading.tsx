/**
 * Segment `(dashboard)` — lekki szkielet podczas streamowania RSC (bez logiki).
 */
export default function DashboardLoading() {
  return (
    <div
      className="animate-pulse space-y-8 pb-10 text-[var(--ff-on-surface)]"
      aria-busy
      aria-label="Ładowanie"
    >
      <div className="space-y-2">
        <div className="h-10 w-64 max-w-full rounded-lg bg-[color-mix(in_srgb,var(--ff-on-surface)_10%,transparent)]" />
        <div className="h-5 w-96 max-w-full rounded-md bg-[color-mix(in_srgb,var(--ff-on-surface)_6%,transparent)]" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="ff-glass-pane h-28 rounded-[var(--ff-radius-lg)]"
          />
        ))}
      </div>
      <div className="ff-glass-pane h-64 rounded-[var(--ff-radius-lg)]" />
      <div className="ff-glass-pane h-48 rounded-[var(--ff-radius-lg)]" />
    </div>
  );
}
