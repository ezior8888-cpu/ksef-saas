export default function Loading() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="space-y-3">
        <div className="h-10 w-72 bg-foreground/5 rounded-2xl" />
        <div className="h-4 w-96 bg-foreground/5 rounded-lg" />
      </div>
      <div className="rounded-3xl border border-white/55 dark:border-white/14 bg-white/45 dark:bg-[rgba(15,10,30,0.45)] backdrop-blur-[24px] shadow-[0_8px_32px_0_rgba(31,38,135,0.08)] p-6">
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 bg-foreground/5 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
