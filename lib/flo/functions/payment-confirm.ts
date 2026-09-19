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
 *    a oznaczenie ma cofnięcie przez dziesięć minut.
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
import { fingerprintOf, type FloFacts } from '@/lib/flo/fingerprint';
import { registerFloHandler } from '@/lib/flo/handlers';
import { formatDays, formatPlnPlain } from '@/lib/flo/money';
import type { CreateProposalInput } from '@/lib/flo/proposals';
import { captureUndo } from '@/lib/flo/undo';
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

/**
 * Karta o JEDNEJ fakturze — tę buduje producent w pulsie (zadanie 1.1
 * planu FLO 2, `payment-confirm-producer.ts`).
 *
 * DLACZEGO NIE KARTA ZBIORCZA Z FUNKCJI WYŻEJ. Przy wpinaniu producenta
 * wyszły trzy rzeczy, których tamta funkcja nie widzi, bo żyją w innych
 * plikach:
 *
 * 1. Wariant `choice` NIE RYSUJE LISTY faktur. Karta „Sprawdźmy 3 zaległe
 *    płatności" ma jeden przycisk „Tak", a wykonawca zamyka nim PIERWSZĄ
 *    fakturę z ładunku — tę, której człowiek na ekranie nie widział. To jest
 *    dokładnie awaria nr 1 z nagłówka tego pliku.
 *
 * 2. Re-walidacja (`fingerprint.ts`) czyta fakty faktury po `payload.invoiceId`.
 *    Karta zbiorcza go nie ma, więc przy kliknięciu odcisk liczy się z etykiet
 *    ładunku i nie zgadza się z zapisanym NIGDY — każde kliknięcie kończyłoby
 *    się komunikatem „dane się zmieniły".
 *
 * 3. Klucz tematu z datą dnia daje NOWĄ kartę przy każdym przebiegu pulsu,
 *    bo wczorajsza ma inny klucz. Po tygodniu: siedem kart o to samo.
 *
 * Tekst, kwoty i dowody zostają z funkcji zbiorczej. Zmieniają się tylko
 * rzeczy, które zależą od tożsamości faktury, a nie od treści.
 */
export function buildInvoiceConfirmProposal(input: {
  tenantId: string;
  entry: OverdueSelection;
  /**
   * Fakty faktury z `computeFingerprint` — TĄ SAMĄ drogą, którą pójdzie
   * re-walidacja przy kliknięciu. Fakty zbudowane tu po swojemu dawałyby
   * odcisk, który nie zgadza się nigdy.
   */
  facts: FloFacts;
  now?: Date;
}): CreateProposalInput {
  // Jednoelementowy wybór zawsze daje kartę — `null` jest tylko dla pustego.
  const base = buildPaymentConfirmProposal({
    tenantId: input.tenantId,
    selection: [input.entry],
    now: input.now,
  })!;
  const invoiceId = input.entry.invoice.id;

  return {
    ...base,
    // Jedna faktura = jeden temat. Kolejny przebieg pulsu aktualizuje tę
    // samą kartę, zamiast stawiać obok drugą.
    topicKey: `payment.confirm:${invoiceId}`,
    fingerprint: fingerprintOf(input.facts),
    payload: {
      ...base.payload,
      invoiceId,
      // Stan „przed" dla zdania o zmianie. Muszą to być te same klucze, które
      // policzy `readState` — inaczej komunikat re-walidacji byłby o niczym.
      facts: input.facts,
      primaryLabel: 'Tak, zapłacił',
    },
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
  if (!Number.isFinite(input.amount) || input.amount <= 0) return 'invalid';
  if (input.amount > input.outstanding + 0.01) return 'invalid';
  return input.amount >= input.outstanding - 0.01 ? 'full' : 'partial';
}

interface PaymentsClient {
  from: (table: 'payments' | 'invoices') => {
    insert: (row: Record<string, unknown>) => Promise<{
      error: { message: string } | null;
    }>;
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
      };
    };
    update: (patch: Record<string, unknown>) => {
      eq: (
        column: string,
        value: string,
      ) => Promise<{ error: { message: string } | null }>;
    };
  };
}

/**
 * „Tak, zapłacił" albo „częściowo, tyle a tyle".
 *
 * Czynność odwracalna wewnątrz konta, więc ma cofnięcie. Zapis idzie do
 * `payments` — tej samej tabeli, z której korzysta import wyciągów — żeby
 * potwierdzenie ręczne i wpłata z banku znaczyły dokładnie to samo.
 */
registerFloHandler('payment.confirm', async (ctx) => {
  const payload = ctx.proposal.payload ?? {};
  const list = Array.isArray(payload.invoices) ? payload.invoices : [];
  const first = list[0] as Record<string, unknown> | undefined;

  const invoiceId =
    typeof ctx.input?.selectedIds?.[0] === 'string'
      ? ctx.input.selectedIds[0]
      : typeof first?.invoiceId === 'string'
        ? first.invoiceId
        : null;

  if (!invoiceId) throw new Error('Propozycja bez identyfikatora faktury');

  const entry = list.find(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      (item as Record<string, unknown>).invoiceId === invoiceId,
  ) as Record<string, unknown> | undefined;

  const outstanding = Number(entry?.outstanding ?? 0);
  const declared = ctx.input?.value ? Number(ctx.input.value) : outstanding;

  const kind = classifyConfirmation({ invoiceId, amount: declared, outstanding });
  if (kind === 'invalid') {
    throw new Error('Kwota poza zakresem należności');
  }

  const client = createAdminClient() as unknown as PaymentsClient;

  const { error } = await client.from('payments').insert({
    tenant_id: ctx.proposal.tenant_id,
    invoice_id: invoiceId,
    amount: declared,
    paid_at: new Date().toISOString(),
    source: 'flo_confirmation',
    note: 'potwierdzone przez klienta w karcie FLO',
  });

  if (error) throw new Error(error.message);

  return {
    summary:
      kind === 'full'
        ? `faktura ${String(entry?.number ?? '')} oznaczona jako zapłacona`
        : `zapisano wpłatę częściową ${formatPlnPlain(declared)}`,
    details: {
      invoiceId,
      amount: declared,
      kind,
      // Stan sprzed zmiany — podstawa cofnięcia przez dziesięć minut.
      undo: captureUndo(
        'invoices',
        invoiceId,
        { paid_amount: Number(payload.previousPaid ?? 0) },
        { paid_amount: declared },
      ),
    },
  };
});
