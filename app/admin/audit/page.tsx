import Link from 'next/link';
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { searchAuditLogs, type AuditLogRow } from '@/lib/admin/audit';

import { AuditFilters } from './_components/audit-filters';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 100;

interface SearchParams {
  action?: string;
  userId?: string;
  tenantId?: string;
  from?: string;
  to?: string;
  page?: string;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function fmtMetadata(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object') return '';
  const obj = metadata as Record<string, unknown>;
  return Object.entries(obj)
    .filter(([k]) => k !== 'source')
    .slice(0, 5)
    .map(([k, v]) => {
      const valStr = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return `${k}=${valStr.length > 40 ? valStr.slice(0, 40) + '…' : valStr}`;
    })
    .join(' · ');
}

export default async function AdminAuditPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await props.searchParams;
  const page = Math.max(0, Number.parseInt(params.page ?? '0', 10) || 0);

  // ISO datetime z `<input type="datetime-local">` ma format `YYYY-MM-DDTHH:MM`,
  // bez TZ. Doklejmy `:00` jeśli brakuje sekund — Postgres TIMESTAMPTZ akceptuje.
  const normalizeDt = (raw: string | undefined): string | undefined => {
    if (!raw) return undefined;
    return raw.length === 16 ? `${raw}:00` : raw;
  };

  const { items, total } = await searchAuditLogs({
    action: params.action,
    userId: params.userId,
    tenantId: params.tenantId,
    from: normalizeDt(params.from),
    to: normalizeDt(params.to),
    page,
    pageSize: PAGE_SIZE,
  }).catch(() => ({ items: [], total: 0, page: 0, pageSize: PAGE_SIZE }));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tighter-display">
          Audit log
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {total > 0
            ? `${total.toLocaleString('pl-PL')} wpisów po filtrze. Maks. 500/strona.`
            : 'Brak wpisów. Spróbuj zmienić filtry.'}
        </p>
      </header>

      <AuditFilters />

      {items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Brak wpisów"
          description="Zmień filtry albo poszerz zakres dat."
        />
      ) : (
        <>
          <AuditTable items={items} />
          {totalPages > 1 ? (
            <Pagination page={page} totalPages={totalPages} params={params} />
          ) : null}
        </>
      )}
    </div>
  );
}

function AuditTable({ items }: { items: AuditLogRow[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-glass-border bg-foreground/3 backdrop-blur-glass">
      <table className="w-full text-sm">
        <thead className="border-b border-glass-border">
          <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Czas</th>
            <th className="px-4 py-2.5 font-medium">Action</th>
            <th className="px-4 py-2.5 font-medium">Entity</th>
            <th className="px-4 py-2.5 font-medium">User</th>
            <th className="px-4 py-2.5 font-medium">Tenant</th>
            <th className="px-4 py-2.5 font-medium">Metadata</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr
              key={row.id}
              className="border-b border-glass-border last:border-0 hover:bg-foreground/5"
            >
              <td className="px-4 py-2 font-mono text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                {fmtDate(row.createdAt)}
              </td>
              <td className="px-4 py-2">
                <Badge variant="outline" className="font-mono text-xs">
                  {row.action}
                </Badge>
              </td>
              <td className="px-4 py-2 text-xs">
                {row.entityType ? (
                  <span>
                    {row.entityType}
                    {row.entityId ? (
                      <span className="text-muted-foreground">
                        :{row.entityId.slice(0, 8)}…
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-4 py-2 text-xs font-mono">
                {row.userId ? (
                  <Link
                    href={`/admin/users/${row.userId}`}
                    className="text-foreground hover:underline"
                  >
                    {row.userId.slice(0, 8)}…
                  </Link>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-4 py-2 text-xs font-mono">
                {row.tenantId ? (
                  <span className="text-muted-foreground">
                    {row.tenantId.slice(0, 8)}…
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-4 py-2 text-xs text-muted-foreground max-w-md break-all">
                {fmtMetadata(row.metadata)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  params,
}: {
  page: number;
  totalPages: number;
  params: SearchParams;
}) {
  const baseParams = new URLSearchParams();
  if (params.action) baseParams.set('action', params.action);
  if (params.userId) baseParams.set('userId', params.userId);
  if (params.tenantId) baseParams.set('tenantId', params.tenantId);
  if (params.from) baseParams.set('from', params.from);
  if (params.to) baseParams.set('to', params.to);

  const linkFor = (p: number) => {
    const x = new URLSearchParams(baseParams);
    if (p > 0) x.set('page', String(p));
    return `/admin/audit?${x.toString()}`;
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">
        Strona {page + 1} z {totalPages}
      </p>
      <div className="flex items-center gap-1">
        {page > 0 ? (
          <Link
            href={linkFor(page - 1)}
            className="inline-flex items-center gap-1 rounded-xl border border-glass-border bg-foreground/3 px-3 py-1.5 text-xs font-medium hover:bg-foreground/5"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Poprzednia
          </Link>
        ) : null}
        {page < totalPages - 1 ? (
          <Link
            href={linkFor(page + 1)}
            className="inline-flex items-center gap-1 rounded-xl border border-glass-border bg-foreground/3 px-3 py-1.5 text-xs font-medium hover:bg-foreground/5"
          >
            Następna
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
