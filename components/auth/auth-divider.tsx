import { cn } from '@/lib/utils';

/**
 * Separator „lub”.
 *
 * Wariant domyślny chodzi na tokenach landingu (`.zova`), bo ekrany
 * logowania i rejestracji są jasne. Wcześniej miał tu wpisane na sztywno
 * ciemne tło `#1d1e27`, które na jasnej karcie wyglądało jak czarny prostokąt.
 */
export function AuthDivider({
  variant = 'dark',
}: {
  variant?: 'light' | 'dark';
}) {
  const isLight = variant === 'light';

  return (
    <div className="relative py-2">
      <div className="absolute inset-0 flex items-center" aria-hidden>
        <div
          className={cn(
            'w-full border-t',
            isLight ? 'border-zinc-200' : 'border-[var(--z-300)]',
          )}
        />
      </div>
      <div className="relative flex justify-center">
        <span
          className={cn(
            'px-3 text-[11px] font-medium uppercase tracking-[0.14em]',
            isLight
              ? 'bg-white text-zinc-500'
              : 'bg-white text-[var(--z-muted)]',
          )}
        >
          lub
        </span>
      </div>
    </div>
  );
}
