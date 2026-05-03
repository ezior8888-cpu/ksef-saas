'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Resolver } from 'react-hook-form';
import { useEffect, useMemo, useTransition } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { z } from 'zod';

import { BuyerLookup } from '@/components/invoices/buyer-lookup';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { calculateFinalInvoiceTotals } from '@/lib/invoices/calculator';
import {
  finalInvoiceSchema,
  type FinalInvoiceSchemaIn,
} from '@/lib/validators/invoice-validators';
import { calculateLineItem, roundToCents } from '@/lib/xml/invoice-calculator';
import type { BuyerB2B, InvoiceLine, SellerData } from '@/types/invoice-types';

import { saveFinalAction, saveAndSendFinalAction } from './final-actions';

type FinalFormIn = z.input<typeof finalInvoiceSchema>;

const labelClass =
  'text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block';

const emptyBuyer: BuyerB2B = {
  type: 'b2b',
  idType: 'nip',
  nip: '',
  name: '',
  address: { addressLine1: '', addressLine2: '', countryCode: 'PL' },
};

const defaultLine: FinalInvoiceSchemaIn['lines'][number] = {
  name: '',
  unit: 'szt',
  quantity: 1,
  unitPriceNet: 0,
  vatRate: '23',
};

export interface AdvanceOptionRow {
  id: string;
  internal_number: string | null;
  ksef_number: string | null;
  issue_date: string;
  advance_amount: number | string | null;
  gross_total: number | string | null;
}

export interface FinalInvoiceFormProps {
  initialSeller: SellerData;
  advanceInvoices: AdvanceOptionRow[];
}

function advanceLabel(row: AdvanceOptionRow): string {
  const num = row.internal_number?.trim() || row.ksef_number?.trim() || row.id.slice(0, 8);
  return num;
}

