'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  toggleInvoiceRemindersAction,
  triggerManualReminderAction,
} from '@/app/actions/reminders';
import { cn } from '@/lib/utils';

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

function formatPlMoney(n: number): string {
  return n.toLocaleString('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPlInt(n: number): string {
  return n.toLocaleString('pl-PL', { maximumFractionDigits: 0 });
}

export function OverdueDashboard({ overdueInvoices, stats }: Props) {
  return (
    <div className="pb-10 text-[var(--ff-on-surface)]">
      <div className="mb-10">
        <h1 className="mb-1 text-[30px] font-bold leading-tight tracking-[-0.02em] text-[var(--ff-text-strong)]">
          Przeterminowane
        </h1>
        <p className="text-sm text-[var(--ff-text-muted)]">
          Faktury po terminie płatności • przypomnienia e-mail
        </p>
      </div>

      <div className="mb-[var(--ff-gutter)] grid grid-cols-1 gap-[var(--ff-gutter)] md:grid-cols-3">
        <div className="group relative overflow-hidden rounded-[14px] border border-[var(--ff-border)] bg-[var(--ff-surface)] p-[22px]">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex size-[38px] shrink-0 items-center justify-center rounded-[9px] bg-[color-mix(in_srgb,#f87171_22%,transparent)]">
              <span className="material-symbols-outlined text-[22px] text-red-300">
                error
              </span>
            </div>
            <span className="text-[11px] font-semibold uppercase leading-[1.3] tracking-[0.06em] text-[var(--ff-text-muted)]">
              Liczba przeterminowanych
            </span>
          </div>
          <p className="text-[34px] font-bold leading-none tracking-[-0.02em] tabular-nums">
            {formatPlInt(stats.totalCount)}
          </p>
          <p className="mt-3 text-xs text-[var(--ff-text-dim)]">
            Wymagają działania lub opłacenia
          </p>
        </div>

        <div className="group relative overflow-hidden rounded-[14px] border border-[var(--ff-border)] bg-[var(--ff-surface)] p-[22px]">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex size-[38px] shrink-0 items-center justify-center rounded-[9px] bg-[color-mix(in_srgb,var(--ff-secondary)_20%,transparent)]">
              <span className="material-symbols-outlined text-[22px] text-[var(--ff-secondary)]">
                payments
              </span>
            </div>
            <span className="text-[11px] font-semibold uppercase leading-[1.3] tracking-[0.06em] text-[var(--ff-text-muted)]">
              Suma do odzyskania
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[32px] font-bold leading-none tracking-[-0.02em] tabular-nums">
              {formatPlMoney(stats.totalAmount)}
            </span>
            <span className="text-sm font-medium text-[var(--ff-text-dim)]">
              PLN
            </span>
          </div>
          <p className="mt-3 text-xs text-[var(--ff-text-dim)]">
            Kwoty „do zapłaty” z widoku
          </p>
        </div>

        <div className="relative overflow-hidden rounded-[14px] border border-[var(--ff-border)] bg-[var(--ff-surface)] p-[22px]">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex size-[38px] shrink-0 items-center justify-center rounded-[9px] bg-[color-mix(in_srgb,var(--ff-tertiary)_18%,transparent)]">
              <span className="material-symbols-outlined text-[22px] text-[var(--ff-tertiary)]">
                schedule
              </span>
            </div>
            <span className="text-[11px] font-semibold uppercase leading-[1.3] tracking-[0.06em] text-[var(--ff-text-muted)]">
              Średnie opóźnienie
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[34px] font-bold leading-none tracking-[-0.02em] tabular-nums">
              {formatPlInt(stats.avgDaysOverdue)}
            </span>
            <span className="text-sm font-medium text-[var(--ff-text-dim)]">
              dni
            </span>
          </div>
          <p className="mt-3 text-xs text-[var(--ff-text-dim)]">
            Średnia z bieżącej listy (DSO)
          </p>
        </div>
      </div>

      {overdueInvoices.length === 0 ? (
        <div className="ff-glass-pane rounded-[var(--ff-radius-lg)] px-8 py-16 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--ff-primary)_18%,transparent)]">
            <span className="material-symbols-outlined text-[32px] text-[var(--ff-primary)]">
              check_circle
            </span>
          </div>
          <h3 className="mb-2 text-xl font-bold tracking-tight">
            Wszystkie faktury opłacone w terminie
          </h3>
          <p className="mx-auto max-w-md text-sm text-[var(--ff-text-muted)]">
            Brak pozycji po terminie — gdy pojawią się zaległości, zobaczysz je w
            tabeli poniżej.
          </p>
        </div>
      ) : (
        <div className="ff-glass-pane overflow-hidden rounded-[var(--ff-radius-lg)]">
          <div className="border-b border-[var(--ff-border)] px-[22px] py-[18px]">
            <h2 className="text-[15px] font-semibold text-[var(--ff-text-strong)]">Lista zaległości</h2>
            <p className="mt-1 text-[13px] text-[var(--ff-text-muted)]">
              {formatPlInt(overdueInvoices.length)} pozycji (max. 100) • sortowanie
              wg dni po terminie
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-[14px]">
              <thead>
                <tr className="border-b border-[var(--ff-border)]">
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ff-text-dim)]">
                    Faktura
                  </th>
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ff-text-dim)]">
                    Nabywca
                  </th>
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ff-text-dim)]">
                    Termin
                  </th>
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ff-text-dim)]">
                    Opóźnienie
                  </th>
                  <th className="px-6 py-3.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ff-text-dim)]">
                    Do zapłaty
                  </th>
                  <th className="px-6 py-3.5 text-center text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ff-text-dim)]">
                    Wysłane
                  </th>
                  <th className="px-6 py-3.5 sm:px-8" aria-hidden />
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

  const badgeClass =
    severity === 'critical'
      ? 'border-red-400/25 bg-[color-mix(in_srgb,#f87171_14%,transparent)] text-red-200'
      : severity === 'high'
        ? 'border-[color-mix(in_srgb,var(--ff-secondary)_35%,transparent)] bg-[color-mix(in_srgb,var(--ff-secondary)_12%,transparent)] text-[var(--ff-secondary)]'
        : severity === 'medium'
          ? 'border-amber-400/25 bg-amber-500/10 text-amber-200'
          : 'border-white/10 bg-white/5 text-[color-mix(in_srgb,var(--ff-on-surface-variant)_85%,transparent)]';

  const iconBtn =
    'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-[color-mix(in_srgb,var(--ff-on-surface)_6%,transparent)] text-[var(--ff-on-surface)] transition-colors hover:border-white/20 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--ff-primary)_45%,transparent)] disabled:pointer-events-none disabled:opacity-40';

  return (
    <tr className="border-b border-[var(--ff-row-divider)] transition-colors last:border-0 hover:bg-[var(--ff-row-hover)]">
      <td className="px-6 py-4 sm:px-8">
        <Link
          href={`/invoices/${invoice.id}`}
          className="font-mono text-[14px] font-semibold text-[var(--ff-primary)] underline-offset-2 hover:underline"
        >
          {invoice.internal_number || '—'}
        </Link>
      </td>
      <td className="px-6 py-4 sm:px-8">
        <div className="font-medium text-[var(--ff-on-surface)]">
          {invoice.buyer_name || '—'}
        </div>
        {invoice.buyer_nip ? (
          <div className="mt-0.5 font-mono text-[12px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_50%,transparent)]">
            {invoice.buyer_nip}
          </div>
        ) : null}
      </td>
      <td className="px-6 py-4 text-[13px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_65%,transparent)] sm:px-8">
        {dueLabel}
      </td>
      <td className="px-6 py-4 sm:px-8">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold',
            badgeClass,
          )}
        >
          {invoice.days_overdue} dni
        </span>
      </td>
      <td className="px-6 py-4 text-right font-semibold tabular-nums text-[var(--ff-on-surface)] sm:px-8">
        {formatPlMoney(invoice.amount_due)}{' '}
        <span className="text-[12px] font-bold text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)]">
          PLN
        </span>
      </td>
      <td className="px-6 py-4 text-center sm:px-8">
        <span className="inline-flex items-center justify-center gap-1 text-[12px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)]">
          <span className="material-symbols-outlined text-[16px] leading-none">
            mail
          </span>
          {invoice.reminders_sent_count}/3
        </span>
      </td>
      <td className="px-6 py-4 sm:px-8">
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={handleSendReminder}
            disabled={
              isSending ||
              invoice.reminders_paused ||
              !(invoice.buyer_email?.trim())
            }
            className={iconBtn}
            title="Wyślij przypomnienie teraz"
            aria-label="Wyślij przypomnienie teraz"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <span className="material-symbols-outlined text-[18px] leading-none" aria-hidden>
                send
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={handleTogglePause}
            disabled={isPausing}
            className={iconBtn}
            title={
              invoice.reminders_paused
                ? 'Wznów przypomnienia'
                : 'Wstrzymaj przypomnienia'
            }
            aria-label={
              invoice.reminders_paused
                ? 'Wznów przypomnienia'
                : 'Wstrzymaj przypomnienia'
            }
          >
            {isPausing ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <span className="material-symbols-outlined text-[18px] leading-none" aria-hidden>
                {invoice.reminders_paused ? 'play_arrow' : 'pause'}
              </span>
            )}
          </button>
        </div>
      </td>
    </tr>
  );
}
