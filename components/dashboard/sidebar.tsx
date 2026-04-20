'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  FileText,
  Inbox,
  Users,
  BarChart3,
  Settings,
  PlusCircle,
  LayoutGrid,
  Home,
  LogIn,
  UserPlus,
  KeyRound,
  ClipboardList,
  FileStack,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Krótki opis pod linkiem (np. redirect przy sesji) */
  hint?: string;
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
      { href: '/settings/ksef', label: 'Ustawienia KSeF', icon: Shield },
    ],
  },
  {
    title: 'Strona i konto',
    items: [
      { href: '/', label: 'Strona startowa', icon: Home },
      {
        href: '/login',
        label: 'Logowanie',
        icon: LogIn,
        hint: 'Z sesją → faktury',
      },
      {
        href: '/register',
        label: 'Rejestracja',
        icon: UserPlus,
        hint: 'Z sesją → faktury',
      },
      { href: '/forgot-password', label: 'Reset hasła', icon: KeyRound },
      {
        href: '/onboarding',
        label: 'Onboarding',
        icon: ClipboardList,
        hint: 'Z tenantem → faktury',
      },
    ],
  },
];

interface SidebarProps {
  /** Pierwsza faktura wystawiona — link do `/invoices/[id]` do testów */
  sampleInvoiceId?: string | null;
}

export function Sidebar({ sampleInvoiceId }: SidebarProps) {
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
                        {item.hint && (
                          <span
                            className={cn(
                              'pl-7 text-[11px] leading-tight',
                              active ? 'text-white/70' : 'text-gray-400'
                            )}
                          >
                            {item.hint}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {sampleInvoiceId && (
            <div>
              <h3 className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Przykład dynamiczny
              </h3>
              <ul className="space-y-0.5">
                <li>
                  <Link
                    href={`/invoices/${sampleInvoiceId}`}
                    className={cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition',
                      pathname === `/invoices/${sampleInvoiceId}`
                        ? 'bg-black text-white'
                        : 'text-gray-700 hover:bg-gray-200'
                    )}
                  >
                    <FileStack className="h-4 w-4 shrink-0" />
                    Szczegóły faktury (ostatnia)
                  </Link>
                </li>
              </ul>
            </div>
          )}
        </nav>
      </div>
    </aside>
  );
}
