import Link from 'next/link';
import type { AccountantPortalData } from '@/lib/accountant/load-accountant-portal';

type InvoiceRow = AccountantPortalData['invoices'][number];

const STATUS_LABELS: Record<string, string> = {
  accepted: 'Przyjęta w KSeF',
  received: 'Odebrana z KSeF',
  offline_queued: 'Offline — czeka na KSeF',
};

function statusLabel(status: string | null): string {
  return status ? STATUS_LABELS[status] ?? status : '—';
}

function directionLabel(direction: string | null): string {
  if (direction === 'outgoing') return 'Sprzedaż';
  if (direction === 'incoming') return 'Koszt';
  return '—';
}

interface Props {
  invoices: InvoiceRow[];
  canDownload: boolean;
  token: string;
}

export function AccountantInvoiceList({
  invoices,
  canDownload,
  token,
}: Props) {
  const tokenSeg = encodeURIComponent(token);

  if (!invoices.length) {
    return (
      <p className="text-sm text-muted-foreground text-center py-12 rounded-3xl border border-white/55 dark:border-white/14 bg-white/45 dark:bg-[rgba(15,10,30,0.45)] backdrop-blur-[24px]">
        Brak dokumentów przyjętych w KSeF.
      </p>
    );
  }

  return (
    <div className="rounded-3xl border border-white/55 dark:border-white/14 bg-white/45 dark:bg-[rgba(15,10,30,0.45)] backdrop-blur-[24px] shadow-[0_8px_32px_0_rgba(31,38,135,0.08)] overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-foreground/[0.03] border-b border-white/55 dark:border-white/14">
          <tr className="text-left text-muted-foreground">
            {['Numer', 'Rodzaj', 'Data', 'Kwota brutto', 'Status KSeF', ...(canDownload ? [''] : [])].map(
              (h) => (
                <th key={h} className="px-6 py-4 font-medium text-xs uppercase tracking-wider">
                  {h}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr
              key={inv.id}
              className="border-b border-white/55 dark:border-white/[0.07] last:border-0 hover:bg-foreground/[0.02]"
            >
              <td className="px-6 py-4 font-mono">
                {inv.internal_number ?? '—'}
              </td>
              <td className="px-6 py-4">{directionLabel(inv.direction)}</td>
              <td className="px-6 py-4 whitespace-nowrap text-muted-foreground tabular-nums">
                {new Date(inv.issue_date).toLocaleDateString('pl-PL')}
              </td>
              <td className="px-6 py-4 tabular-nums">
                {inv.gross_total != null
                  ? `${Number(inv.gross_total).toFixed(2)} PLN`
                  : '—'}
              </td>
              <td className="px-6 py-4 text-muted-foreground">
                {statusLabel(inv.ksef_status)}
              </td>
              {canDownload && (
                <td className="px-6 py-4 text-right">
                  {inv.xml_storage_path ? (
                    <Link
                      href={`/accountant/${tokenSeg}/download/${inv.id}`}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Pobierz XML
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground">brak XML</span>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
