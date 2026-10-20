// Plan Finora P15 (E10b): `src/components/shared/Logo.tsx` szablonu —
// znak 34 px + nazwa `text-xl font-bold`. Zamiast znaku i nazwy Finory nasz
// znak (`/brand/faktflow-mark.png`, jak `FaktflowMark`) i „FaktWay”
// dwutonowo, jak wordmark panelu (`BrandWordmark variant='app'`).

// Next Imports
import Image from 'next/image'

// Util Imports
import { cn } from '@/lib/utils'

export function AuthLogo({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      {/* Znak jest ozdobą: nazwę niesie tekst obok (odsyłacz ma nazwę „FaktWay”). */}
      <Image
        src='/brand/faktflow-mark.png'
        alt=''
        width={128}
        height={128}
        className='size-8.5 shrink-0 rounded-lg object-contain'
        priority
        unoptimized
      />
      <span className='text-xl font-bold'>
        Fakt<span className='text-primary'>Way</span>
      </span>
    </div>
  )
}
