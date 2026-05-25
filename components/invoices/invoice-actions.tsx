'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Download, FileText, Loader2, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmailInvoiceButton } from './email-invoice-button';
import {
  downloadInvoiceXmlAction,
  resendInvoiceAction,
} from './actions-detail';

interface Props {
  invoice: {
    id: string;
    ksef_status: string;
    xml_storage_path: string | null;
  };
}

export function InvoiceActions({ invoice }: Props) {
  const [isDownloading, startDownloading] = useTransition();
  const [isDownloadingPdf, startDownloadingPdf] = useTransition();
  const [isResending, startResending] = useTransition();

  const canDownload = !!invoice.xml_storage_path;
  const canResend =
    invoice.ksef_status === 'rejected' || invoice.ksef_status === 'failed';

  /** Zapisuje Blob jako plik do pobrania. */
  const saveBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleDownload = () => {
    startDownloading(async () => {
      const result = await downloadInvoiceXmlAction(invoice.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      saveBlob(
        new Blob([result.xml], { type: 'application/xml' }),
        result.filename,
      );
    });
  };

  const handleDownloadPdf = () => {
    startDownloadingPdf(async () => {
      try {
        const res = await fetch(`/api/invoices/${invoice.id}/pdf`);
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          toast.error(
            body.error === 'pdf_generation_failed'
              ? 'Nie udało się wygenerować PDF. Spróbuj ponownie.'
              : 'Nie udało się pobrać PDF faktury.',
          );
          return;
        }
        const cd = res.headers.get('Content-Disposition') ?? '';
        const filename =
          cd.match(/filename="(.+?)"/)?.[1] ?? `Faktura_${invoice.id}.pdf`;
        saveBlob(await res.blob(), filename);
      } catch {
        toast.error('Błąd połączenia przy pobieraniu PDF.');
      }
    });
  };

  return (
    <div className="flex flex-wrap gap-2 justify-end pt-2">
      <Button
        variant="glass"
        size="lg"
        onClick={handleDownloadPdf}
        disabled={isDownloadingPdf}
      >
        {isDownloadingPdf ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <FileText className="h-4 w-4 mr-2" />
        )}
        Pobierz PDF
      </Button>
      <EmailInvoiceButton invoiceId={invoice.id} />
      {canDownload && (
        <Button
          variant="glass"
          size="lg"
          onClick={handleDownload}
          disabled={isDownloading}
        >
          {isDownloading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          Pobierz XML
        </Button>
      )}
      {canResend && (
        <Button
          variant="glass-primary"
          size="lg"
          disabled={isResending}
          onClick={() => {
            startResending(async () => {
              const result = await resendInvoiceAction(invoice.id);
              if (result.success) toast.success('Ponowna wysyłka rozpoczęta');
              else toast.error(result.error);
            });
          }}
        >
          {isResending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Wyślij ponownie
        </Button>
      )}
    </div>
  );
}
