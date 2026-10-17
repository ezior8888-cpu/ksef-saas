'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Download, FilePenLine, FileText, Loader2, Printer } from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
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
    /**
     * E3 / P4: faktura może mieć korektę (liczy strona tym samym predykatem
     * co lista faktur) — w karcie „Dokument” pojawia się link „Korekta”.
     */
    can_correct?: boolean;
  };
  /** Rola w firmie dopuszcza ponowną wysyłkę i powrót do szkicu (owner/admin). */
  canManageSend?: boolean;
  /**
   * E3 / P4: podgląd faktury stawia akcje w dwóch kartach, z TYMI SAMYMI
   * props — `primary` (karta „Status”: wysyłka szkicu, ponowienie po błędzie)
   * i `secondary` (karta „Dokument”: e-mail, PDF, Drukuj, XML, Korekta).
   * Każdy przycisk jest w DOM raz. `all` (domyślnie) to dotychczasowy pasek.
   */
  section?: 'primary' | 'secondary' | 'all';
}

/** Komunikat dla klienta po nieudanym pobraniu PDF — wspólny dla „Pobierz PDF” i „Drukuj”. */
async function pdfFailureMessage(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return body.error === 'pdf_generation_failed'
    ? 'Nie udało się wygenerować PDF. Spróbuj ponownie.'
    : res.status === 409
      ? body.error ?? 'PDF faktury offline jest obecnie niedostępny.'
      : 'Nie udało się pobrać PDF faktury.';
}

/** Blob URL zostaje na czas oglądania PDF w nowej karcie (przeładowanie karty go potrzebuje). */
const PRINT_BLOB_URL_TTL_MS = 10 * 60_000;

export function InvoiceActions({ invoice, canManageSend = false, section = 'all' }: Props) {
  const [isDownloading, startDownloading] = useTransition();
  const [isDownloadingPdf, startDownloadingPdf] = useTransition();
  const [isOpeningPdf, startOpeningPdf] = useTransition();

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
          toast.error(await pdfFailureMessage(res));
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

  /**
   * „Drukuj” (P4): dokumentem jest PDF z `/api/invoices/[id]/pdf`, a
   * `window.print()` wydrukowałby szkielet panelu. Kartę otwieramy od razu
   * w obsłudze kliknięcia (po `await` przeglądarki blokują okna), a PDF
   * wczytujemy do niej przez blob URL — te same trasa, zgody i komunikaty
   * błędów co przy „Pobierz PDF”.
   */
  const handlePrintPdf = () => {
    const tab = window.open('about:blank', '_blank');
    if (!tab) {
      toast.error('Przeglądarka zablokowała nową kartę. Zezwól na okna z tej strony i spróbuj ponownie.');
      return;
    }
    tab.opener = null;
    startOpeningPdf(async () => {
      try {
        const res = await fetch(`/api/invoices/${invoice.id}/pdf`);
        if (!res.ok) {
          tab.close();
          toast.error(await pdfFailureMessage(res));
          return;
        }
        const url = URL.createObjectURL(await res.blob());
        tab.location.href = url;
        window.setTimeout(() => URL.revokeObjectURL(url), PRINT_BLOB_URL_TTL_MS);
      } catch {
        tab.close();
        toast.error('Błąd połączenia przy pobieraniu PDF.');
      }
    });
  };

  const hasPrimary =
    invoice.ksef_status === 'draft' ||
    invoice.ksef_status === 'rejected' ||
    invoice.ksef_status === 'failed';

  const primary = (
    <>
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
    </>
  );

  // Podział na karty: główna akcja (wysyłka, ponowienie) obok statusu, reszta w karcie „Dokument”.
  if (section === 'primary') {
    return hasPrimary ? <div className="flex flex-wrap gap-2">{primary}</div> : null;
  }

  const secondary = (
    <>
      <Button
        variant="outline"
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
      <Button
        variant="outline"
        onClick={handlePrintPdf}
        disabled={isOpeningPdf}
      >
        {isOpeningPdf ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Printer className="h-4 w-4 mr-2" />
        )}
        Drukuj
      </Button>
      {/* Decyzja 10: dokument wycofany nie jest fakturą dla nabywcy (odmawia też serwer). */}
      {!invoice.ksef_retired && <EmailInvoiceButton invoiceId={invoice.id} />}
      {canDownload && (
        <Button
          variant="outline"
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
      {invoice.can_correct && (
        <Link
          href={`/invoices/new/correction?parentId=${encodeURIComponent(invoice.id)}`}
          className={buttonVariants({ variant: 'outline' })}
        >
          <FilePenLine className="h-4 w-4 mr-2" />
          Korekta
        </Link>
      )}
    </>
  );

  if (section === 'secondary') {
    // Kolumna 18 rem: pole e-maila (EmailInvoiceButton) ma się zawinąć, nie wystawać.
    return <div className="flex flex-col gap-2 [&_form]:flex-wrap">{secondary}</div>;
  }

  return (
    <div className="flex flex-wrap gap-2 justify-end pt-2">
      {secondary}
      {primary}
    </div>
  );
}
