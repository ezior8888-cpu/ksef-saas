'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  useForm,
  useFieldArray,
  useWatch,
  type FieldErrors,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  invoiceFormSchema,
  type InvoiceFormValues,
} from '@/lib/schemas/invoice-form';
import {
  calculateLineItem,
  calculateInvoiceTotals,
} from '@/lib/xml/invoice-calculator';
import type { InvoiceLineItem } from '@/types/invoice';
import { saveAndSendInvoiceAction, saveDraftAction } from './actions';
import { BuyerLookup } from './buyer-lookup';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, Loader2 } from 'lucide-react';

const defaultLine: InvoiceFormValues['lines'][number] = {
  name: '',
  unit: 'szt',
  quantity: 1,
  unitPriceNet: 0,
  vatRate: '23',
};

/** RHF nie wywołuje onSubmit przy błędach Zod — bez toastu user myśli że guzik jest zepsuty. */
function firstValidationMessage(
  errors: FieldErrors<InvoiceFormValues>
): string {
  const walk = (node: unknown): string | null => {
    if (!node || typeof node !== 'object') return null;
    const o = node as Record<string, unknown>;
    if (typeof o.message === 'string' && o.message.length) return o.message;
    if (Array.isArray(o)) {
      for (const item of o) {
        const m = walk(item);
        if (m) return m;
      }
      return null;
    }
    for (const v of Object.values(o)) {
      const m = walk(v);
      if (m) return m;
    }
    return null;
  };
  return walk(errors) ?? 'Sprawdź pola formularza (czerwone podpowiedzi).';
}

