'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AlertCircle,
  BarChart3,
  BookOpen,
  FileSpreadsheet,
  FileText,
  Inbox,
  LayoutDashboard,
  PlusCircle,
  Receipt,
  Settings,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  separator?: boolean;
}

function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  if (href === '/invoices/new') return pathname === '/invoices/new';
  if (href === '/reports') return pathname === '/reports';
  if (href === '/reports/kpir') {
    return (
      pathname === '/reports/kpir' || pathname.startsWith('/reports/kpir/')
    );
  }
  if (href === '/invoices') {
    if (pathname === '/invoices/new') return false;
    return pathname === '/invoices' || pathname.startsWith('/invoices/');
  }
  if (href === '/expenses') {
    return pathname === '/expenses' || pathname.startsWith('/expenses/');
  }
  if (href === '/settings')
    return pathname === '/settings' || pathname.startsWith('/settings/');
  return pathname === href || pathname.startsWith(`${href}/`);
}

const navItems: NavItem[] = [
  { href: '/', label: 'Przepływy', icon: LayoutDashboard },
  { href: '/reports', label: 'Raporty', icon: BarChart3 },
  { href: '/reports/exports', label: 'Eksport', icon: FileSpreadsheet },
  { href: '/reports/kpir', label: 'KPiR', icon: BookOpen },
  { href: '/invoices', label: 'Faktury wystawione', icon: FileText },
  { href: '/payments/overdue', label: 'Przeterminowane', icon: AlertCircle },
  { href: '/inbox', label: 'Skrzynka odbiorcza', icon: Inbox },
  { href: '/expenses', label: 'Wydatki', icon: Receipt },
  { href: '/contractors', label: 'Kontrahenci', icon: Users },
  { href: '/settings', label: 'Ustawienia', icon: Settings },
];

export function Sidebar({ drawer }: { drawer?: boolean }) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'flex flex-col w-[264px] shrink-0 p-4 bg-white/45 dark:bg-[rgba(15,10,30,0.45)] backdrop-blur-glass border border-white/55 dark:border-white/14 rounded-3xl shadow-glass',
        drawer
          ? 'flex h-full min-h-0 w-full m-0 border-0 rounded-none shadow-none bg-transparent'
          : 'hidden lg:flex m-3 mt-0 sticky top-[76px] h-[calc(100vh-88px)] min-h-0'
      )}
    >

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
                    ? 'rounded-2xl bg-foreground/90 dark:bg-white/15 text-background dark:text-foreground backdrop-blur-md shadow-glass-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/30 dark:hover:bg-white/8'
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
