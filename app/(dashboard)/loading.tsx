import { Skeleton } from '@/components/ui/skeleton';

/**
 * Segment `(dashboard)` — lekki szkielet podczas streamowania RSC (bez logiki).
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-8 pb-10" aria-busy="true" aria-label="Ładowanie">
      <div className="space-y-2">
        <Skeleton className="h-10 w-64 max-w-full" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-64" />
      <Skeleton className="h-48" />
    </div>
  );
}
