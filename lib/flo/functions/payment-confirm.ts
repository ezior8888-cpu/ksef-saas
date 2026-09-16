/**
 * K-01 — wiem, co jest zapłacone (krok 22 planu).
 *
 * DLACZEGO TA FUNKCJA W OGÓLE ISTNIEJE: bez niej ponaglenia (K-02) byłyby
 * ruletką. Wiadomość wysłana komuś, kto zapłacił trzy dni temu, kompromituje
 * klienta przed jego własnym kontrahentem — i winą obciąży narzędzie.
 * Licznik „ile odłożyć na podatki" też nie ma z czego liczyć, dopóki nie
 * wiadomo, co naprawdę wpłynęło.
 *
 * ZERO INTEGRACJI I ZERO KONFIGURACJI. Jedno pytanie w karcie, jeden tap.
 * Podłączenie banku będzie kiedyś ułatwieniem, nigdy warunkiem — funkcja,
 * która wymaga setupu, nie działa u nikogo.
 *
 * TRZY AWARIE, KTÓRE TU ZAMYKAMY:
 *
 * 1. POMYŁKOWE „TAK". Klient klika w biegu, myląc dwie faktury tego samego
 *    kontrahenta. Należność zamknięta, pieniędzy nie ma. Dlatego karta
 *    pokazuje NUMER, KWOTĘ I DATĘ każdej faktury — nigdy samą nazwę firmy —
 *    a cofnięcie musi odwrócić wpis płatności, nie tylko sumę na fakturze.
 *
 * 2. PYTANIE ZA WCZEŚNIE. Termin minął wczoraj, przelew jest w drodze,
 *    klient dobrze o tym wie. Pytamy dopiero dobę po terminie, zbiorczo,
 *    i nigdy powiadomieniem.
 *
 * 3. RZECZYWISTOŚĆ NIE JEST BINARNA. Kontrahent zapłacił połowę, rozliczył
 *    się kompensatą albo gotówką. „Tak" i „nie" są wtedy oba nieprawdziwe,
 *    a klient musiałby skłamać agentowi, żeby ten przestał pytać — i od tego
 *    momentu wszystkie dane byłyby fałszywe.
 */

import { renderCopy } from '@/lib/flo/copy';
import { fingerprintOf } from '@/lib/flo/fingerprint';
import { registerFloHandler } from '@/lib/flo/handlers';
import { formatDays, formatPlnPlain } from '@/lib/flo/money';
import type { CreateProposalInput } from '@/lib/flo/proposals';
import { createAdminClient } from '@/lib/supabase/admin';

/** Dobę po terminie, nie w dniu terminu. Przelew bywa w drodze. */
const ASK_AFTER_DAYS = 1;

/** „Jeszcze czekam" odkłada sprawę o tyle dni. */
export const SNOOZE_DAYS = 7;

export interface OverdueInvoice {
  id: string;
  /** Numer widoczny dla człowieka — bez niego karta jest zgadywanką. */
  number: string;
  contractorName: string;
  grossTotal: number;
  paidAmount: number;
  /** YYYY-MM-DD */
  dueDate: string;
  remindersPaused: boolean;
}

export interface OverdueSelection {
  invoice: OverdueInvoice;
  outstanding: number;
  daysOverdue: number;
}

// ═══════════════════════════════════════════════════════════════
// Wybór faktur — funkcja czysta
// ═══════════════════════════════════════════════════════════════

