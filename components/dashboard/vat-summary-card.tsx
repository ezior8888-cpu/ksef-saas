import { DashboardExportsPdfLink } from '@/components/dashboard/exports-route-client';

/**
 * WŁAŚCICIEL: Bartosz (tor silnika) — rama panelu.
 *
 * Panel „Podsumowanie podatku VAT". Do 30.08.2026 stał wprost w
 * `app/(dashboard)/dashboard/page.tsx`; przeniesiony na `/przeplywy`, bo
 * dashboard oddał całą powierzchnię agentowi FLO. Treść bez zmian — to jest
 * przeprowadzka, nie przeprojektowanie.
 */
export interface VatSummaryCardProps {
  /** „sierpień 2026" — gotowy napis, tu nic nie liczymy. */
  monthName: string;
  netLabel: string;
  vatLabel: string;
  grossLabel: string;
  vatDueLabel: string;
  daysToVatDue: number;
}

export function VatSummaryCard({
  monthName,
  netLabel,
  vatLabel,
  grossLabel,
  vatDueLabel,
  daysToVatDue,
}: VatSummaryCardProps) {
  return (
    <div className="rounded-2xl border border-[var(--ff-border)] bg-[var(--ff-surface)] px-8 py-[30px]">
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[var(--ff-text-strong)]">
            Podsumowanie podatku VAT
          </h2>
          <p className="mt-1.5 text-[13px] text-[var(--ff-text-muted)]">
            {monthName} · deklaracja JPK_V7
          </p>
        </div>
        <DashboardExportsPdfLink />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3">
        <div className="md:pr-7">
          <div className="mb-2.5 text-xs font-semibold uppercase tracking-[0.05em] text-[var(--ff-text-muted)]">
            Netto
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[30px] font-bold leading-none text-[var(--ff-text-strong)] tabular-nums">
              {netLabel}
            </span>
            <span className="text-sm text-[var(--ff-text-dim)]">PLN</span>
          </div>
        </div>
        <div className="mt-6 md:mt-0 md:border-l md:border-[var(--ff-border)] md:px-7">
          <div className="mb-2.5 text-xs font-semibold uppercase tracking-[0.05em] text-[var(--ff-text-muted)]">
            VAT należny
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[30px] font-bold leading-none text-[var(--ff-warn)] tabular-nums">
              {vatLabel}
            </span>
            <span className="text-sm text-[var(--ff-text-dim)]">PLN</span>
          </div>
        </div>
        <div className="mt-6 md:mt-0 md:border-l md:border-[var(--ff-border)] md:px-7">
          <div className="mb-2.5 text-xs font-semibold uppercase tracking-[0.05em] text-[var(--ff-text-muted)]">
            Brutto
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[30px] font-bold leading-none text-[var(--ff-text-strong)] tabular-nums">
              {grossLabel}
            </span>
            <span className="text-sm text-[var(--ff-text-dim)]">PLN</span>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-2.5 rounded-[10px] border border-[var(--ff-warn-border)] bg-[var(--ff-warn-tint)] px-4 py-3 text-[13px] text-[var(--ff-warn)]">
        <span className="material-symbols-outlined text-[16px] leading-none">
          error
        </span>
        <span>
          Termin płatności VAT:{' '}
          <strong className="font-semibold">{vatDueLabel}</strong> — pozostało{' '}
          {daysToVatDue} {daysToVatDue === 1 ? 'dzień' : 'dni'}
        </span>
      </div>
    </div>
  );
}
