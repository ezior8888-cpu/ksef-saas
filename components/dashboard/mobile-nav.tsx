'use client';

import { Menu } from 'lucide-react';

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
          className="rounded-xl lg:hidden"
          aria-label="Menu"
          type="button"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-[264px] p-4 backdrop-blur-glass-lg bg-glass-white-strong border-r border-glass-border"
      >
        <SheetTitle className="sr-only">Nawigacja</SheetTitle>
        <Sidebar drawer />
      </SheetContent>
    </Sheet>
  );
}
