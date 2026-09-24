'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
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
import {
  saveAndSendInvoiceAction,
  saveDraftAction,
  type PrefillFromLastInvoice,
} from './actions';
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
import Link from 'next/link';
import { AlertCircle, ChevronLeft, Plus, Trash2, Loader2 } from 'lucide-react';
import { InvoiceTotals } from '@/components/invoices/invoice-totals';
import { formatPlMoney } from '@/lib/format/pl';
import { ffSettingsPanel } from '@/lib/dashboard/ff-surface-classes';
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
  'text-xs font-medium text-[var(--ff-text-muted)] uppercase tracking-wider mb-1.5 block';

/**
 * Sekcja formularza.
 *
 * DO WRZEŚNIA 2026 TO BYŁ OSTATNI EKRAN NA STARYM „SZKLE”. Pięć sekcji miało
 * wpisane na sztywno `bg-white/45 backdrop-blur-[24px] border-white/55` razem
 * z wariantami `dark:` — czyli paletę sprzed przemalowania panelu na biało
 * (30.08.2026). W jasnym motywie ratował je wyłącznie zestaw łatek
 * `html:not(.dark) .ff-dashboard [class*='bg-white/5']` w `globals.css`.
 *
 * Teraz to jest zwykły panel na tokenach, taki sam jak w ustawieniach
 * i w tabelach. Odstęp wewnętrzny schodzi na telefonie z 28 px do 16 px —
 * przy szerokości 375 px stare `p-7` zabierało siódmą część ekranu.
 */
const sectionClass = `${ffSettingsPanel} space-y-5 p-4 sm:p-6 lg:p-8`;

/** Tailwind `lg` — musi być zgodne z breakpointem ukrywania/pokazywania pozycji. */
const LINES_LAYOUT_LG_MEDIA = '(min-width: 1024px)';

