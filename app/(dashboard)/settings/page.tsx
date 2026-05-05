import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  User,
  Bell,
  Building2,
  ShieldCheck,
  History,
  UserCog,
  ChevronRight,
  AlertTriangle,
  Mail,
} from 'lucide-react';
import { DeleteAccountSection } from '@/components/settings/delete-account';

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id, role, tenants(name, nip, address)')
    .eq('id', user.id)
    .single();

  const tenant = Array.isArray(userData?.tenants)
    ? userData.tenants[0]
    : userData?.tenants;

  const isOwner = userData?.role === 'owner';

  const settingsLinks = [
    {
      href: '/settings/ksef',
      label: 'Ustawienia KSeF',
      description: 'Certyfikat i połączenie z systemem KSeF',
      icon: ShieldCheck,
    },
    ...(isOwner
      ? [
          {
            href: '/settings/reminders',
            label: 'Wkurzacz Dłużników',
            description: 'Automatyczne przypomnienia o płatnościach',
            icon: Mail,
          },
        ]
      : []),
    {
      href: '/settings/accountant',
      label: 'Co-Pilot Księgowego',
      description: 'Auto-wysyłka paczek do biura rachunkowego',
      icon: UserCog,
    },
    {
      href: '/settings/notifications',
      label: 'Powiadomienia',
      description: 'Push notifications na telefon i desktop',
      icon: Bell,
    },
    {
      href: '/settings/audit',
      label: 'Historia aktywności',
      description: 'Audit trail wszystkich operacji w koncie',
      icon: History,
    },
  ];

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-4xl font-display font-semibold tracking-tighter-display">
          Ustawienia
        </h1>
        <p className="mt-2 text-muted-foreground">
          Zarządzaj kontem, firmą i bezpieczeństwem
        </p>
      </div>

      {/* Profil użytkownika */}
      <div className="rounded-3xl border border-glass-border bg-glass-white backdrop-blur-glass shadow-glass p-7 lg:p-8 space-y-5">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-2xl bg-foreground/5 flex items-center justify-center shrink-0">
            <User className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="flex-1 space-y-4">
            <div>
              <h2 className="text-lg font-display font-semibold tracking-tighter-text">
                Profil użytkownika
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Twoje dane konta i rola w organizacji
              </p>
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Email
                </dt>
                <dd className="font-medium mt-1 truncate">{user.email}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Rola
                </dt>
                <dd className="mt-1">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-foreground/5 border border-glass-border text-xs font-medium backdrop-blur-glass-sm capitalize">
                    {userData?.role ?? 'user'}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  ID konta
                </dt>
                <dd className="font-mono text-xs text-muted-foreground mt-1">
                  {user.id.slice(0, 8)}...{user.id.slice(-4)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Konto utworzone
                </dt>
                <dd className="text-sm text-muted-foreground mt-1">
                  {new Date(user.created_at).toLocaleDateString('pl-PL', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {/* Dane firmy */}
      <div className="rounded-3xl border border-glass-border bg-glass-white backdrop-blur-glass shadow-glass p-7 lg:p-8 space-y-5">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-2xl bg-foreground/5 flex items-center justify-center shrink-0">
            <Building2 className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="flex-1 space-y-4">
            <div>
              <h2 className="text-lg font-display font-semibold tracking-tighter-text">
                Dane firmy
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Informacje o Twojej firmie z bazy GUS
              </p>
            </div>

            <dl className="grid grid-cols-1 gap-4 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Nazwa firmy
                </dt>
                <dd className="font-medium mt-1">
                  {tenant?.name ?? 'Bez nazwy'}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  NIP
                </dt>
                <dd className="font-mono mt-1">{tenant?.nip ?? '-'}</dd>
              </div>
              {tenant?.address &&
                typeof tenant.address === 'object' &&
                tenant.address !== null && (
                  <div>
                    <dt className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                      Adres siedziby
                    </dt>
                    <dd className="text-foreground mt-1 leading-relaxed">
                      {
                        (
                          tenant.address as {
                            addressLine1?: string;
                            addressLine2?: string;
                          }
                        ).addressLine1
                      }
                      <br />
                      {
                        (
                          tenant.address as {
                            addressLine1?: string;
                            addressLine2?: string;
                          }
                        ).addressLine2
                      }
                    </dd>
                  </div>
                )}
            </dl>
          </div>
        </div>
      </div>

      {/* Linki do podstron */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider px-2">
          Konfiguracja
        </h2>
        <div className="rounded-3xl border border-glass-border bg-glass-white backdrop-blur-glass shadow-glass overflow-hidden">
          {settingsLinks.map((link, idx) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-4 p-5 hover:bg-foreground/2 transition-colors duration-150 ${
                  idx !== settingsLinks.length - 1
                    ? 'border-b border-glass-border/50'
                    : ''
                }`}
              >
                <div className="h-10 w-10 rounded-2xl bg-foreground/5 flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{link.label}</p>
                  <p className="text-sm text-muted-foreground truncate">
                    {link.description}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
              </Link>
            );
          })}
        </div>
      </div>

      {/* Niebezpieczna strefa - tylko owner */}
      {isOwner && (
        <div className="rounded-3xl border border-red-500/20 bg-red-500/5 backdrop-blur-glass shadow-glass p-7 lg:p-8 space-y-5">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-2xl bg-red-500/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <h2 className="text-lg font-display font-semibold tracking-tighter-text">
                  Niebezpieczna strefa
                </h2>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  Trwałe usunięcie konta wraz ze wszystkimi danymi.
                  Operacja nieodwracalna po 30 dniach.
                </p>
              </div>
              <DeleteAccountSection tenantNip={tenant?.nip ?? ''} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
