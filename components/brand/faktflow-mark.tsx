import Image from 'next/image';

/**
 * Znaczek FaktFlow — **te same** `src` / `width` / `height` / klasy co na stronie
 * głównej (`app/(marketing)/page.tsx` hero oraz `app/(marketing)/layout.tsx`).
 */
export function FaktflowMark({
  variant,
  priority,
}: {
  variant: 'hero' | 'header';
  /** Jak w layoutcie marketingu: `header` domyślnie ładuje z `priority`. */
  priority?: boolean;
}) {
  const isHeader = variant === 'header';
  return (
    <Image
      src="/brand/faktflow-mark.png"
      alt="FaktFlow"
      width={128}
      height={128}
      className={
        isHeader
          ? 'block h-9 w-9 shrink-0 rounded-2xl object-contain'
          : 'block h-16 w-16 shrink-0 rounded-2xl object-contain'
      }
      priority={priority ?? isHeader}
      unoptimized
    />
  );
}
