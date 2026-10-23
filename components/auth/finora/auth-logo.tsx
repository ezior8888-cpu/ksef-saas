// Plan Finora P15 (E10b): `src/components/shared/Logo.tsx` szablonu —
// znak 34 px + nazwa `text-xl font-bold`. Od 23.10.2026 bez znaku: zielony
// znak zdjęty na prośbę Bartosza, nowe logo przyjdzie osobno. Zostaje
// „FaktWay” dwutonowo, jak wordmark panelu (`BrandWordmark variant='app'`).

// Util Imports
import { cn } from '@/lib/utils'

export function AuthLogo({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <span className='text-xl font-bold'>
        Fakt<span className='text-primary'>Way</span>
      </span>
    </div>
  )
}
