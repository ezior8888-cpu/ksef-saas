'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import {
  AlertCircle,
  Clock,
  Loader2,
  Mail,
  Pause,
  Play,
  Send,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  toggleInvoiceRemindersAction,
  triggerManualReminderAction,
} from '@/app/actions/reminders';
import { Button } from '@/components/ui/button';

export interface OverdueInvoice {
  id: string;
  internal_number: string;
  payment_due_date: string;
  gross_total: number;
  amount_due: number;
  days_overdue: number;
  buyer_name: string;
  buyer_nip: string | null;
  buyer_email: string | null;
  reminders_paused: boolean;
  reminders_sent_count: number;
}

interface Props {
  overdueInvoices: OverdueInvoice[];
  stats: {
    totalCount: number;
    totalAmount: number;
    avgDaysOverdue: number;
  };
}

export function OverdueDashboard({ overdueInvoices, stats }: Props) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-display font-semibold tracking-tighter-display">
          Przeterminowane
        </h1>
        <p className="mt-2 text-muted-foreground">
          Faktury po terminie płatności • Wkurzacz Dłużników aktywny
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="space-y-3 rounded-3xl border border-glass-border bg-glass-white p-6 shadow-glass backdrop-blur-glass">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-500/10">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Liczba przeterminowanych
            </p>
            <p className="mt-1 font-display text-3xl font-semibold tabular-nums tracking-tighter-display">
              {stats.totalCount}
            </p>
          </div>
        </div>

        <div className="space-y-3 rounded-3xl border border-glass-border bg-glass-white p-6 shadow-glass backdrop-blur-glass">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-500/10">
            <TrendingUp className="h-5 w-5 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Suma do odzyskania
            </p>
            <p className="mt-1 font-display text-3xl font-semibold tabular-nums tracking-tighter-display">
              {stats.totalAmount.toFixed(2)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">PLN</p>
          </div>
        </div>

        <div className="space-y-3 rounded-3xl border border-glass-border bg-glass-white p-6 shadow-glass backdrop-blur-glass">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-500/10">
            <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Średnie opóźnienie (DSO)
            </p>
            <p className="mt-1 font-display text-3xl font-semibold tabular-nums tracking-tighter-display">
              {stats.avgDaysOverdue}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">dni</p>
          </div>
        </div>
      </div>

      {overdueInvoices.length === 0 ? (
        <div className="rounded-3xl border border-glass-border bg-glass-white py-16 text-center shadow-glass backdrop-blur-glass">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-green-500/10">
            <AlertCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
          </div>
          <h3 className="mb-1 font-display text-lg font-semibold tracking-tighter-text">
            Wszystkie faktury opłacone w terminie!
          </h3>
          <p className="text-sm text-muted-foreground">
            Świetna robota — żadnych zaległych płatności
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-glass-border bg-glass-white shadow-glass backdrop-blur-glass">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b border-glass-border bg-foreground/3">
                <tr className="text-left">
                  <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Faktura
                  </th>
                  <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Nabywca
                  </th>
                  <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Termin
                  </th>
                  <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Opóźnienie
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Do zapłaty
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Wysłane
                  </th>
                  <th className="px-6 py-4" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {overdueInvoices.map((inv) => (
                  <OverdueRow key={inv.id} invoice={inv} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function OverdueRow({ invoice }: { invoice: OverdueInvoice }) {
  const router = useRouter();
  const [isSending, startSending] = useTransition();
  const [isPausing, startPausing] = useTransition();

  const severity =
    invoice.days_overdue >= 30
      ? 'critical'
      : invoice.days_overdue >= 14
        ? 'high'
        : invoice.days_overdue >= 7
          ? 'medium'
          : 'low';

  const handleSendReminder = () => {
    startSending(async () => {
      const result = await triggerManualReminderAction(invoice.id);
      if (result.success) {
        toast.success('Przypomnienie wysłane');
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleTogglePause = () => {
    startPausing(async () => {
      const reason = invoice.reminders_paused
        ? undefined
        : (prompt('Powód wstrzymania przypomnień (opcjonalnie):') ?? undefined);

      const result = await toggleInvoiceRemindersAction(
        invoice.id,
        !invoice.reminders_paused,
        reason,
      );
      if (result.success) {
        toast.success(invoice.reminders_paused ? 'Wznowiono' : 'Wstrzymano');
        router.refresh();
      } else {
        toast.error(result.error ?? 'Nie udało się zmienić ustawienia');
      }
    });
  };

  const dueLabel = invoice.payment_due_date.trim()
    ? new Date(`${invoice.payment_due_date.slice(0, 10)}T12:00:00.000Z`).toLocaleDateString(
        'pl-PL',
      )
    : '—';

  return (
    <tr className="border-b border-glass-border/50 transition-colors last:border-0 hover:bg-foreground/2">
      <td className="px-6 py-4">
        <Link
          href={`/invoices/${invoice.id}`}
          className="font-mono text-sm font-medium transition-colors hover:text-accent"
        >
          {invoice.internal_number || '—'}
        </Link>
      </td>
      <td className="px-6 py-4">
        <div className="font-medium">{invoice.buyer_name || '—'}</div>
        {invoice.buyer_nip ? (
          <div className="font-mono text-xs text-muted-foreground">
            {invoice.buyer_nip}
          </div>
        ) : null}
      </td>
      <td className="px-6 py-4 text-xs text-muted-foreground">{dueLabel}</td>
      <td className="px-6 py-4">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium backdrop-blur-glass-sm ${
            severity === 'critical'
              ? 'border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400'
              : severity === 'high'
                ? 'border-orange-500/20 bg-orange-500/10 text-orange-700 dark:text-orange-400'
                : severity === 'medium'
                  ? 'border-yellow-500/20 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400'
                  : 'border-glass-border bg-foreground/5 text-muted-foreground'
          }`}
        >
          {invoice.days_overdue} dni
        </span>
      </td>
      <td className="px-6 py-4 text-right font-medium tabular-nums">
        {Number(invoice.amount_due).toFixed(2)} PLN
      </td>
      <td className="px-6 py-4 text-center">
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Mail className="h-3 w-3 shrink-0" />
          {invoice.reminders_sent_count}/3
        </span>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSendReminder}
            disabled={
              isSending ||
              invoice.reminders_paused ||
              !(invoice.buyer_email?.trim())
            }
            className="h-8 w-8 p-0"
            title="Wyślij przypomnienie teraz"
          >
            {isSending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleTogglePause}
            disabled={isPausing}
            className="h-8 w-8 p-0"
            title={
              invoice.reminders_paused
                ? 'Wznów przypomnienia'
                : 'Wstrzymaj przypomnienia'
            }
          >
            {isPausing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : invoice.reminders_paused ? (
              <Play className="h-3.5 w-3.5" />
            ) : (
              <Pause className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </td>
    </tr>
  );
}
