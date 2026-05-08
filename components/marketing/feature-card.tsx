import type { LucideIcon } from 'lucide-react';

interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  proof?: string;
}

export function FeatureCard({ icon: Icon, title, description, proof }: FeatureCardProps) {
  return (
    <div
      className="rounded-3xl border border-glass-border bg-glass-white backdrop-blur-glass shadow-glass p-7 transition-shadow duration-300 hover:shadow-glass-lg"
    >
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground/5">
        <Icon className="h-5 w-5 text-foreground" aria-hidden />
      </div>
      <h3 className="mb-2 font-display text-lg font-semibold tracking-tighter-text">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      {proof ? (
        <p
          className="mt-4 inline-block rounded-full border border-green-500/20 bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-700 dark:text-green-400"
        >
          ✓ {proof}
        </p>
      ) : null}
    </div>
  );
}
