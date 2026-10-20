'use client';

import Link from 'next/link';

import {
  currencySymbol,
  resolveOutstanding,
  resolvePaymentState,
  type InvoiceFactsById,
  type InvoiceRow,
} from '@/components/invoices/invoice-row-types';
import { StatusBadge } from '@/components/invoices/status-badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { companyInitials, shortenLegalForm } from '@/lib/format/legal-form';
import { formatPlMoney } from '@/lib/format/pl';

import { InvoiceRowActions } from './invoice-row-actions';
import { PaymentIndicator } from './payment-indicator';

interface Props {
  invoices: InvoiceRow[];
  facts: InvoiceFactsById;
  /** Dziś w Europe/Warsaw (RRRR-MM-DD) — „po terminie” z daty. */
  today: string;
  selectedIds: ReadonlySet<string>;
  onToggleRow: (id: string, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
}

function money(amount: string | number | null | undefined, currency: string | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  const n = Number(amount);
  return Number.isFinite(n) ? `${formatPlMoney(n)} ${currencySymbol(currency)}` : '—';
}

/** Tabela listy faktur w układzie data-table Finory (tylko od `lg`). Dane i filtry należą do serwera. */
export function InvoicesTable({ invoices, facts, today, selectedIds, onToggleRow, onToggleAll }: Props) {
  const selectedOnPage = invoices.filter((inv) => selectedIds.has(inv.id)).length;
  const allSelected = invoices.length > 0 && selectedOnPage === invoices.length;

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-10 pl-4">
            <Checkbox
              aria-label="Zaznacz wszystkie faktury na stronie"
              checked={allSelected}
              indeterminate={selectedOnPage > 0 && !allSelected}
              onCheckedChange={(checked) => onToggleAll(checked === true)}
            />
          </TableHead>
          <TableHead>Numer</TableHead>
          <TableHead>Płatność</TableHead>
          <TableHead className="min-w-56">Nabywca</TableHead>
          <TableHead className="text-right">Brutto</TableHead>
          <TableHead>Wystawiona</TableHead>
          <TableHead>Termin</TableHead>
          <TableHead className="text-right">Do zapłaty</TableHead>
          <TableHead className="pr-4 text-right">Akcje</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((inv) => {
          const rowFacts = facts[inv.id];
          const state = resolvePaymentState(inv, rowFacts, today);
          const outstanding = resolveOutstanding(inv, rowFacts);
          const number = inv.internal_number ?? '(bez numeru)';
          const buyerName = inv.buyer_data?.name ?? null;
          return (
            <TableRow key={inv.id} data-state={selectedIds.has(inv.id) ? 'selected' : undefined}>
              <TableCell className="pl-4">
                <Checkbox
                  aria-label={`Zaznacz fakturę ${number}`}
                  checked={selectedIds.has(inv.id)}
                  onCheckedChange={(checked) => onToggleRow(inv.id, checked === true)}
                />
              </TableCell>
              <TableCell>
                <Link
                  href={`/invoices/${inv.id}`}
                  className="text-foreground font-mono text-xs font-medium hover:underline"
                >
                  {number}
                </Link>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <PaymentIndicator state={state} />
                  <StatusBadge status={inv.ksef_status} errorCode={inv.last_error_code} />
                </div>
              </TableCell>
              <TableCell className="max-w-72">
                <div className="flex items-center gap-3">
                  <Avatar size="lg">
                    <AvatarFallback className="bg-primary/10 text-accent-foreground text-xs font-medium">
                      {companyInitials(buyerName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate font-medium" title={buyerName ?? undefined}>
                      {buyerName ? shortenLegalForm(buyerName) : '—'}
                    </p>
                    {inv.buyer_data?.nip ? (
                      <p className="text-muted-foreground truncate font-mono text-xs">{inv.buyer_data.nip}</p>
                    ) : null}
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">{money(inv.gross_total, inv.currency)}</TableCell>
              <TableCell className="tabular-nums">{inv.issue_date ?? '—'}</TableCell>
              <TableCell className="tabular-nums">{inv.payment_due_date ?? '—'}</TableCell>
              <TableCell className="text-right tabular-nums">
                {outstanding === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : outstanding === 0 ? (
                  <Badge variant="secondary">Opłacona</Badge>
                ) : (
                  money(outstanding, inv.currency)
                )}
              </TableCell>
              <TableCell className="pr-4">
                <InvoiceRowActions invoice={inv} facts={rowFacts} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
