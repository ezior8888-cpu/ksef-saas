'use client';

import { AlertCircle, ChevronRight, Lightbulb } from 'lucide-react';
import Link from 'next/link';

interface InvoiceErrorDisplayProps {
  errorMessage: string;
  errorCode?: string | null;
  errorField?: string | null;
  errorSuggestion?: string | null;
  invoiceId?: string;
  showEditLink?: boolean;
}

/**
 * Kartka błędu KSeF (przetłumaczony komunikat z DB).
 *
 * UWAGA: nie ma jeszcze `app/(dashboard)/invoices/[id]/edit` — link prowadzi
 * na szczegóły faktury z `focus` (na późniejsze scroll-to-field / pierwszą edycję).
 */
export function InvoiceErrorDisplay({
  errorMessage,
  errorCode,
  errorField,
  errorSuggestion,
  invoiceId,
  showEditLink = true,
}: InvoiceErrorDisplayProps) {
  return (
    <div className="rounded-3xl border border-red-500/20 bg-red-500/5 backdrop-blur-glass shadow-glass p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-2xl bg-red-500/10 flex items-center justify-center shrink-0">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
        </div>
        <div className="flex-1 space-y-1">
          <p className="text-xs uppercase tracking-wider text-red-700 dark:text-red-400 font-medium">
            Błąd wysyłki do KSeF
          </p>
          <p className="font-medium text-foreground">{errorMessage}</p>
          {errorCode && (
            <p className="text-xs text-muted-foreground font-mono">
              Kod techniczny: {errorCode}
            </p>
          )}
        </div>
      </div>

      {errorSuggestion && (
        <div className="rounded-2xl bg-blue-500/5 border border-blue-500/20 backdrop-blur-glass-sm p-4 flex items-start gap-3">
          <Lightbulb className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <p className="text-xs uppercase tracking-wider text-blue-700 dark:text-blue-400 font-medium">
              Jak naprawić
            </p>
            <p className="text-sm text-foreground leading-relaxed">{errorSuggestion}</p>
          </div>
        </div>
      )}

      {showEditLink && invoiceId && errorField && (
        <Link
          href={`/invoices/${invoiceId}?focus=${encodeURIComponent(errorField)}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-accent transition-colors"
        >
          Przejdź do problematycznego pola
          <ChevronRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}
