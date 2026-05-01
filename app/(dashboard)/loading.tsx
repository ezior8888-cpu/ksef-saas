export default function Loading() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="space-y-3">
        <div className="skeleton h-10 w-72" />
        <div className="skeleton h-4 w-96" />
      </div>
      <div className="rounded-3xl border border-glass-border bg-glass-white backdrop-blur-glass shadow-glass p-6">
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-12" />
          ))}
        </div>
      </div>
    </div>
  );
}
