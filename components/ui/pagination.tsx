import * as React from 'react'

import { RiArrowLeftSLine, RiArrowRightSLine, RiMoreLine } from '@remixicon/react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

// Port z szablonu Finora (src/components/ui/pagination.tsx). Różnice: polskie
// napisy domyślne; PaginationLink zostaje zwykłym <a> (nawigacja przez URL).

function Pagination({ className, ...props }: React.ComponentProps<'nav'>) {
  return (
    <nav
      role='navigation'
      aria-label='Paginacja'
      data-slot='pagination'
      className={cn('mx-auto flex w-full justify-center', className)}
      {...props}
    />
  )
}

function PaginationContent({ className, ...props }: React.ComponentProps<'ul'>) {
  return <ul data-slot='pagination-content' className={cn('flex items-center gap-0.5', className)} {...props} />
}

function PaginationItem({ ...props }: React.ComponentProps<'li'>) {
  return <li data-slot='pagination-item' {...props} />
}

type PaginationLinkProps = {
  isActive?: boolean
} & Pick<React.ComponentProps<typeof Button>, 'size'> &
  React.ComponentProps<'a'>

function PaginationLink({ className, isActive, size = 'icon', ...props }: PaginationLinkProps) {
  return (
    <Button
      variant={isActive ? 'outline' : 'ghost'}
      size={size}
      className={cn(className)}
      nativeButton={false}
      render={
        <a aria-current={isActive ? 'page' : undefined} data-slot='pagination-link' data-active={isActive} {...props} />
      }
    />
  )
}

function PaginationPrevious({
  className,
  text = 'Poprzednia',
  ...props
}: React.ComponentProps<typeof PaginationLink> & { text?: string }) {
  return (
    <PaginationLink aria-label='Przejdź do poprzedniej strony' size='default' className={cn('pl-1.5!', className)} {...props}>
      <RiArrowLeftSLine data-icon='inline-start' />
      <span className='hidden sm:block'>{text}</span>
    </PaginationLink>
  )
}

function PaginationNext({
  className,
  text = 'Następna',
  ...props
}: React.ComponentProps<typeof PaginationLink> & { text?: string }) {
  return (
    <PaginationLink aria-label='Przejdź do następnej strony' size='default' className={cn('pr-1.5!', className)} {...props}>
      <span className='hidden sm:block'>{text}</span>
      <RiArrowRightSLine data-icon='inline-end' />
    </PaginationLink>
  )
}

function PaginationEllipsis({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      aria-hidden
      data-slot='pagination-ellipsis'
      className={cn("flex size-8 items-center justify-center [&_svg:not([class*='size-'])]:size-4", className)}
      {...props}
    >
      <RiMoreLine />
      <span className='sr-only'>Więcej stron</span>
    </span>
  )
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
}
