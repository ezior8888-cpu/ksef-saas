'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  FileText,
  History,
  Inbox,
  KeyRound,
  Users,
  UserCircle,
  BarChart3,
  Settings,
  PlusCircle,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  separator?: boolean;
}

function isActivePath(pathname: string, href: string): boolean {
  if (href === '/invoices/new') return pathname === '/invoices/new';
  if (href === '/invoices') {
    if (pathname === '/invoices/new') return false;
    return pathname === '/invoices' || pathname.startsWith('/invoices/');
  }
  if (href === '/settings') return pathname === '/settings';
  return pathname === href || pathname.startsWith(`${href}/`);
}

const navItems: NavItem[] = [
  { href: '/invoices',        label: 'Faktury wystawione',   icon: FileText },
  { href: '/inbox',           label: 'Skrzynka odbiorcza',   icon: Inbox },
  { href: '/contractors',     label: 'Kontrahenci',           icon: Users },
  { href: '/reports',         label: 'Raporty',               icon: BarChart3 },
  { href: '/settings/audit',  label: 'Historia aktywności',   icon: History,  separator: true },
  { href: '/settings/ksef',   label: 'Ustawienia KSeF',       icon: Settings },
  { href: '/settings',        label: 'Ustawienia',            icon: Shield },
  { href: '/settings/account',label: 'Konto',                 icon: UserCircle },
  { href: '/settings/accountant', label: 'Księgowa',          icon: KeyRound },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex flex-col w-[264px] shrink-0 m-3 mt-0 p-4 bg-white/45 dark:bg-[rgba(15,10,30,0.45)] backdrop-blur-glass border border-white/55 dark:border-white/14 rounded-3xl shadow-glass sticky top-[76px] h-[calc(100vh-88px)] min-h-0">

      <Link
        href="/invoices/new"
        className="flex items-center gap-2.5 rounded-2xl bg-foreground text-background px-4 py-3.5 hover:bg-foreground/90 active:scale-[0.97] transition-all duration-200 shadow-glass-sm font-medium text-sm tracking-tight"
      >
        <PlusCircle className="h-[18px] w-[18px] shrink-0" />
        <span>Nowa faktura</span>
      </Link>

      <nav className="mt-6 flex-1 overflow-y-auto space-y-0.5 min-h-0">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActivePath(pathname, item.href);
          return (
            <div key={item.href}>
              {item.separator && (
                <div className="my-3 h-px bg-white/55 dark:bg-white/10" />
              )}
              <Link
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                  active
                    ? 'bg-foreground text-background shadow-glass-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {item.label}
              </Link>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
