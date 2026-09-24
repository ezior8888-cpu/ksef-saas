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

import type { SupabaseClient } from '@supabase/supabase-js';

import { renderCopy } from '@/lib/flo/copy';
import {
  fingerprintOf,
  warsawIsoDate,
  type FloState,
} from '@/lib/flo/fingerprint';
import { registerFloHandler } from '@/lib/flo/handlers';
import { formatDays, formatPlnPlain, parsePlnAmount } from '@/lib/flo/money';
import type { CreateProposalInput } from '@/lib/flo/proposals';
import { captureInsertUndo } from '@/lib/flo/undo';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database, TablesInsert } from '@/types/database';
import type { FloApproveInput } from '@/types/flo';

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
 * Tekst i dowody zostają z funkcji zbiorczej. Zmieniają się rzeczy, które
 * zależą od tożsamości faktury, i akcje: „Tak", „Jeszcze nie", „Częściowo".
 *
 * KWOTY I ODCISK Z JEDNEGO ODCZYTU. Funkcja nie przyjmuje osobno „faktury
 * z listy" i „faktów do odcisku", bo to były dwa odczyty bazy w dwóch
 * różnych chwilach. Wpłata, która wpadła między nimi, dawała kartę ze starą
 * kwotą i ze ŚWIEŻYM odciskiem — czyli taką, która przechodzi re-walidację
 * i każe zapisać wpłatę na kwotę, której już nikt nie jest winien. Teraz
 * wszystko, co widać na karcie, pochodzi z `state` — tego samego odczytu,
 * który daje odcisk.
 *
 * Zwraca `null`, gdy według tego odczytu faktura nie jest już zaległa
 * (opłacona, wstrzymana, termin przesunięty, zniknęła). Pytać wtedy nie ma
 * o co.
 */
export function buildInvoiceConfirmProposal(input: {
  tenantId: string;
  invoiceId: string;
  /**
   * Stan faktury z `readState` — TĄ SAMĄ drogą, którą pójdzie re-walidacja
   * przy kliknięciu. Fakty zbudowane tu po swojemu dawałyby odcisk, który
   * nie zgadza się nigdy.
   */
  state: FloState;
  now?: Date;
}): CreateProposalInput | null {
  const now = input.now ?? new Date();
  const entry = overdueEntryFromState(input.invoiceId, input.state, now);
  if (!entry) return null;

  // Jednoelementowy wybór zawsze daje kartę — `null` jest tylko dla pustego.
  const base = buildPaymentConfirmProposal({
    tenantId: input.tenantId,
    selection: [entry],
    now,
  })!;

  return {
    ...base,
    // Jedna faktura = jeden temat. Kolejny przebieg pulsu aktualizuje tę
    // samą kartę, zamiast stawiać obok drugą.
    topicKey: `payment.confirm:${input.invoiceId}`,
    fingerprint: fingerprintOf(input.state.facts),
    // Ładunek składany od zera, a nie z funkcji zbiorczej: jej `invoices`,
    // `snoozeDays` i `inputLabel` na najwyższym poziomie opisywały kartę,
    // której ta nie jest („Nie teraz" nie odkłada tu o tydzień — zamyka temat).
    payload: {
      invoiceId: input.invoiceId,
      // Kontekst do meldunku po wykonaniu. Kwot tu nie ma: wykonawca liczy
      // należność z `facts`, które re-walidacja właśnie potwierdziła.
      number: entry.invoice.number,
      contractorName: entry.invoice.contractorName,
      // Stan „przed" dla zdania o zmianie. Muszą to być te same klucze, które
      // policzy `readState` — inaczej komunikat re-walidacji byłby o niczym.
      facts: input.state.facts,
      primaryLabel: 'Tak, zapłacił',
      // Trzy odpowiedzi, bo rzeczywistość nie jest binarna (awaria nr 3
      // z nagłówka). Wzór: atrapa `fx-choice-payment`.
      secondary: [
        { label: 'Jeszcze nie', intent: 'dismiss' },
        {
          label: 'Częściowo',
          intent: 'input',
          inputLabel: 'Ile wpłynęło?',
          inputKind: 'amount',
        },
      ],
    },
  };
}

/**
 * Faktura po terminie zbudowana ze stanu z `readState` — funkcja czysta.
 *
 * Reguły „zaległa czy nie" są te same co przy pierwszym odczycie
 * (`selectOverdueForConfirmation`), plus status KSeF: producent czyta tylko
 * faktury przyjęte, więc faktura, która w międzyczasie przestała nią być,
 * też nie jest pytaniem.
 */
