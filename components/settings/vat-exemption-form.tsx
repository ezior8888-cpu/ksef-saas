'use client';

import { useState, useTransition } from 'react';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

import { updateVatExemptionAction } from '@/app/actions/vat-exemption';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { VAT_EXEMPTION_PRESETS } from '@/lib/invoices/vat-exemption';

const CUSTOM = 'inna';

/**
 * Zwolnienie z VAT firmy. Podstawa trafia do każdej faktury ze stawką „zw”
 * jako P_19A w FA(3). Firma zwolniona dostaje „zw” jako domyślną stawkę.
 */
export function VatExemptionForm({
  initialBasis,
  canEdit,
}: {
  initialBasis: string | null;
  /** Właściciel i administrator; pozostali widzą stan bez możliwości zmiany. */
  canEdit: boolean;
}) {
  const presetMatch = VAT_EXEMPTION_PRESETS.find((p) => p.value === initialBasis)?.value;
  const [exempt, setExempt] = useState(initialBasis !== null);
  const [choice, setChoice] = useState<string>(presetMatch ?? (initialBasis ? CUSTOM : VAT_EXEMPTION_PRESETS[0].value));
  const [custom, setCustom] = useState(presetMatch ? '' : initialBasis ?? '');
  const [pending, startTransition] = useTransition();

  const save = () => {
    const basis = !exempt ? null : choice === CUSTOM ? custom : choice;
    startTransition(async () => {
      const result = await updateVatExemptionAction(basis);
      if (result.success) {
        toast.success(result.basis ? 'Zwolnienie z VAT zapisane' : 'Firma jest czynnym podatnikiem VAT');
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={exempt}
          disabled={!canEdit || pending}
          onChange={(e) => setExempt(e.target.checked)}
          className="h-4 w-4"
        />
        Moja firma jest zwolniona z VAT
      </label>

      {exempt ? (
        <div className="space-y-3">
          <div>
            <Label htmlFor="vat-exemption-basis" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Podstawa prawna zwolnienia
            </Label>
            <select
              id="vat-exemption-basis"
              value={choice}
              disabled={!canEdit || pending}
              onChange={(e) => setChoice(e.target.value)}
              className="h-10 w-full rounded-lg border border-[var(--ff-border)] bg-[var(--ff-surface)] px-3 text-sm text-[var(--ff-text)]"
            >
              {VAT_EXEMPTION_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
              <option value={CUSTOM}>Inna podstawa (np. zwolnienie przedmiotowe z art. 43)</option>
            </select>
          </div>
          {choice === CUSTOM ? (
            <Input
              value={custom}
              disabled={!canEdit || pending}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="np. art. 43 ust. 1 pkt 29 lit. c ustawy o VAT"
              maxLength={256}
            />
          ) : null}
          <p className="text-xs text-muted-foreground">
            Ta podstawa trafi na każdą fakturę ze stawką „zw” (pole P_19A w KSeF). Nowe pozycje faktury dostaną
            stawkę „zw” domyślnie.
          </p>
        </div>
      ) : null}

      {canEdit ? (
        <Button type="button" onClick={save} disabled={pending} className="gap-2">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Zapisz
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">Zmienić to może właściciel albo administrator firmy.</p>
      )}
    </div>
  );
}
