'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/invoices/status-badge';
import { InvoiceActions } from '@/components/invoices/invoice-actions';
import { InvoiceErrorDisplay } from '@/components/invoices/error-display';
import { UpoDownload } from '@/components/invoices/upo-download';
import { formatWarsawDateTime } from '@/lib/format/warsaw-date';
import type { DuplicateOriginalView } from '@/lib/ksef/duplicate-check';
import type { Database } from '@/types/database';

export interface InvoiceDetailLine {
  ordinal: number;
  name: string | null;
  unit: string | null;
  quantity: string | number | null;
  unit_price_net: string | number | null;
  vat_rate: string | null;
  gross_amount: string | number | null;
}

interface AddressSnapshot {
  countryCode?: string;
  addressLine1?: string;
  addressLine2?: string;
}

interface PartySnapshot {
  nip?: string | null;
  vatUeNumber?: string | null;
  name?: string | null;
  address?: AddressSnapshot | null;
  email?: string | null;
}

export interface InvoiceDetailInitial {
  id: string;
  internal_number: string | null;
  invoice_type: string | null;
  /** regular / correction / advance / final (`invoices.invoice_kind`). */
  invoice_kind: string | null;
  issue_date: string | null;
  sale_date: string | null;
  ksef_status: string;
  ksef_number: string | null;
  ksef_accepted_at: string | null;
  xml_storage_path: string | null;
  net_total: string | number | null;
  vat_total: string | number | null;
  gross_total: string | number | null;
  notes: string | null;
  last_error: string | null;
  last_error_code: string | null;
  last_error_field: string | null;
  last_error_suggestion: string | null;
  seller_data: unknown;
  buyer_data: unknown;
  /** `invoices.payment_data` — `PaymentInfo` z faktury; `null` w starych rekordach. */
  payment_data: unknown;
  lines: InvoiceDetailLine[];
  upo_status: Database['public']['Enums']['upo_status_enum'] | null;
  /** Rola zalogowanej osoby w firmie faktury dopuszcza „Wyślij ponownie” / „Wróć do szkicu”. */
  can_manage_send: boolean;
  /** D-A4-1b-3: dane faktury, którą KSeF ma już pod tym numerem (nierozstrzygnięty 440). */
  ksef_duplicate_original: DuplicateOriginalView | null;
}

interface PaymentSnapshot {
  method?: string | null;
  dueDate?: string | null;
  bankAccount?: string | null;
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  transfer: 'Przelew',
  cash: 'Gotówka',
  card: 'Karta',
  other: 'Inna',
};

/**
 * Liczba po polsku („18 000,19”): co najmniej 2 miejsca, najwyżej
 * `maxDigits`. Ilość i cena jednostkowa mają w bazie i w XML 4 miejsca —
 * ekran pokazuje je w całości, jak PDF (F-094).
 */
function formatNumber(value: string | number | null, maxDigits = 2): string {
  if (value == null) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: maxDigits,
  });
}

function vatRateLabel(rate: string | null): string {
  if (!rate) return '—';
  // AUD-70: usługa z art. 100 ust. 1 pkt 4 (FA(3) „np II”) — jak na PDF.
  if (rate === 'np_ii') return 'np. II';
  if (['zw', 'oo', 'np'].includes(rate)) return rate;
  return `${rate}%`;
}

/**
 * Szczegóły faktury + nasłuch Realtime na UPDATE tego samego wiersza
 * (status KSeF, numer, ścieżka XML, błąd) — bez ręcznego odświeżania.
 */