export function overdueEntryFromState(
  invoiceId: string,
  state: FloState,
  now: Date,
): OverdueSelection | null {
  const { facts, context } = state;
  if ('missing' in facts) return null;
  if (facts.status !== 'accepted') return null;
  if (typeof facts.dueDate !== 'string') return null;

  const invoice: OverdueInvoice = {
    id: invoiceId,
    number: context.invoiceNumber ?? 'bez numeru',
    contractorName: context.contractorName ?? 'Kontrahent',
    grossTotal: Number(facts.grossTotal ?? 0),
    paidAmount: Number(facts.paidAmount ?? 0),
    dueDate: facts.dueDate,
    remindersPaused: facts.remindersPaused === 1,
  };

  return selectOverdueForConfirmation([invoice], now)[0] ?? null;
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

/** Ślad w `payments.notes` — skąd wzięła się wpłata bez wyciągu z banku. */
export const CONFIRMATION_NOTE = 'Potwierdzone przez klienta w karcie FLO';

export interface PaymentConfirmPlan {
  invoiceId: string;
  amount: number;
  kind: Exclude<ConfirmationKind, 'invalid'>;
  /** Numer faktury do meldunku. */
  number: string;
}

/**
 * Co zapisać po kliknięciu — funkcja czysta, cała logika wykonawcy bez bazy.
 *
 * TRZY ZASADY:
 *
 * 1. FAKTURA WYŁĄCZNIE Z ŁADUNKU. `selectedIds` przychodzi z przeglądarki,
 *    a zapis idzie klientem administracyjnym, z pominięciem RLS. Wcześniej
 *    wykonawca brał identyfikator właśnie stamtąd — podmieniony w żądaniu
 *    dopisywał wpłatę do dowolnej faktury, także cudzego konta, a trigger
 *    (SECURITY DEFINER) przeliczał jej `paid_amount`. Karta dotyczy jednej
 *    faktury i tylko tę wolno zamknąć.
 *
 * 2. NALEŻNOŚĆ Z `facts`. To są fakty, które re-walidacja sprawdziła
 *    z bazą tuż przed wywołaniem wykonawcy — nie kwota wpisana w ładunek
 *    w chwili tworzenia karty.
 *
 * 3. KWOTA WPISANA PRZEZ CZŁOWIEKA JEST NAPISEM. „1 234,56" czyta
 *    `parsePlnAmount`; napis, którego nie rozumiemy, to odmowa, nie zero.
 */
export function planPaymentConfirmation(
  payload: Record<string, unknown>,
  input?: FloApproveInput,
): PaymentConfirmPlan {
  const invoiceId =
    typeof payload.invoiceId === 'string' && payload.invoiceId.length > 0
      ? payload.invoiceId
      : null;
  if (!invoiceId) throw new Error('Propozycja bez identyfikatora faktury');

  const selected = input?.selectedIds ?? [];
  if (selected.some((id) => id !== invoiceId)) {
    throw new Error('Karta dotyczy innej faktury niż wskazana');
  }

  const facts =
    typeof payload.facts === 'object' && payload.facts !== null
      ? (payload.facts as Record<string, unknown>)
      : {};
  const grossTotal = Number(facts.grossTotal);
  const paidAmount = Number(facts.paidAmount);
  if (!Number.isFinite(grossTotal) || !Number.isFinite(paidAmount)) {
    throw new Error('Propozycja bez kwot faktury');
  }
  const outstanding = round2(grossTotal - paidAmount);

  let amount = outstanding;
  if (input?.value !== undefined) {
    const parsed = parsePlnAmount(input.value);
    if (parsed === null) throw new Error('Nie rozumiem wpisanej kwoty');
    amount = parsed;
  }

  const kind = classifyConfirmation({ invoiceId, amount, outstanding });
  if (kind === 'invalid') {
    throw new Error('Kwota poza zakresem należności');
  }

  return {
    invoiceId,
    amount,
    kind,
    number: typeof payload.number === 'string' ? payload.number : 'bez numeru',
  };
}

/**
 * „Tak, zapłacił" albo „częściowo, tyle a tyle".
 *
 * Czynność odwracalna wewnątrz konta, więc ma cofnięcie. Zapis idzie do
 * `payments` — tej samej tabeli, z której korzysta import wyciągów — żeby
 * potwierdzenie ręczne i wpłata z banku znaczyły dokładnie to samo.
 * `invoices.paid_amount` przelicza trigger `recalculate_invoice_paid_amount`
 * jako sumę wpłat; wykonawca go nie dotyka.
 *
 * KLIENT TYPOWANY, NIE RZUTOWANY. Poprzednia wersja rzutowała klienta na
 * ręcznie napisany interfejs, który przyjmował dowolny obiekt — i wstawiała
 * `paid_at`, `source`, `note`, których tabela nie ma, bez `payment_date`,
 * który jest NOT NULL. Typecheck milczał, a każde „Tak" kończyło się błędem
 * PostgREST-a. Wiersz typu `TablesInsert<'payments'>` nie skompiluje się
 * z nieistniejącą kolumną ani bez wymaganej.
 */
registerFloHandler('payment.confirm', async (ctx) => {
  const now = new Date();
  const plan = planPaymentConfirmation(ctx.proposal.payload ?? {}, ctx.input);

  const row: TablesInsert<'payments'> = {
    tenant_id: ctx.proposal.tenant_id,
    invoice_id: plan.invoiceId,
    amount: plan.amount,
    // Kolumna `DATE` — dzień w polskiej strefie, nie w strefie serwera.
    payment_date: warsawIsoDate(now),
    // Człowiek sam potwierdził wpłatę. Bez tego wiersz wyglądałby jak
    // niepotwierdzone dopasowanie z banku.
    is_confirmed: true,
    notes: CONFIRMATION_NOTE,
  };

  const client: SupabaseClient<Database> = createAdminClient();
  const { data, error } = await client
    .from('payments')
    .insert(row)
    .select('id')
    .single();

  if (error) throw new Error(error.message);

  return {
    summary:
      plan.kind === 'full'
        ? `faktura ${plan.number} oznaczona jako zapłacona`
        : `zapisano wpłatę częściową ${formatPlnPlain(plan.amount)}`,
    details: {
      invoiceId: plan.invoiceId,
      paymentId: data.id,
      amount: plan.amount,
      kind: plan.kind,
    },
    // Cofnięcie = usunięcie TEGO wiersza. Trigger sam przeliczy fakturę.
    // Pola w `after` pilnują, żeby nie skasować wpłaty, którą człowiek
    // w międzyczasie poprawił ręcznie.
    undo: captureInsertUndo(
      'payments',
      data.id,
      {
        tenant_id: row.tenant_id,
        invoice_id: row.invoice_id,
        amount: row.amount,
      },
      now,
    ),
  };
});
