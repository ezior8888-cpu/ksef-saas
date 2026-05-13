import Link from 'next/link';
import { Ban, CheckCircle2, ChevronLeft, ChevronRight, Mail, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { listAdminUsers, type AdminUserListItem } from '@/lib/admin/users';

import { UsersFilter } from './_components/users-filter';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

interface SearchParams {
  q?: string;
  status?: 'all' | 'active' | 'suspended' | 'unverified';
  page?: string;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pl-PL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtRelativeDate(iso: string | null): string {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m temu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h temu`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d temu`;
  return fmtDate(iso);
}

export default async function AdminUsersPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await props.searchParams;
  const page = Math.max(0, Number.parseInt(params.page ?? '0', 10) || 0);
  const { items, total } = await listAdminUsers({
    q: params.q,
    status: params.status,
    page,
    pageSize: PAGE_SIZE,
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tighter-display">
            Użytkownicy
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total} {total === 1 ? 'konto' : total < 5 ? 'konta' : 'kont'} po
            filtrze. Klik na wiersz otwiera profil.
          </p>
        </div>
      </header>

      <UsersFilter />

      {items.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="Nic nie znaleziono"
          description={
            params.q
              ? `Brak userów pasujących do „${params.q}". Sprawdź pisownię albo zmień status.`
              : 'Brak userów w tym filtrze.'
          }
        />
      ) : (
        <>
          <UsersTable items={items} />

          {totalPages > 1 ? (
            <Pagination page={page} totalPages={totalPages} searchParams={params} />
          ) : null}
        </>
      )}
    </div>
  );
}

function UsersTable({ items }: { items: AdminUserListItem[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-glass-border bg-foreground/3 backdrop-blur-glass">
      <table className="w-full text-sm">
        <thead className="border-b border-glass-border bg-foreground/3">
          <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-3 font-medium">Email</th>
            <th className="px-4 py-3 font-medium">Główna organizacja</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Zarejestrowany</th>
            <th className="px-4 py-3 font-medium">Ostatnie logowanie</th>
          </tr>
        </thead>
        <tbody>
          {items.map((u) => (
            <tr
              key={u.userId}
              className="border-b border-glass-border last:border-0 transition-colors hover:bg-foreground/5"
            >
              <td className="px-4 py-3">
                <Link
                  href={`/admin/users/${u.userId}`}
                  className="font-medium text-foreground hover:underline"
                >
                  {u.email ?? '(brak email)'}
                </Link>
                {u.orgCount > 1 ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    +{u.orgCount - 1} {u.orgCount - 1 === 1 ? 'inna org' : 'innych org'}
                  </p>
                ) : null}
              </td>
              <td className="px-4 py-3">
                {u.primaryOrgName ? (
                  <div className="space-y-0.5">
                    <p className="font-medium">{u.primaryOrgName}</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      NIP {u.primaryOrgNip}
                    </p>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground italic">
                    Brak organizacji
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <StatusBadges
                  bannedUntil={u.bannedUntil}
                  emailConfirmed={u.emailConfirmed}
                  ksefVerified={u.primaryOrgVerified}
                />
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground">
                {fmtRelativeDate(u.createdAt)}
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground">
                {fmtRelativeDate(u.lastSignInAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadges({
  bannedUntil,
  emailConfirmed,
  ksefVerified,
}: {
  bannedUntil: string | null;
  emailConfirmed: boolean;
  ksefVerified: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {bannedUntil ? (
        <Badge variant="destructive" className="gap-1 text-xs">
          <Ban className="h-3 w-3" />
          Zawieszony
        </Badge>
      ) : null}
      {!emailConfirmed ? (
        <Badge variant="outline" className="gap-1 text-xs">
          Email niezwer.
        </Badge>
      ) : null}
      {emailConfirmed && !bannedUntil ? (
        <Badge variant="secondary" className="gap-1 text-xs">
          <CheckCircle2 className="h-3 w-3" />
          Aktywny
        </Badge>
      ) : null}
      {ksefVerified ? (
        <Badge variant="outline" className="gap-1 text-xs text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
          <ShieldCheck className="h-3 w-3" />
          KSeF
        </Badge>
      ) : null}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  searchParams,
}: {
  page: number;
  totalPages: number;
  searchParams: SearchParams;
}) {
  const baseParams = new URLSearchParams();
  if (searchParams.q) baseParams.set('q', searchParams.q);
  if (searchParams.status) baseParams.set('status', searchParams.status);

  const prevHref = (() => {
    if (page === 0) return null;
    const p = new URLSearchParams(baseParams);
    if (page - 1 > 0) p.set('page', String(page - 1));
    return `/admin/users?${p.toString()}`;
  })();

  const nextHref = (() => {
    if (page >= totalPages - 1) return null;
    const p = new URLSearchParams(baseParams);
    p.set('page', String(page + 1));
    return `/admin/users?${p.toString()}`;
  })();

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">
        Strona {page + 1} z {totalPages}
      </p>
      <div className="flex items-center gap-1">
        {prevHref ? (
          <Link
            href={prevHref}
            className="inline-flex items-center gap-1 rounded-xl border border-glass-border bg-foreground/3 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-foreground/5"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Poprzednia
          </Link>
        ) : (
          <span className="inline-flex cursor-not-allowed items-center gap-1 rounded-xl border border-glass-border px-3 py-1.5 text-xs font-medium text-muted-foreground opacity-50">
            <ChevronLeft className="h-3.5 w-3.5" />
            Poprzednia
          </span>
        )}
        {nextHref ? (
          <Link
            href={nextHref}
            className="inline-flex items-center gap-1 rounded-xl border border-glass-border bg-foreground/3 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-foreground/5"
          >
            Następna
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <span className="inline-flex cursor-not-allowed items-center gap-1 rounded-xl border border-glass-border px-3 py-1.5 text-xs font-medium text-muted-foreground opacity-50">
            Następna
            <ChevronRight className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
    </div>
  );
}