export function InvoiceDetailView({ initial }: { initial: InvoiceDetailInitial }) {
  const [inv, setInv] = useState(initial);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`invoice-detail-${initial.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'invoices',
          filter: `id=eq.${initial.id}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          setInv((prev) => ({
            ...prev,
            ksef_status:
              typeof row.ksef_status === 'string'
                ? row.ksef_status
                : prev.ksef_status,
            ksef_number:
              (row.ksef_number as string | null | undefined) ?? prev.ksef_number,
            ksef_accepted_at:
              (row.ksef_accepted_at as string | null | undefined) ??
              prev.ksef_accepted_at,
            xml_storage_path:
              (row.xml_storage_path as string | null | undefined) ??
              prev.xml_storage_path,
            last_error:
              'last_error' in row
                ? row.last_error as string | null
                : prev.last_error,
            last_error_code:
              'last_error_code' in row
                ? row.last_error_code as string | null
                : prev.last_error_code,
            last_error_field:
              (row.last_error_field as string | null | undefined) ??
              prev.last_error_field,
            last_error_suggestion:
              (row.last_error_suggestion as string | null | undefined) ??
              prev.last_error_suggestion,
          }));
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'upo_receipts',
          filter: `invoice_id=eq.${initial.id}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setInv((prev) => ({ ...prev, upo_status: null }));
            return;
          }
          const row = payload.new as Record<string, unknown>;
          const status = row.status;
          if (typeof status === 'string') {
            setInv((prev) => ({
              ...prev,
              upo_status: status as InvoiceDetailInitial['upo_status'],
            }));
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [initial.id]);

  const seller = (inv.seller_data ?? {}) as PartySnapshot;
  const buyer = (inv.buyer_data ?? {}) as PartySnapshot;
  const payment = (inv.payment_data ?? null) as PaymentSnapshot | null;
  const lines = inv.lines;

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
            {inv.internal_number ?? '(bez numeru)'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Wystawiona {inv.issue_date ?? '—'}
            {inv.sale_date && inv.sale_date !== inv.issue_date
              ? ` · Data sprzedaży: ${inv.sale_date}`
              : ''}
            {inv.invoice_type ? ` · ${inv.invoice_type}` : ''}
          </p>
        </div>
        <StatusBadge status={inv.ksef_status} errorCode={inv.last_error_code} />
      </div>

      {inv.ksef_number && (
        <Card className="p-4 mb-6 bg-green-50 border-green-200">
          <p className="text-xs text-green-800 uppercase tracking-wide">
            Numer KSeF
          </p>
          <p className="font-mono text-sm mt-1">{inv.ksef_number}</p>
          {inv.ksef_accepted_at && (
            <p className="text-xs text-green-800 mt-1">
              Zaakceptowana: {formatWarsawDateTime(inv.ksef_accepted_at)}
            </p>
          )}
        </Card>
      )}

      {inv.ksef_status === 'accepted' && inv.ksef_number && (
        <div className="mb-6">
          <UpoDownload
            invoiceId={inv.id}
            ksefNumber={inv.ksef_number}
            upoStatus={inv.upo_status}
          />
        </div>
      )}

      {inv.last_error && (
        <div className="mb-6">
          <InvoiceErrorDisplay
            errorMessage={inv.last_error}
            errorCode={inv.last_error_code}
            errorField={inv.last_error_field}
            errorSuggestion={inv.last_error_suggestion}
            invoiceId={inv.id}
            showEditLink={
              inv.ksef_status === 'rejected' ||
              inv.ksef_status === 'failed'
            }
          />
        </div>
      )}

      {inv.ksef_status === 'failed' &&
        inv.last_error_code === 'KSEF_DUPLICATE_RECONCILE' &&
        inv.ksef_duplicate_original && (
          <Card className="p-4 mb-6 border-amber-200 bg-amber-50">
            <h3 className="font-semibold text-sm text-amber-900">
              {inv.ksef_duplicate_original.title}
            </h3>
            <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
              {inv.ksef_duplicate_original.rows.map((row) => (
                <div key={row.label} className="flex gap-2">
                  <dt className="text-amber-800">{row.label}:</dt>
                  <dd className="font-medium break-all">{row.value}</dd>
                </div>
              ))}
            </dl>
            <p className="text-sm text-amber-900 mt-3">
              {inv.ksef_duplicate_original.note}
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
          {buyer.nip ? (
            <p className="text-xs text-gray-500">NIP: {buyer.nip}</p>
          ) : buyer.vatUeNumber ? (
            <p className="text-xs text-gray-500">VAT UE: {buyer.vatUeNumber}</p>
          ) : null}
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
                  {formatNumber(line.quantity, 4)}{' '}
                  <span className="text-gray-500 text-xs">
                    {line.unit ?? ''}
                  </span>
                </td>
                <td className="text-right tabular-nums">
                  {formatNumber(line.unit_price_net, 4)}
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
                {formatNumber(inv.net_total)}
              </td>
            </tr>
            <tr>
              <td colSpan={5} className="pt-1 text-right font-medium">
                VAT
              </td>
              <td className="pt-1 text-right tabular-nums">
                {formatNumber(inv.vat_total)}
              </td>
            </tr>
            <tr>
              <td colSpan={5} className="pt-1 text-right font-semibold">
                RAZEM BRUTTO
              </td>
              <td className="pt-1 text-right font-bold tabular-nums">
                {formatNumber(inv.gross_total)} PLN
              </td>
            </tr>
          </tfoot>
        </table>
      </Card>

      {payment?.dueDate && (
        <Card className="p-4 mb-6">
          <h3 className="font-semibold mb-2 text-sm uppercase text-gray-500">
            Płatność
          </h3>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
            <div>
              <dt className="text-xs text-gray-500">Forma</dt>
              <dd>{PAYMENT_METHOD_LABEL[payment.method ?? ''] ?? payment.method ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Termin płatności</dt>
              <dd className="tabular-nums">{payment.dueDate}</dd>
            </div>
            {payment.bankAccount && (
              <div>
                <dt className="text-xs text-gray-500">Rachunek</dt>
                <dd className="font-mono text-xs break-all">{payment.bankAccount}</dd>
              </div>
            )}
          </dl>
        </Card>
      )}

      {inv.notes && (
        <Card className="p-4 mb-6">
          <h3 className="font-semibold mb-2 text-sm uppercase text-gray-500">
            Uwagi
          </h3>
          <p className="text-sm whitespace-pre-wrap">{inv.notes}</p>
        </Card>
      )}

      <InvoiceActions
        invoice={{
          id: inv.id,
          ksef_status: inv.ksef_status,
          xml_storage_path: inv.xml_storage_path ?? null,
          invoice_type: inv.invoice_type,
          invoice_kind: inv.invoice_kind,
          last_error_code: inv.last_error_code,
        }}
        canManageSend={inv.can_manage_send}
      />
    </div>
  );
}
