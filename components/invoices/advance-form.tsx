'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Resolver } from 'react-hook-form';
import { useEffect, useMemo, useTransition } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { z } from 'zod';

import { BuyerLookup } from '@/components/invoices/buyer-lookup';
import { Button } from '@/components/ui/button';
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
import {
  advanceInvoiceSchema,
  type AdvanceInvoiceSchemaIn,
} from '@/lib/validators/invoice-validators';
import { calculateAdvanceTotals } from '@/lib/invoices/calculator';
import type { BuyerB2B, BuyerData, SellerData } from '@/types/invoice-types';

import { saveAdvanceAction, saveAndSendAdvanceAction } from './advance-actions';

type AdvanceFormIn = z.input<typeof advanceInvoiceSchema>;

const labelClass =
  'text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block';

const emptyBuyer: BuyerB2B = {
  type: 'b2b',
  idType: 'nip',
  nip: '',
  name: '',
  address: { addressLine1: '', addressLine2: '', countryCode: 'PL' },
};

export interface AdvanceInvoiceFormProps {
  initialSeller: SellerData;
}

export function AdvanceInvoiceForm({ initialSeller }: AdvanceInvoiceFormProps) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [sending, startSend] = useTransition();

  // useMemo([]) — daty defaultowe liczone raz przy mount; bez tego React Compiler
  // flaguje `Date.now()` jako impure call w renderze.
  const { today, due } = useMemo(() => {
    const now = Date.now();
    return {
      today: new Date(now).toISOString().slice(0, 10),
      due: new Date(now + 14 * 86400000).toISOString().slice(0, 10),
    };
  }, []);

  const defaults: AdvanceFormIn = {
    invoiceType: 'advance',
    internalNumber: '',
    issueDate: today,
    paymentMethod: 'transfer',
    paymentDueDate: due,
    bankAccount: '',
    notes: '',
    seller: initialSeller as AdvanceFormIn['seller'],
    buyer: emptyBuyer as AdvanceFormIn['buyer'],
    advanceAmount: 100,
    totalContractAmount: 1000,
    expectedDeliveryDate: undefined,
    vatRate: '23',
    description: 'Zaliczka na poczet przyszłej realizacji.',
  };

  const form = useForm<AdvanceFormIn, unknown, AdvanceInvoiceSchemaIn>({
    resolver: zodResolver(advanceInvoiceSchema) as Resolver<
      AdvanceFormIn,
      unknown,
      AdvanceInvoiceSchemaIn
    >,
    defaultValues: defaults,
  });

  useEffect(() => {
    form.setValue('seller', initialSeller as AdvanceFormIn['seller']);
  }, [form, initialSeller]);

  const totalContract =
    Number(useWatch({ control: form.control, name: 'totalContractAmount' })) || 0;
  const advanceAmt = Number(useWatch({ control: form.control, name: 'advanceAmount' })) || 0;
  const vatWatch = useWatch({ control: form.control, name: 'vatRate' }) ?? '23';
  const paymentMethodWatch = useWatch({ control: form.control, name: 'paymentMethod' });

  const preview = calculateAdvanceTotals({
    invoiceType: 'advance',
    internalNumber: '—',
    issueDate: today,
    paymentDueDate: due,
    paymentMethod: 'transfer',
    seller: initialSeller,
    buyer: emptyBuyer as unknown as BuyerData,
    advanceAmount: advanceAmt,
    totalContractAmount: totalContract,
    vatRate: vatWatch as AdvanceInvoiceSchemaIn['vatRate'],
    description: '—',
  });

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
    form.setValue('buyer', next as AdvanceFormIn['buyer'], {
      shouldValidate: true,
      shouldDirty: true,
    });
  }

  const nipDisplay = currentBuyer().nip.replace(/\D/g, '');

  const onSave = form.handleSubmit(
    (data) =>
      startSave(async () => {
        const r = await saveAdvanceAction(data);
        if (r.success) {
          toast.success('Zapisano szkic zaliczki');
          router.push(`/invoices/${r.invoiceId}`);
        } else toast.error(r.error);
      }),
    () => toast.error('Popraw błędy formularza'),
  );

  const onSend = form.handleSubmit(
    (data) =>
      startSend(async () => {
        const r = await saveAndSendAdvanceAction(data);
        if (r.success) {
          toast.success('Zaliczka w kolejce KSeF');
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
        <h1 className="text-4xl font-semibold tracking-tight">Faktura zaliczkowa</h1>
        <p className="mt-2 text-muted-foreground">
          Dokument FA(3) z <span className="font-mono text-xs">RodzajFaktury=ZAL</span>
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="space-y-3 rounded-3xl border border-white/55 bg-white/45 p-7 backdrop-blur-[24px] dark:border-white/14 dark:bg-[rgba(15,10,30,0.45)] lg:p-8">
          <h3 className="font-semibold">Wartość umowy (brutto)</h3>
          <Input
            type="number"
            step="0.01"
            {...form.register('totalContractAmount', { valueAsNumber: true })}
          />
          <p className="text-xs text-muted-foreground">Łączna wartość kontraktu / dostaw</p>
        </section>

        <section className="space-y-3 rounded-3xl border border-white/55 bg-white/45 p-7 backdrop-blur-[24px] dark:border-white/14 dark:bg-[rgba(15,10,30,0.45)] lg:p-8">
          <h3 className="font-semibold">Kwota zaliczki (brutto)</h3>
          <Input
            type="number"
            step="0.01"
            {...form.register('advanceAmount', { valueAsNumber: true })}
          />
          <p className="text-xs text-muted-foreground">
            Pozostało rozliczenia brutto:{' '}
            <strong className="tabular-nums">{preview.remainingAmount.toFixed(2)} PLN</strong>
          </p>
          {form.formState.errors.advanceAmount ? (
            <p className="text-xs text-red-600">{form.formState.errors.advanceAmount.message}</p>
          ) : null}
        </section>
      </div>

      <section className="space-y-4 rounded-3xl border border-white/55 bg-white/45 p-7 backdrop-blur-[24px] dark:border-white/14 dark:bg-[rgba(15,10,30,0.45)] lg:p-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <Label className={labelClass}>Stawka VAT zaliczki</Label>
            <Select
              value={vatWatch}
              onValueChange={(v) =>
                form.setValue('vatRate', v as AdvanceInvoiceSchemaIn['vatRate'], {
                  shouldDirty: true,
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['23', '8', '5', '0'] as const).map((x) => (
                  <SelectItem key={x} value={x}>
                    {x}%
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label className={labelClass}>Planowana data realizacji</Label>
            <Input type="date" {...form.register('expectedDeliveryDate')} />
          </div>
          <div className="sm:col-span-3">
            <Label className={labelClass}>Opis</Label>
            <Textarea rows={2} {...form.register('description')} />
            {form.formState.errors.description ? (
              <p className="mt-1 text-xs text-red-600">
                {form.formState.errors.description.message}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-3xl border border-white/55 bg-white/45 p-7 backdrop-blur-[24px] dark:border-white/14 dark:bg-[rgba(15,10,30,0.45)] lg:p-8">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Nabywca (B2B)</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Wyszukaj kontrahenta po NIP lub uzupełnij pola ręcznie
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
                form.setValue('paymentMethod', v as AdvanceFormIn['paymentMethod'])
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

      <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-30 px-6 py-4 lg:left-[280px]">
        <div className="mx-auto flex max-w-7xl justify-end gap-3 pointer-events-auto">
          <Button type="button" variant="glass" disabled={busy} size="lg" onClick={onSave}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Zapisz szkic
          </Button>
          <Button
            type="button"
            variant="glass-primary"
            size="lg"
            disabled={busy}
            onClick={onSend}
          >
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Wyślij zaliczkę do KSeF
          </Button>
        </div>
      </div>
    </form>
  );
}
