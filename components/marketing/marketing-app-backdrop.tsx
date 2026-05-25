/**
 * Tło marketingu = to samo co w panelu (`ff-mesh-gradient` + orby).
 * Wymaga przodka `.ff-marketing-shell` (tokeny `--ff-primary` / `--ff-secondary`).
 */
export function MarketingAppBackdrop() {
  return (
    <>
      <div className="ff-mesh-gradient" aria-hidden />
      <div className="ff-orb-tr" aria-hidden />
      <div className="ff-orb-bl" aria-hidden />

      <div className="pointer-events-none fixed inset-0 -z-[1] overflow-hidden" aria-hidden>
        <div className="marketing-orb absolute -top-32 -right-32 h-[700px] w-[700px] rounded-full bg-emerald-500/[0.14] blur-[140px]" />
        <div className="marketing-orb marketing-orb-2 absolute top-[38%] -left-40 h-[560px] w-[560px] rounded-full bg-emerald-400/[0.09] blur-[120px]" />
        <div className="marketing-orb marketing-orb-3 absolute -bottom-48 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-teal-500/[0.08] blur-[140px]" />
        <div
          className="absolute inset-0 opacity-[0.02] mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.6'/%3E%3C/svg%3E\")",
          }}
        />
        {/* Vignette — czytelność tekstu na środku */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_70%_at_50%_18%,transparent_0%,#12131a_72%)]" />
      </div>
    </>
  );
}
