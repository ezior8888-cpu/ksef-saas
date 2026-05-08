import { Fragment } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

export type FeatureStatus = 'yes' | 'no' | 'partial' | 'note';

export interface ComparisonRow {
  feature: string;
  ksefSaas: { status: FeatureStatus; note?: string };
  competitor: { status: FeatureStatus; note?: string };
  category?: string;
}

interface Props {
  competitorName: string;
  rows: ComparisonRow[];
}

const STATUS_CONFIG: Record<FeatureStatus, { icon: LucideIcon; className: string }> = {
  yes: {
    icon: CheckCircle2,
    className: 'text-green-600 dark:text-green-400',
  },
  no: { icon: X, className: 'text-red-600 dark:text-red-400' },
  partial: {
    icon: AlertCircle,
    className: 'text-orange-600 dark:text-orange-400',
  },
  note: { icon: AlertCircle, className: 'text-muted-foreground' },
};

export function ComparisonTable({ competitorName, rows }: Props) {
  const grouped = rows.reduce<Record<string, ComparisonRow[]>>((acc, r) => {
    const cat = r.category ?? 'Inne';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(r);
    return acc;
  }, {});

  return (
    <div className="overflow-hidden rounded-3xl border border-glass-border bg-glass-white shadow-glass backdrop-blur-glass">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-glass-border bg-foreground/3">
              <th className="px-6 py-5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Funkcja
              </th>
              <th className="px-6 py-5 text-center">
                <p className="font-display font-semibold tracking-tighter-text">KSeF SaaS</p>
                <p className="mt-0.5 text-xs text-muted-foreground">49 zł/mc</p>
              </th>
              <th className="px-6 py-5 text-center">
                <p className="font-display font-semibold tracking-tighter-text">{competitorName}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">~79 zł/mc</p>
              </th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(grouped).map(([category, categoryRows]) => (
              <Fragment key={category}>
                <tr className="bg-foreground/2">
                  <td
                    colSpan={3}
                    className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {category}
                  </td>
                </tr>
                {categoryRows.map((row, i) => (
                  <tr
                    key={`${category}-${i}`}
                    className="border-b border-glass-border/50 last:border-0"
                  >
                    <td className="px-6 py-4 text-sm">{row.feature}</td>
                    <FeatureCell status={row.ksefSaas} />
                    <FeatureCell status={row.competitor} />
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FeatureCell({ status }: { status: { status: FeatureStatus; note?: string } }) {
  const config = STATUS_CONFIG[status.status];
  const Icon = config.icon;
  return (
    <td className="px-6 py-4 text-center">
      <div className="flex flex-col items-center gap-1">
        <Icon className={`h-5 w-5 ${config.className}`} aria-hidden />
        {status.note ? (
          <span className="text-xs text-muted-foreground">{status.note}</span>
        ) : null}
      </div>
    </td>
  );
}
