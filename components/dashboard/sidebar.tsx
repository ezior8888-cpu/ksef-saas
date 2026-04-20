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
  LayoutGrid,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavSection {
  title: string;
  items: NavItem[];
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

const sections: NavSection[] = [
  {
    title: 'Aplikacja',
    items: [
      { href: '/invoices', label: 'Faktury wystawione', icon: FileText },
      { href: '/invoices/new', label: 'Nowa faktura', icon: PlusCircle },
      { href: '/inbox', label: 'Skrzynka odbiorcza', icon: Inbox },
      { href: '/contractors', label: 'Kontrahenci', icon: Users },
      { href: '/reports', label: 'Raporty', icon: BarChart3 },
      { href: '/settings', label: 'Ustawienia', icon: Settings },
      { href: '/settings/account', label: 'Konto', icon: UserCircle },
      { href: '/settings/accountant', label: 'Księgowa', icon: KeyRound },
      { href: '/settings/ksef', label: 'Ustawienia KSeF', icon: Shield },
      { href: '/settings/audit', label: 'Historia aktywności', icon: History },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex w-72 shrink-0 flex-col border-r bg-gray-50">
      <div className="flex flex-1 flex-col overflow-hidden p-4 pt-4">
        <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <LayoutGrid className="h-3.5 w-3.5" />
          Mapa stron
        </p>

        <nav className="flex-1 space-y-6 overflow-y-auto pr-1 min-h-0">
          {sections.map((section) => (
            <div key={section.title}>
              <h3 className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                {section.title}
              </h3>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActivePath(pathname, item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          'flex flex-col gap-0.5 rounded-md px-3 py-2 text-sm transition',
                          active
                            ? 'bg-black text-white'
                            : 'text-gray-700 hover:bg-gray-200'
                        )}
                      >
                        <span className="flex items-center gap-3">
                          <Icon className="h-4 w-4 shrink-0" />
                          {item.label}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
}
