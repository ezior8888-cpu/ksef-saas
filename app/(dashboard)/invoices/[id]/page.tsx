import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/invoices/status-badge';
import { InvoiceActions } from '@/components/invoices/invoice-actions';

export const dynamic = 'force-dynamic';

interface AddressSnapshot {
  countryCode?: string;
  addressLine1?: string;
  addressLine2?: string;
}

interface PartySnapshot {
  nip?: string | null;
  name?: string | null;
  address?: AddressSnapshot | null;
  email?: string | null;
}

interface LineItemRow {
  ordinal: number;
  name: string | null;
  unit: string | null;
  quantity: string | number | null;
  unit_price_net: string | number | null;
  vat_rate: string | null;
  gross_amount: string | number | null;
}

function formatNumber(value: string | number | null, digits = 2): string {
  if (value == null) return '—';
  return Number(value).toFixed(digits);
}

function vatRateLabel(rate: string | null): string {
  if (!rate) return '—';
  if (['zw', 'oo', 'np'].includes(rate)) return rate;
  return `${rate}%`;
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from('invoices')
    .select(
      `
      id,
      internal_number,
      invoice_type,
      issue_date,
      sale_date,
      ksef_status,
      ksef_number,
      ksef_accepted_at,
      xml_storage_path,
      net_total,
      vat_total,
      gross_total,
      notes,
      last_error,
      seller_data,
      buyer_data,
      payment_data,
      invoice_line_items(
        ordinal,
        name,
        unit,
        quantity,
        unit_price_net,
        vat_rate,
        gross_amount
      )
      `
    )
    .eq('id', id)
    .maybeSingle();

  if (!invoice) notFound();

  const seller = (invoice.seller_data ?? {}) as PartySnapshot;
  const buyer = (invoice.buyer_data ?? {}) as PartySnapshot;
  const lines = ((invoice.invoice_line_items ?? []) as LineItemRow[])
    .slice()
    .sort((a, b) => a.ordinal - b.ordinal);

  return (
    <div className="max-w-4xl">
      <Link
        href="/invoices"
        className="inline-flex items-center text-sm text-gray-600 mb-4 hover:underline"
      >
        <ArrowLeft className="h-4 w-4 mr-1" /> Powrót do listy
      </Link>

      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {invoice.internal_number ?? '(bez numeru)'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Wystawiona {invoice.issue_date ?? '—'}
            {invoice.sale_date && invoice.sale_date !== invoice.issue_date
              ? ` · Data sprzedaży: ${invoice.sale_date}`
              : ''}
            {invoice.invoice_type ? ` · ${invoice.invoice_type}` : ''}
          </p>
        </div>
        <StatusBadge status={invoice.ksef_status} />
      </div>

      {invoice.ksef_number && (
        <Card className="p-4 mb-6 bg-green-50 border-green-200">
          <p className="text-xs text-green-800 uppercase tracking-wide">
            Numer KSeF
          </p>
          <p className="font-mono text-sm mt-1">{invoice.ksef_number}</p>
          {invoice.ksef_accepted_at && (
            <p className="text-xs text-green-800 mt-1">
              Zaakceptowana: {invoice.ksef_accepted_at}
            </p>
          )}
        </Card>
      )}

      {invoice.last_error &&
        (invoice.ksef_status === 'rejected' ||
          invoice.ksef_status === 'failed') && (
          <Card className="p-4 mb-6 bg-red-50 border-red-200">
            <p className="text-xs text-red-800 uppercase tracking-wide mb-1">
              Ostatni błąd wysyłki
            </p>
            <p className="text-sm text-red-900 font-mono whitespace-pre-wrap">
              {invoice.last_error}
            </p>
          </Card>
        )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card className="p-4">
          <h3 className="font-semibold mb-2 text-sm uppercase text-gray-500">
            Sprzedawca
          </h3>
          <p className="font-medium">{seller.name ?? '—'}</p>
          {seller.nip && (
            <p className="text-xs text-gray-500">NIP: {seller.nip}</p>
          )}
          <p className="text-xs text-gray-600 mt-2 whitespace-pre-line">
            {seller.address?.addressLine1 ?? ''}
            {seller.address?.addressLine2
              ? '\n' + seller.address.addressLine2
              : ''}
          </p>
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold mb-2 text-sm uppercase text-gray-500">
            Nabywca
          </h3>
          <p className="font-medium">{buyer.name ?? '—'}</p>
          {buyer.nip && (
            <p className="text-xs text-gray-500">NIP: {buyer.nip}</p>
          )}
          <p className="text-xs text-gray-600 mt-2 whitespace-pre-line">
            {buyer.address?.addressLine1 ?? ''}
            {buyer.address?.addressLine2
              ? '\n' + buyer.address.addressLine2
              : ''}
          </p>
          {buyer.email && (
            <p className="text-xs text-gray-500 mt-1">{buyer.email}</p>
          )}
        </Card>
      </div>

      <Card className="p-4 mb-6 overflow-x-auto">
        <h3 className="font-semibold mb-3 text-sm uppercase text-gray-500">
          Pozycje
        </h3>
        <table className="w-full text-sm">
          <thead className="border-b text-left text-gray-500">
            <tr>
              <th className="pb-2 w-8">#</th>
              <th className="pb-2">Nazwa</th>
              <th className="pb-2 text-right w-28">Ilość</th>
              <th className="pb-2 text-right w-28">Cena netto</th>
              <th className="pb-2 text-right w-20">VAT</th>
              <th className="pb-2 text-right w-28">Brutto</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="py-4 text-center text-gray-400 text-xs"
                >
                  Brak pozycji
                </td>
              </tr>
            )}
            {lines.map((line) => (
              <tr key={line.ordinal} className="border-b last:border-b-0">
                <td className="py-2">{line.ordinal}</td>
                <td>{line.name ?? '—'}</td>
                <td className="text-right tabular-nums">
                  {formatNumber(line.quantity, 2)}{' '}
                  <span className="text-gray-500 text-xs">
                    {line.unit ?? ''}
                  </span>
                </td>
                <td className="text-right tabular-nums">
                  {formatNumber(line.unit_price_net, 2)}
                </td>
                <td className="text-right">{vatRateLabel(line.vat_rate)}</td>
                <td className="text-right tabular-nums font-medium">
                  {formatNumber(line.gross_amount, 2)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} className="pt-3 text-right font-medium">
                RAZEM NETTO
              </td>
              <td className="pt-3 text-right tabular-nums">
                {formatNumber(invoice.net_total)}
              </td>
            </tr>
            <tr>
              <td colSpan={5} className="pt-1 text-right font-medium">
                VAT
              </td>
              <td className="pt-1 text-right tabular-nums">
                {formatNumber(invoice.vat_total)}
              </td>
            </tr>
            <tr>
              <td colSpan={5} className="pt-1 text-right font-semibold">
                RAZEM BRUTTO
              </td>
              <td className="pt-1 text-right font-bold tabular-nums">
                {formatNumber(invoice.gross_total)} PLN
              </td>
            </tr>
          </tfoot>
        </table>
      </Card>

      {invoice.notes && (
        <Card className="p-4 mb-6">
          <h3 className="font-semibold mb-2 text-sm uppercase text-gray-500">
            Uwagi
          </h3>
          <p className="text-sm whitespace-pre-wrap">{invoice.notes}</p>
        </Card>
      )}

      <InvoiceActions
        invoice={{
          id: invoice.id as string,
          ksef_status: invoice.ksef_status as string,
          xml_storage_path: (invoice.xml_storage_path as string | null) ?? null,
        }}
      />
    </div>
  );
}
