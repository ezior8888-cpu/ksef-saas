'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Loader2, Mail, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { emailInvoiceAction } from './actions-detail';

/**
 * Wysyłka faktury (PDF w załączniku) do nabywcy (Faza 33 Krok 8).
 *
 * Przycisk rozwija inline pole na adres email — bez osobnego dialogu,
 * żeby trzymać się prostoty paska akcji faktury.
 */
export function EmailInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [isPending, start] = useTransition();

  if (!open) {
    return (
      <Button variant="glass" size="lg" onClick={() => setOpen(true)}>
        <Mail className="h-4 w-4 mr-2" />
        Wyślij mailem
      </Button>
    );
  }

  const submit = () => {
    start(async () => {
      const result = await emailInvoiceAction(invoiceId, email);
      if (result.success) {
        toast.success('Faktura wysłana.');
        setOpen(false);
        setEmail('');
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Input
        type="email"
        required
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="email nabywcy"
        className="w-56"
        aria-label="Adres email odbiorcy faktury"
      />
      <Button type="submit" size="lg" disabled={isPending}>
        {isPending ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Send className="h-4 w-4 mr-2" />
        )}
        Wyślij
      </Button>
      <Button
        type="button"
        variant="glass"
        size="lg"
        onClick={() => setOpen(false)}
        disabled={isPending}
      >
        Anuluj
      </Button>
    </form>
  );
}