export function InvoiceForm() {
  const router = useRouter();
  const [isSaving, startSaving] = useTransition();
  const [isSending, startSending] = useTransition();

  const today = new Date().toISOString().slice(0, 10);
  const in14days = new Date(Date.now() + 14 * 86400_000)
    .toISOString()
    .slice(0, 10);

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: {
      internalNumber: '',
      issueDate: today,
      saleDate: '',
      buyerNip: '',
      buyerName: '',
      buyerAddressLine1: '',
      buyerAddressLine2: '',
      buyerEmail: '',
      lines: [defaultLine],
      paymentMethod: 'transfer',
      paymentDueDate: in14days,
      bankAccount: '',
      notes: '',
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'lines',
  });

  // Totale liczymy w locie z watchowanych pozycji. calculateInvoiceTotals
  // oczekuje `InvoiceLineItem` - budujemy snapshot z zaokrąglonymi
  // kwotami z calculateLineItem (to ta sama logika co backend użyje
  // przy finalizeInvoice, więc podgląd = rzeczywista faktura).
  const watchedLines = useWatch({ control: form.control, name: 'lines' });
  const buyerNipWatch = useWatch({ control: form.control, name: 'buyerNip' });
  const totals = calculateInvoiceTotals(
    ((watchedLines ?? []) as InvoiceFormValues['lines']).map<InvoiceLineItem>(
      (line, idx) => {
        const calc = calculateLineItem({
          quantity: Number(line?.quantity) || 0,
          unitPriceNet: Number(line?.unitPriceNet) || 0,
          vatRate: line?.vatRate ?? '23',
        });
        return {
          ordinal: idx + 1,
          name: line?.name ?? '',
          unit: line?.unit ?? 'szt',
          quantity: Number(line?.quantity) || 0,
          unitPriceNet: Number(line?.unitPriceNet) || 0,
          vatRate: line?.vatRate ?? '23',
          ...calc,
        };
      }
    )
  );

  const handleSaveDraft = form.handleSubmit(
    (values) => {
      startSaving(async () => {
        try {
          const result = await saveDraftAction(values);
          if (result.success) {
            toast.success('Szkic zapisany');
            router.push(`/invoices/${result.invoiceId}`);
          } else {
            toast.error(result.error);
          }
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Błąd zapisu');
        }
      });
    },
    (errors) => {
      toast.error(firstValidationMessage(errors));
    }
  );

  const handleSend = form.handleSubmit(
    (values) => {
      startSending(async () => {
        try {
          const result = await saveAndSendInvoiceAction(values);
          if (result.success) {
            toast.success('Wysyłanie faktury do KSeF rozpoczęte');
            router.push(`/invoices/${result.invoiceId}`);
          } else {
            toast.error(result.error);
            if (result.invoiceId) {
              router.push(`/invoices/${result.invoiceId}`);
            }
          }
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Błąd wysyłki');
        }
      });
    },
    (errors) => {
      toast.error(firstValidationMessage(errors));
    }
  );

  const handleBuyerSelected = (data: {
    nip: string;
    name: string;
    addressLine1: string;
    addressLine2: string;
  }) => {
    form.setValue('buyerNip', data.nip);
    form.setValue('buyerName', data.name);
    form.setValue('buyerAddressLine1', data.addressLine1);
    form.setValue('buyerAddressLine2', data.addressLine2);
  };

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
      <Card className="p-6 space-y-4">
        <h2 className="font-semibold">Dane faktury</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Numer faktury</Label>
            <Input
              placeholder="FV/2026/04/001"
              {...form.register('internalNumber')}
            />
            {form.formState.errors.internalNumber && (
              <p className="text-xs text-red-600 mt-1">
                {form.formState.errors.internalNumber.message}
              </p>
            )}
          </div>
          <div>
            <Label>Data wystawienia</Label>
            <Input type="date" {...form.register('issueDate')} />
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="font-semibold">Nabywca</h2>
        <BuyerLookup
          nip={buyerNipWatch ?? ''}
          onNipChange={(digits) => {
            form.setValue('buyerNip', digits, { shouldDirty: true });
            // Waliduj dopiero przy pełnym NIP (unikamy „10 cyfr” po 1. cyfrze).
            if (digits.length === 10) void form.trigger('buyerNip');
          }}
          onSelected={handleBuyerSelected}
          nipError={form.formState.errors.buyerNip?.message}
        />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Nazwa</Label>
            <Input {...form.register('buyerName')} />
          </div>
          <div>
            <Label>Adres (linia 1)</Label>
            <Input {...form.register('buyerAddressLine1')} />
          </div>
          <div>
            <Label>Adres (linia 2)</Label>
            <Input {...form.register('buyerAddressLine2')} />
          </div>
          <div className="col-span-2">
            <Label>Email (opcjonalnie)</Label>
            <Input type="email" {...form.register('buyerEmail')} />
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Pozycje</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append(defaultLine)}
          >
            <Plus className="h-4 w-4 mr-1" /> Dodaj pozycję
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2 w-8">#</th>
                <th>Nazwa</th>
                <th className="w-20">J.m.</th>
                <th className="w-24">Ilość</th>
                <th className="w-28">Cena netto</th>
                <th className="w-20">VAT</th>
                <th className="w-24">Netto</th>
                <th className="w-24">Brutto</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => {
                const watched = watchedLines?.[index];
                const calc = calculateLineItem({
                  quantity: Number(watched?.quantity) || 0,
                  unitPriceNet: Number(watched?.unitPriceNet) || 0,
                  vatRate: watched?.vatRate ?? '23',
                });
                return (
                  <tr key={field.id} className="border-b">
                    <td className="py-2">{index + 1}</td>
                    <td>
                      <Input
                        className="h-8"
                        {...form.register(`lines.${index}.name`)}
                      />
                    </td>
                    <td>
                      <Input
                        className="h-8"
                        {...form.register(`lines.${index}.unit`)}
                      />
                    </td>
                    <td>
                      <Input
                        type="number"
                        step="0.0001"
                        className="h-8"
                        {...form.register(`lines.${index}.quantity`, {
                          valueAsNumber: true,
                        })}
                      />
                    </td>
                    <td>
                      <Input
                        type="number"
                        step="0.01"
                        className="h-8"
                        {...form.register(`lines.${index}.unitPriceNet`, {
                          valueAsNumber: true,
                        })}
                      />
                    </td>
                    <td>
                      <select
                        className="h-8 border rounded px-2 text-sm w-full"
                        {...form.register(`lines.${index}.vatRate`)}
                      >
                        <option value="23">23%</option>
                        <option value="8">8%</option>
                        <option value="5">5%</option>
                        <option value="0">0%</option>
                        <option value="zw">zw</option>
                        <option value="oo">oo</option>
                        <option value="np">np</option>
                      </select>
                    </td>
                    <td className="text-right tabular-nums">
                      {calc.netAmount.toFixed(2)}
                    </td>
                    <td className="text-right tabular-nums font-medium">
                      {calc.grossAmount.toFixed(2)}
                    </td>
                    <td>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={fields.length === 1}
                        onClick={() => remove(index)}
                      >
                        <Trash2 className="h-4 w-4 text-gray-500" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6} className="py-3 text-right font-medium">
                  RAZEM
                </td>
                <td className="text-right tabular-nums font-medium">
                  {totals.netTotal.toFixed(2)}
                </td>
                <td className="text-right tabular-nums font-bold">
                  {totals.grossTotal.toFixed(2)} PLN
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="font-semibold">Płatność</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Metoda</Label>
            <Select
              value={form.watch('paymentMethod')}
              onValueChange={(v) =>
                form.setValue(
                  'paymentMethod',
                  v as InvoiceFormValues['paymentMethod']
                )
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="transfer">Przelew</SelectItem>
                <SelectItem value="cash">Gotówka</SelectItem>
                <SelectItem value="card">Karta</SelectItem>
                <SelectItem value="other">Inna</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Termin płatności</Label>
            <Input type="date" {...form.register('paymentDueDate')} />
          </div>
          <div className="col-span-2">
            <Label>Numer rachunku (dla przelewu)</Label>
            <Input
              {...form.register('bankAccount')}
              placeholder="12 3456 7890 ..."
            />
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <Label>Uwagi</Label>
        <Textarea rows={3} {...form.register('notes')} />
      </Card>

      <div className="flex gap-3 justify-end sticky bottom-0 bg-white py-3">
        <Button
          type="button"
          variant="outline"
          onClick={handleSaveDraft}
          disabled={isSaving || isSending}
        >
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Zapisz szkic
        </Button>
        <Button
          type="button"
          onClick={handleSend}
          disabled={isSaving || isSending}
        >
          {isSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Wystaw i wyślij do KSeF
        </Button>
      </div>
    </form>
  );
}