export function FinalInvoiceForm({ initialSeller, advanceInvoices }: FinalInvoiceFormProps) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [sending, startSend] = useTransition();

  const today = new Date().toISOString().slice(0, 10);
  const due = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

  const defaults: FinalFormIn = {
    invoiceType: 'final',
    internalNumber: '',
    issueDate: today,
    paymentMethod: 'transfer',
    paymentDueDate: due,
    bankAccount: '',
    notes: '',
    seller: initialSeller as FinalFormIn['seller'],
    buyer: emptyBuyer as FinalFormIn['buyer'],
    advanceInvoiceIds: [],
    totalAdvances: 0,
    lines: [{ ...defaultLine }],
  };

  const form = useForm<FinalFormIn, unknown, FinalInvoiceSchemaIn>({
    resolver: zodResolver(finalInvoiceSchema) as Resolver<
      FinalFormIn,
      unknown,
      FinalInvoiceSchemaIn
    >,
    defaultValues: defaults,
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'lines',
  });

  useEffect(() => {
    form.setValue('seller', initialSeller as FinalFormIn['seller']);
  }, [form, initialSeller]);

  const advanceById = useMemo(
    () => new Map(advanceInvoices.map((r) => [r.id, r])),
    [advanceInvoices],
  );

  const selectedIds = useWatch({ control: form.control, name: 'advanceInvoiceIds' }) ?? [];
  const watchedLines =
    useWatch({ control: form.control, name: 'lines' }) ??
    ([] as FinalInvoiceSchemaIn['lines']);

  const totalAdvancesRounded = useMemo(() => {
    let sum = 0;
    const ids = selectedIds ?? [];
    for (const id of ids) {
      const row = advanceById.get(id);
      if (!row) continue;
      const raw = Number(row.advance_amount ?? row.gross_total ?? 0);
      sum += roundToCents(raw);
    }
    return sum;
  }, [selectedIds, advanceById]);

  useEffect(() => {
    form.setValue('totalAdvances', totalAdvancesRounded, {
      shouldDirty: false,
      shouldValidate: true,
    });
  }, [totalAdvancesRounded, form]);

  const normalizedLines = (watchedLines as FinalInvoiceSchemaIn['lines']).map((l) => ({
    name: l?.name ?? '',
    unit: l?.unit ?? 'szt',
    quantity: Number(l?.quantity) || 0,
    unitPriceNet: Number(l?.unitPriceNet) || 0,
    vatRate: (l?.vatRate ?? '23') as InvoiceLine['vatRate'],
    pkwiuCode: l?.pkwiuCode,
    gtuCode: l?.gtuCode,
  }));

  const finalTotals = calculateFinalInvoiceTotals(normalizedLines, totalAdvancesRounded);

  function toggleAdvance(id: string, checked: boolean) {
    const cur = form.getValues('advanceInvoiceIds') ?? [];
    const next = checked ? [...new Set([...cur, id])] : cur.filter((x) => x !== id);
    form.setValue('advanceInvoiceIds', next, { shouldDirty: true, shouldValidate: true });
  }

  function currentBuyer(): BuyerB2B {
    const raw = form.getValues('buyer');
    if (raw?.type !== 'b2b') return { ...emptyBuyer };
    const b = raw as BuyerB2B;
    return {
      ...emptyBuyer,
      ...b,
      address: {
        ...emptyBuyer.address,
        ...b.address,
        countryCode: b.address?.countryCode || 'PL',
      },
    };
  }

  function patchBuyer(patch: Partial<BuyerB2B>) {
    const cur = currentBuyer();
    const next: BuyerB2B = {
      ...cur,
      ...patch,
      address: {
        ...cur.address,
        ...(patch.address ?? {}),
        countryCode: patch.address?.countryCode ?? cur.address.countryCode ?? 'PL',
      },
    };
    form.setValue('buyer', next as FinalFormIn['buyer'], {
      shouldValidate: true,
      shouldDirty: true,
    });
  }

  const nipDisplay = currentBuyer().nip.replace(/\D/g, '');
  const paymentMethodWatch = useWatch({ control: form.control, name: 'paymentMethod' });

  const onSave = form.handleSubmit(
    (data) =>
      startSave(async () => {
        const r = await saveFinalAction(data);
        if (r.success) {
          toast.success('Zapisano szkic faktury rozliczającej');
          router.push(`/invoices/${r.invoiceId}`);
        } else toast.error(r.error);
      }),
    () => toast.error('Popraw błędy formularza'),
  );

  const onSend = form.handleSubmit(
    (data) =>
      startSend(async () => {
        const r = await saveAndSendFinalAction(data);
        if (r.success) {
          toast.success('Faktura rozliczająca w kolejce KSeF');
          router.push(`/invoices/${r.invoiceId}`);
        } else toast.error(r.error);
      }),
    () => toast.error('Popraw błędy formularza'),
  );

  const busy = saving || sending;

  return (
    <form className="space-y-8 pb-32" onSubmit={(e) => e.preventDefault()}>
      <Link
        href="/invoices/new"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Typ faktury
      </Link>

      <div>
        <h1 className="text-4xl font-semibold tracking-tight">Faktura rozliczająca</h1>
        <p className="mt-2 text-muted-foreground">
          Dokument FA(3){' '}
          <span className="font-mono text-xs">RodzajFaktury=ROZ</span> — rozliczenie wcześniejszych
          zaliczek
        </p>
      </div>

      <section className="space-y-4 rounded-3xl border border-white/55 bg-white/45 p-7 backdrop-blur-[24px] dark:border-white/14 dark:bg-[rgba(15,10,30,0.45)] lg:p-8">
        <h2 className="text-lg font-semibold tracking-tight">Dane dokumentu</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label className={labelClass}>Numer</Label>
            <Input {...form.register('internalNumber')} />
            {form.formState.errors.internalNumber ? (
              <p className="mt-1 text-xs text-red-600">
                {form.formState.errors.internalNumber.message}
              </p>
            ) : null}
          </div>
          <div>
            <Label className={labelClass}>Data wystawienia</Label>
            <Input type="date" {...form.register('issueDate')} />
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-3xl border border-white/55 bg-white/45 p-7 backdrop-blur-[24px] dark:border-white/14 dark:bg-[rgba(15,10,30,0.45)] lg:p-8">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Faktury zaliczkowe do rozliczenia</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tylko zaakceptowane w KSeF zaliczki z tej firmy. Suma jest przeliczana automatycznie.
          </p>
        </div>
        {advanceInvoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Brak zaliczek do wyboru. Wystaw i zaakceptuj najpierw fakturę zaliczkową.
          </p>
        ) : (
          <ul className="max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-white/40 p-3 dark:border-white/10">
            {advanceInvoices.map((row) => {
              const checked = selectedIds.includes(row.id);
              const amt = roundToCents(Number(row.advance_amount ?? row.gross_total ?? 0));
              return (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/30 dark:hover:bg-white/5"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(c) => toggleAdvance(row.id, c === true)}
                    aria-label={`Zaliczka ${advanceLabel(row)}`}
                  />
                  <span className="min-w-0 flex-1 font-medium">{advanceLabel(row)}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{row.issue_date}</span>
                  <span className="tabular-nums text-sm font-medium">{amt.toFixed(2)} PLN</span>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-2xl border border-dashed border-white/45 p-4 dark:border-white/15">
          <span className="text-sm text-muted-foreground">Suma wybranych zaliczek (brutto)</span>
          <span className="text-lg font-semibold tabular-nums">
            {totalAdvancesRounded.toFixed(2)} PLN
          </span>
        </div>
        {form.formState.errors.advanceInvoiceIds ? (
          <p className="text-xs text-red-600">
            {String(form.formState.errors.advanceInvoiceIds.message ?? '')}
          </p>
        ) : null}
      </section>

      <section className="space-y-4 rounded-3xl border border-white/55 bg-white/45 p-7 backdrop-blur-[24px] dark:border-white/14 dark:bg-[rgba(15,10,30,0.45)] lg:p-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Pozycje</h2>
            <p className="mt-1 text-sm text-muted-foreground">Pełna realizacja zamówienia / usługi</p>
          </div>
          <Button type="button" variant="glass" size="sm" onClick={() => append({ ...defaultLine })}>
            <Plus className="mr-2 h-4 w-4" />
            Dodaj pozycję
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/55 text-left text-muted-foreground dark:border-white/14">
                {['#', 'Nazwa', 'J.m.', 'Ilość', 'Cena netto', 'VAT', 'Netto', 'Brutto', ''].map(
                  (h) => (
                    <th key={h} className="py-3 text-xs font-medium uppercase tracking-wider">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => {
                const watched = watchedLines[index];
                const calc = calculateLineItem({
                  quantity: Number(watched?.quantity) || 0,
                  unitPriceNet: Number(watched?.unitPriceNet) || 0,
                  vatRate: (watched?.vatRate ?? '23') as InvoiceLine['vatRate'],
                });
                return (
                  <tr
                    key={field.id}
                    className="border-b border-white/55 last:border-0 dark:border-white/[0.07]"
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
                        {...form.register(`lines.${index}.quantity`, { valueAsNumber: true })}
                      />
                    </td>
                    <td className="py-3 pr-2">
                      <Input
                        type="number"
                        step="0.01"
                        className="h-9"
                        {...form.register(`lines.${index}.unitPriceNet`, { valueAsNumber: true })}
                      />
                    </td>
                    <td className="py-3 pr-2">
                      <select
                        className="h-9 w-full rounded-xl border border-white/55 bg-white/50 px-2 text-sm backdrop-blur-[12px] transition-colors focus:outline-none focus:ring-2 focus:ring-foreground/20 dark:border-white/14 dark:bg-white/[0.05]"
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
                    <td className="py-3 pr-2 text-right tabular-nums">{calc.netAmount.toFixed(2)}</td>
                    <td className="py-3 pr-2 text-right tabular-nums font-medium">
                      {calc.grossAmount.toFixed(2)}
                    </td>
                    <td className="py-3">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={fields.length === 1}
                        onClick={() => remove(index)}
                        className="h-9 w-9"
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
                  className="py-4 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
                >
                  Razem brutto pozycji
                </td>
                <td className="py-4" />
                <td className="py-4 text-right tabular-nums font-semibold">
                  {finalTotals.totalGross.toFixed(2)} PLN
                </td>
                <td className="py-4" />
              </tr>
              <tr>
                <td
                  colSpan={6}
                  className="pb-4 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
                >
                  Do zapłaty po odliczeniu zaliczek
                </td>
                <td className="pb-4" />
                <td className="pb-4 text-right text-lg font-bold tabular-nums text-foreground">
                  {finalTotals.amountDue.toFixed(2)} PLN
                </td>
                <td className="pb-4" />
              </tr>
            </tfoot>
          </table>
        </div>
        {form.formState.errors.lines ? (
          <p className="text-xs text-red-600">Sprawdź pozycje (nazwa, ilość, ceny).</p>
        ) : null}
      </section>

      <section className="space-y-4 rounded-3xl border border-white/55 bg-white/45 p-7 backdrop-blur-[24px] dark:border-white/14 dark:bg-[rgba(15,10,30,0.45)] lg:p-8">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Nabywca (B2B)</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Zwykle ten sam podmiot co na fakturach zaliczkowych
          </p>
        </div>
        <BuyerLookup
          nip={nipDisplay}
          onNipChange={(d) => patchBuyer({ nip: d })}
          onSelected={(data) =>
            patchBuyer({
              nip: data.nip,
              name: data.name,
              address: {
                ...currentBuyer().address,
                addressLine1: data.addressLine1,
                addressLine2: data.addressLine2,
                countryCode: 'PL',
              },
            })
          }
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className={labelClass}>Nazwa podmiotu</Label>
            <Input
              value={currentBuyer().name}
              onChange={(e) => patchBuyer({ name: e.target.value })}
            />
          </div>
          <div>
            <Label className={labelClass}>Adres — linia 1</Label>
            <Input
              value={currentBuyer().address.addressLine1}
              onChange={(e) =>
                patchBuyer({
                  address: { ...currentBuyer().address, addressLine1: e.target.value },
                })
              }
            />
          </div>
          <div>
            <Label className={labelClass}>Adres — linia 2</Label>
            <Input
              value={currentBuyer().address.addressLine2}
              onChange={(e) =>
                patchBuyer({
                  address: { ...currentBuyer().address, addressLine2: e.target.value },
                })
              }
            />
          </div>
        </div>
        {form.formState.errors.buyer?.message ? (
          <p className="text-xs text-red-600">{String(form.formState.errors.buyer.message)}</p>
        ) : null}
      </section>

      <div className="rounded-3xl border border-dashed border-white/45 p-4 text-sm text-muted-foreground dark:border-white/20">
        <span className="font-medium text-foreground">{initialSeller.name}</span>{' '}
        <span className="tabular-nums">· NIP {initialSeller.nip}</span>
      </div>

      <section className="space-y-4 rounded-3xl border border-white/55 bg-white/45 p-7 backdrop-blur-[24px] dark:border-white/14 dark:bg-[rgba(15,10,30,0.45)] lg:p-8">
        <h3 className="font-semibold tracking-tight">Płatność</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label className={labelClass}>Metoda</Label>
            <Select
              value={paymentMethodWatch}
              onValueChange={(v) =>
                form.setValue('paymentMethod', v as FinalFormIn['paymentMethod'])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="transfer">Przelew</SelectItem>
                <SelectItem value="cash">Gotówka</SelectItem>
                <SelectItem value="card">Karta</SelectItem>
                <SelectItem value="compensation">Kompensata</SelectItem>
                <SelectItem value="other">Inna</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className={labelClass}>Termin płatności</Label>
            <Input type="date" {...form.register('paymentDueDate')} />
            {form.formState.errors.paymentDueDate ? (
              <p className="mt-1 text-xs text-red-600">
                {form.formState.errors.paymentDueDate.message}
              </p>
            ) : null}
          </div>
          <div className="sm:col-span-2">
            <Label className={labelClass}>Numer rachunku (26 cyfr, opcja)</Label>
            <Input {...form.register('bankAccount')} />
            {form.formState.errors.bankAccount ? (
              <p className="mt-1 text-xs text-red-600">
                {String(form.formState.errors.bankAccount.message)}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-white/55 p-7">
        <Label className={labelClass}>Uwagi</Label>
        <Textarea rows={2} {...form.register('notes')} />
      </section>

      <div className="fixed bottom-0 left-0 right-0 z-30 flex justify-end gap-3 border-t border-white/55 bg-white/72 px-6 py-4 backdrop-blur-xl dark:border-white/10 dark:bg-[rgba(15,10,30,0.72)] lg:left-[280px]">
        <Button type="button" variant="glass" disabled={busy} size="lg" onClick={onSave}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Zapisz szkic
        </Button>
        <Button type="button" variant="glass-primary" size="lg" disabled={busy} onClick={onSend}>
          {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Wyślij do KSeF
        </Button>
      </div>
    </form>
  );
}
