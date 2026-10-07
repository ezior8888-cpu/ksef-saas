'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, RotateCcw, Send, Settings } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { KsefResendFacts } from '@/lib/invoices/ksef-requeue-event';
import { failedInvoiceButtons, resetDoneMessage } from '@/lib/invoices/ksef-send-policy';
import { resendInvoiceAction, resetInvoiceToDraftAction } from './actions-detail';

interface Props {
  invoiceId: string;
  /** `failed` albo `rejected` — dla innych stanów komponent nic nie renderuje. */
  status: string;
  errorCode: string | null;
  invoiceKind: string | null;
  canManage: boolean;
  /** A4b PR2b: fakty ponowienia z kopii (liczone na serwerze, bez treści dokumentu). */
  facts: KsefResendFacts;
  environmentKnown: boolean;
}

/**
 * Przyciski po nieudanej wysyłce wg tabeli stanów (cykl życia faktury,
 * sekcja 7): „Wyślij ponownie”, „Wróć do szkicu”, link do ustawień KSeF —
 * albo samo wyjaśnienie, gdy sprawą zajmuje się automat lub operator.
 * Decyzję podejmuje `failedInvoiceButtons`, tę samą, którą sprawdzają akcje.
 */
export function FailedInvoiceActions({ invoiceId, status, errorCode, invoiceKind, canManage, facts, environmentKnown }: Props) {
  const router = useRouter();
  const [isResending, startResending] = useTransition();
  const [isResetting, startResetting] = useTransition();
  const plan = failedInvoiceButtons({ status, errorCode, invoiceKind, canManage, facts, environmentKnown });
  if (!plan) return null;
  const busy = isResending || isResetting;

  const handleResend = () => {
    startResending(async () => {
      const result = await resendInvoiceAction(invoiceId);
      if (!result.success) {
        toast.error(result.error);
        // Strona otwarta po północy: serwer przeliczy fakty i zamieni przycisk na wyjaśnienie.
        router.refresh();
        return;
      }
      toast.success('Faktura wróciła do kolejki KSeF.');
      router.refresh();
    });
  };

  const handleReset = () => {
    if (!window.confirm('Wrócić do szkicu? Dane wysyłki zostaną wyczyszczone, numer faktury zostaje.')) return;
    startResetting(async () => {
      const result = await resetInvoiceToDraftAction(invoiceId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(resetDoneMessage(invoiceKind, facts));
      router.refresh();
    });
  };

  return (
    <div className="w-full flex flex-col items-end gap-2">
      <p className="text-right text-sm text-[var(--ff-text-muted)]">{plan.info}</p>
      {(plan.resend || plan.reset || plan.settings) && (
        <div className="flex flex-wrap gap-2 justify-end">
          {plan.settings && (
            <Button asChild variant="outline">
              <Link href="/settings/ksef">
                <Settings className="h-4 w-4 mr-2" />
                Ustawienia KSeF
              </Link>
            </Button>
          )}
          {plan.reset && (
            <Button variant="outline" onClick={handleReset} disabled={busy}>
              {isResetting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
              Wróć do szkicu
            </Button>
          )}
          {plan.resend && (
            <Button onClick={handleResend} disabled={busy}>
              {isResending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Wyślij ponownie
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
