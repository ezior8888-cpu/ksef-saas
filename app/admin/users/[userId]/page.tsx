import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Ban,
  Building2,
  CheckCircle2,
  ChevronLeft,
  Clock,
  FileText,
  Mail,
  Receipt,
  ShieldCheck,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { getAdminUserDetail } from '@/lib/admin/users';

import { listUserPayments } from './billing-actions';
import { NotesSection } from './_components/notes-section';
import { PaymentsSection } from './_components/payments-section';
import { UserActions } from './_components/user-actions';

export const dynamic = 'force-dynamic';

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

function fmtAuditMetadata(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object') return '';
  const obj = metadata as Record<string, unknown>;
  const pairs = Object.entries(obj)
    .filter(([k]) => !['source'].includes(k))
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' · ');
  return pairs;
}

export default async function AdminUserDetailPage(props: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await props.params;
  const [detail, payments] = await Promise.all([
    getAdminUserDetail(userId),
    listUserPayments(userId).catch(() => []),
  ]);
  if (!detail) notFound();

  const isSuspended = Boolean(detail.bannedUntil);
  const totalInvoices = detail.memberships.reduce(
    (sum, m) => sum + m.invoiceCount,
    0,
  );
  const totalExpenses = detail.memberships.reduce(
    (sum, m) => sum + m.expenseCount,
    0,
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Lista użytkowników
        </Link>
      </div>

      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-semibold tracking-tighter-display">
              {detail.email ?? '(brak email)'}
            </h1>
            {isSuspended ? (
              <Badge variant="destructive" className="gap-1">
                <Ban className="h-3 w-3" />
                Zawieszony
              </Badge>
            ) : detail.emailConfirmed ? (
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Aktywny
              </Badge>
            ) : (
              <Badge variant="outline">Niezweryfikowany email</Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground font-mono">{userId}</p>
        </div>

        <UserActions
          userId={userId}
          email={detail.email}
          isSuspended={isSuspended}
        />
      </header>

      {/* Stats grid */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Mail} label="Zarejestrowany" value={fmtDate(detail.createdAt)} />
        <Stat icon={Clock} label="Ostatnie logowanie" value={fmtDate(detail.lastSignInAt)} />
        <Stat icon={Receipt} label="Faktur (wszystkie org)" value={String(totalInvoices)} />
        <Stat icon={FileText} label="Wydatków (wszystkie org)" value={String(totalExpenses)} />
      </section>

      {/* Organizations */}
      <section className="space-y-3">
        <h2 className="font-semibold text-lg flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          Organizacje ({detail.memberships.length})
        </h2>
        {detail.memberships.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            User nie należy do żadnej organizacji.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-glass-border bg-foreground/3 backdrop-blur-glass">
            <table className="w-full text-sm">
              <thead className="border-b border-glass-border">
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Organizacja</th>
                  <th className="px-4 py-2.5 font-medium">NIP</th>
                  <th className="px-4 py-2.5 font-medium">Rola</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Dołączył</th>
                  <th className="px-4 py-2.5 font-medium text-right">Faktur</th>
                  <th className="px-4 py-2.5 font-medium text-right">Kosztów</th>
                </tr>
              </thead>
              <tbody>
                {detail.memberships.map((m) => (
                  <tr
                    key={m.organizationId}
                    className="border-b border-glass-border last:border-0"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{m.organizationName}</span>
                        {m.ksefVerified ? (
                          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">{m.organizationNip}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant="outline" className="text-xs">
                        {m.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-xs">{m.status}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {fmtDate(m.joinedAt)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {m.invoiceCount}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {m.expenseCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Payments (Faza 25) */}
      <PaymentsSection payments={payments} />

      {/* Notes */}
      <NotesSection userId={userId} initialNotes={detail.notes} />

      {/* Audit log */}
      <section className="space-y-3">
        <h2 className="font-semibold text-lg flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          Audit log (ostatnich {detail.recentAuditLogs.length})
        </h2>
        {detail.recentAuditLogs.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            Brak akcji w audytach. User był pasywny lub wszystko sprzed retencji.
          </p>
        ) : (
          <ul className="space-y-1">
            {detail.recentAuditLogs.map((row) => {
              const meta = fmtAuditMetadata(row.metadata);
              return (
                <li
                  key={row.id}
                  className="flex items-start gap-3 rounded-xl border border-glass-border bg-foreground/3 px-3 py-2 backdrop-blur-glass"
                >
                  <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                    {fmtDate(row.createdAt)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="font-mono text-xs">
                        {row.action}
                      </Badge>
                      {row.entityType ? (
                        <span className="text-xs text-muted-foreground">
                          {row.entityType}
                          {row.entityId ? `:${row.entityId.slice(0, 8)}` : ''}
                        </span>
                      ) : null}
                    </div>
                    {meta ? (
                      <p className="mt-1 text-xs text-muted-foreground break-all">
                        {meta}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-glass-border bg-foreground/3 p-3 backdrop-blur-glass">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p className="mt-1 font-medium text-sm tabular-nums">{value}</p>
    </div>
  );
}
