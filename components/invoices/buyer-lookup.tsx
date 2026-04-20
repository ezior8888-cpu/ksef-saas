'use client';

import { useTransition } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { lookupBuyerAction } from './actions';

/**
 * Wyszukiwarka nabywcy po NIP.
 *
 * NIP jest **tym samym polem** co `buyerNip` w react-hook-form (przekazywane
 * z rodzica jako `nip` + `onNipChange`). Wcześniej mieliśmy osobny stan
 * lokalny — user wpisywał 10 cyfr tylko tu, a walidacja szła na pustym
 * polu w drugim wierszu → fałszywy błąd „NIP: 10 cyfr”.
 */
interface Props {
  /** Wartość z `form` — jedyny NIP na fakturze */
  nip: string;
  onNipChange: (digits: string) => void;
  onSelected: (data: {
    nip: string;
    name: string;
    addressLine1: string;
    addressLine2: string;
  }) => void;
  /** Komunikat błędu walidacji z RHF (np. regex / suma kontrolna) */
  nipError?: string;
}

export function BuyerLookup({
  nip,
  onNipChange,
  onSelected,
  nipError,
}: Props) {
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
    <div className="space-y-1">
      <Label htmlFor="buyer-nip-lookup">NIP nabywcy (wyszukaj w GUS)</Label>
      <div className="flex gap-2">
        <Input
          id="buyer-nip-lookup"
          value={nip}
          onChange={(e) =>
            onNipChange(e.target.value.replace(/\D/g, '').slice(0, 10))
          }
          placeholder="10 cyfr, bez myślników"
          inputMode="numeric"
          maxLength={10}
          disabled={isLoading}
          autoComplete="off"
          className={nipError ? 'border-red-500 focus-visible:ring-red-500' : undefined}
        />
        <Button
          type="button"
          variant="outline"
          onClick={handleLookup}
          disabled={nip.length !== 10 || isLoading}
          title="Pobierz dane firmy z bazy GUS / cache"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
        </Button>
      </div>
      {nipError ? (
        <p className="text-xs text-red-600">{nipError}</p>
      ) : (
        <p className="text-xs text-gray-500">
          Wpisz NIP i opcjonalnie kliknij lupę, żeby uzupełnić nazwę i adres.
        </p>
      )}
    </div>
  );
}
