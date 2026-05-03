'use client';

import { useState, useTransition } from 'react';
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
import { VatStatusBadge } from '@/components/validation/vat-status-badge';
import type { CachedValidationResult } from '@/lib/validation/cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertCircle, Plus, Trash2, Loader2 } from 'lucide-react';
import { BUYER_ID_TYPE_LABELS } from '@/types/invoice-types';

const defaultLine: InvoiceFormValues['lines'][number] = {
  name: '',
  unit: 'szt',
  quantity: 1,
  unitPriceNet: 0,
  vatRate: '23',
};

function firstValidationMessage(errors: FieldErrors<InvoiceFormValues>): string {
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

const labelClass =
  'text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block';

export function InvoiceForm() {
  const router = useRouter();
  const [isSaving, startSaving] = useTransition();
  const [isSending, startSending] = useTransition();
  const [buyerVatStatus, setBuyerVatStatus] =
    useState<CachedValidationResult | null>(null);

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
      buyerIsConsumer: false,
      buyerConsumerIdType: undefined,
      buyerPesel: '',
      buyerIdDocument: '',
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

  const watchedLines = useWatch({ control: form.control, name: 'lines' });
  const buyerNipWatch = useWatch({ control: form.control, name: 'buyerNip' });
  const buyerIsConsumer = useWatch({ control: form.control, name: 'buyerIsConsumer' });
  const buyerConsumerIdType = useWatch({
    control: form.control,
    name: 'buyerConsumerIdType',
  });

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
      if (
        !buyerIsConsumer &&
        buyerVatStatus &&
        !buyerVatStatus.isValid
      ) {
        const label =
          buyerVatStatus.legalName?.trim() ||
          `(NIP ${buyerVatStatus.nip ?? '?'})`;
        const proceed =
          typeof window !== 'undefined' &&
          confirm(
            `Uwaga: kontrahent ${label} ma status "${buyerVatStatus.vatStatus}". KSeF może odrzucić fakturę. Kontynuować?`,
          );
        if (!proceed) {
          return;
        }
      }

      startSending(async () => {
        try {
          const result = await saveAndSendInvoiceAction(values);
          if (result.success) {
            toast.success('Wysyłanie faktury do KSeF rozpoczęte');
            router.push(`/invoices/${result.invoiceId}`);
          } else {
            toast.error(result.error);
            if (result.invoiceId) router.push(`/invoices/${result.invoiceId}`);
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

  // react-hook-form: watch() jest celowo niememoizowalny — React Compiler pomija ten hook.
  // eslint-disable-next-line react-hooks/incompatible-library -- RHF watch dla warunkowego UI
  const paymentMethod = form.watch('paymentMethod');

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-8 pb-32">
      {/* Page header */}
      <div>
        <h1 className="text-4xl font-semibold tracking-tight">Nowa faktura</h1>
        <p className="mt-2 text-muted-foreground">
          Wystaw fakturę B2B lub B2C i wyślij do KSeF jednym kliknięciem
        </p>
      </div>

      {/* SECTION: Dane faktury */}
      <section className="rounded-3xl border border-white/55 dark:border-white/14 bg-white/45 dark:bg-[rgba(15,10,30,0.45)] backdrop-blur-[24px] shadow-[0_8px_32px_0_rgba(31,38,135,0.08)] p-7 lg:p-8 space-y-5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Dane faktury</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Numer i data wystawienia
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="internalNumber" className={labelClass}>
              Numer faktury
            </Label>
            <Input
              id="internalNumber"
              placeholder="FV/2026/04/001"
              {...form.register('internalNumber')}
            />
            {form.formState.errors.internalNumber && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1.5 flex items-center gap-1.5">
                <AlertCircle className="h-3 w-3" />
                {form.formState.errors.internalNumber.message}
              </p>
            )}
          </div>
          <div>
            <Label className={labelClass}>Data wystawienia</Label>
            <Input type="date" {...form.register('issueDate')} />
          </div>
        </div>
      </section>

      {/* SECTION: Nabywca */}
      <section className="rounded-3xl border border-white/55 dark:border-white/14 bg-white/45 dark:bg-[rgba(15,10,30,0.45)] backdrop-blur-[24px] shadow-[0_8px_32px_0_rgba(31,38,135,0.08)] p-7 lg:p-8 space-y-5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Nabywca</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {buyerIsConsumer
              ? 'Dane osoby fizycznej (bez NIP podatnika)'
              : 'Wyszukaj po NIP w bazie GUS lub wprowadź ręcznie'}
          </p>
        </div>
        <div className="flex items-start gap-3 rounded-2xl border border-white/45 bg-white/30 p-4 dark:border-white/12 dark:bg-white/[0.04]">
          <Checkbox
            id="buyer-is-consumer"
            checked={!!buyerIsConsumer}
            onCheckedChange={(c) => {
              const on = c === true;
              form.setValue('buyerIsConsumer', on, { shouldDirty: true });
              setBuyerVatStatus(null);
              if (on) {
                form.setValue('buyerNip', '', { shouldDirty: true });
                form.setValue('buyerConsumerIdType', 'pesel', { shouldDirty: true });
              } else {
                form.setValue('buyerConsumerIdType', undefined, { shouldDirty: true });
                form.setValue('buyerPesel', '', { shouldDirty: true });
                form.setValue('buyerIdDocument', '', { shouldDirty: true });
              }
              void form.trigger(['buyerNip', 'buyerConsumerIdType', 'buyerPesel', 'buyerIdDocument']);
            }}
          />
          <div className="min-w-0 flex-1 space-y-0.5">
            <Label htmlFor="buyer-is-consumer" className="text-sm font-medium leading-none">
              Faktura dla osoby fizycznej (bez NIP)
            </Label>
            <p className="text-xs text-muted-foreground">
              Włącz dla B2C: wybierz typ identyfikatora (PESEL, dowód, paszport lub brak).
            </p>
          </div>
        </div>
        {!buyerIsConsumer ? (
          <div className="space-y-2">
            <Label className={labelClass}>NIP nabywcy</Label>
            <BuyerLookup
              nip={buyerNipWatch ?? ''}
              onNipChange={(digits) => {
                form.setValue('buyerNip', digits, { shouldDirty: true });
                if (digits.length === 10) void form.trigger('buyerNip');
              }}
              onSelected={handleBuyerSelected}
              nipError={form.formState.errors.buyerNip?.message}
              onValidationComplete={(result) => {
                setBuyerVatStatus(result);
                if (
                  result?.legalName &&
                  !form.getValues('buyerName')?.trim()
                ) {
                  form.setValue('buyerName', result.legalName, {
                    shouldDirty: true,
                  });
                }
              }}
            />
            {buyerVatStatus ? (
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <VatStatusBadge
                  status={buyerVatStatus.vatStatus}
                  source={buyerVatStatus.source}
                  fromCache={buyerVatStatus.fromCache}
                  warning={buyerVatStatus.warning ?? null}
                  size="sm"
                />
              </div>
            ) : null}
          </div>
        ) : null}
        {buyerIsConsumer ? (
          <div className="space-y-2">
            <Label className={labelClass}>Typ identyfikatora</Label>
            <Select
              value={buyerConsumerIdType ?? 'pesel'}
              onValueChange={(v) => {
                form.setValue(
                  'buyerConsumerIdType',
                  v as InvoiceFormValues['buyerConsumerIdType'],
                  { shouldDirty: true },
                );
                form.setValue('buyerPesel', '', { shouldDirty: true });
                form.setValue('buyerIdDocument', '', { shouldDirty: true });
                void form.trigger(['buyerConsumerIdType', 'buyerPesel', 'buyerIdDocument']);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Wybierz typ" />
              </SelectTrigger>
              <SelectContent>
                {(['pesel', 'id_card', 'passport', 'no_id'] as const).map((k) => (
                  <SelectItem key={k} value={k}>
                    {BUYER_ID_TYPE_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.buyerConsumerIdType ? (
              <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
                <AlertCircle className="h-3 w-3" />
                {form.formState.errors.buyerConsumerIdType.message}
              </p>
            ) : null}
          </div>
        ) : null}
        {buyerIsConsumer && buyerConsumerIdType === 'pesel' ? (
          <div>
            <Label className={labelClass}>PESEL</Label>
            <Input
              inputMode="numeric"
              autoComplete="off"
              placeholder="11 cyfr"
              {...form.register('buyerPesel')}
            />
            {form.formState.errors.buyerPesel ? (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1.5 flex items-center gap-1.5">
                <AlertCircle className="h-3 w-3" />
                {form.formState.errors.buyerPesel.message}
              </p>
            ) : null}
          </div>
        ) : null}
        {buyerIsConsumer &&
        (buyerConsumerIdType === 'id_card' || buyerConsumerIdType === 'passport') ? (
          <div>
            <Label className={labelClass}>Numer dokumentu</Label>
            <Input
              autoComplete="off"
              placeholder={
                buyerConsumerIdType === 'id_card' ? 'Seria i numer dowodu' : 'Numer paszportu'
              }
              {...form.register('buyerIdDocument')}
            />
            {form.formState.errors.buyerIdDocument ? (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1.5 flex items-center gap-1.5">
                <AlertCircle className="h-3 w-3" />
                {form.formState.errors.buyerIdDocument.message}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className={labelClass}>Nazwa firmy</Label>
            <Input {...form.register('buyerName')} />
          </div>
          <div>
            <Label className={labelClass}>Adres (linia 1)</Label>
            <Input {...form.register('buyerAddressLine1')} />
          </div>
          <div>
            <Label className={labelClass}>Adres (linia 2)</Label>
            <Input {...form.register('buyerAddressLine2')} />
          </div>
          <div className="col-span-2">
            <Label className={labelClass}>Email (opcjonalnie)</Label>
            <Input type="email" {...form.register('buyerEmail')} />
          </div>
        </div>
      </section>

      {/* SECTION: Pozycje */}
      <section className="rounded-3xl border border-white/55 dark:border-white/14 bg-white/45 dark:bg-[rgba(15,10,30,0.45)] backdrop-blur-[24px] shadow-[0_8px_32px_0_rgba(31,38,135,0.08)] p-7 lg:p-8 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Pozycje</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Towary i usługi na fakturze
            </p>
          </div>
          <Button
            type="button"
            variant="glass"
            size="sm"
            onClick={() => append(defaultLine)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Dodaj pozycję
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/55 dark:border-white/14 text-left text-muted-foreground">
                {['#', 'Nazwa', 'J.m.', 'Ilość', 'Cena netto', 'VAT', 'Netto', 'Brutto', ''].map((h) => (
                  <th key={h} className="py-3 font-medium text-xs uppercase tracking-wider">
                    {h}
                  </th>
                ))}
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
                  <tr
                    key={field.id}
                    className="border-b border-white/55 dark:border-white/[0.07] last:border-0"
                  >
                    <td className="py-3 text-muted-foreground">{index + 1}</td>
                    <td className="py-3 pr-2">
                      <Input className="h-9" {...form.register(`lines.${index}.name`)} />
                    </td>
                    <td className="py-3 pr-2">
                      <Input className="h-9" {...form.register(`lines.${index}.unit`)} />
                    </td>
                    <td className="py-3 pr-2">
                      <Input
                        type="number"
                        step="0.0001"
                        className="h-9"
                        {...form.register(`lines.${index}.quantity`, {
                          valueAsNumber: true,
                        })}
                      />
                    </td>
                    <td className="py-3 pr-2">
                      <Input
                        type="number"
                        step="0.01"
                        className="h-9"
                        {...form.register(`lines.${index}.unitPriceNet`, {
                          valueAsNumber: true,
                        })}
                      />
                    </td>
                    <td className="py-3 pr-2">
                      <select
                        className="h-9 border border-white/55 dark:border-white/14 rounded-xl px-2 text-sm w-full bg-white/50 dark:bg-white/[0.05] backdrop-blur-[12px] transition-colors focus:outline-none focus:ring-2 focus:ring-foreground/20"
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
                    <td className="py-3 text-right tabular-nums pr-2">
                      {calc.netAmount.toFixed(2)}
                    </td>
                    <td className="py-3 text-right tabular-nums font-medium pr-2">
                      {calc.grossAmount.toFixed(2)}
                    </td>
                    <td className="py-3">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={fields.length === 1}
                        onClick={() => remove(index)}
                        className="h-9 w-9 rounded-lg hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-white/55 dark:border-white/14">
                <td
                  colSpan={6}
                  className="py-4 text-right font-medium text-muted-foreground text-xs uppercase tracking-wider"
                >
                  RAZEM
                </td>
                <td className="py-4 text-right tabular-nums font-medium">
                  {totals.netTotal.toFixed(2)}
                </td>
                <td className="py-4 text-right tabular-nums font-bold">
                  {totals.grossTotal.toFixed(2)} PLN
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* SECTION: Płatność */}
      <section className="rounded-3xl border border-white/55 dark:border-white/14 bg-white/45 dark:bg-[rgba(15,10,30,0.45)] backdrop-blur-[24px] shadow-[0_8px_32px_0_rgba(31,38,135,0.08)] p-7 lg:p-8 space-y-5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Płatność</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Sposób i termin zapłaty
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className={labelClass}>Metoda płatności</Label>
            <Select
              value={paymentMethod}
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
            <Label className={labelClass}>Termin płatności</Label>
            <Input type="date" {...form.register('paymentDueDate')} />
          </div>
          <div className="col-span-2">
            <Label className={labelClass}>Numer rachunku (dla przelewu)</Label>
            <Input
              {...form.register('bankAccount')}
              placeholder="12 3456 7890 ..."
            />
          </div>
        </div>
      </section>

      {/* SECTION: Uwagi */}
      <section className="rounded-3xl border border-white/55 dark:border-white/14 bg-white/45 dark:bg-[rgba(15,10,30,0.45)] backdrop-blur-[24px] shadow-[0_8px_32px_0_rgba(31,38,135,0.08)] p-7 lg:p-8">
        <Label className={labelClass}>Uwagi</Label>
        <Textarea rows={3} {...form.register('notes')} />
      </section>

      {/* STICKY FOOTER */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-[280px] z-30 px-6 py-4 bg-white/62 dark:bg-[rgba(15,10,30,0.62)] backdrop-blur-[40px] border-t border-white/55 dark:border-white/10">
        <div className="max-w-7xl mx-auto flex gap-3 justify-end">
          <Button
            type="button"
            variant="glass"
            size="lg"
            onClick={handleSaveDraft}
            disabled={isSaving || isSending}
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Zapisz szkic
          </Button>
          <Button
            type="button"
            variant="glass-primary"
            size="lg"
            onClick={handleSend}
            disabled={isSaving || isSending}
          >
            {isSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Wystaw i wyślij do KSeF
          </Button>
        </div>
      </div>
    </form>
  );
}
