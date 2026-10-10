'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Download, FileText, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmailInvoiceButton } from './email-invoice-button';
import { DraftInvoiceActions } from './draft-invoice-actions';
import { FailedInvoiceActions } from './failed-invoice-actions';
import { downloadInvoiceXmlAction } from './actions-detail';
import { saveBlob } from '@/lib/download';
import type { KsefResendFacts } from '@/lib/invoices/ksef-requeue-event';

interface Props {
  invoice: {
    id: string;
    ksef_status: string;
    xml_storage_path: string | null;
    /** VAT / KOR / ZAL / ROZ — do przycisków szkicu. */
    invoice_type?: string | null;
    /** regular / correction / advance / final — dokument specjalny: przyciski wg faktów ponowienia z kopii. */
    invoice_kind?: string | null;
    /** Kod z katalogu `ksef_error_codes` — decyduje o przyciskach po błędzie. */
    last_error_code?: string | null;
    /** A4b PR2b: dane zapisane, rodzaj wstrzymany, data wystawienia minęła. */
    ksef_resend_facts: KsefResendFacts;
    /** `KSEF_ENV` aplikacji poprawny. */
    ksef_environment_known: boolean;
    /**
     * D-A4-1b-3 PR B: nad paskiem stoi panel duplikatu 440 (decyzja albo nota
     * z danymi oryginału) — pasek po błędzie odsyła do ramki wyżej.
     */
    ksef_duplicate_panel?: boolean;
    /**
     * D-A4-1b-3 PR B: szkic wycofany (wpis `number_taken`) — bez wysyłki do KSeF
     * i bez e-maila do nabywcy (decyzja 10); usunąć można tylko korektę i fakturę
     * rozliczeniową (`deletable`, decyzja 9). `null` — zwykły szkic albo inny stan.
     */
    ksef_retired?: { deletable: boolean } | null;
  };
  /** Rola w firmie dopuszcza ponowną wysyłkę i powrót do szkicu (owner/admin). */
  canManageSend?: boolean;
}

export function InvoiceActions({ invoice, canManageSend = false }: Props) {
  const [isDownloading, startDownloading] = useTransition();
  const [isDownloadingPdf, startDownloadingPdf] = useTransition();

  const canDownload = !!invoice.xml_storage_path;

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
              : res.status === 409
                ? body.error ?? 'PDF faktury offline jest obecnie niedostępny.'
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
      {/* Decyzja 10: dokument wycofany nie jest fakturą dla nabywcy (odmawia też serwer). */}
      {!invoice.ksef_retired && <EmailInvoiceButton invoiceId={invoice.id} />}
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
      {invoice.ksef_status === 'draft' && (
        <DraftInvoiceActions
          invoiceId={invoice.id}
          invoiceType={invoice.invoice_type ?? null}
          retired={invoice.ksef_retired ?? null}
        />
      )}
      {(invoice.ksef_status === 'rejected' || invoice.ksef_status === 'failed') && (
        <FailedInvoiceActions
          invoiceId={invoice.id}
          status={invoice.ksef_status}
          errorCode={invoice.last_error_code ?? null}
          invoiceKind={invoice.invoice_kind ?? null}
          canManage={canManageSend}
          facts={invoice.ksef_resend_facts}
          environmentKnown={invoice.ksef_environment_known}
          duplicatePanel={invoice.ksef_duplicate_panel ?? false}
        />
      )}
    </div>
  );
}
