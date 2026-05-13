/**
 * To samo tło co na stronie głównej (`app/(marketing)/layout.tsx`):
 * `bg-background` na rodzicu + te trzy orby (fixed, pod treścią).
 */
export function MarketingAmbientBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      aria-hidden
    >
      <div className="animate-orb-1 absolute -top-40 -right-40 h-[600px] w-[600px] rounded-full bg-blue-500/10 blur-[120px]" />
      <div className="animate-orb-2 absolute top-1/2 -left-40 h-[500px] w-[500px] rounded-full bg-purple-500/10 blur-[120px]" />
      <div className="animate-orb-3 absolute -bottom-40 left-1/2 h-[500px] w-[500px] rounded-full bg-green-500/10 blur-[120px]" />
    </div>
  );
}
