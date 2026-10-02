'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Send, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { deleteDraftInvoiceAction, sendDraftInvoiceAction } from './draft-actions';

interface Props {
  invoiceId: string;
  /** VAT / KOR / ZAL / ROZ — wysłać ze szkicu można tylko zwykłą fakturę VAT. */
  invoiceType: string | null;
}

/** Przyciski szkicu: wysyłka do KSeF i usunięcie (F-001). */
export function DraftInvoiceActions({ invoiceId, invoiceType }: Props) {
  const router = useRouter();
  const [isSending, startSending] = useTransition();
  const [isDeleting, startDeleting] = useTransition();
  const busy = isSending || isDeleting;
  const canSend = (invoiceType ?? 'VAT') === 'VAT';

  const handleSend = () => {
    startSending(async () => {
      const result = await sendDraftInvoiceAction(invoiceId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.offline
          ? 'KSeF jest niedostępny — faktura czeka w kolejce offline i zostanie wysłana automatycznie.'
          : 'Faktura wysłana do kolejki KSeF.',
      );
      router.refresh();
    });
  };

  const handleDelete = () => {
    if (!window.confirm('Usunąć szkic? Numer faktury będzie można użyć ponownie.')) return;
    startDeleting(async () => {
      const result = await deleteDraftInvoiceAction(invoiceId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success('Szkic usunięty.');
      router.push('/invoices');
    });
  };

  return (
    <>
      {canSend && (
        <Button onClick={handleSend} disabled={busy}>
          {isSending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
          Wyślij do KSeF
        </Button>
      )}
      <Button variant="outline" onClick={handleDelete} disabled={busy}>
        {isDeleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
        Usuń szkic
      </Button>
    </>
  );
}
