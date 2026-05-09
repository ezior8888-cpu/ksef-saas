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
        <h1 className="mb-1 text-[40px] font-bold leading-[1.2] tracking-[-0.02em]">
          Przeterminowane
        </h1>
        <p className="text-[16px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_60%,transparent)]">
          Faktury po terminie płatności • przypomnienia e-mail
        </p>
      </div>

      <div className="mb-[var(--ff-gutter)] grid grid-cols-1 gap-[var(--ff-gutter)] md:grid-cols-3">
        <div className="ff-glass-pane ff-glass-pane-hover group relative overflow-hidden rounded-[var(--ff-radius-lg)] p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,#f87171_22%,transparent)]">
              <span className="material-symbols-outlined text-[22px] text-red-300">
                error
              </span>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[color-mix(in_srgb,var(--ff-on-surface-variant)_90%,transparent)]">
              Liczba przeterminowanych
            </span>
          </div>
          <p className="text-[48px] font-bold leading-none tabular-nums">
            {formatPlInt(stats.totalCount)}
          </p>
          <p className="mt-2 text-[12px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_45%,transparent)]">
            Wymagają działania lub opłacenia
          </p>
          <div className="pointer-events-none absolute -bottom-4 -right-4 opacity-[0.06] transition-opacity group-hover:opacity-[0.1]">
            <span className="material-symbols-outlined text-[120px] leading-none">
              receipt_long
            </span>
          </div>
        </div>

        <div className="ff-glass-pane ff-glass-pane-hover group relative overflow-hidden rounded-[var(--ff-radius-lg)] p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--ff-secondary)_20%,transparent)]">
              <span className="material-symbols-outlined text-[22px] text-[var(--ff-secondary)]">
                payments
              </span>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[color-mix(in_srgb,var(--ff-on-surface-variant)_90%,transparent)]">
              Suma do odzyskania
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[32px] font-bold leading-none tabular-nums">
              {formatPlMoney(stats.totalAmount)}
            </span>
            <span className="text-sm font-bold text-[color-mix(in_srgb,var(--ff-on-surface-variant)_85%,transparent)]">
              PLN
            </span>
          </div>
          <p className="mt-2 text-[12px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_45%,transparent)]">
            Kwoty „do zapłaty” z widoku
          </p>
        </div>

        <div className="ff-glass-pane ff-glass-pane-hover relative overflow-hidden rounded-[var(--ff-radius-lg)] p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--ff-tertiary)_18%,transparent)]">
              <span className="material-symbols-outlined text-[22px] text-[var(--ff-tertiary)]">
                schedule
              </span>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[color-mix(in_srgb,var(--ff-on-surface-variant)_90%,transparent)]">
              Średnie opóźnienie
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[48px] font-bold leading-none tabular-nums">
              {formatPlInt(stats.avgDaysOverdue)}
            </span>
            <span className="text-sm font-bold text-[color-mix(in_srgb,var(--ff-on-surface-variant)_85%,transparent)]">
              dni
            </span>
          </div>
          <p className="mt-2 text-[12px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_45%,transparent)]">
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
          <p className="mx-auto max-w-md text-[15px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)]">
            Brak pozycji po terminie — gdy pojawią się zaległości, zobaczysz je w
            tabeli poniżej.
          </p>
        </div>
      ) : (
        <div className="ff-glass-pane overflow-hidden rounded-[var(--ff-radius-lg)]">
          <div className="border-b border-white/10 px-6 py-5 sm:px-8">
            <h2 className="text-xl font-bold tracking-tight">Lista zaległości</h2>
            <p className="mt-1 text-[14px] text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)]">
              {formatPlInt(overdueInvoices.length)} pozycji (max. 100) • sortowanie
              wg dni po terminie
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-[14px]">
              <thead>
                <tr className="border-b border-white/10 bg-[color-mix(in_srgb,var(--ff-on-surface)_4%,transparent)]">
                  <th className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-widest text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)] sm:px-8">
                    Faktura
                  </th>
                  <th className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-widest text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)] sm:px-8">
                    Nabywca
                  </th>
                  <th className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-widest text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)] sm:px-8">
                    Termin
                  </th>
                  <th className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-widest text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)] sm:px-8">
                    Opóźnienie
                  </th>
                  <th className="px-6 py-3.5 text-right text-[10px] font-bold uppercase tracking-widest text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)] sm:px-8">
                    Do zapłaty
                  </th>
                  <th className="px-6 py-3.5 text-center text-[10px] font-bold uppercase tracking-widest text-[color-mix(in_srgb,var(--ff-on-surface-variant)_55%,transparent)] sm:px-8">
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
    <tr className="border-b border-white/6 transition-colors last:border-0 hover:bg-[color-mix(in_srgb,var(--ff-on-surface)_4%,transparent)]">
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
