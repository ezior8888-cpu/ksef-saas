'use client';

import { useState, useTransition } from 'react';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

import { updateTaxOfficeAction } from '@/app/actions/tax-office';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TAX_OFFICES, taxOfficeName } from '@/lib/exports/tax-offices';

const LIST_ID = 'tax-office-options';

function label(code: string): string {
  const name = taxOfficeName(code);
  return name ? `${code} — ${name}` : code;
}

/**
 * Urząd skarbowy firmy — trafia do nagłówka plików JPK (KodUrzedu).
 * Wybór z oficjalnej listy MF: wpisz miasto albo kod, podpowiedzi zawężają.
 */
export function TaxOfficeForm({ initialCode }: { initialCode: string | null }) {
  const [value, setValue] = useState(initialCode ? label(initialCode) : '');
  const [pending, startTransition] = useTransition();

  const save = () => {
    startTransition(async () => {
      const result = await updateTaxOfficeAction(value);
      if (result.success) {
        setValue(result.code ? label(result.code) : '');
        toast.success(result.code ? 'Urząd skarbowy zapisany' : 'Urząd skarbowy usunięty');
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="space-y-3">
      <div>
        <Label
          htmlFor="tax-office"
          className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground"
        >
          Urząd skarbowy firmy
        </Label>
        <Input
          id="tax-office"
          list={LIST_ID}
          value={value}
          disabled={pending}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Wpisz miasto albo kod, np. Kraków lub 1213"
          autoComplete="off"
        />
        <datalist id={LIST_ID}>
          {TAX_OFFICES.map(([code, name]) => (
            <option key={code} value={`${code} — ${name}`} />
          ))}
        </datalist>
      </div>
      <p className="text-xs text-muted-foreground">
        Urząd, do którego firma składa JPK — ten sam, w którym rozlicza VAT. Bez niego eksport plików JPK
        nie poda urzędu. Nie wiesz, który? Sprawdź na podatki.gov.pl albo zapytaj księgową.
      </p>
      <Button type="button" onClick={save} disabled={pending} className="gap-2">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Zapisz
      </Button>
    </div>
  );
}
