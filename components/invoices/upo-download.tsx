'use client';

import { useTransition } from 'react';
import { Download, FileCheck2, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { getUpoPdfAction, getUpoXmlAction } from '@/app/(dashboard)/invoices/[id]/upo-actions';
import { Button } from '@/components/ui/button';

interface UpoDownloadProps {
  invoiceId: string;
  upoStatus?: 'pending' | 'downloaded' | 'failed' | 'archived' | null;
  ksefNumber?: string | null;
}

function safeXmlBasename(ksefNumber: string): string {
  return ksefNumber.replace(/[/\\]/g, '-');
}

export function UpoDownload({
  invoiceId,
  upoStatus,
  ksefNumber,
}: UpoDownloadProps) {
  const [isPdfLoading, startPdfDownload] = useTransition();
  const [isXmlLoading, startXmlDownload] = useTransition();

  if (!ksefNumber) return null;

  const handleDownloadPdf = () => {
    startPdfDownload(async () => {
      const result = await getUpoPdfAction(invoiceId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      const binary = atob(result.pdfBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);

      toast.success('UPO pobrane');
    });
  };

  const handleDownloadXml = () => {
    startXmlDownload(async () => {
      const result = await getUpoXmlAction(invoiceId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      const blob = new Blob([result.xml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `UPO-${safeXmlBasename(ksefNumber)}.xml`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success('UPO XML pobrane');
    });
  };

  if (!upoStatus || upoStatus === 'pending' || upoStatus === 'failed') {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-glass-border bg-glass-white p-4 backdrop-blur-glass-sm">
        <Loader2 className="text-muted-foreground h-5 w-5 shrink-0 animate-spin" />
        <div className="flex-1">
          <p className="text-sm font-medium">UPO w trakcie generowania</p>
          <p className="text-muted-foreground text-xs">
            KSeF generuje UPO asynchronicznie — to może potrwać 1–5 minut.
            Odśwież stronę.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="border-green-500/20 bg-green-500/5 shadow-glass space-y-4 rounded-3xl border p-6 backdrop-blur-glass">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-green-500/10">
          <FileCheck2 className="h-5 w-5 text-green-600 dark:text-green-400" />
        </div>
        <div className="flex-1">
          <p className="font-medium text-xs tracking-wider text-green-700 uppercase dark:text-green-400">
            UPO dostępne
          </p>
          <p className="font-medium">Urzędowe Poświadczenie Odbioru</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Dowód prawny akceptacji faktury w KSeF. Zachowaj na wypadek kontroli.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={handleDownloadPdf}
          variant="glass-primary"
          size="lg"
          disabled={isPdfLoading}
        >
          {isPdfLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Pobierz UPO (PDF)
        </Button>
        <Button
          onClick={handleDownloadXml}
          variant="glass"
          size="lg"
          disabled={isXmlLoading}
        >
          {isXmlLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FileText className="mr-2 h-4 w-4" />
          )}
          Pobierz XML
        </Button>
      </div>
    </div>
  );
}
