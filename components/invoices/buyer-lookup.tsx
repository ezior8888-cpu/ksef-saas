'use client';

import { useTransition } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { lookupBuyerAction } from './actions';

interface Props {
  nip: string;
  onNipChange: (digits: string) => void;
  onSelected: (data: {
    nip: string;
    name: string;
    addressLine1: string;
    addressLine2: string;
  }) => void;
  nipError?: string;
}

export function BuyerLookup({ nip, onNipChange, onSelected, nipError }: Props) {
  const [isLoading, startLoading] = useTransition();

  const handleLookup = () => {
    startLoading(async () => {
      const result = await lookupBuyerAction(nip);
      if (result.success) {
        onSelected(result.data);
        toast.success(
          result.source === 'cache'
            ? 'Uzupełniono z historii kontrahentów'
            : 'Uzupełniono danymi z GUS'
        );
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Input
          id="buyer-nip-lookup"
          value={nip}
          onChange={(e) => onNipChange(e.target.value.replace(/\D/g, '').slice(0, 10))}
          placeholder="Wyszukaj kontrahenta po NIP..."
          inputMode="numeric"
          maxLength={10}
          disabled={isLoading}
          autoComplete="off"
          className={`pr-12 font-mono${nipError ? ' border-red-500/60 focus:border-red-500/60 focus:ring-red-500/20' : ''}`}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleLookup}
          disabled={nip.length !== 10 || isLoading}
          className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 rounded-lg"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </div>
      {nipError ? (
        <p className="text-xs text-red-600 dark:text-red-400">{nipError}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Wpisz NIP i opcjonalnie kliknij lupę, żeby uzupełnić nazwę i adres.
        </p>
      )}
    </div>
  );
}
