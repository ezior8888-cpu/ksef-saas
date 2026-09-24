import {
  formatPlInt,
  formatPlMoney,
  type MonthlyFigures,
} from '@/lib/dashboard/monthly-figures';

/**
 * Karta „liczby miesiąca”.
 *
 * DWA MIEJSCA, JEDEN KOMPONENT. Na komputerze stoi w prawej szynie
 * dashboardu (układ z sierpniowej makiety). Na telefonie szyny nie ma —
 * schodziłaby pod wątek agenta, czyli poza ekran przy zablokowanej wysokości
 * — więc te same liczby mieszkają na `/przeplywy`, pod zakładką „Miesiąc”
 * w dolnej nawigacji. Stąd wyprowadzka z folderu trasy do `components/`.
 */

export function MonthlyFiguresCard({ figures }: { figures: MonthlyFigures }) {
  return (
    <section className="rounded-2xl border border-[var(--ff-border)] bg-[var(--ff-surface)] px-4 py-4">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--ff-text-muted)]">
        {figures.monthName}
      </h2>

      <dl className="mt-3.5 flex flex-col gap-3.5">
        <StatRow
          icon="description"
          label="Wystawione faktury"
          sublabel={
            figures.hasPrevMonth
              ? `Poprzedni miesiąc: ${formatPlInt(figures.prevIssuedCount)}`
              : 'Pierwszy miesiąc'
          }
          value={formatPlInt(figures.issuedCount)}
          accent
        />
        <StatRow
          icon="check_circle"
          label="Przyjęte przez KSeF"
          sublabel={`${formatPlInt(figures.pendingCount)} oczekuje`}
          value={formatPlInt(figures.acceptedCount)}
          accent
        />
        <StatRow
          icon="credit_card"
          label="VAT należny"
          sublabel="JPK_V7"
          value={formatPlMoney(figures.totalVat)}
          tone="warn"
        />
        <StatRow
          icon="trending_up"
          label="Sprzedaż brutto"
          sublabel={
            figures.isBestMonthOfYear
              ? 'Najlepszy wynik w roku'
              : figures.hasPrevMonth
                ? `${figures.momGrossPct >= 0 ? '+' : ''}${figures.momGrossPct}% m/m`
                : 'Pierwszy miesiąc ze sprzedażą'
          }
          value={formatPlMoney(figures.totalGross)}
        />
      </dl>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--ff-border)] pt-3.5">
        <span className="text-[12.5px] font-medium text-[var(--ff-text-soft)]">
          Termin VAT · {figures.vatDueLabel}
        </span>
        <span className="shrink-0 rounded-full bg-[var(--ff-warn-tint)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ff-warn)]">
          {figures.daysToVatDue} {figures.daysToVatDue === 1 ? 'dzień' : 'dni'}
        </span>
      </div>
    </section>
  );
}

/** Wiersz szyny: ikona, etykieta z podetykietą, liczba po prawej. */
function StatRow({
  icon,
  label,
  sublabel,
  value,
  accent = false,
  tone,
}: {
  icon: string;
  label: string;
  sublabel: string;
  value: string;
  accent?: boolean;
  tone?: 'warn';
}) {
  const valueColor =
    tone === 'warn'
      ? 'text-[var(--ff-warn)]'
      : accent
        ? 'text-[var(--ff-accent)]'
        : 'text-[var(--ff-text-strong)]';

  return (
    <div className="flex items-center gap-2.5">
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-[var(--ff-surface-chip)] text-[var(--ff-text-muted)]"
        aria-hidden
      >
        <span className="material-symbols-outlined text-[18px]">{icon}</span>
      </span>
      <div className="min-w-0 flex-1">
        <dt className="truncate text-[13px] font-medium text-[var(--ff-text-soft)]">
          {label}
        </dt>
        <dd className="truncate text-[11.5px] text-[var(--ff-text-dim)]">
          {sublabel}
        </dd>
      </div>
      <span
        className={`shrink-0 text-[17px] font-semibold tabular-nums ${valueColor}`}
      >
        {value}
      </span>
    </div>
  );
}
