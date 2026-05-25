'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { FileArchive, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Pobranie ZIP z PDF wszystkich faktur wybranego miesiąca (Faza 33 Krok 7).
 *
 * Domyślnie bieżący miesiąc. ZIP buduje endpoint `/api/invoices/batch-pdf`.
 */
export function BatchPdfDownload() {
  const [month, setMonth] = useState<string>(() =>
    new Date().toISOString().slice(0, 7),
  );
  const [isPending, start] = useTransition();

  const download = () => {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      toast.error('Wybierz miesiąc.');
      return;
    }
    const [y, m] = month.split('-').map(Number);
    const from = `${month}-01`;
    // Ostatni dzień miesiąca: dzień 0 kolejnego miesiąca.
    const to = `${month}-${String(new Date(y!, m!, 0).getDate()).padStart(2, '0')}`;

    start(async () => {
      try {
        const res = await fetch(
          `/api/invoices/batch-pdf?from=${from}&to=${to}`,
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          toast.error(
            body.error === 'no_invoices'
              ? 'Brak faktur w tym miesiącu.'
              : body.error === 'too_many'
                ? 'Za dużo faktur w miesiącu (limit 100). Skontaktuj się z pomocą.'
                : 'Nie udało się przygotować paczki ZIP.',
          );
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Faktury_${month}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch {
        toast.error('Błąd połączenia przy pobieraniu paczki.');
      }
    });
  };

  return (
    <div className="flex items-end gap-2">
      <div>
        <label
          htmlFor="batch-month"
          className="mb-1 block text-xs font-medium text-muted-foreground"
        >
          Pobierz PDF za miesiąc
        </label>
        <Input
          id="batch-month"
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="w-40"
        />
      </div>
      <Button variant="glass" onClick={download} disabled={isPending}>
        {isPending ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <FileArchive className="h-4 w-4 mr-2" />
        )}
        ZIP
      </Button>
    </div>
  );
}
