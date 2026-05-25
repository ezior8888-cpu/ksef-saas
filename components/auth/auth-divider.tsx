import { cn } from '@/lib/utils';

/** Separator „lub”. */
export function AuthDivider({ variant = 'dark' }: { variant?: 'light' | 'dark' }) {
  const isLight = variant === 'light';

  return (
    <div className="relative py-1">
      <div className="absolute inset-0 flex items-center" aria-hidden>
        <div
          className={cn(
            'w-full border-t',
            isLight ? 'border-zinc-200' : 'border-white/10',
          )}
        />
      </div>
      <div className="relative flex justify-center">
        <span
          className={cn(
            'px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest',
            isLight
              ? 'bg-white text-zinc-500'
              : 'bg-[var(--ff-glass-pane-solid,#1d1e27)] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)]',
          )}
        >
          lub
        </span>
      </div>
    </div>
  );
}
