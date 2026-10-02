'use client';

import { useState, useTransition } from 'react';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

import { updateCompanyProfileAction } from '@/app/actions/company-profile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Edycja nazwy i adresu siedziby firmy (F-008). Dane trafiają na każdą
 * KOLEJNĄ fakturę; wystawione faktury mają własną kopię i się nie zmieniają.
 */
export function CompanyProfileForm({
  initial,
}: {
  initial: { name: string; addressLine1: string; addressLine2: string };
}) {
  const [name, setName] = useState(initial.name);
  const [addressLine1, setAddressLine1] = useState(initial.addressLine1);
  const [addressLine2, setAddressLine2] = useState(initial.addressLine2);
  const [pending, startTransition] = useTransition();

  const save = () => {
    startTransition(async () => {
      const result = await updateCompanyProfileAction({ name, addressLine1, addressLine2 });
      if (result.success) {
        toast.success('Dane firmy zapisane — trafią na kolejne faktury');
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="grid grid-cols-1 gap-4 text-sm">
      <div className="space-y-1.5">
        <Label htmlFor="company-name">Nazwa firmy</Label>
        <Input id="company-name" value={name} maxLength={512} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="company-address-1">Ulica i numer</Label>
        <Input
          id="company-address-1"
          value={addressLine1}
          maxLength={512}
          onChange={(e) => setAddressLine1(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="company-address-2">Kod pocztowy i miejscowość</Label>
        <Input
          id="company-address-2"
          value={addressLine2}
          maxLength={512}
          placeholder="00-001 Warszawa"
          onChange={(e) => setAddressLine2(e.target.value)}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Zmiana dotyczy kolejnych faktur. Wystawione faktury zachowują dane z dnia wystawienia. NIP nie podlega zmianie.
      </p>
      <div>
        <Button onClick={save} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Zapisz dane firmy
        </Button>
      </div>
    </div>
  );
}