export function selectOverdueForConfirmation(
  invoices: readonly OverdueInvoice[],
  now: Date,
): OverdueSelection[] {
  return invoices
    .map((invoice) => {
      const outstanding = round2(invoice.grossTotal - invoice.paidAmount);
      const due = Date.parse(invoice.dueDate);
      const daysOverdue = Number.isNaN(due)
        ? 0
        : Math.floor((now.getTime() - due) / 86_400_000);
      return { invoice, outstanding, daysOverdue };
    })
    .filter(
      (entry) =>
        entry.outstanding > 0 &&
        entry.daysOverdue >= ASK_AFTER_DAYS &&
        !entry.invoice.remindersPaused,
    )
    .sort((a, b) => b.outstanding - a.outstanding);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════
// Karta
// ═══════════════════════════════════════════════════════════════

/**
 * Jedna karta na wszystkie faktury po terminie.
 *
 * Osobna karta na każdą byłaby serią pytań o to samo — a przy pięciu
 * zaległościach zamieniłaby wątek w listę zarzutów.
 */
export function buildPaymentConfirmProposal(input: {
  tenantId: string;
  selection: readonly OverdueSelection[];
  now?: Date;
}): CreateProposalInput | null {
  const now = input.now ?? new Date();
  if (input.selection.length === 0) return null;

  const first = input.selection[0]!;
  const many = input.selection.length > 1;

  const copy = renderCopy('payment.confirm', {
    kontrahent: first.invoice.contractorName,
    numer: first.invoice.number,
    kwota: formatPlnPlain(first.outstanding),
    dni: formatDays(first.daysOverdue),
  });

  const total = round2(
    input.selection.reduce((sum, entry) => sum + entry.outstanding, 0),
  );

  return {
    tenantId: input.tenantId,
    kind: 'payment.confirm',
    // Jedna karta na dzień, aktualizowana kolejnymi przebiegami.
    topicKey: `payment.confirm:${now.toISOString().slice(0, 10)}`,
    title: many
      ? `Sprawdźmy ${input.selection.length} zaległe płatności`
      : copy.title,
    body: many
      ? `Razem ${formatPlnPlain(total)} po terminie. Zaznacz, co już wpłynęło — pytam raz, potem się nie odzywam.`
      : copy.body,
    fingerprint: fingerprintOf({
      ids: input.selection.map((e) => e.invoice.id).join('|'),
      total: Math.round(total * 100),
    }),
    expiresAt: new Date(now.getTime() + 30 * 86_400_000),
    priority: 20,
    payload: {
      // NUMER, KWOTA I DATA przy każdej pozycji. Sama nazwa kontrahenta
      // przy dwóch fakturach tej samej firmy to prosta droga do pomyłkowego
      // zamknięcia niewłaściwej należności.
      invoices: input.selection.map((entry) => ({
        invoiceId: entry.invoice.id,
        number: entry.invoice.number,
        contractorName: entry.invoice.contractorName,
        amount: formatPlnPlain(entry.outstanding),
        outstanding: entry.outstanding,
        dueDate: entry.invoice.dueDate,
      })),
      facts: {
        grossTotal: first.invoice.grossTotal,
        paidAmount: first.invoice.paidAmount,
        dueDate: first.invoice.dueDate,
        status: 'overdue',
      },
      inputLabel: 'Ile wpłynęło?',
      inputKind: 'amount',
      snoozeDays: SNOOZE_DAYS,
    },
    evidence: [
      { label: 'Przeterminowane', href: '/payments/overdue' },
      { label: `Faktura ${first.invoice.number}`, href: `/invoices/${first.invoice.id}` },
    ],
  };
}

// ═══════════════════════════════════════════════════════════════
// Zapis odpowiedzi
// ═══════════════════════════════════════════════════════════════

export interface ConfirmationInput {
  invoiceId: string;
  /** Pełna kwota, gdy klient kliknął „tak"; częściowa, gdy wpisał sumę. */
  amount: number;
  outstanding: number;
}

export type ConfirmationKind = 'full' | 'partial' | 'invalid';

/**
 * Jak potraktować odpowiedź — funkcja czysta.
 *
 * Kwota większa od należności to pomyłka w pisaniu, nie nadpłata: zamiast
 * zapisywać bzdurę, odmawiamy i pozwalamy poprawić.
 */
export function classifyConfirmation(
  input: ConfirmationInput,
): ConfirmationKind {
  if (!Number.isFinite(input.amount) || input.amount <= 0 ||
      !Number.isFinite(input.outstanding) || input.outstanding <= 0) return 'invalid';
  if (input.amount > input.outstanding + 0.01) return 'invalid';
  return input.amount >= input.outstanding - 0.01 ? 'full' : 'partial';
}

/**
 * „Tak, zapłacił" albo „częściowo, tyle a tyle".
 *
 * Zapis idzie do `payments` — tej samej tabeli, z której korzysta import wyciągów — żeby
 * potwierdzenie ręczne i wpłata z banku znaczyły dokładnie to samo.
 */
registerFloHandler('payment.confirm', async (ctx) => {
  const payload = ctx.proposal.payload ?? {};
  const list = Array.isArray(payload.invoices) ? payload.invoices : [];
  const selected = ctx.input?.selectedIds;
  if (selected !== undefined &&
      (!Array.isArray(selected) || selected.length !== 1 || typeof selected[0] !== 'string')) {
    throw new Error('Wybierz jedną fakturę z propozycji');
  }
  const first = list[0] as Record<string, unknown> | undefined;
  const invoiceId = selected?.[0] ?? first?.invoiceId;
  const entry = list.find((item) => typeof item === 'object' && item !== null &&
    (item as Record<string, unknown>).invoiceId === invoiceId) as Record<string, unknown> | undefined;
  if (typeof invoiceId !== 'string' || !invoiceId || !entry) {
    throw new Error('Faktura nie należy do zatwierdzanej propozycji');
  }

  const proposedBalance = Number(entry.outstanding);
  if (!Number.isFinite(proposedBalance) || proposedBalance <= 0) {
    throw new Error('Propozycja bez dodatniej należności');
  }
  const raw = ctx.input?.value;
  if (raw !== undefined && (typeof raw !== 'string' ||
      !/^(?:0|[1-9]\d{0,12})(?:[.,]\d{1,2})?$/.test(raw.trim()))) {
    throw new Error('Podaj dodatnią kwotę z dokładnością do grosza');
  }
  const declared = raw === undefined ? proposedBalance : Number(raw.trim().replace(',', '.'));
  const amountCents = Math.round(declared * 100);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 ||
      Math.abs(declared * 100 - amountCents) > 0.0001) {
    throw new Error('Nieprawidłowa kwota wpłaty');
  }

  const client = createAdminClient();
  // A proposal ID is not proof of ownership of every entity inside its payload.
  const invoice = await client.from('invoices')
    .select('id, gross_total, paid_amount')
    .eq('id', invoiceId)
    .eq('tenant_id', ctx.proposal.tenant_id)
    .maybeSingle();
  if (invoice.error || !invoice.data) throw new Error('Nie można potwierdzić tej faktury');
  const outstanding = Number(invoice.data.gross_total) - Number(invoice.data.paid_amount);
  const balanceCents = Math.round(outstanding * 100);
  const proposedCents = Math.round(proposedBalance * 100);
  if (!Number.isSafeInteger(balanceCents) || balanceCents <= 0 ||
      amountCents > balanceCents || amountCents > proposedCents) {
    throw new Error('Kwota poza zakresem aktualnej należności');
  }
  const kind: ConfirmationKind = amountCents === balanceCents ? 'full' : 'partial';
  const amount = amountCents / 100;
  const { error } = await client.from('payments').insert({
    tenant_id: ctx.proposal.tenant_id,
    invoice_id: invoiceId,
    amount,
    payment_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw' }).format(new Date()),
    is_confirmed: true,
    match_method: 'flo_confirmation',
    notes: 'potwierdzone przez klienta w karcie FLO',
  });
  if (error) throw new Error(error.message);

  // Payments drive invoice totals through a database trigger. Restoring only
  // invoices.paid_amount would leave the actual payment in place, so do not
  // publish a fictitious invoice-only undo operation.
  return {
    summary: kind === 'full'
      ? `faktura ${String(entry.number ?? '')} oznaczona jako zapłacona`
      : `zapisano wpłatę częściową ${formatPlnPlain(amount)}`,
    details: { invoiceId, amount, kind },
  };
});
