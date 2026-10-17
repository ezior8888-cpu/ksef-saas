'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  RiDeleteBinLine,
  RiEditLine,
  RiEyeLine,
  RiFileCodeLine,
  RiFilePdf2Line,
  RiLoader4Line,
  RiMoreLine,
} from '@remixicon/react';

import { downloadInvoiceXmlAction } from '@/components/invoices/actions-detail';
import { deleteDraftInvoiceAction } from '@/components/invoices/draft-actions';
import type { InvoiceRow } from '@/components/invoices/invoice-row-types';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { saveBlob } from '@/lib/download';
import type { InvoiceListRowFacts } from '@/lib/invoices/list-row-facts';

export type RowMenuEntry = 'correction' | 'xml' | 'delete';

/**
 * Pozycje menu „⋯” wiersza. Korekta: tylko faktury, które przyjmuje formularz
 * korekty i bez korekty w toku (`facts.canCorrect`). XML: gdy jest plik.
 * Usuń: wyłącznie szkic — akcja sama odmawia dla szkiców wycofanych, a
 * odmowę widać w toaście.
 */
export function rowMenuEntries(
  invoice: Pick<InvoiceRow, 'ksef_status' | 'xml_storage_path'>,
  facts: Pick<InvoiceListRowFacts, 'canCorrect'> | undefined,
): RowMenuEntry[] {
  const entries: RowMenuEntry[] = [];
  if (facts?.canCorrect === true) entries.push('correction');
  if (invoice.xml_storage_path) entries.push('xml');
  if (invoice.ksef_status === 'draft') entries.push('delete');
  return entries;
}

/** Pobranie PDF jednej faktury — ta sama ścieżka co `InvoiceActions`. */
export async function downloadInvoicePdf(invoiceId: string): Promise<void> {
  try {
    const res = await fetch(`/api/invoices/${invoiceId}/pdf`);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(
        body.error === 'pdf_generation_failed'
          ? 'Nie udało się wygenerować PDF. Spróbuj ponownie.'
          : res.status === 409
            ? body.error ?? 'PDF faktury offline jest obecnie niedostępny.'
            : 'Nie udało się pobrać PDF faktury.',
      );
      return;
    }
    const cd = res.headers.get('Content-Disposition') ?? '';
    const filename = cd.match(/filename="(.+?)"/)?.[1] ?? `Faktura_${invoiceId}.pdf`;
    saveBlob(await res.blob(), filename);
  } catch {
    toast.error('Błąd połączenia przy pobieraniu PDF.');
  }
}

interface Props {
  invoice: InvoiceRow;
  facts: InvoiceListRowFacts | undefined;
  /** Tylko testy: menu otwarte od razu. */
  defaultMenuOpen?: boolean;
}

/** Kolumna „Akcje”: Podgląd, PDF i menu „⋯” (Finora: podgląd + RowActions). */
export function InvoiceRowActions({ invoice, facts, defaultMenuOpen = false }: Props) {
  const router = useRouter();
  const [pdfPending, startPdf] = useTransition();
  const [xmlPending, startXml] = useTransition();
  const [deletePending, startDelete] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const number = invoice.internal_number ?? '(bez numeru)';
  const entries = rowMenuEntries(invoice, facts);

  const downloadXml = () => {
    startXml(async () => {
      const result = await downloadInvoiceXmlAction(invoice.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      saveBlob(new Blob([result.xml], { type: 'application/xml' }), result.filename);
      toast.success('Pobrano XML');
    });
  };

  const confirmDelete = () => {
    startDelete(async () => {
      const result = await deleteDraftInvoiceAction(invoice.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setConfirmOpen(false);
      toast.success('Szkic usunięty');
      router.refresh();
    });
  };

  return (
    <div className="flex items-center justify-end gap-0.5">
      <Link
        href={`/invoices/${invoice.id}`}
        className={buttonVariants({ variant: 'ghost', size: 'icon' })}
        aria-label={`Podgląd faktury ${number}`}
        title="Podgląd"
      >
        <RiEyeLine />
      </Link>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Pobierz PDF faktury ${number}`}
        title="Pobierz PDF"
        disabled={pdfPending}
        onClick={() => startPdf(() => downloadInvoicePdf(invoice.id))}
      >
        {pdfPending ? <RiLoader4Line className="animate-spin" /> : <RiFilePdf2Line />}
      </Button>

      {entries.length > 0 ? (
        <DropdownMenu defaultOpen={defaultMenuOpen}>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon" aria-label={`Więcej akcji dla faktury ${number}`} />}
          >
            <RiMoreLine />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Akcje faktury</DropdownMenuLabel>
              {entries.includes('correction') ? (
                <DropdownMenuItem render={<Link href={`/invoices/new/correction?parentId=${invoice.id}`} />}>
                  <RiEditLine />
                  Korekta
                </DropdownMenuItem>
              ) : null}
              {entries.includes('xml') ? (
                <DropdownMenuItem disabled={xmlPending} onClick={downloadXml}>
                  <RiFileCodeLine />
                  Pobierz XML
                </DropdownMenuItem>
              ) : null}
              {entries.includes('delete') ? (
                <DropdownMenuItem variant="destructive" onClick={() => setConfirmOpen(true)}>
                  <RiDeleteBinLine />
                  Usuń
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {entries.includes('delete') ? (
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>Usunąć szkic {number}?</DialogTitle>
              <DialogDescription>
                Szkic zniknie z listy razem z pozycjami. Tej operacji nie można cofnąć.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={deletePending}>
                Anuluj
              </Button>
              <Button variant="destructive" onClick={confirmDelete} disabled={deletePending}>
                {deletePending ? <RiLoader4Line className="animate-spin" /> : null}
                Usuń szkic
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