export function InvoiceForm({
  prefill = null,
}: {
  /** Podkład z ostatniej faktury — `null`, gdy tenant nie ma jeszcze żadnej. */
  prefill?: PrefillFromLastInvoice | null;
} = {}) {
  const router = useRouter();
  const [isSaving, startSaving] = useTransition();
  const [isSending, startSending] = useTransition();
  const [buyerVatStatus, setBuyerVatStatus] =
    useState<CachedValidationResult | null>(null);

  // Synchroniczny re-entry guard — `isSaving`/`isSending` z `useTransition`
  // ustawia się dopiero po async-walidacji RHF/Zod (kilka ms okna), przez co
  // szybkie podwójne kliknięcie "Wystaw i wyślij" potrafiło stworzyć dwie
  // faktury z tym samym `internal_number` (audyt #11). Ten ref blokuje submit
  // od razu na pierwszym kliknięciu, jeszcze zanim transition pendinguje.
  // Stanowi PIERWSZĄ warstwę ochrony — drugą jest unique index z migracji
  // 00028, trzecią mapowanie 23505 → friendly error w `actions.ts`.
  const submitInFlightRef = useRef(false);

  /**
   * Nie montuj jednocześnie tabeli desktop i kart mobile z tym samym
   * `register('lines.*')` — oba bloki były w DOM (tylko `display:none`), przez co
   * React Hook Form wiązał ref z „drugim” inputem i widoczne pole Nazwa nie
   * aktualizowało stanu.
   */
  const [linesDesktopLayout, setLinesDesktopLayout] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(LINES_LAYOUT_LG_MEDIA);
    const sync = () => setLinesDesktopLayout(mql.matches);
    sync();
    mql.addEventListener('change', sync);
    return () => mql.removeEventListener('change', sync);
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const in14days = new Date(Date.now() + 14 * 86400_000)
    .toISOString()
    .slice(0, 10);

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: {
      internalNumber: '',
      issueDate: today,
      saleDate: today,
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

  const { fields, append, remove, replace } = useFieldArray({
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

  // Wyciągnięte do zmiennej, bo tej samej tablicy potrzebuje `InvoiceTotals`
  // do rozbicia VAT-u na stawki. Wcześniej mapowanie żyło wyłącznie w argumencie
  // `calculateInvoiceTotals`, więc podsumowanie nie miało jak zobaczyć stawek
  // i liczyło VAT jako `brutto − netto`.
  const lineItems = (
    (watchedLines ?? []) as InvoiceFormValues['lines']
  ).map<InvoiceLineItem>((line, idx) => {
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
  });

  const totals = calculateInvoiceTotals(lineItems);

  // Podtytuł nagłówka na telefonie („wrzesień 2026 · KSeF”). Liczony przy
  // renderze, a nie wpisany na stałe — ten sam wzorzec co w pasku panelu
  // (`lib/dashboard-page-title.ts`).
  const miesiacRok = new Date().toLocaleDateString('pl-PL', {
    month: 'long',
    year: 'numeric',
  });

  const [prefillUzyty, setPrefillUzyty] = useState(false);

  /**
   * Wypełnienie z ostatniej faktury.
   *
   * NIE RUSZAMY numeru ani żadnej daty — te pola formularz wypełnił sam
   * wartościami na dziś i przepisanie starych byłoby cofnięciem faktury
   * w czasie. Reszta to podmiana wartości: nabywca, pozycje i sposób zapłaty.
   */
  const wypelnijZOstatniej = () => {
    if (!prefill) return;
    const v = prefill.values;
    form.setValue('buyerIsConsumer', false);
    form.setValue('buyerNip', v.buyerNip, { shouldValidate: true });
    form.setValue('buyerName', v.buyerName);
    form.setValue('buyerAddressLine1', v.buyerAddressLine1);
    form.setValue('buyerAddressLine2', v.buyerAddressLine2);
    form.setValue('buyerEmail', v.buyerEmail);
    form.setValue('paymentMethod', v.paymentMethod);
    if (v.bankAccount) form.setValue('bankAccount', v.bankAccount);
    replace(v.lines);
    setPrefillUzyty(true);
    toast.success(`Wypełniłem na podstawie faktury dla ${prefill.contractorName}`);
  };

  /**
   * Pigułki terminu: „14 dni” zamiast wybierania daty z kalendarza.
   * Liczone od daty wystawienia z formularza, nie od dzisiaj — inaczej przy
   * fakturze wystawionej wstecz termin wypadałby przed datą wystawienia,
   * a schemat to odrzuca (`paymentDueDate >= issueDate`).
   */
  const ustawTermin = (dni: number) => {
    const bazowa = form.getValues('issueDate');
    const d = bazowa ? new Date(`${bazowa}T00:00:00`) : new Date();
    if (Number.isNaN(d.getTime())) return;
    d.setDate(d.getDate() + dni);
    form.setValue('paymentDueDate', d.toISOString().slice(0, 10), {
      shouldValidate: true,
    });
  };

  const handleSaveDraft = form.handleSubmit(
    (values) => {
      if (submitInFlightRef.current) return;
      submitInFlightRef.current = true;
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
        } finally {
          submitInFlightRef.current = false;
        }
      });
    },
    (errors) => {
      submitInFlightRef.current = false;
      toast.error(firstValidationMessage(errors));
    }
  );

  const handleSend = form.handleSubmit(
    (values) => {
      if (submitInFlightRef.current) return;

      // BUG-010 (audyt przedlaunchowy): ostrzeżenie o fakturze bezpłatnej.
      // Puste pole ceny jest blokowane przez walidację Zod. Cena 0.00 zł jest
      // dozwolona (faktura bezpłatna jest legalna), ale wymaga świadomego
      // potwierdzenia, żeby user nie wysłał przypadkiem faktury na 0 zł.
      const hasZeroPriceLine = (values.lines ?? []).some(
        (l) => Number(l.unitPriceNet) === 0,
      );
      if (hasZeroPriceLine) {
        const proceed =
          typeof window !== 'undefined' &&
          confirm(
            'Co najmniej jedna pozycja ma cenę 0.00 zł. Czy na pewno chcesz wystawić fakturę bezpłatną?',
          );
        if (!proceed) return;
      }

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

      submitInFlightRef.current = true;
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
        } finally {
          submitInFlightRef.current = false;
        }
      });
    },
    (errors) => {
      submitInFlightRef.current = false;
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
      {/* NAGŁÓWEK — dwa układy.
          Na telefonie pasek z makiety: strzałka wstecz, tytuł z podtytułem,
          „Szkic” po prawej. Zapis szkicu wchodzi tu z dolnego paska, żeby
          zostawić mu miejsce na dwa przyciski zamiast trzech.
          Od `sm` zostaje duży tytuł, jak było. */}
      <div className="flex items-center gap-2 sm:hidden">
        <Link
          href="/invoices/new"
          aria-label="Wróć do wyboru rodzaju faktury"
          className="-ml-2 flex size-10 shrink-0 items-center justify-center rounded-lg text-[var(--ff-text-muted)] transition-colors hover:bg-[var(--ff-row-hover)]"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[20px] font-bold leading-tight tracking-[-0.02em] text-[var(--ff-text-strong)]">
            Nowa faktura
          </h1>
          <p className="truncate text-[13px] text-[var(--ff-text-muted)]">
            {miesiacRok} · KSeF
          </p>
        </div>
        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={isSaving || isSending}
          className="shrink-0 rounded-lg px-2 py-2 text-sm font-semibold text-[var(--ff-accent)] transition-opacity disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Szkic'}
        </button>
      </div>

      <div className="hidden sm:block">
        <h1 className="text-4xl font-semibold tracking-tight">Nowa faktura</h1>
        <p className="mt-2 text-muted-foreground">
          Wystaw fakturę B2B lub B2C i wyślij do KSeF jednym kliknięciem
        </p>
      </div>

      {/* PODPOWIEDŹ FLO — tylko gdy jest z czego wypełniać.
          Zniknie po użyciu: baner, który po kliknięciu zostaje, wygląda jakby
          nic się nie stało, a formularz jest już wypełniony. */}
      {prefill && !prefillUzyty ? (
        <div className="flex items-start gap-3 rounded-2xl border border-[var(--ff-accent)]/25 bg-[var(--ff-accent-tint)] p-4">
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--ff-primary)] text-sm font-semibold text-[var(--ff-on-primary)]"
          >
            F
          </span>
          <p className="min-w-0 flex-1 text-[13.5px] leading-relaxed text-[var(--ff-text)]">
            Mogę wypełnić to za Ciebie na podstawie ostatniej faktury dla{' '}
            <span className="font-semibold">{prefill.contractorName}</span>.{' '}
            <button
              type="button"
              onClick={wypelnijZOstatniej}
              className="font-semibold text-[var(--ff-accent)] underline-offset-4 hover:underline"
            >
              Wypełnij →
            </button>
          </p>
        </div>
      ) : null}

      {/* SECTION: Dane faktury */}
      <section className={sectionClass}>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Dane faktury</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Numer i data wystawienia
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <Input
              type="date"
              className="h-12 text-base"
              {...form.register('issueDate')}
            />
          </div>
        </div>
        <div className="max-w-md">
          <Label className={labelClass}>Data sprzedaży / dostawy</Label>
          <p className="-mt-0.5 mb-2 text-xs text-muted-foreground">
            Opcjonalnie, gdy jest inna od daty wystawienia (pole P_6 w KSeF); identyczna data nie jest duplikowana w XML.
          </p>
          <Input type="date" className="h-12 text-base" {...form.register('saleDate')} />
          {form.formState.errors.saleDate ? (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
              <AlertCircle className="h-3 w-3" />
              {form.formState.errors.saleDate.message}
            </p>
          ) : null}
        </div>
      </section>

      {/* SECTION: Nabywca */}
      <section className={sectionClass}>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Nabywca</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {buyerIsConsumer
              ? 'Dane osoby fizycznej (bez NIP podatnika)'
              : 'Wyszukaj po NIP w bazie GUS lub wprowadź ręcznie'}
          </p>
        </div>
        <div className="flex items-start gap-3 rounded-2xl border border-[var(--ff-border)] bg-[var(--ff-surface-container-low)] p-4">
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          <div className="sm:col-span-2">
            <Label className={labelClass}>Email (opcjonalnie)</Label>
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              className="h-12 text-base"
              {...form.register('buyerEmail')}
            />
          </div>
        </div>
      </section>

      {/* SECTION: Pozycje — tabela vs karty wg `linesDesktopLayout` (1024px, jak Tailwind lg) */}
      <section
        className={sectionClass}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tighter-text">
              Pozycje
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Towary i usługi na fakturze
            </p>
          </div>
          <Button
            type="button"
            variant="glass"
            size="sm"
            onClick={() => append(defaultLine)}
            className="shrink-0"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Dodaj pozycję</span>
            <span className="sm:hidden">Dodaj</span>
          </Button>
        </div>

        {/* Tylko jeden wariant layoutu naraz — patrz `linesDesktopLayout` powyżej. */}
        {linesDesktopLayout ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ff-border)] text-left text-[var(--ff-text-muted)]">
                <th className="w-8 py-3 text-xs font-medium uppercase tracking-wider">
                  #
                </th>
                <th className="py-3 text-xs font-medium uppercase tracking-wider">
                  Nazwa
                </th>
                <th className="w-20 py-3 text-xs font-medium uppercase tracking-wider">
                  J.m.
                </th>
                <th className="w-24 py-3 text-xs font-medium uppercase tracking-wider">
                  Ilość
                </th>
                <th className="w-32 py-3 text-xs font-medium uppercase tracking-wider">
                  Cena netto
                </th>
                <th className="w-24 py-3 text-xs font-medium uppercase tracking-wider">
                  VAT
                </th>
                <th className="w-28 py-3 text-right text-xs font-medium uppercase tracking-wider">
                  Netto
                </th>
                <th className="w-28 py-3 text-right text-xs font-medium uppercase tracking-wider">
                  Brutto
                </th>
                <th className="w-10 py-3" />
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => {
                const w = watchedLines?.[index];
                const calc = calculateLineItem({
                  quantity: Number(w?.quantity) || 0,
                  unitPriceNet: Number(w?.unitPriceNet) || 0,
                  vatRate: w?.vatRate ?? '23',
                });
                return (
                  <tr
                    key={field.id}
                    className="border-b border-[var(--ff-row-divider)] last:border-0"
                  >
                    <td className="py-3 text-muted-foreground">{index + 1}</td>
                    <td className="py-3 pr-2">
                      <Input
                        className="h-9"
                        {...form.register(`lines.${index}.name`)}
                      />
                    </td>
                    <td className="py-3 pr-2">
                      <Input
                        className="h-9"
                        {...form.register(`lines.${index}.unit`)}
                      />
                    </td>
                    <td className="py-3 pr-2">
                      <Input
                        type="number"
                        step="0.0001"
                        inputMode="decimal"
                        className="h-9 text-right tabular-nums"
                        {...form.register(`lines.${index}.quantity`, {
                          valueAsNumber: true,
                        })}
                      />
                    </td>
                    <td className="py-3 pr-2">
                      <Input
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        className="h-9 text-right tabular-nums"
                        {...form.register(`lines.${index}.unitPriceNet`, {
                          valueAsNumber: true,
                        })}
                      />
                    </td>
                    <td className="py-3 pr-2">
                      <select
                        className="h-9 w-full rounded-lg border border-[var(--ff-border)] bg-[var(--ff-surface)] px-2 text-sm text-[var(--ff-text)]"
                        {...form.register(`lines.${index}.vatRate`)}
                      >
                        <option value="23">23%</option>
                        <option value="8">8%</option>
                        <option value="5">5%</option>
                        <option value="0">0%</option>
                        <option value="oo">oo</option>
                        <option value="np">np</option>
                      </select>
                    </td>
                    <td className="py-3 text-right tabular-nums">
                      {formatPlMoney(calc.netAmount)}
                    </td>
                    <td className="py-3 text-right tabular-nums font-medium">
                      {formatPlMoney(calc.grossAmount)}
                    </td>
                    <td className="py-3">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={fields.length === 1}
                        onClick={() => remove(index)}
                        className="h-9 w-9 rounded-lg hover:bg-red-500/10 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        ) : (
        <div className="space-y-3">
          {fields.map((field, index) => {
            const w = watchedLines?.[index];
            const calc = calculateLineItem({
              quantity: Number(w?.quantity) || 0,
              unitPriceNet: Number(w?.unitPriceNet) || 0,
              vatRate: w?.vatRate ?? '23',
            });
            return (
              <div
                key={field.id}
                className="space-y-3 rounded-2xl border border-[var(--ff-border)] bg-[var(--ff-surface-container-low)] p-4"
              >
                <div className="flex items-center justify-between">
                  <span
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-xs font-medium text-background"
                  >
                    {index + 1}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={fields.length === 1}
                    onClick={() => remove(index)}
                    className="h-9 w-9 rounded-lg hover:bg-red-500/10 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div>
                  <Label className={labelClass}>Nazwa pozycji</Label>
                  <Input
                    placeholder="np. Usługa programistyczna"
                    className="h-12 text-base"
                    {...form.register(`lines.${index}.name`)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className={labelClass}>Ilość</Label>
                    <Input
                      type="number"
                      step="0.0001"
                      inputMode="decimal"
                      className="h-12 text-right text-base tabular-nums"
                      {...form.register(`lines.${index}.quantity`, {
                        valueAsNumber: true,
                      })}
                    />
                  </div>
                  <div>
                    <Label className={labelClass}>Jednostka</Label>
                    <Input
                      placeholder="szt."
                      className="h-12 text-base"
                      {...form.register(`lines.${index}.unit`)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className={labelClass}>Cena netto (PLN)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      className="h-12 text-right text-base tabular-nums"
                      {...form.register(`lines.${index}.unitPriceNet`, {
                        valueAsNumber: true,
                      })}
                    />
                  </div>
                  <div>
                    <Label className={labelClass}>Stawka VAT</Label>
                    <select
                      className="h-12 w-full rounded-xl border border-[var(--ff-border)] bg-[var(--ff-surface)] px-3 text-base text-[var(--ff-text)]"
                      {...form.register(`lines.${index}.vatRate`)}
                    >
                      <option value="23">23%</option>
                      <option value="8">8%</option>
                      <option value="5">5%</option>
                      <option value="0">0%</option>
                      <option value="oo">oo — odwrotne obciążenie</option>
                      <option value="np">np — nie podlega</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-[var(--ff-row-divider)] pt-3">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">
                    Brutto
                  </span>
                  <div className="text-right">
                    <p className="text-base font-bold tabular-nums">
                      {formatPlMoney(calc.grossAmount)} PLN
                    </p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      Netto: {formatPlMoney(calc.netAmount)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}

        </div>
        )}

        {/* Jedno podsumowanie pod oboma układami pozycji — tabelą i kartami. */}
        <InvoiceTotals totals={totals} lines={lineItems} />
      </section>

      {/* SECTION: Płatność */}
      <section className={sectionClass}>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Płatność</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Sposób i termin zapłaty
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <Input
              type="date"
              className="h-12 text-base"
              {...form.register('paymentDueDate')}
            />
            {/* Skróty zamiast kalendarza: na telefonie wybranie daty
                z natywnego okna to cztery dotknięcia, a „14 dni” jedno.
                Liczone od daty WYSTAWIENIA, nie od dzisiaj. */}
            <div className="mt-2 flex flex-wrap gap-2">
              {[7, 14, 30].map((dni) => (
                <button
                  key={dni}
                  type="button"
                  onClick={() => ustawTermin(dni)}
                  className="min-h-9 rounded-full border border-[var(--ff-border)] px-3 text-xs text-[var(--ff-text-muted)] transition-colors hover:border-[var(--ff-border-strong)] hover:text-[var(--ff-text)]"
                >
                  {dni} dni
                </button>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <Label className={labelClass}>Numer rachunku (dla przelewu)</Label>
            <Input
              {...form.register('bankAccount')}
              placeholder="12 3456 7890 ..."
            />
          </div>
        </div>
      </section>

      {/* SECTION: Uwagi */}
      <section className={sectionClass}>
        <Label className={labelClass}>Uwagi</Label>
        <Textarea rows={3} {...form.register('notes')} />
      </section>

      {/* STICKY FOOTER — przyciski bez tła/bluru (tylko „pływające” nad treścią) */}
      <div className="ff-sticky-actions pointer-events-none">
        {/* Na telefonie wysyłka jest szeroka i pierwsza (kciuk trafia w nią bez
            celowania), a „Zapisz” wąskie obok — układ z makiety. Od `sm`
            wracają dwa przyciski o naturalnej szerokości, dosunięte do prawej.
            Na telefonie „Zapisz” niesie tę samą akcję co „Szkic” w nagłówku;
            to nie jest dubel do usunięcia, tylko ten sam wybór w zasięgu kciuka
            i w zasięgu wzroku. */}
        <div className="pointer-events-auto mx-auto flex max-w-7xl gap-3 sm:justify-end">
          <Button
            type="button"
            variant="glass"
            size="lg"
            onClick={handleSaveDraft}
            disabled={isSaving || isSending}
            className="order-2 flex-1 sm:order-1 sm:flex-none"
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <span className="sm:hidden">Zapisz</span>
            <span className="hidden sm:inline">Zapisz szkic</span>
          </Button>
          <Button
            type="button"
            variant="glass-primary"
            size="lg"
            onClick={handleSend}
            disabled={isSaving || isSending}
            className="order-1 flex-[2] sm:order-2 sm:flex-none"
          >
            {isSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <span className="sm:hidden">Wyślij do KSeF</span>
            <span className="hidden sm:inline">Wystaw i wyślij do KSeF</span>
          </Button>
        </div>
      </div>
    </form>
  );
}
