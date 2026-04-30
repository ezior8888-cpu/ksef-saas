'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Download, Loader2, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
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
  const [isResending, startResending] = useTransition();

  const canDownload = !!invoice.xml_storage_path;
  const canResend =
    invoice.ksef_status === 'rejected' || invoice.ksef_status === 'failed';

  const handleDownload = () => {
    startDownloading(async () => {
      const result = await downloadInvoiceXmlAction(invoice.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      const blob = new Blob([result.xml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  };

  if (!canDownload && !canResend) return null;

  return (
    <div className="flex gap-2 justify-end pt-2">
      {canDownload && (
        <Button variant="glass" size="lg" onClick={handleDownload} disabled={isDownloading}>
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
