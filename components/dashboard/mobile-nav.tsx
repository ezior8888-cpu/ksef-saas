'use client';

import { Sidebar } from '@/components/dashboard/sidebar';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

export function MobileNav() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full text-[var(--ff-on-surface)] hover:bg-white/5 lg:hidden"
          aria-label="Menu"
          type="button"
        >
          <span className="material-symbols-outlined text-[24px]">menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="ff-dashboard ff-shell-mobile w-[min(100vw,288px)] p-0"
      >
        <SheetTitle className="sr-only">Nawigacja</SheetTitle>
        <Sidebar drawer />
      </SheetContent>
    </Sheet>
  );
}
